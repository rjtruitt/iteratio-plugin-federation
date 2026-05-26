/**
 * Mobile App Example
 *
 * Example of a mobile app that handles user input requests.
 * Uses reverse-tunnel to bypass firewall.
 */

import { FederationPlugin } from '../src/index';
import { Iteratio } from 'iteratio';

async function main() {
  // Create federation plugin
  const federation = new FederationPlugin({
    eventBus: {
      url: 'wss://your-server.com/tunnel'
    },
    connection: {
      mode: 'reverse-tunnel'  // Behind firewall
    },
    client: {
      type: 'mobile',
      name: 'iPhone 15',
      platform: 'ios',
      handlers: ['ask_user', 'notify_user'],
      metadata: {
        appVersion: '1.0.0',
        deviceName: 'iPhone 15 Pro',
        userId: 'user-123'
      }
    },
    auth: {
      type: 'jwt',
      token: process.env.JWT_TOKEN || 'your-jwt-token'
    },
    rbac: {
      role: 'handler',
      customPermissions: [
        { resource: 'events', action: 'read', scope: 'agent.*' }
      ]
    },
    rateLimit: {
      maxRequestsPerSecond: 10,
      maxSubscriptions: 50
    }
  });

  // Create Iteratio app
  const app = new Iteratio();
  app.use(federation);

  await app.initialize();

  console.log('Mobile app connected to federation');

  // Register handler for ask_user
  await federation.registerHandler('ask_user', async (payload) => {
    const { question, options } = payload;

    console.log(`\nQuestion: ${question}`);
    console.log('Options:', options);

    // Simulate native dialog
    // In real app: const answer = await showNativeDialog(question, options);
    const answer = options[0]; // Just pick first option for demo

    return {
      answer,
      answeredAt: Date.now()
    };
  });

  // Register handler for notify_user
  await federation.registerHandler('notify_user', async (payload) => {
    const { title, message, level } = payload;

    console.log(`\n[${level}] ${title}: ${message}`);

    // In real app: await showNativePushNotification({ title, message, level });

    return {
      notified: true
    };
  });

  // Subscribe to agent events
  await federation.subscribe('agent.tool.call', (message) => {
    console.log('Agent called tool:', message.data);
  });

  // Listen for client events
  const registry = federation.getRegistry();

  registry.onClientJoined((client) => {
    console.log('Client joined:', client.name);
  });

  registry.onClientLeft((clientId) => {
    console.log('Client left:', clientId);
  });

  console.log('Mobile app ready to handle requests');

  // Keep process running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await app.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);
