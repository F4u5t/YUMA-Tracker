import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoJSONFeatureCollection } from '../types/mower';
import { getBoundaries, getMowPath } from '../services/api';

/** Seconds between retries when boundaries are empty/failed */
const BOUNDARIES_RETRY_S = 5;
/** Seconds between mow-path refreshes once loaded */
const MOWPATH_REFRESH_S = 15;
/** Max seconds before we give up auto-retrying boundaries and wait for manual retry */
const BOUNDARIES_GIVE_UP_S = 120;

function isValidGeoJSON(data: GeoJSONFeatureCollection): boolean {
  return (
    data?.type === 'FeatureCollection' &&
    Array.isArray(data.features) &&
    data.features.length > 0
  );
}

export type MapDataStatus = 'loading' | 'syncing' | 'ok' | 'error';

export interface MapDataState {
  boundaries: GeoJSONFeatureCollection | null;
  mowPath: GeoJSONFeatureCollection | null;
  boundariesStatus: MapDataStatus;
  /** Human-readable message when status is 'syncing' or 'error' */
  boundariesMessage: string | null;
  retryBoundaries: () => void;
}

export function useMapData(mowerConnected: boolean): MapDataState {
  const [boundaries, setBoundaries] = useState<GeoJSONFeatureCollection | null>(null);
  const [mowPath, setMowPath] = useState<GeoJSONFeatureCollection | null>(null);
  const [boundariesStatus, setBoundariesStatus] = useState<MapDataStatus>('loading');
  const [boundariesMessage, setBoundariesMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const startTime = useRef<number>(Date.now());

  const retryBoundaries = useCallback(() => {
    startTime.current = Date.now();
    setBoundariesStatus('loading');
    setBoundariesMessage(null);
    setRetryCount((c) => c + 1);
  }, []);

  // Re-trigger boundaries fetch when mower connects (was offline, now online)
  const prevConnected = useRef(false);
  useEffect(() => {
    if (mowerConnected && !prevConnected.current && boundaries === null) {
      retryBoundaries();
    }
    prevConnected.current = mowerConnected;
  }, [mowerConnected, boundaries, retryBoundaries]);

  // Boundaries: load with retry + validation
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const attempt = () => {
      if (cancelled) return;

      getBoundaries()
        .then((data) => {
          if (cancelled) return;
          if (isValidGeoJSON(data)) {
            setBoundaries(data);
            setBoundariesStatus('ok');
            setBoundariesMessage(null);
          } else {
            // Backend responded but no zones yet — mower is still syncing map data
            const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
            if (elapsed < BOUNDARIES_GIVE_UP_S) {
              setBoundariesStatus('syncing');
              setBoundariesMessage(
                `Waiting for mower to sync map data… (${elapsed}s elapsed, retrying)`
              );
              timeoutId = setTimeout(attempt, BOUNDARIES_RETRY_S * 1000);
            } else {
              setBoundariesStatus('error');
              setBoundariesMessage(
                'Map zones not received after 2 minutes. Mower may not be connected. Tap Retry.'
              );
            }
          }
        })
        .catch((err: Error) => {
          if (cancelled) return;
          const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
          if (elapsed < BOUNDARIES_GIVE_UP_S) {
            setBoundariesStatus('syncing');
            setBoundariesMessage(`Zone load failed (${err.message}) — retrying…`);
            timeoutId = setTimeout(attempt, BOUNDARIES_RETRY_S * 1000);
          } else {
            setBoundariesStatus('error');
            setBoundariesMessage(`Zone load failed: ${err.message}. Tap Retry.`);
          }
        });
    };

    setBoundariesStatus('loading');
    attempt();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  // Mow path: load + retry + periodic refresh
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const attempt = (isRefresh = false) => {
      if (cancelled) return;
      getMowPath()
        .then((data) => {
          if (!cancelled) {
            setMowPath(data);
            timeoutId = setTimeout(() => attempt(true), MOWPATH_REFRESH_S * 1000);
          }
        })
        .catch(() => {
          if (!cancelled) {
            const delay = isRefresh ? MOWPATH_REFRESH_S * 1000 : BOUNDARIES_RETRY_S * 1000;
            timeoutId = setTimeout(() => attempt(isRefresh), delay);
          }
        });
    };

    attempt();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return { boundaries, mowPath, boundariesStatus, boundariesMessage, retryBoundaries };
}
