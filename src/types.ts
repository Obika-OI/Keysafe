export interface RouteConfig {
  id: string;
  name: string;
  prefix: string;
  targetBaseUrl: string;
  authStrategy: 'bearer' | 'header' | 'query' | 'none';
  authHeaderName?: string;
  authQueryParamName?: string;
  secretEnvKey: string;
  customHeaders?: Record<string, string>;
  rateLimitOverride?: number;
  enabled: boolean;
}

export interface SecurityConfig {
  requireClientKey: boolean;
  masterClientKey: string;
  allowedOrigins: string[];
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  ipWhitelist: string[];
}

export interface VaultSecretItem {
  configured: boolean;
  preview: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  method: string;
  clientIp: string;
  origin: string;
  path: string;
  upstreamUrl: string;
  status: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  clientHeadersRedacted: Record<string, string>;
  upstreamHeadersSentRedacted: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  error?: string;
}

export interface AdminOverview {
  security: SecurityConfig;
  routes: RouteConfig[];
  vault: Record<string, VaultSecretItem>;
  stats: {
    uptimeSeconds: number;
    totalRequestsLogged: number;
    recentErrors: number;
  };
}

export interface PlaygroundPreset {
  id: string;
  name: string;
  service: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers: Record<string, string>;
  body?: string;
  description: string;
  secretHint: string;
}
