const API_HOST = window.location.hostname || 'localhost';
const API_PORT = 18080;
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const API_BASE = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/api`;

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

// WebSocket base URL
export const WS_URL = `${WS_PROTOCOL}://${API_HOST}:${API_PORT}/ws/telemetry`;
