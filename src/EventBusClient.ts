/**
 * EventBusClient - Client for connecting to federation event bus.
 * Supports NATS and WebSocket backends with multiple auth methods.
 */

import { NatsConnection, StringCodec, Subscription } from 'nats';
import WebSocket from 'ws';
import { FederationPluginConfig } from './index';
import { getAuthProvider, AuthProvider } from './auth/AuthProvider';
import { EventBusWebSocketHandlers } from './EventBusWebSocketHandlers';
import { connectNATS, connectWebSocket } from './EventBusConnections';

export interface RequestOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  retries?: number;
}

export interface SubscribeOptions {
  filter?: (msg: any) => boolean;
  priority?: 'low' | 'normal' | 'high';
  queueGroup?: string;
}

type MessageHandler = (message: any) => void | Promise<void>;
type RequestHandler = (payload: any) => Promise<any>;

/** Handles connection to event bus and message routing. */
/** Client for connecting to the federation event bus (NATS or WebSocket). */
export class EventBusClient {
  private config?: FederationPluginConfig;
  private authProvider?: AuthProvider;
  private natsConnection?: NatsConnection;
  private wsConnection?: WebSocket;
  private connected: boolean = false;
  private subscriptions: Map<string, Subscription> = new Map();
  private wsSubscriptions: Map<string, MessageHandler[]> = new Map();
  private requestHandlers: Map<string, RequestHandler> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private requestCount: number = 0;
  private requestResetTimer?: NodeJS.Timeout;
  private sc = StringCodec();
  private wsHandlers: EventBusWebSocketHandlers;

  constructor(config?: FederationPluginConfig) {
    this.config = config;
    if (config?.auth) {
      this.authProvider = getAuthProvider(config.auth);
    }
    this.wsHandlers = new EventBusWebSocketHandlers({
      config,
      requestHandlers: this.requestHandlers,
      pendingRequests: this.pendingRequests,
      wsSubscriptions: this.wsSubscriptions
    });
  }

  /** Connect to event bus */
  async connect(inlineConfig?: { url: string; clientId?: string }): Promise<void> {
    if (inlineConfig && !this.config) {
      this.connected = true;
      return;
    }

    const url = this.config?.eventBus?.url;

    if (!url) {
      // Simple mode: just mark as connected (for testing)
      this.connected = true;
      return;
    }

    // Authenticate first
    if (this.authProvider) {
      await this.authProvider.authenticate();
    }

    // Determine connection type
    if (url.startsWith('nats://') || url.startsWith('tls://')) {
      await this.doConnectNATS(url);
    } else if (url.startsWith('ws://') || url.startsWith('wss://')) {
      await this.doConnectWebSocket(url);
    } else {
      throw new Error(`Unsupported event bus URL: ${url}`);
    }

    this.connected = true;

    // Start rate limit reset timer
    this.startRateLimitReset();

    // Setup reconnection if configured
    if (this.config?.connection?.reconnect !== false) {
      this.setupReconnection();
    }

    console.log(`Connected to event bus: ${url}`);
  }

  /** Disconnect from event bus */
  async disconnect(): Promise<void> {
    if (this.natsConnection) {
      await this.natsConnection.close();
      this.natsConnection = undefined;
    }

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = undefined;
      this.wsHandlers.setConnection(undefined);
    }

    // Clear subscriptions
    this.subscriptions.clear();
    this.wsSubscriptions.clear();

    // Clear pending requests
    for (const [, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingRequests.clear();

    this.connected = false;

    console.log('Disconnected from event bus');
  }

  /** Subscribe to topic */
  async subscribe(topic: string, handler: MessageHandler, options?: SubscribeOptions): Promise<string> {
    if (!this.connected) {
      throw new Error('Not connected to event bus');
    }

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    if (this.natsConnection) {
      // NATS subscription
      const sub = this.natsConnection.subscribe(topic, {
        queue: options?.queueGroup
      });

      this.subscriptions.set(subscriptionId, sub);

      // Process messages
      (async () => {
        for await (const msg of sub) {
          try {
            const data = JSON.parse(this.sc.decode(msg.data));

            // Apply filter if provided
            if (options?.filter && !options.filter(data)) {
              continue;
            }

            await handler(data);
          } catch (error) {
            console.error('Error handling subscription message:', error);
          }
        }
      })();
    } else if (this.wsConnection) {
      // WebSocket subscription
      if (!this.wsSubscriptions.has(topic)) {
        this.wsSubscriptions.set(topic, []);
      }
      this.wsSubscriptions.get(topic)!.push(handler);

      // Send subscribe message
      this.wsConnection.send(JSON.stringify({
        type: 'subscribe',
        topic,
        subscriptionId
      }));
    } else {
      // Simple in-memory mode (no external connection)
      if (!this.wsSubscriptions.has(topic)) {
        this.wsSubscriptions.set(topic, []);
      }
      this.wsSubscriptions.get(topic)!.push(handler);
    }

    return subscriptionId;
  }

  /** Unsubscribe from topic */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId);

