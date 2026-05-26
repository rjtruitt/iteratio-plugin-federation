import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRBACManager, SimpleRBACManager as RBACManager } from '../RBACManager';

describe('RBACManager', () => {
  let rbac: RBACManager;

  beforeEach(() => {
    rbac = createRBACManager();

    // Set up role hierarchy
    rbac.defineRole({
      name: 'viewer',
      permissions: ['read:data', 'read:metadata'],
      description: 'Can read data',
    });

    rbac.defineRole({
      name: 'editor',
      permissions: ['write:data', 'delete:own'],
      inherits: ['viewer'],
      description: 'Can edit and view data',
    });

    rbac.defineRole({
      name: 'admin',
      permissions: ['write:all', 'delete:all', 'manage:users', 'manage:roles'],
      inherits: ['editor'],
      description: 'Full administrative access',
    });
  });

  describe('define roles', () => {
    it('should define a role with permissions', () => {
      rbac.defineRole({
        name: 'custom',
        permissions: ['custom:action'],
      });

      // Should not throw
      rbac.assignRole('agent-1', 'custom');
      const result = rbac.checkPermission('agent-1', 'custom:action');
      expect(result.allowed).toBe(true);
    });

    it('should reject duplicate role definitions', () => {
      expect(() => rbac.defineRole({
        name: 'viewer', // already exists
        permissions: ['other:permission'],
      })).toThrow(/already exists|duplicate/i);
    });
  });

  describe('assign role to agent', () => {
    it('should assign a role to an agent', () => {
      rbac.assignRole('agent-1', 'viewer');

      const roles = rbac.getAgentRoles('agent-1');
      expect(roles).toContain('viewer');
    });

    it('should allow multiple roles for same agent', () => {
      rbac.defineRole({ name: 'reporter', permissions: ['generate:report'] });

      rbac.assignRole('agent-1', 'viewer');
      rbac.assignRole('agent-1', 'reporter');

      const roles = rbac.getAgentRoles('agent-1');
      expect(roles).toContain('viewer');
      expect(roles).toContain('reporter');
    });

    it('should throw when assigning non-existent role', () => {
      expect(() => rbac.assignRole('agent-1', 'nonexistent-role'))
        .toThrow(/not found|unknown|undefined/i);
    });
  });

  describe('check permission (allowed)', () => {
    it('should allow permission when agent has role with that permission', () => {
      rbac.assignRole('agent-1', 'viewer');

      const result = rbac.checkPermission('agent-1', 'read:data');
      expect(result.allowed).toBe(true);
      expect(result.role).toBe('viewer');
    });

    it('should allow inherited permissions', () => {
      rbac.assignRole('agent-1', 'editor');

      // Editor inherits from viewer, so read:data should be allowed
      const result = rbac.checkPermission('agent-1', 'read:data');
      expect(result.allowed).toBe(true);
    });

    it('should allow deeply inherited permissions', () => {
      rbac.assignRole('agent-1', 'admin');

      // Admin inherits editor which inherits viewer
      const result = rbac.checkPermission('agent-1', 'read:data');
      expect(result.allowed).toBe(true);
    });
  });

  describe('check permission (denied)', () => {
    it('should deny permission when agent has no matching role', () => {
      rbac.assignRole('agent-1', 'viewer');

      const result = rbac.checkPermission('agent-1', 'write:data');
      expect(result.allowed).toBe(false);
    });

    it('should deny permission for agent with no roles', () => {
      const result = rbac.checkPermission('unassigned-agent', 'read:data');
      expect(result.allowed).toBe(false);
    });

    it('should deny unrecognized permissions', () => {
      rbac.assignRole('agent-1', 'admin');

      const result = rbac.checkPermission('agent-1', 'launch:missiles');
      expect(result.allowed).toBe(false);
    });
  });

  describe('permission inheritance', () => {
    it('should include all inherited permissions in effective set', () => {
      rbac.assignRole('agent-1', 'admin');

      const effective = rbac.getEffectivePermissions('agent-1');

      // Admin should have its own + editor's + viewer's permissions
      expect(effective).toContain('manage:users');
      expect(effective).toContain('write:data');
      expect(effective).toContain('read:data');
      expect(effective).toContain('read:metadata');
    });

    it('should not duplicate permissions in effective set', () => {
      rbac.assignRole('agent-1', 'admin');

      const effective = rbac.getEffectivePermissions('agent-1');
      const uniquePerms = new Set(effective);
      expect(effective.length).toBe(uniquePerms.size);
    });

    it('should handle diamond inheritance without duplicates', () => {
      rbac.defineRole({ name: 'a', permissions: ['perm:a'], inherits: ['viewer'] });
      rbac.defineRole({ name: 'b', permissions: ['perm:b'], inherits: ['viewer'] });
      rbac.defineRole({ name: 'top', permissions: ['perm:top'], inherits: ['a', 'b'] });

      rbac.assignRole('agent-1', 'top');

      const effective = rbac.getEffectivePermissions('agent-1');
      // read:data from viewer should appear only once
      const readDataCount = effective.filter(p => p === 'read:data').length;
      expect(readDataCount).toBe(1);
    });
  });

  describe('dynamic role changes', () => {
    it('should revoke a role from an agent', () => {
      rbac.assignRole('agent-1', 'editor');
      rbac.revokeRole('agent-1', 'editor');

      const result = rbac.checkPermission('agent-1', 'write:data');
      expect(result.allowed).toBe(false);
    });

    it('should update permissions immediately after role change', () => {
      rbac.assignRole('agent-1', 'viewer');
      expect(rbac.checkPermission('agent-1', 'read:data').allowed).toBe(true);
      expect(rbac.checkPermission('agent-1', 'write:data').allowed).toBe(false);

      // Upgrade to editor
      rbac.assignRole('agent-1', 'editor');
      expect(rbac.checkPermission('agent-1', 'write:data').allowed).toBe(true);
    });

    it('should handle role revocation when agent has multiple roles', () => {
      rbac.defineRole({ name: 'reporter', permissions: ['generate:report'] });
      rbac.assignRole('agent-1', 'viewer');
      rbac.assignRole('agent-1', 'reporter');

      rbac.revokeRole('agent-1', 'viewer');

      expect(rbac.checkPermission('agent-1', 'read:data').allowed).toBe(false);
      expect(rbac.checkPermission('agent-1', 'generate:report').allowed).toBe(true);
    });
  });

  describe('clear error on denial', () => {
    it('should include reason in denied permission result', () => {
      rbac.assignRole('agent-1', 'viewer');

      const result = rbac.checkPermission('agent-1', 'delete:all');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toMatch(/no.*permission|not.*authorized|insufficient/i);
    });

    it('should include which permission was checked in denial reason', () => {
      const result = rbac.checkPermission('agent-1', 'manage:users');
      expect(result.reason).toContain('manage:users');
    });
  });
});
