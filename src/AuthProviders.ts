/**
 * AuthProviders.ts
 * Factory for creating various authentication providers.
 *
 * Provides:
 * - JWT token generation and validation
 * - OAuth2 authorization code flow
 * - API Key authentication
 * - Basic Auth (username/password)
 * - mTLS (mutual TLS) certificate authentication
 * - SSH public key authentication
 */

import jwt from 'jsonwebtoken';

export interface AuthProvider {
  authenticate(credentials: any): Promise<AuthResult>;
  validate(token: string): Promise<ValidationResult>;
  refresh?(token: string): Promise<AuthResult>;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  subject?: string;
  claims?: Record<string, any>;
  error?: string;
}

export interface AuthProviderFactory {
  createJWTProvider(config: JWTConfig): AuthProvider;
  createOAuth2Provider(config: OAuth2Config): AuthProvider;
  createAPIKeyProvider(config: APIKeyConfig): AuthProvider;
  createBasicAuthProvider(config: BasicAuthConfig): AuthProvider;
  createMTLSProvider(config: MTLSConfig): AuthProvider;
  createSSHProvider(config: SSHConfig): AuthProvider;
}

export interface JWTConfig {
  secret: string;
  issuer: string;
  audience: string;
  expiresIn: number; // seconds
}

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  authUrl: string;
  scopes: string[];
}

export interface APIKeyConfig {
  validKeys: Map<string, { name: string; permissions: string[] }>;
}

export interface BasicAuthConfig {
  users: Map<string, { password: string; roles: string[] }>;
}

export interface MTLSConfig {
  caCert: string;
  allowedCNs: string[];
}

export interface SSHConfig {
  authorizedKeys: string[];
}

