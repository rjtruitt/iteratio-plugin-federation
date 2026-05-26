/**
 * RBACManager
 *
 * Role-Based Access Control for federation.
 * Manages roles, permissions, and access checks.
 * Includes simple RBAC factory (createRBACManager) for standalone usage.
 */

// --- Simple RBACManager (used by tests) ---

export interface SimpleRBACManager {
  defineRole(role: RoleDefinition): void;
  assignRole(agentId: string, roleName: string): void;
  revokeRole(agentId: string, roleName: string): void;
  checkPermission(agentId: string, permission: string): PermissionResult;
  getAgentRoles(agentId: string): string[];
  getEffectivePermissions(agentId: string): string[];
}

export interface RoleDefinition {
  name: string;
  permissions: string[];
  inherits?: string[]; // roles this role inherits from
  description?: string;
}

export interface PermissionResult {
  allowed: boolean;
  role?: string; // which role granted this permission
  reason?: string;
}

export function createRBACManager(): SimpleRBACManager {
  const roles = new Map<string, RoleDefinition>();
  const agentRoles = new Map<string, Set<string>>();

  function getEffectivePermissionsForRole(roleName: string, visited: Set<string> = new Set()): string[] {
    if (visited.has(roleName)) return [];
    visited.add(roleName);

    const role = roles.get(roleName);
    if (!role) return [];

    const perms: string[] = [...role.permissions];

    if (role.inherits) {
      for (const parentName of role.inherits) {
        perms.push(...getEffectivePermissionsForRole(parentName, visited));
      }
    }

    return perms;
  }

  return {
    defineRole(role: RoleDefinition): void {
      if (roles.has(role.name)) {
        throw new Error(`Role already exists: ${role.name}`);
      }
      roles.set(role.name, role);
    },

    assignRole(agentId: string, roleName: string): void {
      if (!roles.has(roleName)) {
        throw new Error(`Role not found: ${roleName}`);
      }
      if (!agentRoles.has(agentId)) {
        agentRoles.set(agentId, new Set());
      }
      agentRoles.get(agentId)!.add(roleName);
    },

    revokeRole(agentId: string, roleName: string): void {
      const roleSet = agentRoles.get(agentId);
      if (roleSet) {
        roleSet.delete(roleName);
      }
    },

    checkPermission(agentId: string, permission: string): PermissionResult {
      const roleSet = agentRoles.get(agentId);
      if (!roleSet || roleSet.size === 0) {
        return { allowed: false, reason: `No permission ${permission}: agent has no roles` };
      }

      for (const roleName of roleSet) {
        const effective = getEffectivePermissionsForRole(roleName);
        if (effective.includes(permission)) {
          return { allowed: true, role: roleName };
        }
      }

      return { allowed: false, reason: `No permission ${permission}: not authorized` };
    },

    getAgentRoles(agentId: string): string[] {
      const roleSet = agentRoles.get(agentId);
      return roleSet ? Array.from(roleSet) : [];
    },

    getEffectivePermissions(agentId: string): string[] {
      const roleSet = agentRoles.get(agentId);
      if (!roleSet) return [];

      const allPerms = new Set<string>();
      for (const roleName of roleSet) {
        const perms = getEffectivePermissionsForRole(roleName);
        for (const p of perms) {
          allPerms.add(p);
        }
      }
      return Array.from(allPerms);
    },
  };
}

// --- End simple RBACManager ---

export interface Permission {
  resource: string;    // 'events' | 'requests' | 'clients' | 'subscriptions'
  action: 'read' | 'write' | 'admin';
  scope?: string;      // Optional topic/handler pattern
}

export interface Role {
  name: string;
  permissions: Permission[];
}

/**
 * Built-in roles
 */
