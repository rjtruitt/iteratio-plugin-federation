/**
 * EventBus Connection Factories
 *
 * Handles establishing NATS and WebSocket connections for the EventBusClient.
 */

import { connect, NatsConnection, StringCodec } from 'nats';
import WebSocket from 'ws';
import { AuthProvider } from './auth/AuthProvider';

/**
 * Establish a NATS connection with optional TLS.
 */
export async function connectNATS(
  url: string,
  authProvider?: AuthProvider
): Promise<NatsConnection> {
  const tlsOptions = authProvider?.getTLSOptions?.();

  const nc = await connect({
    servers: [url],
    ...(tlsOptions ? { tls: tlsOptions } : {}),
  });

  console.log('NATS connection established');
  return nc;
}

/**
 * Establish a WebSocket connection with optional auth headers.
 * Returns the connected WebSocket instance.
 */
export async function connectWebSocket(
  url: string,
  authProvider?: AuthProvider,
  onMessage?: (data: string) => void,
  onDisconnect?: () => void
): Promise<WebSocket> {
  const authHeaders = authProvider ? await authProvider.getHeaders() : undefined;

  const ws = new WebSocket(url, {
    headers: authHeaders
  });

  ws.on('open', () => {
    console.log('WebSocket connection established');
  });

  ws.on('message', (data: string) => {
    if (onMessage) onMessage(data);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (onDisconnect) onDisconnect();
  });

  // Wait for connection
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  return ws;
}
