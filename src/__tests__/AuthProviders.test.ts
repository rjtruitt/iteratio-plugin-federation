import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAuthProviderFactory,
  AuthProvider,
  AuthProviderFactory,
} from '../AuthProviders';

describe('AuthProviders', () => {
  let factory: AuthProviderFactory;

  beforeEach(() => {
    factory = createAuthProviderFactory();
  });

  describe('JWT Provider', () => {
    let jwtProvider: AuthProvider;

    beforeEach(() => {
      jwtProvider = factory.createJWTProvider({
        secret: 'test-secret-key-32-chars-long!!',
        issuer: 'iteratio-federation',
        audience: 'agent-network',
        expiresIn: 3600,
      });
    });

    it('should generate a valid JWT token', async () => {
      const result = await jwtProvider.authenticate({ subject: 'agent-1', claims: { role: 'editor' } });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token!.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should validate a valid token', async () => {
      const auth = await jwtProvider.authenticate({ subject: 'agent-1' });
      const validation = await jwtProvider.validate(auth.token!);

      expect(validation.valid).toBe(true);
      expect(validation.subject).toBe('agent-1');
    });

    it('should reject an expired token', async () => {
      vi.useFakeTimers();

      const auth = await jwtProvider.authenticate({ subject: 'agent-1' });
      vi.advanceTimersByTime(3601 * 1000); // past expiry

      const validation = await jwtProvider.validate(auth.token!);
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/expired/i);

      vi.useRealTimers();
    });

    it('should reject a tampered token', async () => {
      const auth = await jwtProvider.authenticate({ subject: 'agent-1' });
      const tampered = auth.token! + 'TAMPERED';

      const validation = await jwtProvider.validate(tampered);
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/invalid|signature|tampered/i);
    });

    it('should include claims in validated token', async () => {
      const auth = await jwtProvider.authenticate({
        subject: 'agent-1',
        claims: { role: 'admin', org: 'org-alpha' },
      });

      const validation = await jwtProvider.validate(auth.token!);
      expect(validation.claims).toBeDefined();
      expect(validation.claims!.role).toBe('admin');
      expect(validation.claims!.org).toBe('org-alpha');
    });
  });

  describe('OAuth2 Provider', () => {
    let oauthProvider: AuthProvider;

    beforeEach(() => {
      oauthProvider = factory.createOAuth2Provider({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
        authUrl: 'https://auth.example.com/authorize',
        scopes: ['read', 'write'],
      });
    });

    it('should exchange authorization code for token', async () => {
      const result = await oauthProvider.authenticate({ grantType: 'authorization_code', code: 'valid-auth-code' });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should refresh an expired token', async () => {
      const initial = await oauthProvider.authenticate({ grantType: 'authorization_code', code: 'code' });
      const refreshed = await oauthProvider.refresh!(initial.token!);

      expect(refreshed.success).toBe(true);
      expect(refreshed.token).toBeDefined();
      expect(refreshed.token).not.toBe(initial.token);
    });

    it('should reject invalid authorization code', async () => {
      const result = await oauthProvider.authenticate({ grantType: 'authorization_code', code: 'invalid-code' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid.*code|unauthorized/i);
    });

    it('should reject refresh with invalid token', async () => {
      const result = await oauthProvider.refresh!('invalid-refresh-token');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid|expired|refresh/i);
    });
  });

  describe('API Key Provider', () => {
    let apiKeyProvider: AuthProvider;

    beforeEach(() => {
      const validKeys = new Map([
        ['key-abc-123', { name: 'Production App', permissions: ['read', 'write'] }],
        ['key-xyz-789', { name: 'Read-only App', permissions: ['read'] }],
      ]);
      apiKeyProvider = factory.createAPIKeyProvider({ validKeys });
    });

    it('should validate a correct API key', async () => {
      const result = await apiKeyProvider.authenticate({ apiKey: 'key-abc-123' });

      expect(result.success).toBe(true);
    });

    it('should reject an invalid API key', async () => {
      const result = await apiKeyProvider.authenticate({ apiKey: 'invalid-key' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid|not found|unauthorized/i);
    });

    it('should validate token returns key info', async () => {
      const auth = await apiKeyProvider.authenticate({ apiKey: 'key-abc-123' });
      const validation = await apiKeyProvider.validate(auth.token || 'key-abc-123');

      expect(validation.valid).toBe(true);
      expect(validation.claims?.name).toBe('Production App');
    });

    it('should reject empty API key', async () => {
      const result = await apiKeyProvider.authenticate({ apiKey: '' });

      expect(result.success).toBe(false);
    });
  });

  describe('Basic Auth Provider', () => {
    let basicProvider: AuthProvider;

    beforeEach(() => {
      const users = new Map([
        ['admin', { password: 'secret123', roles: ['admin'] }],
        ['user', { password: 'pass456', roles: ['viewer'] }],
      ]);
      basicProvider = factory.createBasicAuthProvider({ users });
    });

    it('should authenticate with valid credentials', async () => {
      const result = await basicProvider.authenticate({ username: 'admin', password: 'secret123' });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const result = await basicProvider.authenticate({ username: 'admin', password: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid|incorrect|unauthorized/i);
    });

    it('should reject unknown username', async () => {
      const result = await basicProvider.authenticate({ username: 'ghost', password: 'any' });

      expect(result.success).toBe(false);
    });

    it('should encode credentials in Base64', async () => {
      const result = await basicProvider.authenticate({ username: 'user', password: 'pass456' });

      // Token should be base64 encoded
      expect(result.token).toBeDefined();
      const decoded = Buffer.from(result.token!, 'base64').toString();
      expect(decoded).toContain('user');
    });
  });

  describe('mTLS Provider', () => {
    let mtlsProvider: AuthProvider;

    beforeEach(() => {
      mtlsProvider = factory.createMTLSProvider({
        caCert: '-----BEGIN CERTIFICATE-----\nMOCK_CA_CERT\n-----END CERTIFICATE-----',
        allowedCNs: ['agent.org-alpha.com', 'agent.org-beta.com'],
      });
    });

    it('should validate certificate with allowed CN', async () => {
      const result = await mtlsProvider.authenticate({
        cert: '-----BEGIN CERTIFICATE-----\nMOCK_CLIENT_CERT\n-----END CERTIFICATE-----',
        cn: 'agent.org-alpha.com',
      });

      expect(result.success).toBe(true);
    });

    it('should reject certificate with disallowed CN', async () => {
      const result = await mtlsProvider.authenticate({
        cert: '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----',
        cn: 'evil.attacker.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not allowed|rejected|unauthorized/i);
    });

    it('should reject invalid certificate', async () => {
      const result = await mtlsProvider.authenticate({ cert: 'not-a-cert', cn: 'agent.org-alpha.com' });

      expect(result.success).toBe(false);
    });
  });

  describe('SSH Provider', () => {
    let sshProvider: AuthProvider;

    beforeEach(() => {
      sshProvider = factory.createSSHProvider({
        authorizedKeys: [
          'ssh-rsa AAAAB3...key1... agent@org-alpha',
          'ssh-ed25519 AAAAC3...key2... agent@org-beta',
        ],
      });
    });

    it('should authenticate with authorized public key', async () => {
      const result = await sshProvider.authenticate({
        publicKey: 'ssh-rsa AAAAB3...key1... agent@org-alpha',
        signature: 'valid-signature-mock',
      });

      expect(result.success).toBe(true);
    });

    it('should reject unauthorized public key', async () => {
      const result = await sshProvider.authenticate({
        publicKey: 'ssh-rsa AAAAB3...unknown-key... hacker@evil',
        signature: 'some-signature',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unauthorized|not found|rejected/i);
    });

    it('should reject invalid signature', async () => {
      const result = await sshProvider.authenticate({
        publicKey: 'ssh-rsa AAAAB3...key1... agent@org-alpha',
        signature: 'invalid-signature',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/signature|invalid/i);
    });
  });

  describe('graceful failure handling', () => {
    it('should return clear error on JWT provider failure', async () => {
      const provider = factory.createJWTProvider({
        secret: '',
        issuer: 'test',
        audience: 'test',
        expiresIn: 0,
      });

      const result = await provider.authenticate({ subject: 'agent' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return clear error on OAuth2 network failure', async () => {
      const provider = factory.createOAuth2Provider({
        clientId: 'test',
        clientSecret: 'test',
        tokenUrl: 'https://unreachable.invalid/token',
        authUrl: 'https://unreachable.invalid/auth',
        scopes: [],
      });

      const result = await provider.authenticate({ grantType: 'authorization_code', code: 'x' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should never throw — always return structured error', async () => {
      const provider = factory.createAPIKeyProvider({
        validKeys: new Map(),
      });

      // Should not throw, should return error result
      const result = await provider.authenticate({ apiKey: null });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
