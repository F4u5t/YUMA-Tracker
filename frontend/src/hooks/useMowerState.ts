import { useState, useCallback, useEffect } from 'react';
import type { Telemetry, SatSample, WSMessage } from '../types/mower';
import { useWebSocket } from './useWebSocket';
import { getStatus } from '../services/api';

export interface MowerState {
  telemetry: Telemetry | null;
  satSamples: SatSample[];
  connected: boolean;
}

export function useMowerState(): MowerState {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [satSamples, setSatSamples] = useState<SatSample[]>([]);

  // Initial REST fetch so the map centers immediately (before WS connects)
  useEffect(() => {
    getStatus()
      .then((data) => setTelemetry(data as Telemetry))
      .catch(() => {});
  }, []);

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'telemetry') {
      setTelemetry(msg as Telemetry);
    } else if (msg.type === 'sat_sample') {
      setSatSamples((prev) => [...prev, msg as SatSample]);
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);

  return { telemetry, satSamples, connected };
}
