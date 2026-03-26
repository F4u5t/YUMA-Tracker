import { GeoJSON } from 'react-leaflet';
import type { GeoJSONFeatureCollection } from '../../types/mower';
import type { PathOptions } from 'leaflet';
import { useMemo } from 'react';

interface ZoneLayerProps {
  geojson: GeoJSONFeatureCollection;
  selectedZones: number[];
}

export function ZoneLayer({ geojson, selectedZones }: ZoneLayerProps) {
  const key = useMemo(() => JSON.stringify(selectedZones), [selectedZones]);

  const style = (feature: GeoJSON.Feature | undefined): PathOptions => {
    if (!feature?.properties) return {};
    const typeId = feature.properties.type_id as number;
    const hash = feature.properties.hash as number;
    const isSelected = selectedZones.length > 0 && selectedZones.includes(hash);
    const isObstacle = typeId === 1;

    if (isObstacle) {
      return {
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.3,
        weight: 2,
      };
    }

    return {
      color: isSelected ? '#f59e0b' : '#22c55e',
      fillColor: isSelected ? '#f59e0b' : '#22c55e',
      fillOpacity: isSelected ? 0.45 : 0.2,
      weight: isSelected ? 3 : 2,
    };
  };

  const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
    const name = (feature.properties?.Name as string) || `Zone ${feature.properties?.hash}`;
    const typeLabel = feature.properties?.type_id === 1 ? 'Obstacle' : 'Zone';
    (layer as L.Path).bindTooltip(`${typeLabel}: ${name}`, { sticky: true });
  };

  if (!geojson.features.length) return null;

  return (
    <GeoJSON
      key={key}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={geojson as any}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}
