/**
 * APIKeyAuthProvider
 *
 * Simple API key authentication.
 * Suitable for simple clients, testing, and internal services.
 */

import { AuthProvider } from './AuthProvider';

export interface APIKeyConfig {
  type: 'apikey';
  apiKey: string;
  headerName?: string;  // Default: 'X-API-Key'
}

export class APIKeyAuthProvider implements AuthProvider {
  private config: APIKeyConfig;

  constructor(config: APIKeyConfig) {
    this.config = config;
  }

  async authenticate(): Promise<void> {
    // No authentication needed for API key
    // Key is sent with each request
    console.log('API key authentication configured');
  }

  async getHeaders(): Promise<Record<string, string>> {
    const headerName = this.config.headerName || 'X-API-Key';

    return {
      [headerName]: this.config.apiKey
    };
  }
}
