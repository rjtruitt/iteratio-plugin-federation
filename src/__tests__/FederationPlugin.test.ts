import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFederationPlugin,
  FederationPlugin,
  FederationClient,
} from '../FederationPlugin';

describe('FederationPlugin', () => {
  let plugin: FederationPlugin;

  beforeEach(() => {
    plugin = createFederationPlugin({
      ownOrgId: 'org-alpha',
      registryUrl: 'https://registry.federation.local',
      securityPolicy: {
        allowedOrgs: ['org-alpha', 'org-beta', 'org-gamma'],
        deniedOrgs: ['org-evil'],
      },
    });
  });

  describe('client registration', () => {
    it('should register a federation client', async () => {
      const client: FederationClient = {
        orgId: 'org-alpha',
        name: 'data-processor',
        endpoint: 'https://agent.org-alpha.com/api',
        capabilities: ['data-analysis', 'reporting'],
        authConfig: { type: 'bearer', credentials: { token: 'abc' } },
      };

      await expect(plugin.registerClient(client)).resolves.not.toThrow();
    });

    it('should reject registration with invalid endpoint', async () => {
      const client: FederationClient = {
        orgId: 'org-alpha',
        name: 'bad-agent',
        endpoint: '', // invalid
        capabilities: [],
        authConfig: { type: 'none', credentials: {} },
      };

      await expect(plugin.registerClient(client)).rejects.toThrow(/endpoint|invalid/i);
    });

    it('should reject registration from denied org', async () => {
      const client: FederationClient = {
        orgId: 'org-evil',
        name: 'malicious-agent',
        endpoint: 'https://evil.com/api',
        capabilities: ['hacking'],
        authConfig: { type: 'bearer', credentials: { token: 'x' } },
      };

      await expect(plugin.registerClient(client)).rejects.toThrow(/denied|blocked|forbidden/i);
    });
  });

  describe('cross-org agent discovery', () => {
    it('should discover agents from federated registry', async () => {
      const agents = await plugin.discoverAgents();

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should filter by capability', async () => {
      await plugin.registerClient({
        orgId: 'org-beta',
        name: 'analyst',
        endpoint: 'https://agent.org-beta.com/api',
        capabilities: ['data-analysis'],
        authConfig: { type: 'bearer', credentials: { token: 'tok1' } },
      });

      const agents = await plugin.discoverAgents({ capabilities: ['data-analysis'] });

      for (const agent of agents) {
        expect(agent.capabilities).toContain('data-analysis');
      }
    });

    it('should filter by org', async () => {
      await plugin.registerClient({
        orgId: 'org-beta',
        name: 'beta-agent',
        endpoint: 'https://agent.org-beta.com/api',
        capabilities: ['general'],
        authConfig: { type: 'bearer', credentials: { token: 'tok2' } },
      });

      const agents = await plugin.discoverAgents({ orgId: 'org-beta' });

      for (const agent of agents) {
        expect(agent.orgId).toBe('org-beta');
      }
    });

    it('should return empty array when no agents match', async () => {
      const agents = await plugin.discoverAgents({ capabilities: ['quantum-computing'] });

      expect(agents).toHaveLength(0);
    });
  });

  describe('security boundary enforcement', () => {
    it('should allow requests between trusted orgs', () => {
      const decision = plugin.enforceSecurityBoundary(
        { action: 'invoke' },
        {
          callerOrgId: 'org-alpha',
          callerAgentId: 'agent-1',
          targetOrgId: 'org-beta',
          operation: 'execute_tool',
        }
      );

      expect(decision.allowed).toBe(true);
    });

    it('should deny requests to denied orgs', () => {
      const decision = plugin.enforceSecurityBoundary(
        { action: 'invoke' },
        {
          callerOrgId: 'org-alpha',
          callerAgentId: 'agent-1',
          targetOrgId: 'org-evil',
          operation: 'execute_tool',
        }
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/denied|blocked|forbidden/i);
    });

    it('should deny requests from unknown orgs', () => {
      const decision = plugin.enforceSecurityBoundary(
        { action: 'invoke' },
        {
          callerOrgId: 'org-unknown',
          callerAgentId: 'agent-x',
          targetOrgId: 'org-alpha',
          operation: 'read_data',
        }
      );

      expect(decision.allowed).toBe(false);
    });

    it('should enforce operation-level restrictions', () => {
      const decision = plugin.enforceSecurityBoundary(
        { action: 'admin' },
        {
          callerOrgId: 'org-beta',
          callerAgentId: 'agent-1',
          targetOrgId: 'org-alpha',
          operation: 'delete_all_data', // restricted operation
        }
      );

      expect(decision.allowed).toBe(false);
    });
  });

  describe('remote agent invocation', () => {
    it('should invoke a remote agent and return result', async () => {
      // Register a client first
      await plugin.registerClient({
        orgId: 'org-beta',
        name: 'helper-agent',
        endpoint: 'https://agent.org-beta.com/api',
        capabilities: ['summarization'],
        authConfig: { type: 'bearer', credentials: { token: 'valid' } },
      });

      const result = await plugin.invokeRemoteAgent('helper-agent', {
        task: 'summarize',
        input: 'Long text here...',
      });

      expect(result).toBeDefined();
    });

    it('should throw when invoking non-existent agent', async () => {
      await expect(
        plugin.invokeRemoteAgent('nonexistent-agent', { task: 'anything' })
      ).rejects.toThrow(/not found|unknown/i);
    });
  });

  describe('Adversarial: Federation Attacks', () => {
    it('should reject federated agent that sends forged org credentials', async () => {
      // Agent claims to be from org-beta but uses forged credentials
      const forgedClient: FederationClient = {
        orgId: 'org-beta',
        name: 'forged-agent',
        endpoint: 'https://attacker.com/api',
        capabilities: ['data-analysis'],
        authConfig: {
          type: 'bearer',
          credentials: { token: 'forged-token-not-valid-for-org-beta' },
        },
      };

      // Registration should fail because credentials don't validate for claimed org
      await expect(plugin.registerClient(forgedClient)).rejects.toThrow(/auth|credential|invalid|forbidden/i);
    });

    it('should prevent horizontal privilege escalation between agents', async () => {
      // Agent from org-beta tries to access org-gamma resources
      const decision = plugin.enforceSecurityBoundary(
        { action: 'read_data', targetAgent: 'gamma-private-agent' },
        {
          callerOrgId: 'org-beta',
          callerAgentId: 'beta-agent',
          targetOrgId: 'org-gamma',
          operation: 'read_private_data', // Not authorized cross-org
        }
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/privilege|unauthorized|denied/i);
    });

    it('should prevent vertical privilege escalation (reader to admin)', async () => {
      // Agent with reader role attempts admin operations
      const decision = plugin.enforceSecurityBoundary(
        { action: 'admin_operation', escalate: true },
        {
          callerOrgId: 'org-alpha',
          callerAgentId: 'reader-agent',
          targetOrgId: 'org-alpha',
          operation: 'delete_all_agents', // Admin-only operation
        }
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/privilege|role|admin|denied/i);
    });

    it('should reject federation token replay attack (same token used twice)', async () => {
      const client: FederationClient = {
        orgId: 'org-beta',
        name: 'replay-agent',
        endpoint: 'https://agent.org-beta.com/api',
        capabilities: ['compute'],
        authConfig: { type: 'bearer', credentials: { token: 'one-time-token-xyz' } },
      };

      // First use should succeed
      await plugin.registerClient(client);

      // Second use of same token should be rejected (token replay)
      await expect(plugin.registerClient({
        ...client,
        name: 'replay-agent-2',
      })).rejects.toThrow(/replay|reuse|expired|duplicate/i);
    });

    it('should reject agent that claims capabilities it does not have', async () => {
      // Agent registers claiming capabilities, but verification fails
      const liarClient: FederationClient = {
        orgId: 'org-beta',
        name: 'liar-agent',
        endpoint: 'https://agent.org-beta.com/api',
        capabilities: ['quantum-computing', 'time-travel', 'admin-access'],
        authConfig: { type: 'bearer', credentials: { token: 'valid-beta-token' } },
      };

      await plugin.registerClient(liarClient);

      // When trying to use claimed capabilities, they should be verified
      const agents = await plugin.discoverAgents({ capabilities: ['quantum-computing'] });

      // Unverified capabilities should not be discoverable
      expect(agents.find(a => a.name === 'liar-agent')).toBeUndefined();
    });

    it('should reject cross-org request with injected headers', async () => {
      // Attempt to inject auth headers into cross-org invocation
      const decision = plugin.enforceSecurityBoundary(
        {
          action: 'invoke',
          __headers: {
            'X-Admin-Override': 'true',
            'X-Org-Id': 'org-alpha', // Trying to impersonate org-alpha
          },
        },
        {
          callerOrgId: 'org-beta',
          callerAgentId: 'header-injector',
          targetOrgId: 'org-alpha',
          operation: 'admin_action',
        }
      );

      // Injected headers should not grant additional privileges
      expect(decision.allowed).toBe(false);
    });

    it('should reject federation handshake with downgraded TLS', async () => {
      // Agent attempts to register with HTTP instead of HTTPS (TLS downgrade)
      const insecureClient: FederationClient = {
        orgId: 'org-beta',
        name: 'insecure-agent',
        endpoint: 'http://agent.org-beta.com/api', // HTTP, not HTTPS
        capabilities: ['data-analysis'],
        authConfig: { type: 'bearer', credentials: { token: 'valid' } },
      };

      // Should reject non-TLS endpoints for federation
      await expect(plugin.registerClient(insecureClient)).rejects.toThrow(/https|tls|secure|ssl/i);
    });

    it('should detect agent impersonation via similar-name attack', async () => {
      // Register legitimate agent
      const legitimate: FederationClient = {
        orgId: 'org-beta',
        name: 'data-processor',
        endpoint: 'https://agent.org-beta.com/api',
        capabilities: ['data-analysis'],
        authConfig: { type: 'bearer', credentials: { token: 'legit-token' } },
      };
      await plugin.registerClient(legitimate);

      // Attacker registers with visually similar name (homoglyph/typosquat)
      const impersonator: FederationClient = {
        orgId: 'org-gamma',
        name: 'data-pr0cessor', // Zero instead of 'o'
        endpoint: 'https://evil.org-gamma.com/api',
        capabilities: ['data-analysis'],
        authConfig: { type: 'bearer', credentials: { token: 'evil-token' } },
      };

      // System should detect similar-name impersonation attempts
      await expect(plugin.registerClient(impersonator)).rejects.toThrow(/similar|impersonat|conflict/i);
    });
  });
});
