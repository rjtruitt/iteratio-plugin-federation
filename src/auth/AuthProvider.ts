/**
 * AuthProvider
 *
 * Base interface for authentication providers.
 */

export interface AuthProvider {
  /**
   * Authenticate and obtain credentials
   */
  authenticate(): Promise<void>;

  /**
   * Get headers for authenticated requests
   */
  getHeaders(): Promise<Record<string, string>>;

  /**
   * Get TLS options (for mTLS)
   */
  getTLSOptions?(): any;

  /**
   * Refresh authentication if needed
   */
  refresh?(): Promise<void>;
}

/**
 * Factory function to create auth provider
 */
export function getAuthProvider(authConfig: any): AuthProvider {
  const type = authConfig.type;

  switch (type) {
    case 'oauth2':
      return new (require('./OAuth2AuthProvider').OAuth2AuthProvider)(authConfig);

    case 'apikey':
      return new (require('./APIKeyAuthProvider').APIKeyAuthProvider)(authConfig);

    case 'jwt':
      return new (require('./JWTAuthProvider').JWTAuthProvider)(authConfig);

    case 'mtls':
      return new (require('./MTLSAuthProvider').MTLSAuthProvider)(authConfig);

    case 'ssh':
      return new (require('./SSHAuthProvider').SSHAuthProvider)(authConfig);

    case 'basic':
      return new (require('./BasicAuthProvider').BasicAuthProvider)(authConfig);

    default:
      throw new Error(`Unknown auth type: ${type}`);
  }
}
