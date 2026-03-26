import { GeoJSON } from 'react-leaflet';
import type { GeoJSONFeatureCollection } from '../../types/mower';
import type { PathOptions } from 'leaflet';

interface MowPathLayerProps {
  geojson: GeoJSONFeatureCollection;
}

const pathStyle: PathOptions = {
  color: '#8b5cf6',
  weight: 2,
  opacity: 0.7,
  dashArray: '4 4',
};

export function MowPathLayer({ geojson }: MowPathLayerProps) {
  if (!geojson.features.length) return null;

  return (
    <GeoJSON
      key={geojson.features.length}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={geojson as any}
      style={() => pathStyle}
    />
  );
}
