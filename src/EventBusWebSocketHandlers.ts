/**
 * EventBus WebSocket Message Handlers
 *
 * Handles routing and processing of WebSocket messages for the EventBusClient.
 * Extracted to keep EventBusClient focused on connection and pub/sub.
 */

import WebSocket from 'ws';
import { FederationPluginConfig } from './index';

type RequestHandler = (payload: any) => Promise<any>;

/**
 * Manages WebSocket message routing: work requests, work responses, and event notifications.
 */
/** Handles WebSocket protocol-level events: connect, disconnect, message, error. */
export class EventBusWebSocketHandlers {
  private wsConnection?: WebSocket;
  private config?: FederationPluginConfig;
  private requestHandlers: Map<string, RequestHandler>;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>;
  private wsSubscriptions: Map<string, ((message: any) => void | Promise<void>)[]>;

  constructor(deps: {
    config?: FederationPluginConfig;
    requestHandlers: Map<string, RequestHandler>;
    pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>;
    wsSubscriptions: Map<string, ((message: any) => void | Promise<void>)[]>;
  }) {
    this.config = deps.config;
    this.requestHandlers = deps.requestHandlers;
    this.pendingRequests = deps.pendingRequests;
    this.wsSubscriptions = deps.wsSubscriptions;
  }

  /**
   * Set the active WebSocket connection reference
   */
  setConnection(ws: WebSocket | undefined): void {
    this.wsConnection = ws;
  }

  /**
   * Route an incoming WebSocket message to the appropriate handler.
   */
  handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'work_request':
          this.handleWorkRequest(message);
          break;

        case 'work_response':
          this.handleWorkResponse(message);
          break;

        case 'event_notification':
          this.handleEventNotification(message);
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private async handleWorkRequest(request: any): Promise<void> {
    const handler = this.requestHandlers.get(request.service);

    if (!handler) {
      // Send error response
      this.wsConnection?.send(JSON.stringify({
        type: 'work_response',
        from: this.config?.client?.id || 'unknown',
        to: request.from,
        requestId: request.requestId,
        success: false,
        error: {
          code: 'HANDLER_NOT_FOUND',
          message: `No handler for service: ${request.service}`
        }
      }));
      return;
    }

    try {
      const result = await handler(request.payload);

      // Send success response
      this.wsConnection?.send(JSON.stringify({
        type: 'work_response',
        from: this.config?.client?.id || 'unknown',
        to: request.from,
        requestId: request.requestId,
        success: true,
        data: result
      }));
    } catch (error: any) {
      // Send error response
      this.wsConnection?.send(JSON.stringify({
        type: 'work_response',
        from: this.config?.client?.id || 'unknown',
        to: request.from,
        requestId: request.requestId,
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error.message
        }
      }));
    }
  }

  private handleWorkResponse(response: any): void {
    const pending = this.pendingRequests.get(response.requestId);

    if (!pending) {
      console.warn('Received response for unknown request:', response.requestId);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.requestId);

    if (response.success) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error?.message || 'Request failed'));
    }
  }

  private handleEventNotification(event: any): void {
    // Route to topic subscribers
    const handlers = this.wsSubscriptions.get(event.event);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    }
  }
}
