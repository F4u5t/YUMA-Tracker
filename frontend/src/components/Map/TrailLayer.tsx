import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { TrailPoint } from '../../types/mower';
import { STATUS_TRAIL_COLOR, DEFAULT_TRAIL_COLOR } from '../../types/mower';

interface TrailLayerProps {
  points: TrailPoint[];
  /** Weight of the polyline in px */
  weight?: number;
  opacity?: number;
}

/**
 * Renders a trail as colour-coded polyline segments on the Leaflet map.
 * Each segment between two consecutive points is coloured by the status of
 * the first point, so colour transitions are visible.
 */
export function TrailLayer({ points, weight = 3, opacity = 0.8 }: TrailLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map);
    }
    const group = layerRef.current;
    group.clearLayers();

    if (points.length < 2) return;

    // Group consecutive points with the same status into segments
    let segStart = 0;
    for (let i = 1; i <= points.length; i++) {
      const prevStatus = points[i - 1].sys_status;
      const currStatus = i < points.length ? points[i].sys_status : -1;

      if (currStatus !== prevStatus || i === points.length) {
        const segPoints: [number, number][] = points
          .slice(segStart, i)
          .map((p) => [p.lat, p.lng]);

        if (segPoints.length >= 2) {
          L.polyline(segPoints, {
            color: STATUS_TRAIL_COLOR[prevStatus] ?? DEFAULT_TRAIL_COLOR,
            weight,
            opacity,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(group);
        }
        segStart = i - 1; // overlap by 1 so segments connect
      }
    }

    return () => {
      group.clearLayers();
    };
  }, [points, map, weight, opacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, []);

  return null;
}
