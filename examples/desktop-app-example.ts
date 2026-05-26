/**
 * Desktop App Example
 *
 * Example of a desktop app that handles system checks.
 * Uses direct WebSocket connection (no firewall).
 */

import { FederationPlugin } from '../src/index';
import { Iteratio } from 'iteratio';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

async function main() {
  // Create federation plugin
  const federation = new FederationPlugin({
    eventBus: {
      url: 'ws://192.168.1.10:8080'
    },
    connection: {
      mode: 'direct'
    },
    client: {
      type: 'desktop',
      name: 'MacBook Pro',
      platform: 'macos',
      handlers: ['check_app_running', 'file_access', 'execute_command'],
      metadata: {
        appVersion: '1.0.0',
        deviceName: 'MacBook Pro 16"',
        userId: 'user-456'
      }
    },
    auth: {
      type: 'apikey',
      apiKey: process.env.API_KEY || 'your-api-key'
    },
    rbac: {
      role: 'handler'
    }
  });

  // Create Iteratio app
  const app = new Iteratio();
  app.use(federation);

  await app.initialize();

  console.log('Desktop app connected to federation');

  // Register handler: check if app is running
  await federation.registerHandler('check_app_running', async (payload) => {
    const { appName } = payload;

    try {
      // macOS specific - check with pgrep
      const { stdout } = await execAsync(`pgrep -f "${appName}"`);
      const processIds = stdout.trim().split('\n').filter(Boolean);

      return {
        isRunning: processIds.length > 0,
        processIds,
        count: processIds.length
      };
    } catch (error) {
      // pgrep returns exit code 1 if no matches
      return {
        isRunning: false,
        processIds: [],
        count: 0
      };
    }
  });

  // Register handler: file access (read file)
  await federation.registerHandler('file_access', async (payload) => {
    const { path, operation } = payload;

    try {
      if (operation === 'read') {
        const content = await fs.readFile(path, 'utf-8');
        return {
          success: true,
          content,
          size: content.length
        };
      } else if (operation === 'exists') {
        try {
          await fs.access(path);
          return { success: true, exists: true };
        } catch {
          return { success: true, exists: false };
        }
      } else if (operation === 'stat') {
        const stats = await fs.stat(path);
        return {
          success: true,
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          modified: stats.mtime
        };
      }

      return {
        success: false,
        error: `Unknown operation: ${operation}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Register handler: execute command
  await federation.registerHandler('execute_command', async (payload) => {
    const { command, timeout = 30000 } = payload;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout
      });

      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1
      };
    }
  });

  // Subscribe to deployment events
  await federation.subscribe('app.deployment.*', (message) => {
    console.log('Deployment event:', message.data);
  });

  console.log('Desktop app ready to handle requests');

  // Keep process running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await app.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);
