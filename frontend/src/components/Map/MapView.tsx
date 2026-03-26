import { MapContainer, TileLayer, LayersControl, useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Telemetry, SatSample, GeoJSONFeatureCollection } from '../../types/mower';
import { MowerMarker } from './MowerMarker';
import { DockMarker } from './DockMarker';
import { ZoneLayer } from './ZoneLayer';
import { MowPathLayer } from './MowPathLayer';
import { SatelliteHeatmap } from './SatelliteHeatmap';
import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  telemetry: Telemetry | null;
  satSamples: SatSample[];
  boundaries: GeoJSONFeatureCollection | null;
  mowPath: GeoJSONFeatureCollection | null;
  showHeatmap: boolean;
  selectedTaskZones: number[];
}

const DEFAULT_CENTER: [number, number] = [36.601, -82.114]; // Bristol VA fallback
const DEFAULT_ZOOM = 21;

/** Fits the map to the boundaries GeoJSON the first time it loads. */
function FitBounds({ boundaries }: { boundaries: GeoJSONFeatureCollection | null }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !boundaries || !boundaries.features.length) return;
    try {
      const layer = L.geoJSON(boundaries as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 21 });
        fitted.current = true;
      }
    } catch {
      // ignore malformed geometry
    }
  }, [boundaries]);
  return null;
}

/** Flies to the mower position the first time a valid fix arrives. */
function AutoFly({ telemetry }: { telemetry: Telemetry | null }) {
  const map = useMap();
  useEffect(() => {
    if (telemetry && telemetry.position.lat !== 0 && telemetry.position.lng !== 0) {
      map.setView([telemetry.position.lat, telemetry.position.lng], map.getZoom() < 10 ? DEFAULT_ZOOM : map.getZoom());
    }
  }, [telemetry?.position.lat, telemetry?.position.lng]);
  return null;
}

export function MapView({ telemetry, satSamples, boundaries, mowPath, showHeatmap, selectedTaskZones }: MapViewProps) {
  const center: [number, number] = telemetry && telemetry.position.lat !== 0
    ? [telemetry.position.lat, telemetry.position.lng]
    : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={DEFAULT_ZOOM} maxZoom={21} className="map-container" style={{ height: '100%', width: '100%' }}>
      <FitBounds boundaries={boundaries} />
      <AutoFly telemetry={telemetry} />
      <LayersControl position="topright">
        <LayersControl.BaseLayer name="Street Map">
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            maxZoom={21}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            attribution='&copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={20}
            maxZoom={21}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {boundaries && <ZoneLayer geojson={boundaries} selectedZones={selectedTaskZones} />}
      {mowPath && <MowPathLayer geojson={mowPath} />}
      {telemetry && telemetry.position.lat !== 0 && (
        <MowerMarker position={telemetry.position} orientation={telemetry.orientation} />
      )}
      {telemetry && telemetry.dock.lat !== 0 && (
        <DockMarker position={telemetry.dock} />
      )}
      {showHeatmap && <SatelliteHeatmap samples={satSamples} />}
    </MapContainer>
  );
}
