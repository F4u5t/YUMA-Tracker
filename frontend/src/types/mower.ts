// Telemetry data from WebSocket
export interface Position {
  lat: number;
  lng: number;
}

export interface DockPosition extends Position {
  rotation: number;
}

export interface Telemetry {
  type: 'telemetry';
  position: Position;
  dock: DockPosition;
  rtk_base: Position;
  battery: number;
  charge_state: number;
  satellites_total: number;
  satellites_l2: number;
  rtk_status: string;
  sys_status: number;
  orientation: number;
  position_type: number;
  work_zone: number;
  rtk_age: number;
  pos_level: number;
  gps_stars: number;
  co_view_stars: number;
  wifi_rssi: number;
  device_name: string;
  online: boolean;
  timestamp: string;
}

export interface SatSample {
  type: 'sat_sample';
  lat: number;
  lng: number;
  satellites: number;
  rtk_status: string;
}

export type WSMessage = Telemetry | SatSample;

// REST API types
export interface TaskPlan {
  plan_id: string;
  task_name: string;
  job_id: string;
  zone_hashs: number[];
  zone_names: string[];
  job_mode: number;
  speed: number;
  knife_height: number;
  channel_width: number;
  channel_mode: number;
  edge_mode: number;
  toward: number;
}

export interface Zone {
  hash: number;
  name: string;
  type: 'area' | 'obstacle';
}

export interface CameraToken {
  appId: string;
  token: string;
  channelName: string;
  uid: number;
  cameras: { cameraId: string; token: string }[];
}

// GeoJSON types
export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[][] | number[][][] ;
  };
}

// System status codes (from PyMammotion WorkMode enum)

export interface BatteryReading {
  ts: number;   // epoch ms
  pct: number;  // battery %
}

export interface BatterySession {
  id: string;           // ISO start timestamp
  taskName: string;
  startPct: number;
  readings: BatteryReading[];
  endPct?: number;      // set when session ends
  durationMs?: number;
}
export interface TrailPoint {
  lat: number;
  lng: number;
  sys_status: number;
  ts: number; // epoch ms
}

export interface TrailSession {
  id: string;         // ISO start timestamp
  label: string;      // e.g. "Mowing · Mar 31"
  startTs: number;
  endTs: number;
  points: TrailPoint[];
}

/** Color per sys_status for trail rendering */
export const STATUS_TRAIL_COLOR: Record<number, string> = {
  13: '#22c55e',  // Mowing        — green
  20: '#86efac',  // Manual Mowing — light green
  14: '#f97316',  // Returning     — orange
  15: '#3b82f6',  // Charging      — blue
  19: '#eab308',  // Paused        — yellow
  11: '#a78bfa',  // Ready         — purple
};
export const DEFAULT_TRAIL_COLOR = '#94a3b8'; // slate for everything else

export const SYS_STATUS_LABELS: Record<number, string> = {
  0: 'Not Active',
  1: 'Online',
  2: 'Offline',
  8: 'Disabled',
  10: 'Initializing',
  11: 'Ready',
  13: 'Mowing',
  14: 'Returning',
  15: 'Charging',
  16: 'Updating',
  17: 'Locked',
  19: 'Paused',
  20: 'Manual Mowing',
  22: 'Update Success',
  23: 'Update Failed',
  31: 'Drawing Job',
  32: 'Drawing Obstacle',
  34: 'Drawing Channel',
  35: 'Drawing Eraser',
  36: 'Editing Boundary',
  37: 'Location Error',
  38: 'Boundary Jump',
  39: 'Charging Paused',
};

export const JOB_MODE_LABELS: Record<number, string> = {
  0: 'Single Grid',
  1: 'Double Grid',
  2: 'Segment',
  3: 'No Grid',
};
