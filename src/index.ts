/**
 * iteratio-plugin-federation
 *
 * Enables app-to-app federation for distributed multi-agent systems.
 * Apps can connect to event bus, register capabilities, and coordinate work.
 *
 * Based on APP_FEDERATION.md architecture.
 */

import { IPlugin } from 'iteratio';
import { Container } from 'inversify';
import { ClientRegistry } from './ClientRegistry';
import { EventBusClient } from './EventBusClient';
import { RBACManager } from './RBACManager';

/** Full configuration for the federation plugin including bus, identity, auth, RBAC, and rate limits. */
export interface FederationPluginConfig {
  /** Event bus connection settings (NATS or WebSocket). */
  eventBus: {
    url: string;                    // e.g., 'nats://localhost:4222' or 'wss://bus.example.com'
    type?: 'nats' | 'websocket';    // Default: auto-detect from URL
  };

  /** Identity and capability declaration for this client on the bus. */
  client: {
    id?: string;                    // Auto-generated if not provided
    type: 'mobile' | 'desktop' | 'browser' | 'server' | 'iot' | 'agent';
    name: string;                   // Human-readable name
    platform?: 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web';
    handlers?: string[];            // Handlers this client provides
    metadata?: Record<string, any>; // Custom metadata
  };

  /** Authentication mechanism for connecting to the event bus. */
  auth: {
    type: 'oauth2' | 'apikey' | 'jwt' | 'mtls' | 'ssh' | 'basic';
    // Auth-specific config (see auth providers)
    [key: string]: any;
  };

  /** Transport-level connection behavior (direct, reverse-tunnel, or polling). */
  connection?: {
    mode?: 'direct' | 'reverse-tunnel' | 'polling'; // Default: 'direct'
    pollInterval?: number;          // For polling mode (ms)
    reconnect?: boolean;            // Auto-reconnect on disconnect
    reconnectDelay?: number;        // Delay between reconnect attempts (ms)
  };

  /** Role-based access control settings for this client. */
  rbac?: {
    role?: 'reader' | 'writer' | 'handler' | 'admin' | 'system';
    customPermissions?: Array<{
      resource: string;
      action: 'read' | 'write' | 'admin';
      scope?: string;
    }>;
  };

  /** Throughput limits to prevent bus saturation from a single client. */
  rateLimit?: {
    maxRequestsPerSecond?: number;
    maxSubscriptions?: number;
  };
}

/** Represents a registered client on the federation bus with connection metadata. */
export interface Client {
  id: string;
  type: string;
  name: string;
  platform?: string;
  handlers: string[];
  metadata?: Record<string, any>;
  connection: {
    type: 'websocket' | 'reverse-tunnel' | 'sse' | 'polling';
    address?: string;
  };
  status: 'online' | 'offline';
  lastSeen: number;
}

/** Wire format for messages exchanged over the federation event bus. */
export interface FederationMessage {
  type: 'work_request' | 'work_response' | 'event_notification' | 'capability_query' | 'health_check';
  from: string;
  to?: string;
  [key: string]: any;
}

/**
 * Enables distributed multi-agent coordination by connecting to a shared
 * event bus, registering capabilities, and enforcing RBAC on all pub/sub
 * and request/response interactions.
 */
export class FederationPlugin implements IPlugin {
  name = 'federation';
  version = '1.0.0';

  private config: FederationPluginConfig;
  private registry: ClientRegistry;
  private eventBus: EventBusClient;
  private rbac: RBACManager;
  private container?: Container;

  constructor(config: FederationPluginConfig) {
    this.config = config;

    // Initialize components
    this.registry = new ClientRegistry();
    this.eventBus = new EventBusClient(config);
    this.rbac = new RBACManager(config.rbac?.role || 'handler');
  }

