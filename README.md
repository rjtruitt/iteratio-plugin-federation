# iteratio-plugin-federation

Multi-app federation plugin for iteratio.

## Install

```
npm install iteratio-plugin-federation
```

## What It Does

Lets external apps (mobile, desktop, browser, IoT, services) connect to the agent event bus and participate in a distributed system. Apps register capabilities, handle requests, and coordinate work over WebSocket, reverse-tunnel, or polling connections. Includes RBAC, rate limiting, and auto-reconnection.

## Usage

```typescript
import { FederationPlugin } from 'iteratio-plugin-federation';
import { Iteratio } from 'iteratio';

const federation = new FederationPlugin({
  eventBus: { url: 'ws://localhost:8080' },
  client: { type: 'desktop', name: 'My App', handlers: ['check_app_running'] },
  auth: { type: 'apikey', apiKey: process.env.API_KEY }
});

const app = new Iteratio();
app.use(federation);
await app.initialize();

await federation.registerHandler('check_app_running', async (payload) => {
  return { isRunning: true };
});
```

## License

MIT
