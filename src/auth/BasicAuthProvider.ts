/**
 * BasicAuthProvider
 *
 * HTTP Basic authentication.
 * Simple username/password auth (should use HTTPS in production).
 */

import { AuthProvider } from './AuthProvider';

export interface BasicAuthConfig {
  type: 'basic';
  username: string;
  password: string;
}

export class BasicAuthProvider implements AuthProvider {
  private config: BasicAuthConfig;
  private authHeader: string;

  constructor(config: BasicAuthConfig) {
    this.config = config;
    this.authHeader = '';
  }

  async authenticate(): Promise<void> {
    // Create Base64 encoded credentials
    const credentials = `${this.config.username}:${this.config.password}`;
    this.authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

    console.log('Basic authentication configured');
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {
      'Authorization': this.authHeader
    };
  }
}