    if (sub) {
      await sub.unsubscribe();
      this.subscriptions.delete(subscriptionId);
    }

    // TODO: Handle WebSocket unsubscribe
  }

  /** Publish message to topic */
  async publish(topic: string, message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to event bus');
    }

    if (this.natsConnection) {
      // NATS publish
      this.natsConnection.publish(topic, this.sc.encode(JSON.stringify(message)));
    } else if (this.wsConnection) {
      // WebSocket publish
      this.wsConnection.send(JSON.stringify({
        type: 'publish',
        topic,
        message
      }));
    } else {
      // Simple in-memory mode: deliver to local subscribers
      const handlers = this.wsSubscriptions.get(topic);
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler(message);
          } catch (error) {
            console.error('Error in publish handler:', error);
          }
        }
      }
    }
  }

  /** Register a named handler (alias for onRequest that works without connection) */
  registerHandler(name: string, handler: RequestHandler): void {
    this.requestHandlers.set(name, handler);
  }

  /** Send request to handler (with timeout) */
  async request(handler: string, payload: any, options?: RequestOptions): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected to event bus');
    }

    // Check rate limit
    this.checkRateLimit();

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timeout = options?.timeout || 30000;

    const requestMessage = {
      type: 'work_request',
      from: this.config?.client?.id || 'unknown',
      requestId,
      service: handler,
      payload,
      priority: options?.priority || 'normal'
    };

    // Create promise for response
    const responsePromise = new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${handler}`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });
    });

    if (this.natsConnection) {
      // NATS request/response
      const msg = await this.natsConnection.request(
        `request.${handler}`,
        this.sc.encode(JSON.stringify(requestMessage)),
        { timeout }
      );

      const response = JSON.parse(this.sc.decode(msg.data));

      this.pendingRequests.delete(requestId);

      if (!response.success) {
        throw new Error(response.error?.message || 'Request failed');
      }

      return response.data;
    } else if (this.wsConnection) {
      // WebSocket request/response
      this.wsConnection.send(JSON.stringify(requestMessage));

      return responsePromise;
    } else {
      // Simple in-memory mode: call local handler directly
      const localHandler = this.requestHandlers.get(handler);
      if (localHandler) {
        this.pendingRequests.delete(requestId);
        return localHandler(payload);
      }
      return responsePromise;
    }
  }

  /** Register handler for incoming requests */
  async onRequest(name: string, handler: RequestHandler): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to event bus');
    }

    this.requestHandlers.set(name, handler);

    if (this.natsConnection) {
      // NATS handler subscription
      const sub = this.natsConnection.subscribe(`request.${name}`);

      (async () => {
        for await (const msg of sub) {
          try {
            const request = JSON.parse(this.sc.decode(msg.data));
            const result = await handler(request.payload);

            const response = {
              type: 'work_response',
              from: this.config?.client?.id || 'unknown',
              to: request.from,
              requestId: request.requestId,
              success: true,
              data: result
            };

            msg.respond(this.sc.encode(JSON.stringify(response)));
          } catch (error: any) {
            const errorResponse = {
              type: 'work_response',
              from: this.config?.client?.id || 'unknown',
              requestId: 'unknown',
              success: false,
              error: {
                code: 'HANDLER_ERROR',
                message: error.message
              }
            };

            msg.respond(this.sc.encode(JSON.stringify(errorResponse)));
          }
        }
      })();
    }
  }

  /** Register handler for service requests (alias for onRequest) */
  async onServiceRequest(name: string, handler: RequestHandler): Promise<void> {
    return this.onRequest(name, handler);
  }

  // Private methods

  private async doConnectNATS(url: string): Promise<void> {
    this.natsConnection = await connectNATS(url, this.authProvider);
  }

  private async doConnectWebSocket(url: string): Promise<void> {
    this.wsConnection = await connectWebSocket(
      url,
      this.authProvider,
      (data) => this.wsHandlers.handleMessage(data),
      () => { this.connected = false; }
    );
    this.wsHandlers.setConnection(this.wsConnection);
  }

  private setupReconnection(): void {
    // TODO: Implement reconnection logic
    // Listen for disconnect events and attempt reconnection
  }

  private checkRateLimit(): void {
    const maxRequests = this.config?.rateLimit?.maxRequestsPerSecond || Infinity;

    if (this.requestCount >= maxRequests) {
      throw new Error('Rate limit exceeded');
    }

    this.requestCount++;
  }

  private startRateLimitReset(): void {
    this.requestResetTimer = setInterval(() => {
      this.requestCount = 0;
    }, 1000);
  }
}
