/**
 * MTLSAuthProvider
 *
 * Mutual TLS authentication (client certificates).
 * Suitable for service-to-service communication.
 */

import fs from 'fs';
import { AuthProvider } from './AuthProvider';

export interface MTLSConfig {
  type: 'mtls';
  cert: string | Buffer;     // Client certificate (PEM)
  key: string | Buffer;      // Client private key (PEM)
  ca?: string | Buffer;      // CA certificate (PEM)
  passphrase?: string;       // Key passphrase if encrypted
}

export class MTLSAuthProvider implements AuthProvider {
  private config: MTLSConfig;
  private tlsOptions: any;

  constructor(config: MTLSConfig) {
    this.config = config;
  }

  async authenticate(): Promise<void> {
    // Load certificates
    const cert = typeof this.config.cert === 'string'
      ? fs.readFileSync(this.config.cert)
      : this.config.cert;

    const key = typeof this.config.key === 'string'
      ? fs.readFileSync(this.config.key)
      : this.config.key;

    const ca = this.config.ca
      ? (typeof this.config.ca === 'string'
        ? fs.readFileSync(this.config.ca)
        : this.config.ca)
      : undefined;

    // Prepare TLS options
    this.tlsOptions = {
      cert,
      key,
      ca,
      passphrase: this.config.passphrase,
      rejectUnauthorized: true
    };

    console.log('mTLS authentication configured');
  }

  async getHeaders(): Promise<Record<string, string>> {
    // mTLS doesn't use headers, uses TLS handshake
    return {};
  }

  getTLSOptions(): any {
    return this.tlsOptions;
  }
}
