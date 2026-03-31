const API_HOST = window.location.hostname || 'localhost';
const IS_DEV = window.location.port === '5173';
const API_PORT = IS_DEV ? 18080 : Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const PORT_SUFFIX = IS_DEV ? `:${API_PORT}` : (window.location.port ? `:${window.location.port}` : '');
const API_BASE = `${API_PROTOCOL}://${API_HOST}${PORT_SUFFIX}/api`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export function getStatus() {
  return request<Record<string, unknown>>('/status');
}

export function getPlans() {
  return request<import('../types/mower').TaskPlan[]>('/plans');
}

export function startPlan(planId: string) {
  return request<{ status: string }>(`/plans/${encodeURIComponent(planId)}/start`, { method: 'POST' });
}

export function sendCommand(cmd: 'pause' | 'resume' | 'dock' | 'cancel') {
  return request<{ status: string }>(`/command/${cmd}`, { method: 'POST' });
}

export function getBoundaries() {
  return request<import('../types/mower').GeoJSONFeatureCollection>('/map/boundaries');
}

export function getZones() {
  return request<import('../types/mower').Zone[]>('/map/zones');
}

export function getMowPath() {
  return request<import('../types/mower').GeoJSONFeatureCollection>('/map/mow-path');
}

export function getCameraToken() {
  return request<import('../types/mower').CameraToken>('/camera/token');
}

export function refreshTelemetry() {
  return request<{ status: string }>('/refresh', { method: 'POST' });
}

export function reconnect() {
  return request<{ status: string }>('/reconnect', { method: 'POST' });
}

export interface OverlaySettings {
  mirrorEW: boolean;
  mirrorNS: boolean;
  rot: number;
  eastM: number;
  northM: number;
  /** Independent alignment for trail/track points (GPS coords, separate from zone projection) */
  trailRot: number;
  trailEastM: number;
  trailNorthM: number;
}

export function getOverlaySettings() {
  return request<OverlaySettings>('/settings/overlay');
}

export function saveOverlaySettings(s: OverlaySettings) {
  return request<OverlaySettings>('/settings/overlay', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
}

// WebSocket base URL
export const WS_URL = `${WS_PROTOCOL}://${API_HOST}${PORT_SUFFIX}/ws/telemetry`;
