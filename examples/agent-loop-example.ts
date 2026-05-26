/**
 * Agent Loop Example
 *
 * Example of an agent orchestrator that coordinates with other apps.
 * Uses system role for full access.
 */

import { FederationPlugin } from '../src/index';
import { Iteratio } from 'iteratio';

async function main() {
  // Create federation plugin with system role
  const federation = new FederationPlugin({
    eventBus: {
      url: 'nats://localhost:4222'
    },
    client: {
      type: 'agent',
      name: 'Agent Loop',
      handlers: ['orchestrate', 'delegate_task'],
      metadata: {
        version: '1.0.0'
      }
    },
    auth: {
      type: 'oauth2',
      clientId: 'agent-loop',
      clientSecret: process.env.CLIENT_SECRET || 'your-client-secret',
      tokenEndpoint: 'https://auth.example.com/oauth/token',
      scopes: ['events:*', 'requests:*', 'admin:*']
    },
    rbac: {
      role: 'system'  // Full access
    }
  });

  // Create Iteratio app
  const app = new Iteratio();
  app.use(federation);

  await app.initialize();

  console.log('Agent loop connected to federation');

  // Get registry
  const registry = federation.getRegistry();

  // Example: Ask user for confirmation (delegate to mobile app)
  async function askUserConfirmation(question: string, options: string[]): Promise<string> {
    // Find mobile apps that can handle ask_user
    const mobileApps = await registry.findByHandler('ask_user');

    if (mobileApps.length === 0) {
      throw new Error('No mobile app available for user input');
    }

    console.log(`Asking user via ${mobileApps[0].name}...`);

    // Send request to mobile app
    const response = await federation.request('ask_user', {
      question,
      options
    }, { timeout: 60000 });

    return response.answer;
  }

  // Example: Check if app is running (delegate to desktop app)
  async function checkAppRunning(appName: string): Promise<boolean> {
    // Find desktop apps
    const desktopApps = await registry.findByHandler('check_app_running');

    if (desktopApps.length === 0) {
      throw new Error('No desktop app available for app checks');
    }

    console.log(`Checking if ${appName} is running via ${desktopApps[0].name}...`);

    // Send request to desktop app
    const response = await federation.request('check_app_running', {
      appName
    });

    return response.isRunning;
  }

  // Example: Orchestrate deployment workflow
  async function deployWorkflow() {
    console.log('\n=== Starting Deployment Workflow ===\n');

    // Step 1: Check if required apps are running
    console.log('Step 1: Checking prerequisites...');
    const dockerRunning = await checkAppRunning('docker');
    console.log(`Docker running: ${dockerRunning}`);

    if (!dockerRunning) {
      console.log('Docker not running. Aborting deployment.');
      return;
    }

    // Step 2: Ask user for confirmation
    console.log('\nStep 2: Requesting user confirmation...');
    const answer = await askUserConfirmation(
      'Deploy to production?',
      ['Yes', 'No', 'Cancel']
    );

    console.log(`User answered: ${answer}`);

    if (answer !== 'Yes') {
      console.log('Deployment cancelled by user');
      return;
    }

    // Step 3: Execute deployment (delegate to CI/CD service)
    console.log('\nStep 3: Executing deployment...');

    // Find CI/CD services
    const cicdServices = await registry.findByHandler('deploy');

    if (cicdServices.length > 0) {
      const response = await federation.request('deploy', {
        version: 'v1.2.3',
        environment: 'production'
      }, { timeout: 300000 }); // 5 minutes

      console.log('Deployment complete:', response);
    } else {
      console.log('No CI/CD service available, simulating deployment...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('Deployment complete (simulated)');
    }

    // Step 4: Broadcast deployment success
    console.log('\nStep 4: Broadcasting deployment event...');
    await federation.publish('app.deployment.complete', {
      type: 'event_notification',
      from: 'agent-loop',
      event: 'app.deployment.complete',
      data: {
        version: 'v1.2.3',
        environment: 'production',
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });

    console.log('\n=== Deployment Workflow Complete ===\n');
  }

  // Register handler for orchestration requests
  await federation.registerHandler('orchestrate', async (payload) => {
    const { workflow } = payload;

    if (workflow === 'deploy') {
      await deployWorkflow();
      return { success: true };
    }

    return {
      success: false,
      error: `Unknown workflow: ${workflow}`
    };
  });

  // Subscribe to all events for monitoring
  await federation.subscribe('**', (message) => {
    console.log('Event:', message.type, message.event || '');
  });

  // Listen for client events
  registry.onClientJoined((client) => {
    console.log(`✓ Client joined: ${client.name} (${client.type})`);
  });

  registry.onClientLeft((clientId) => {
    console.log(`✗ Client left: ${clientId}`);
  });

  console.log('Agent loop ready');

  // Run example deployment after 5 seconds
  setTimeout(async () => {
    try {
      await deployWorkflow();
    } catch (error) {
      console.error('Deployment workflow failed:', error);
    }
  }, 5000);

  // Keep process running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await app.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);
