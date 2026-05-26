/**
 * Type definitions for iteratio-plugin-federation
 */

// ========== Client Types ==========

/** A registered client connected to the federation bus. */
export interface Client {
  id: string;
  type: ClientType;
  name: string;
  platform?: Platform;
  handlers: string[];
  metadata?: ClientMetadata;
  connection: ConnectionInfo;
  status: ClientStatus;
  lastSeen: number;
}

/** A registered client connected to the federation bus. */
export type ClientType = 'mobile' | 'desktop' | 'browser' | 'server' | 'iot' | 'agent';

/** Operating platform of the client. */
export type Platform = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web';

/** A registered client connected to the federation bus. */
export type ClientStatus = 'online' | 'offline';

/** A registered client connected to the federation bus. */
export interface ClientMetadata {
  appVersion?: string;
  deviceName?: string;
  userId?: string;
  [key: string]: any;
}

/** Transport-level connection details for a client. */
export interface ConnectionInfo {
  type: 'websocket' | 'reverse-tunnel' | 'sse' | 'polling';
  address?: string;
}

/** A registered client connected to the federation bus. */
export interface ClientFilter {
  type?: ClientType;
  handler?: string;
  status?: ClientStatus;
  platform?: Platform;
}

// ========== Message Types ==========

/** Union type of all message types exchanged on the federation bus. */
export type FederationMessage =
  | WorkRequestMessage
  | WorkResponseMessage
  | EventNotificationMessage
  | CapabilityQueryMessage
  | HealthCheckMessage;

/** Message requesting another client to perform a unit of work. */
export interface WorkRequestMessage {
  type: 'work_request';
  from: string;
  to?: string;
  requestId: string;
  service: string;
  payload: any;
  priority?: MessagePriority;
  timeout?: number;
  context?: RequestContext;
}

/** Message containing the result of a completed work request. */
export interface WorkResponseMessage {
  type: 'work_response';
  from: string;
  to: string;
  requestId: string;
  success: boolean;
  data?: any;
  error?: ErrorInfo;
  metadata?: ResponseMetadata;
}

/** Message broadcasting an event notification to bus subscribers. */
export interface EventNotificationMessage {
  type: 'event_notification';
  from: string;
  event: string;
  data: any;
  timestamp: number;
}

/** Message querying what capabilities are available on the bus. */
export interface CapabilityQueryMessage {
  type: 'capability_query';
  from: string;
  queryId: string;
  capability: string;
  requirements?: any;
}

export interface HealthCheckMessage {
  type: 'health_check';
  from: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  metrics?: HealthMetrics;
}

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface RequestContext {
  userId?: string;
  sessionId?: string;
  traceId?: string;
  parentSpanId?: string;
  [key: string]: any;
}

export interface ErrorInfo {
  code: string;
  message: string;
  stack?: string;
  details?: any;
}

export interface ResponseMetadata {
  duration: number;
  tokensUsed?: number;
  cost?: number;
  [key: string]: any;
}

export interface HealthMetrics {
  cpu?: number;
  memory?: number;
  latency?: number;
  errorRate?: number;
  [key: string]: any;
}

// ========== RBAC Types ==========

export interface Permission {
  resource: string;
  action: 'read' | 'write' | 'admin';
  scope?: string;
}

export interface Role {
  name: string;
  permissions: Permission[];
}

export type RoleName = 'reader' | 'writer' | 'handler' | 'admin' | 'system';

// ========== Auth Types ==========

export type AuthType = 'oauth2' | 'apikey' | 'jwt' | 'mtls' | 'ssh' | 'basic';

export interface OAuth2Config {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes?: string[];
  audience?: string;
}

export interface APIKeyConfig {
  type: 'apikey';
  apiKey: string;
  headerName?: string;
}

export interface JWTConfig {
  type: 'jwt';
  token: string;
  refreshToken?: string;
  refreshEndpoint?: string;
}