export const ROLES: Record<string, Role> = {
  reader: {
    name: 'reader',
    permissions: [
      { resource: 'events', action: 'read' },          // Can subscribe to events
      { resource: 'requests', action: 'read' }         // Can receive requests
    ]
  },

  writer: {
    name: 'writer',
    permissions: [
      { resource: 'events', action: 'read' },
      { resource: 'events', action: 'write' },         // Can publish events
      { resource: 'requests', action: 'write' }        // Can send requests
    ]
  },

  handler: {
    name: 'handler',
    permissions: [
      { resource: 'events', action: 'read' },
      { resource: 'requests', action: 'read' },        // Can receive requests
      { resource: 'requests', action: 'write' }        // Can respond
    ]
  },

  admin: {
    name: 'admin',
    permissions: [
      { resource: '*', action: 'admin' }               // Full access
    ]
  },

  system: {
    name: 'system',
    permissions: [
      { resource: '*', action: 'admin' }               // Full access
    ]
  }
};

/**
 * Subscription limits per role
 */
export const SUBSCRIPTION_LIMITS: Record<string, number> = {
  reader: 100,
  writer: 200,
  handler: 500,
  admin: 1000,
  system: Infinity
};

/**
 * RBACManager
 *
 * Enforces role-based access control for federation operations.
 */
/** Manages role-based access control rules for federation bus operations. */
export class RBACManager {
  private role: Role;
  private customPermissions: Permission[];
  private subscriptionCount: number = 0;

  constructor(roleName: string = 'handler', customPermissions?: Permission[]) {
    // Load role
    const role = ROLES[roleName];
    if (!role) {
      throw new Error(`Unknown role: ${roleName}`);
    }

    this.role = role;
    this.customPermissions = customPermissions || [];
  }

  /**
   * Check if action is permitted
   */
  checkPermission(resource: string, action: 'read' | 'write' | 'admin', scope?: string): boolean {
    // Check custom permissions first
    for (const perm of this.customPermissions) {
      if (this.matchesPermission(perm, resource, action, scope)) {
        return true;
      }
    }

    // Check role permissions
    for (const perm of this.role.permissions) {
      if (this.matchesPermission(perm, resource, action, scope)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enforce permission (throws if not permitted)
   */
  async enforcePermission(resource: string, action: 'read' | 'write' | 'admin', scope?: string): Promise<void> {
    if (!this.checkPermission(resource, action, scope)) {
      throw new Error(`Permission denied: ${action} on ${resource}${scope ? ` (scope: ${scope})` : ''}`);
    }
  }

  /**
   * Check subscription limit
   */
  checkSubscriptionLimit(): boolean {
    const limit = SUBSCRIPTION_LIMITS[this.role.name] || 0;
    return this.subscriptionCount < limit;
  }

  /**
   * Increment subscription count
   */
  incrementSubscriptionCount(): void {
    if (!this.checkSubscriptionLimit()) {
      throw new Error(`Subscription limit exceeded for role: ${this.role.name}`);
    }
    this.subscriptionCount++;
  }

  /**
   * Decrement subscription count
   */
  decrementSubscriptionCount(): void {
    if (this.subscriptionCount > 0) {
      this.subscriptionCount--;
    }
  }

  /**
   * Get current role
   */
  getRole(): Role {
    return this.role;
  }

  /**
   * Get subscription limit
   */
  getSubscriptionLimit(): number {
    return SUBSCRIPTION_LIMITS[this.role.name] || 0;
  }

  // Private methods

  private matchesPermission(perm: Permission, resource: string, action: string, scope?: string): boolean {
    // Check resource
    if (perm.resource !== '*' && perm.resource !== resource) {
      return false;
    }

    // Check action
    if (perm.action === 'admin') {
      // Admin action allows everything
      return true;
    }

    if (perm.action !== action) {
      // Action must match exactly
      return false;
    }

    // Check scope (if specified)
    if (perm.scope && scope) {
      return this.matchesScope(perm.scope, scope);
    }

    return true;
  }

  private matchesScope(pattern: string, value: string): boolean {
    // TODO: Implement wildcard pattern matching
    // For now, exact match or wildcard
    if (pattern === '*' || pattern === '**') {
      return true;
    }

    // Simple wildcard support
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return value.startsWith(prefix + '.');
    }

    if (pattern.endsWith('.**')) {
      const prefix = pattern.slice(0, -3);
      return value.startsWith(prefix + '.') || value === prefix;
    }

    // Exact match
    return pattern === value;
  }
}
