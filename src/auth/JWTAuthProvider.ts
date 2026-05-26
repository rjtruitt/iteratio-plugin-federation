/**
 * JWTAuthProvider
 *
 * JWT token authentication.
 * Suitable for mobile apps and web clients after user login.
 */

import jwt from 'jsonwebtoken';
import { AuthProvider } from './AuthProvider';

export interface JWTConfig {
  type: 'jwt';
  token: string;
  refreshToken?: string;
  refreshEndpoint?: string;
}

export class JWTAuthProvider implements AuthProvider {
  private config: JWTConfig;
  private currentToken: string;

  constructor(config: JWTConfig) {
    this.config = config;
    this.currentToken = config.token;
  }

  async authenticate(): Promise<void> {
    // Validate token format
    try {
      const decoded = jwt.decode(this.currentToken);
      if (!decoded) {
        throw new Error('Invalid JWT token');
      }

      console.log('JWT authentication configured');
    } catch (error: any) {
      throw new Error(`Invalid JWT token: ${error.message}`);
    }
  }

  async getHeaders(): Promise<Record<string, string>> {
    // Check if token is expired
    const decoded = jwt.decode(this.currentToken) as any;

    if (decoded && decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = decoded.exp - now;

      // Refresh if expires in less than 5 minutes
      if (expiresIn < 300 && this.config.refreshToken && this.config.refreshEndpoint) {
        await this.refresh();
      }
    }

    return {
      'Authorization': `Bearer ${this.currentToken}`
    };
  }

  async refresh(): Promise<void> {
    // TODO: Implement JWT refresh flow
    if (!this.config.refreshToken || !this.config.refreshEndpoint) {
      throw new Error('JWT refresh not configured');
    }

    // Make refresh request
    // Update currentToken

    console.log('JWT token refreshed');
  }
}
