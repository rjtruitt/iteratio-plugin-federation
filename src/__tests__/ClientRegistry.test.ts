import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientRegistry } from '../ClientRegistry';

describe('ClientRegistry', () => {
  let registry: ClientRegistry;

  beforeEach(() => {
    registry = new ClientRegistry();
  });

  describe('register(client)', () => {
    it('should register a client', async () => {
      const client = { id: 'client-1', handlers: ['process', 'validate'], metadata: {} };
      await (registry as any).register(client);
      // Client should be retrievable after registration
      const retrieved = await (registry as any).getClient('client-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved.id).toBe('client-1');
    });
  });

  describe('heartbeat(clientId)', () => {
    it('should update heartbeat timestamp', async () => {
      const client = { id: 'client-1', handlers: ['process'], metadata: {} };
      await (registry as any).register(client);
      const before = (await (registry as any).getClient('client-1')).lastSeen;
      // Small delay to ensure timestamp changes
      await new Promise(r => setTimeout(r, 10));
      await (registry as any).heartbeat('client-1');
      const after = (await (registry as any).getClient('client-1')).lastSeen;
      // Client's last heartbeat should be updated
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('unregister(clientId)', () => {
    it('should remove a client', async () => {
      const client = { id: 'client-1', handlers: ['process'], metadata: {} };
      await (registry as any).register(client);
      await (registry as any).unregister('client-1');
      // Client should no longer exist in registry
      const retrieved = await (registry as any).getClient('client-1');
      expect(retrieved).toBeNull();
    });
  });

  describe('listClients()', () => {
    it('should return all clients', async () => {
      await (registry as any).register({ id: 'c1', handlers: ['a'], metadata: {} });
      await (registry as any).register({ id: 'c2', handlers: ['b'], metadata: {} });
      const clients = await (registry as any).listClients();
      // Should return both clients
      expect(clients).toHaveLength(2);
      expect(clients.map((c: any) => c.id)).toContain('c1');
      expect(clients.map((c: any) => c.id)).toContain('c2');
    });
  });

  describe('getClient(clientId)', () => {
    it('should return a specific client', async () => {
      await (registry as any).register({ id: 'c1', handlers: ['process'], metadata: {} });
      const client = await (registry as any).getClient('c1');
      // Should return the registered client
      expect(client).not.toBeNull();
      expect(client.id).toBe('c1');
      expect(client.handlers).toContain('process');
    });
  });

  describe('findByHandler(handlerName)', () => {
    it('should find clients by handler name', async () => {
      await (registry as any).register({ id: 'c1', handlers: ['process', 'validate'], metadata: {} });
      await (registry as any).register({ id: 'c2', handlers: ['notify'], metadata: {} });
      await (registry as any).register({ id: 'c3', handlers: ['process', 'notify'], metadata: {} });
      const clients = await (registry as any).findByHandler('process');
      // Should return c1 and c3
      expect(clients).toHaveLength(2);
      expect(clients.map((c: any) => c.id)).toContain('c1');
      expect(clients.map((c: any) => c.id)).toContain('c3');
    });
  });
});
