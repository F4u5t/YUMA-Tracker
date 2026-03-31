import { useState, useEffect, useRef } from 'react';
import type { Telemetry, TrailPoint, TrailSession } from '../types/mower';
import { SYS_STATUS_LABELS } from '../types/mower';

const STORAGE_KEY = 'faust_trail_sessions';
const MAX_SESSIONS = 10;
const MIN_MOVE_M = 0.5; // minimum metres to record a new point (reduces noise)

function loadSessions(): TrailSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrailSession[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: TrailSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
  } catch {}
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sessionLabel(status: number, ts: number): string {
  const statusName = SYS_STATUS_LABELS[status] ?? `Status ${status}`;
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${statusName} · ${dateStr} ${timeStr}`;
}

export interface TrailTrackerState {
  /** Points accumulated in the current ongoing session */
  liveTrail: TrailPoint[];
  /** Completed sessions (most recent last), max 10 */
  sessions: TrailSession[];
  /** The session being replayed, or null for live view */
  replaySession: TrailSession | null;
  setReplaySession: (s: TrailSession | null) => void;
  clearSessions: () => void;
}

// Statuses that are "active movement" — start/continue a trail session
const ACTIVE_STATUSES = new Set([13, 20, 14, 19]);

export function useTrailTracker(telemetry: Telemetry | null): TrailTrackerState {
  const [sessions, setSessions] = useState<TrailSession[]>(loadSessions);
  const [liveTrail, setLiveTrail] = useState<TrailPoint[]>([]);
  const [replaySession, setReplaySession] = useState<TrailSession | null>(null);

  const activeSessionRef = useRef<TrailSession | null>(null);
  const lastPointRef = useRef<TrailPoint | null>(null);

  useEffect(() => {
    if (!telemetry) return;
    const { lat, lng } = telemetry.position;
    const { sys_status } = telemetry;
    const ts = Date.now();
    const isActive = ACTIVE_STATUSES.has(sys_status);

    if (!isActive) {
      // Finalize any open session
      if (activeSessionRef.current && activeSessionRef.current.points.length > 1) {
        const finished: TrailSession = {
          ...activeSessionRef.current,
          endTs: ts,
        };
        setSessions((prev) => {
          const next = [...prev, finished].slice(-MAX_SESSIONS);
          saveSessions(next);
          return next;
        });
      }
      if (activeSessionRef.current) {
        activeSessionRef.current = null;
        lastPointRef.current = null;
        setLiveTrail([]);
      }
      return;
    }

    // Throttle — only record if moved enough
    const last = lastPointRef.current;
    if (last && haversineM(last.lat, last.lng, lat, lng) < MIN_MOVE_M) return;

    const point: TrailPoint = { lat, lng, sys_status, ts };
    lastPointRef.current = point;

    if (!activeSessionRef.current) {
      // Start a new session
      activeSessionRef.current = {
        id: new Date(ts).toISOString(),
        label: sessionLabel(sys_status, ts),
        startTs: ts,
        endTs: ts,
        points: [point],
      };
    } else {
      activeSessionRef.current = {
        ...activeSessionRef.current,
        endTs: ts,
        points: [...activeSessionRef.current.points, point],
      };
    }

    setLiveTrail([...activeSessionRef.current.points]);
  }, [telemetry]);

  const clearSessions = () => {
    setSessions([]);
    saveSessions([]);
    setLiveTrail([]);
    activeSessionRef.current = null;
    lastPointRef.current = null;
  };

  return { liveTrail, sessions, replaySession, setReplaySession, clearSessions };
}