export interface MTLSConfig {
  type: 'mtls';
  cert: string | Buffer;
  key: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
}

export interface SSHConfig {
  type: 'ssh';
  username: string;
  privateKey: string | Buffer;
  passphrase?: string;
  host?: string;
  port?: number;
}

export interface BasicAuthConfig {
  type: 'basic';
  username: string;
  password: string;
}

export type AuthConfig =
  | OAuth2Config
  | APIKeyConfig
  | JWTConfig
  | MTLSConfig
  | SSHConfig
  | BasicAuthConfig;

// ========== Connection Types ==========

export type ConnectionMode = 'direct' | 'reverse-tunnel' | 'polling';

export interface ConnectionConfig {
  mode?: ConnectionMode;
  pollInterval?: number;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

// ========== Event Bus Types ==========

export interface SubscribeOptions {
  filter?: (msg: any) => boolean;
  priority?: MessagePriority;
  queueGroup?: string;
}

export interface RequestOptions {
  timeout?: number;
  priority?: MessagePriority;
  retries?: number;
  retryDelay?: number;
}

export type MessageHandler = (message: any) => void | Promise<void>;
export type RequestHandler = (payload: any) => Promise<any>;

// ========== Plugin Config Types ==========

export interface FederationPluginConfig {
  eventBus: EventBusConfig;
  client: ClientConfig;
  auth: AuthConfig;
  connection?: ConnectionConfig;
  rbac?: RBACConfig;
  rateLimit?: RateLimitConfig;
}

export interface EventBusConfig {
  url: string;
  type?: 'nats' | 'websocket';
}

/** A registered client connected to the federation bus. */
export interface ClientConfig {
  id?: string;
  type: ClientType;
  name: string;
  platform?: Platform;
  handlers?: string[];
  metadata?: ClientMetadata;
}

/** Configuration for role-based access control on the federation bus. */
export interface RBACConfig {
  role?: RoleName;
  customPermissions?: Permission[];
}

export interface RateLimitConfig {
  maxRequestsPerSecond?: number;
  maxSubscriptions?: number;
}

// ========== Service Types ==========

export interface ServiceDefinition {
  name: string;
  description: string;
  version: string;
  input: any;  // JSON Schema
  output: any; // JSON Schema
  handler: RequestHandler;
  timeout?: number;
  retries?: number;
}

export interface CapabilityDefinition {
  type: string;
  description: string;
  version: string;
  services: string[];
  metadata?: any;
}

// ========== Registry Types ==========

export interface ApplicationIdentity {
  appId: string;
  appType: string;
  appName: string;
  capabilities: CapabilityDefinition[];
  services: ServiceDefinition[];
  endpoints: {
    federation: string;
    health?: string;
    metrics?: string;
  };
  metadata?: any;
}

// ========== Event Types ==========

/** A registered client connected to the federation bus. */
export interface ClientJoinedEvent {
  type: 'client.joined';
  client: Client;
  timestamp: number;
}

/** A registered client connected to the federation bus. */
export interface ClientLeftEvent {
  type: 'client.left';
  clientId: string;
  timestamp: number;
}

/** A registered client connected to the federation bus. */
export interface ClientUpdatedEvent {
  type: 'client.updated';
  clientId: string;
  changes: Partial<Client>;
  timestamp: number;
}

export type RegistryEvent = ClientJoinedEvent | ClientLeftEvent | ClientUpdatedEvent;

// ========== Error Types ==========

export class FederationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FederationError';
  }
}

export class AuthenticationError extends FederationError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends FederationError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHORIZATION_ERROR', details);
    this.name = 'AuthorizationError';
  }
}

export class ConnectionError extends FederationError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends FederationError {
  constructor(message: string, details?: any) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends FederationError {
  constructor(message: string, details?: any) {
    super(message, 'RATE_LIMIT_ERROR', details);
    this.name = 'RateLimitError';
  }
}
