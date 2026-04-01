import { useState, useCallback, useEffect, useRef } from 'react';
import type { Telemetry, SatSample, WSMessage } from '../types/mower';
import { useWebSocket } from './useWebSocket';
import { getStatus, refreshTelemetry } from '../services/api';

/** Seconds without a telemetry update before we call data stale */
const STALE_THRESHOLD_S = 15;
/** How often (seconds) to silently poll REST as fallback when WS goes quiet */
const FALLBACK_POLL_EVERY_S = 10;

export interface MowerState {
  telemetry: Telemetry | null;
  satSamples: SatSample[];
  connected: boolean;
  loading: boolean;
  /** True when no telemetry update received for STALE_THRESHOLD_S seconds */
  stale: boolean;
  /** Seconds since the last telemetry update (0 = just received) */
  dataAgeSeconds: number;
  forceRefresh: () => Promise<void>;
  /** How many times the WebSocket has reconnected since page load */
  reconnectCount: number;
  /** Timestamp of the most recent WebSocket disconnect, or null */
  lastDisconnectAt: Date | null;
}

export function useMowerState(): MowerState {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [satSamples, setSatSamples] = useState<SatSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataAgeSeconds, setDataAgeSeconds] = useState(0);
  const hasData = useRef(false);
  const lastUpdateAt = useRef<number>(0);
  const fallbackPending = useRef(false);

  /** Accept a raw telemetry payload from REST or WS */
  const applyTelemetry = useCallback((data: Record<string, unknown>) => {
    if (!('sys_status' in data) && !('type' in data)) return;
    hasData.current = true;
    lastUpdateAt.current = Date.now();
    setLoading(false);
    setDataAgeSeconds(0);
    setTelemetry(data as unknown as Telemetry);
  }, []);

  // Initial REST fetch — retry every 2s until valid  
  useEffect(() => {
    let cancelled = false;
    const tryFetch = () => {
      if (cancelled || hasData.current) return;
      getStatus()
        .then((data) => {
          if (cancelled) return;
          if ('error' in data) { setTimeout(tryFetch, 2000); return; }
          applyTelemetry(data);
        })
        .catch(() => { if (!cancelled) setTimeout(tryFetch, 2000); });
    };
    tryFetch();
    return () => { cancelled = true; };
  }, [applyTelemetry]);

  // Tick every second: update age counter + fire REST fallback when WS goes quiet
  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastUpdateAt.current) return;
      const age = Math.floor((Date.now() - lastUpdateAt.current) / 1000);
      setDataAgeSeconds(age);

      // Quiet background REST poll as fallback when mower stops pushing via WS
      if (age > 0 && age % FALLBACK_POLL_EVERY_S === 0 && !fallbackPending.current) {
        fallbackPending.current = true;
        getStatus()
          .then((data) => { if (!('error' in data)) applyTelemetry(data); })
          .catch(() => {})
          .finally(() => { fallbackPending.current = false; });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [applyTelemetry]);

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'telemetry') {
      applyTelemetry(msg as unknown as Record<string, unknown>);
    } else if (msg.type === 'sat_sample') {
      setSatSamples((prev) => {
        const next = [...prev, msg as SatSample];
        return next.length > 6000 ? next.slice(-6000) : next;
      });
    }
  }, [applyTelemetry]);

  const { connected, reconnectCount, lastDisconnectAt } = useWebSocket(handleMessage);

  const forceRefresh = useCallback(async () => {
    const data = await refreshTelemetry();
    if ('sys_status' in data) applyTelemetry(data);
  }, [applyTelemetry]);

  const stale = hasData.current && dataAgeSeconds >= STALE_THRESHOLD_S;

  return { telemetry, satSamples, connected, loading, stale, dataAgeSeconds, forceRefresh, reconnectCount, lastDisconnectAt };
}
