import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusClient } from '../EventBusClient';

describe('EventBusClient', () => {
  let client: EventBusClient;

  beforeEach(() => {
    client = new EventBusClient();
  });

  describe('connect(config)', () => {
    it('should connect to the federation bus', async () => {
      const config = { url: 'ws://localhost:8080', clientId: 'test-client' };
      await (client as any).connect(config);
      // Client should be connected
      expect((client as any).connected).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect from the federation bus', async () => {
      await (client as any).connect({ url: 'ws://localhost:8080', clientId: 'test-client' });
      await (client as any).disconnect();
      // Client should be disconnected
      expect((client as any).connected).toBe(false);
    });
  });

  describe('subscribe(topic, handler)', () => {
    it('should subscribe to a topic', async () => {
      await (client as any).connect({ url: 'ws://localhost:8080', clientId: 'test-client' });
      const handler = vi.fn();
      const subId = await (client as any).subscribe('task.completed', handler);
      // Handler should be registered for the topic
      expect(subId).toBeDefined();
      expect(typeof subId).toBe('string');
    });
  });

  describe('publish(topic, data)', () => {
    it('should publish data to a topic', async () => {
      await (client as any).connect({ url: 'ws://localhost:8080', clientId: 'test-client' });
      const handler = vi.fn();
      await (client as any).subscribe('task.created', handler);
      await (client as any).publish('task.created', { taskId: '123', title: 'New Task' });
      // Message should be published to the topic
      expect(handler).toHaveBeenCalledWith({ taskId: '123', title: 'New Task' });
    });
  });

  describe('request(topic, data, timeout)', () => {
    it('should send a request and wait for reply', async () => {
      await (client as any).connect({ url: 'ws://localhost:8080', clientId: 'test-client' });
      // Register a handler that will reply
      (client as any).registerHandler('service.status', async (payload: any) => {
        return { status: 'ok', service: payload.service };
      });
      const result = await (client as any).request('service.status', { service: 'api' }, { timeout: 5000 });
      // Should resolve with a reply
      expect(result).toEqual({ status: 'ok', service: 'api' });
    });
  });

  describe('registerHandler(name, handler)', () => {
    it('should register a named handler', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      (client as any).registerHandler('processTask', handler);
      // Handler should be callable by name from other clients
      expect((client as any).requestHandlers.get('processTask')).toBe(handler);
    });
  });
});