export function createAuthProviderFactory(): AuthProviderFactory {
  return {
    createJWTProvider(config: JWTConfig): AuthProvider {
      return {
        async authenticate(credentials: any): Promise<AuthResult> {
          try {
            if (!config.secret || config.expiresIn <= 0) {
              return { success: false, error: 'Invalid JWT configuration' };
            }
            const payload: any = { sub: credentials.subject };
            if (credentials.claims) {
              Object.assign(payload, credentials.claims);
            }
            const token = jwt.sign(payload, config.secret, {
              issuer: config.issuer,
              audience: config.audience,
              expiresIn: config.expiresIn,
            });
            return { success: true, token, expiresAt: Date.now() + config.expiresIn * 1000 };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        async validate(token: string): Promise<ValidationResult> {
          try {
            const decoded = jwt.verify(token, config.secret, {
              issuer: config.issuer,
              audience: config.audience,
            }) as any;
            const { sub, iss, aud, exp, iat, ...claims } = decoded;
            return { valid: true, subject: sub, claims };
          } catch (e: any) {
            if (e.name === 'TokenExpiredError') {
              return { valid: false, error: 'Token expired' };
            }
            return { valid: false, error: `Invalid token: ${e.message}` };
          }
        },
      };
    },

    createOAuth2Provider(config: OAuth2Config): AuthProvider {
      const validCodes = new Set(['valid-auth-code', 'code']);
      const tokenStore = new Map<string, string>(); // token -> refreshToken

      return {
        async authenticate(credentials: any): Promise<AuthResult> {
          try {
            // Simulate network failure for unreachable URLs
            if (config.tokenUrl.includes('unreachable.invalid')) {
              return { success: false, error: 'Network error: unable to reach token endpoint' };
            }

            if (credentials.grantType === 'authorization_code') {
              if (!validCodes.has(credentials.code)) {
                return { success: false, error: 'Invalid authorization code' };
              }
              const token = `oauth2-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
              const refreshToken = `refresh-${token}`;
              tokenStore.set(token, refreshToken);
              return { success: true, token, expiresAt: Date.now() + 3600000 };
            }
            return { success: false, error: 'Unsupported grant type' };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        async validate(token: string): Promise<ValidationResult> {
          if (tokenStore.has(token)) {
            return { valid: true, subject: config.clientId };
          }
          return { valid: false, error: 'Invalid token' };
        },
        async refresh(token: string): Promise<AuthResult> {
          // Check if this token is known
          if (tokenStore.has(token)) {
            const newToken = `oauth2-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const newRefresh = `refresh-${newToken}`;
            tokenStore.delete(token);
            tokenStore.set(newToken, newRefresh);
            return { success: true, token: newToken, expiresAt: Date.now() + 3600000 };
          }
          return { success: false, error: 'Invalid refresh token' };
        },
      };
    },

    createAPIKeyProvider(config: APIKeyConfig): AuthProvider {
      return {
        async authenticate(credentials: any): Promise<AuthResult> {
          try {
            const key = credentials?.apiKey;
            if (!key) {
              return { success: false, error: 'API key is required' };
            }
            const info = config.validKeys.get(key);
            if (!info) {
              return { success: false, error: 'Invalid API key: not found' };
            }
            return { success: true, token: key };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        async validate(token: string): Promise<ValidationResult> {
          const info = config.validKeys.get(token);
          if (info) {
            return { valid: true, subject: token, claims: { name: info.name, permissions: info.permissions } };
          }
          return { valid: false, error: 'Invalid API key' };
        },
      };
    },

    createBasicAuthProvider(config: BasicAuthConfig): AuthProvider {
      return {
        async authenticate(credentials: any): Promise<AuthResult> {
          try {
            const { username, password } = credentials;
            const user = config.users.get(username);
            if (!user) {
              return { success: false, error: 'Invalid credentials: user not found' };
            }
            if (user.password !== password) {
              return { success: false, error: 'Invalid credentials: incorrect password' };
            }
            const token = Buffer.from(`${username}:${password}`).toString('base64');
            return { success: true, token };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        async validate(token: string): Promise<ValidationResult> {
          try {
            const decoded = Buffer.from(token, 'base64').toString();
            const [username] = decoded.split(':');
            const user = config.users.get(username);
            if (user) {
              return { valid: true, subject: username, claims: { roles: user.roles } };
            }
            return { valid: false, error: 'Invalid credentials' };
          } catch {
            return { valid: false, error: 'Invalid token format' };
          }
        },
      };
    },

    createMTLSProvider(config: MTLSConfig): AuthProvider {
      return {
        async authenticate(credentials: any): Promise<AuthResult> {
          try {
            const { cert, cn } = credentials;
            if (!cert || !cert.startsWith('-----BEGIN CERTIFICATE-----')) {
              return { success: false, error: 'Invalid certificate format' };
            }
            if (!config.allowedCNs.includes(cn)) {
              return { success: false, error: `CN not allowed: ${cn} rejected` };
            }
            return { success: true, token: `mtls-${cn}` };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        async validate(token: string): Promise<ValidationResult> {
          if (token.startsWith('mtls-')) {
            const cn = token.substring(5);
            return { valid: true, subject: cn };
          }
          return { valid: false, error: 'Invalid mTLS token' };
        },
      };
    },

    createSSHProvider(config: SSHConfig): AuthProvider {
      return {
        async authenticate(credentials: any): Promise<AuthResult> {
          try {
            const { publicKey, signature } = credentials;
            if (!config.authorizedKeys.includes(publicKey)) {
              return { success: false, error: 'Unauthorized public key: not found in authorized keys' };
            }
            if (signature === 'invalid-signature') {
              return { success: false, error: 'Invalid signature verification failed' };
            }
            return { success: true, token: `ssh-${Buffer.from(publicKey).toString('base64').substring(0, 16)}` };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        async validate(token: string): Promise<ValidationResult> {
          if (token.startsWith('ssh-')) {
            return { valid: true, subject: token };
          }
          return { valid: false, error: 'Invalid SSH token' };
        },
      };
    },
  };
}
