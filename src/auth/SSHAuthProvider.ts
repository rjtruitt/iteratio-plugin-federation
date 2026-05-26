/**
 * SSHAuthProvider
 *
 * SSH key-based authentication.
 * Suitable for secure connections over SSH tunnels.
 */

import fs from 'fs';
import { AuthProvider } from './AuthProvider';

export interface SSHConfig {
  type: 'ssh';
  username: string;
  privateKey: string | Buffer;  // SSH private key (PEM)
  passphrase?: string;          // Key passphrase if encrypted
  host?: string;                // SSH host (for tunneling)
  port?: number;                // SSH port (default: 22)
}

export class SSHAuthProvider implements AuthProvider {
  private config: SSHConfig;
  private sshKey: Buffer;

  constructor(config: SSHConfig) {
    this.config = config;
    this.sshKey = Buffer.from(''); // Initialize
  }

  async authenticate(): Promise<void> {
    // Load SSH private key
    this.sshKey = typeof this.config.privateKey === 'string'
      ? fs.readFileSync(this.config.privateKey)
      : this.config.privateKey;

    // TODO: Validate key format
    // TODO: Setup SSH tunnel if host/port provided

    console.log('SSH authentication configured');
  }

  async getHeaders(): Promise<Record<string, string>> {
    // SSH auth typically doesn't use HTTP headers
    // This would be used for SSH tunnel authentication
    return {};
  }

  /**
   * Get SSH connection options
   */
  getSSHOptions(): any {
    return {
      username: this.config.username,
      privateKey: this.sshKey,
      passphrase: this.config.passphrase
    };
  }

  /**
   * Get tunnel configuration
   */
  getTunnelConfig(): { host: string; port: number } | null {
    if (this.config.host) {
      return {
        host: this.config.host,
        port: this.config.port || 22
      };
    }
    return null;
  }
}
