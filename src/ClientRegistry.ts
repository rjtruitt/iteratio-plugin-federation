/**
 * ClientRegistry
 *
 * Manages client registration, discovery, and presence tracking.
 * Clients register when connecting, send heartbeats, and unregister on disconnect.
 */

export interface Client {
  id: string;
  type?: string;
  name?: string;
  platform?: string;
  handlers: string[];
  metadata?: Record<string, any>;
  connection?: {
    type: 'websocket' | 'reverse-tunnel' | 'sse' | 'polling';
    address?: string;
  };
  status?: 'online' | 'offline';
  lastSeen?: number;
}

export interface ClientFilter {
  type?: string;
  handler?: string;
  status?: 'online' | 'offline';
  platform?: string;
}

type ClientEventCallback = (client: Client) => void;
type ClientLeftCallback = (clientId: string) => void;

/**
 * ClientRegistry
 *
 * In-memory registry for connected clients.
 * TODO: Replace with distributed storage (etcd, Redis) for production.
 */
/** Registry of all connected clients on the federation bus with status tracking. */
export class ClientRegistry {
  private clients: Map<string, Client> = new Map();
  private handlerIndex: Map<string, Set<string>> = new Map(); // handler -> Set<clientId>
  private typeIndex: Map<string, Set<string>> = new Map();    // type -> Set<clientId>

  // Event listeners
  private joinListeners: ClientEventCallback[] = [];
  private leftListeners: ClientLeftCallback[] = [];

  /**
   * Register a client
   */
  async register(client: Client): Promise<void> {
    // Validate client data - only id is required
    if (!client.id) {
      throw new Error('Client must have an id');
    }

    // Set defaults
    if (!client.status) client.status = 'online';
    if (!client.lastSeen) client.lastSeen = Date.now();

    // Store client
    this.clients.set(client.id, client);

    // Update indices
    this.updateHandlerIndex(client);
    this.updateTypeIndex(client);

    // TODO: Persist to distributed storage (etcd, Redis)
    // await this.storage.set(`client:${client.id}`, client);

    // Emit event
    this.emitClientJoined(client);

    console.log(`Client registered: ${client.name} (${client.id})`);
  }

  /**
   * Update client heartbeat
   */
  async heartbeat(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Update last seen
    client.lastSeen = Date.now();
    client.status = 'online';

    // TODO: Update in distributed storage
    // await this.storage.set(`client:${clientId}`, client);
  }

  /**
   * Unregister a client
   */
  async unregister(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);

    if (!client) {
      return; // Already unregistered
    }

    // Remove from indices
    this.removeFromHandlerIndex(client);
    this.removeFromTypeIndex(client);

    // Remove from map
    this.clients.delete(clientId);

    // TODO: Remove from distributed storage
    // await this.storage.delete(`client:${clientId}`);

    // Emit event
    this.emitClientLeft(clientId);

    console.log(`Client unregistered: ${client.name} (${clientId})`);
  }

  /**
   * List all clients (with optional filter)
   */
  async listClients(filter?: ClientFilter): Promise<Client[]> {
    let clients = Array.from(this.clients.values());

    // Apply filters
    if (filter?.type) {
      clients = clients.filter(c => c.type === filter.type);
    }

    if (filter?.status) {
      clients = clients.filter(c => c.status === filter.status);
    }

    if (filter?.platform) {
      clients = clients.filter(c => c.platform === filter.platform);
    }

    if (filter?.handler) {
      clients = clients.filter(c => c.handlers.includes(filter.handler!));
    }

    // TODO: In production, query distributed storage
    // const keys = await this.storage.keys('client:*');
    // const clients = await Promise.all(keys.map(k => this.storage.get(k)));

    return clients;
  }

  /**
   * Get client by ID
   */
  async getClient(clientId: string): Promise<Client | null> {
    const client = this.clients.get(clientId);

    // TODO: In production, query distributed storage
    // const client = await this.storage.get(`client:${clientId}`);

    return client || null;
  }

  /**
   * Find clients by handler
   */
  async findByHandler(handler: string): Promise<Client[]> {
    const clientIds = this.handlerIndex.get(handler);

    if (!clientIds || clientIds.size === 0) {
      return [];
    }

    const clients: Client[] = [];
    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client && client.status === 'online') {
        clients.push(client);
      }
    }

    // TODO: In production, query distributed storage
    // Use secondary index: handler -> [clientIds]

    return clients;
  }

  /**
   * Find clients by type
   */
  async findByType(type: string): Promise<Client[]> {
    const clientIds = this.typeIndex.get(type);

    if (!clientIds || clientIds.size === 0) {
      return [];
    }

    const clients: Client[] = [];
    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client && client.status === 'online') {
        clients.push(client);
      }
    }

    // TODO: In production, query distributed storage

    return clients;
  }

  /**
   * Register callback for client joined event
   */
  onClientJoined(callback: ClientEventCallback): void {
    this.joinListeners.push(callback);
  }

  /**
   * Register callback for client left event
   */
  onClientLeft(callback: ClientLeftCallback): void {
    this.leftListeners.push(callback);
  }

  /**
   * Start background cleanup task
   * Marks clients as offline if no heartbeat for 60 seconds
   */
  startCleanup(interval: number = 30000): void {
    setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60 seconds

      for (const [clientId, client] of this.clients.entries()) {
        if (client.status === 'online' && client.lastSeen && now - client.lastSeen > timeout) {
          client.status = 'offline';
          console.log(`Client marked offline (no heartbeat): ${client.name} (${clientId})`);

          // TODO: Optionally unregister after longer timeout
          // this.unregister(clientId);
        }
      }
    }, interval);
  }

  // Private methods

  private updateHandlerIndex(client: Client): void {
    for (const handler of client.handlers) {
      if (!this.handlerIndex.has(handler)) {
        this.handlerIndex.set(handler, new Set());
      }
      this.handlerIndex.get(handler)!.add(client.id);
    }
  }

  private removeFromHandlerIndex(client: Client): void {
    for (const handler of client.handlers) {
      const clientIds = this.handlerIndex.get(handler);
      if (clientIds) {
        clientIds.delete(client.id);
        if (clientIds.size === 0) {
          this.handlerIndex.delete(handler);
        }
      }
    }
  }

  private updateTypeIndex(client: Client): void {
    if (!client.type) return;
    if (!this.typeIndex.has(client.type)) {
      this.typeIndex.set(client.type, new Set());
    }
    this.typeIndex.get(client.type)!.add(client.id);
  }

  private removeFromTypeIndex(client: Client): void {
    if (!client.type) return;
    const clientIds = this.typeIndex.get(client.type);
    if (clientIds) {
      clientIds.delete(client.id);
      if (clientIds.size === 0) {
        this.typeIndex.delete(client.type);
      }
    }
  }

  private emitClientJoined(client: Client): void {
    for (const listener of this.joinListeners) {
      try {
        listener(client);
      } catch (error) {
        console.error('Error in client joined listener:', error);
      }
    }
  }

  private emitClientLeft(clientId: string): void {
    for (const listener of this.leftListeners) {
      try {
        listener(clientId);
      } catch (error) {
        console.error('Error in client left listener:', error);
      }
    }
  }
}
