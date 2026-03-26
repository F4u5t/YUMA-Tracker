import { useState, useEffect, useRef } from 'react';
import type { Telemetry, BatterySession, BatteryReading } from '../types/mower';

const MOWING_STATUSES = new Set([13, 20]); // Mowing, Manual Mowing
const STORAGE_KEY = 'faust_battery_sessions';
const MAX_SESSIONS = 20;          // keep last 20 sessions
const SAMPLE_INTERVAL_MS = 30000; // record a reading every 30 s

function loadSessions(): BatterySession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: BatterySession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
  } catch {}
}

export interface BatteryTrackerState {
  activeSession: BatterySession | null;
  sessions: BatterySession[];
  clearSessions: () => void;
}

export function useBatteryTracker(telemetry: Telemetry | null, activeTaskName: string): BatteryTrackerState {
  const [sessions, setSessions] = useState<BatterySession[]>(loadSessions);
  const [activeSession, setActiveSession] = useState<BatterySession | null>(null);
  const lastSampleRef = useRef<number>(0);

  useEffect(() => {
    if (!telemetry) return;

    const isMowing = MOWING_STATUSES.has(telemetry.sys_status);
    const battery = telemetry.battery;
    const now = Date.now();

    if (isMowing) {
      if (!activeSession) {
        // Start a new session
        const newSession: BatterySession = {
          id: new Date().toISOString(),
          taskName: activeTaskName || 'Unknown Task',
          startPct: battery,
          readings: [{ ts: now, pct: battery }],
        };
        setActiveSession(newSession);
        lastSampleRef.current = now;
      } else {
        // Add a reading if enough time has passed
        if (now - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
          const reading: BatteryReading = { ts: now, pct: battery };
          setActiveSession(prev => prev ? {
            ...prev,
            readings: [...prev.readings, reading],
          } : prev);
          lastSampleRef.current = now;
        }
      }
    } else {
      if (activeSession) {
        // Session ended — finalise and archive
        const finished: BatterySession = {
          ...activeSession,
          endPct: battery,
          durationMs: now - new Date(activeSession.id).getTime(),
          readings: [...activeSession.readings, { ts: now, pct: battery }],
        };
        setActiveSession(null);
        setSessions(prev => {
          const updated = [...prev, finished].slice(-MAX_SESSIONS);
          saveSessions(updated);
          return updated;
        });
      }
    }
  }, [telemetry?.sys_status, telemetry?.battery]);

  const clearSessions = () => {
    setSessions([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { activeSession, sessions, clearSessions };
}
