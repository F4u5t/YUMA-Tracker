import { useState, useCallback, useEffect, useRef } from 'react';
import type { Telemetry, SatSample, WSMessage } from '../types/mower';
import { useWebSocket } from './useWebSocket';
import { getStatus } from '../services/api';

export interface MowerState {
  telemetry: Telemetry | null;
  satSamples: SatSample[];
  connected: boolean;
  loading: boolean;
}

export function useMowerState(): MowerState {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [satSamples, setSatSamples] = useState<SatSample[]>([]);
  const [loading, setLoading] = useState(true);
  const hasData = useRef(false);

  // Retry REST fetch every 2 s until we get a valid response
  useEffect(() => {
    let cancelled = false;

    const tryFetch = () => {
      if (cancelled || hasData.current) return;
      getStatus()
        .then((data) => {
          if (cancelled) return;
          if (data && typeof data === 'object' && 'error' in data) {
            // backend returned an error object — retry
            setTimeout(tryFetch, 2000);
            return;
          }
          hasData.current = true;
          setTelemetry(data as unknown as Telemetry);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setTimeout(tryFetch, 2000);
        });
    };

    tryFetch();
    return () => { cancelled = true; };
  }, []);

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'telemetry') {
      hasData.current = true;
      setLoading(false);
      setTelemetry(msg as Telemetry);
    } else if (msg.type === 'sat_sample') {
      setSatSamples((prev) => {
        const next = [...prev, msg as SatSample];
        return next.length > 6000 ? next.slice(-6000) : next;
      });
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);

  return { telemetry, satSamples, connected, loading };
}