  /** Connect to the event bus, register this client, and start the heartbeat timer. */
  async initialize(container: Container): Promise<void> {
    this.container = container;

    // TODO: Connect to event bus
    await this.eventBus.connect();

    // TODO: Register client in registry
    const client: Client = {
      id: this.config.client.id || this.generateClientId(),
      type: this.config.client.type,
      name: this.config.client.name,
      platform: this.config.client.platform,
      handlers: this.config.client.handlers || [],
      metadata: this.config.client.metadata,
      connection: {
        type: this.getConnectionType(),
        address: this.config.eventBus.url
      },
      status: 'online',
      lastSeen: Date.now()
    };

    await this.registry.register(client);

    // TODO: Start heartbeat
    this.startHeartbeat();

    // TODO: Setup request handlers from config
    this.setupHandlers();

    console.log(`Federation plugin initialized: ${client.name} (${client.id})`);
  }

  /** Unregister from the bus and close the connection gracefully. */
  async shutdown(): Promise<void> {
    // TODO: Unregister client
    const clientId = this.config.client.id || '';
    if (clientId) {
      await this.registry.unregister(clientId);
    }

    // TODO: Disconnect from event bus
    await this.eventBus.disconnect();

    console.log('Federation plugin shutdown');
  }

  /** Expose the client registry for capability discovery across the bus. */
  getRegistry(): ClientRegistry {
    return this.registry;
  }

  /** Expose the underlying event bus client for direct pub/sub and request/response. */
  getEventBus(): EventBusClient {
    return this.eventBus;
  }

  /** Expose the RBAC manager for permission checks outside the plugin lifecycle. */
  getRBAC(): RBACManager {
    return this.rbac;
  }

  /** Subscribe to a topic on the event bus after enforcing read permissions via RBAC. */
  async subscribe(topic: string, handler: (message: FederationMessage) => void): Promise<string> {
    // TODO: Check RBAC permissions
    await this.rbac.enforcePermission('events', 'read', topic);

    return this.eventBus.subscribe(topic, handler);
  }

  /** Publish a message to a topic after enforcing write permissions via RBAC. */
  async publish(topic: string, message: FederationMessage): Promise<void> {
    // TODO: Check RBAC permissions
    await this.rbac.enforcePermission('events', 'write', topic);

    await this.eventBus.publish(topic, message);
  }

  /** Send a request-response to a named handler on the bus with optional timeout. */
  async request(handler: string, payload: any, options?: { timeout?: number }): Promise<any> {
    // TODO: Check RBAC permissions
    await this.rbac.enforcePermission('requests', 'write', handler);

    return this.eventBus.request(handler, payload, options);
  }

  /** Register a named handler so other clients can send work requests to this client. */
  async registerHandler(name: string, handler: (payload: any) => Promise<any>): Promise<void> {
    // TODO: Check RBAC permissions
    await this.rbac.enforcePermission('requests', 'read', name);

    return this.eventBus.onRequest(name, handler);
  }

  // Private methods

  private generateClientId(): string {
    return `${this.config.client.type}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private getConnectionType(): 'websocket' | 'reverse-tunnel' | 'sse' | 'polling' {
    const mode = this.config.connection?.mode || 'direct';

    if (mode === 'polling') return 'polling';
    if (mode === 'reverse-tunnel') return 'reverse-tunnel';

    // Direct mode - determine from URL
    if (this.config.eventBus.url.startsWith('ws')) return 'websocket';

    return 'websocket';
  }

  private startHeartbeat(): void {
    // TODO: Send heartbeat every 30 seconds
    const interval = 30000;
    setInterval(async () => {
      const clientId = this.config.client.id;
      if (clientId) {
        await this.registry.heartbeat(clientId);
      }
    }, interval);
  }

  private setupHandlers(): void {
    // TODO: Register handlers from config
    const handlers = this.config.client.handlers || [];

    for (const handler of handlers) {
      // Auto-register handler stub
      this.eventBus.onRequest(handler, async (payload: any) => {
        console.warn(`Handler '${handler}' called but not implemented`);
        return {
          success: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: `Handler '${handler}' not implemented`
          }
        };
      });
    }
  }
}

// Export types and classes
export * from './ClientRegistry';
export * from './EventBusClient';
export * from './RBACManager';
export * from './auth/OAuth2AuthProvider';
export * from './auth/APIKeyAuthProvider';
export * from './auth/JWTAuthProvider';
export * from './auth/MTLSAuthProvider';
export * from './auth/SSHAuthProvider';
export * from './auth/BasicAuthProvider';
