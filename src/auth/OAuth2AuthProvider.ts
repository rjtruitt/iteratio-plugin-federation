/**
 * OAuth2AuthProvider
 *
 * OAuth 2.0 authentication for app-to-app federation.
 * Supports client credentials flow.
 */

import axios from 'axios';
import { AuthProvider } from './AuthProvider';

export interface OAuth2Config {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes?: string[];
  audience?: string;
}

export class OAuth2AuthProvider implements AuthProvider {
  private config: OAuth2Config;
  private accessToken?: string;
  private tokenExpiry?: number;

  constructor(config: OAuth2Config) {
    this.config = config;
  }

  async authenticate(): Promise<void> {
    // TODO: Implement OAuth2 client credentials flow
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);

    if (this.config.scopes && this.config.scopes.length > 0) {
      params.append('scope', this.config.scopes.join(' '));
    }

    if (this.config.audience) {
      params.append('audience', this.config.audience);
    }

    try {
      const response = await axios.post(this.config.tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;

      // Calculate expiry (subtract 60 seconds for safety margin)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + (expiresIn - 60) * 1000;

      console.log('OAuth2 authentication successful');
    } catch (error: any) {
      console.error('OAuth2 authentication failed:', error.message);
      throw new Error(`OAuth2 authentication failed: ${error.message}`);
    }
  }

  async getHeaders(): Promise<Record<string, string>> {
    // Check if token needs refresh
    if (!this.accessToken || (this.tokenExpiry && Date.now() >= this.tokenExpiry)) {
      await this.authenticate();
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`
    };
  }

  async refresh(): Promise<void> {
    // Re-authenticate (client credentials doesn't use refresh tokens)
    await this.authenticate();
  }
}
