import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import type { SatSample } from '../../types/mower';

interface SatelliteHeatmapProps {
  samples: SatSample[];
}

const MAX_SATS = 30; // normalization ceiling

export function SatelliteHeatmap({ samples }: SatelliteHeatmapProps) {
  const map = useMap();
  const heatLayerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    if (!heatLayerRef.current) {
      heatLayerRef.current = L.heatLayer([], {
        radius: 20,
        blur: 15,
        maxZoom: 22,
        max: 1.0,
        gradient: {
          0.0: '#ef4444',  // red — poor
          0.33: '#f59e0b', // yellow — moderate
          0.66: '#22c55e', // green — good
          1.0: '#16a34a',  // dark green — excellent
        },
      }).addTo(map);
    }

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map]);

  useEffect(() => {
    if (!heatLayerRef.current) return;
    const points: [number, number, number][] = samples.map((s) => [
      s.lat,
      s.lng,
      Math.min(s.satellites / MAX_SATS, 1.0),
    ]);
    heatLayerRef.current.setLatLngs(points);
  }, [samples]);

  return null;
}
