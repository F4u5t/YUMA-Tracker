import { MapContainer, TileLayer, LayersControl, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Telemetry, SatSample, GeoJSONFeatureCollection } from '../../types/mower';
import { alignGeoJSON, alignLonLat } from '../../utils/geoRotate';
import { getAlignmentPivot } from '../../utils/mapPivot';
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
  /** Green zones + purple mow path: optional mirror, rotate (°), shift (m) around RTK pivot */
  overlayMirrorEW: boolean;
  overlayMirrorNS: boolean;
  overlayRotationDeg: number;
  overlayEastM: number;
  overlayNorthM: number;
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

/** Flies to the mower position the first time a valid fix arrives (aligned = same as markers). */
function AutoFly({
  displayLat,
  displayLng,
}: {
  displayLat: number;
  displayLng: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (displayLat !== 0 || displayLng !== 0) {
      map.setView([displayLat, displayLng], map.getZoom() < 10 ? DEFAULT_ZOOM : map.getZoom());
    }
  }, [displayLat, displayLng]);
  return null;
}

export function MapView({
  telemetry,
  satSamples,
  boundaries,
  mowPath,
  showHeatmap,
  selectedTaskZones,
  overlayMirrorEW,
  overlayMirrorNS,
  overlayRotationDeg,
  overlayEastM,
  overlayNorthM,
}: MapViewProps) {
  // Never use mower as pivot (mirror/rotate would leave the mower icon fixed vs moving polygons).
  const { pivotLat, pivotLng } = useMemo(
    () => getAlignmentPivot(telemetry, boundaries),
    [telemetry, boundaries]
  );

  const mowerDisplay = useMemo(() => {
    if (!telemetry || (telemetry.position.lat === 0 && telemetry.position.lng === 0)) return null;
    const [lng, lat] = alignLonLat(
      telemetry.position.lng,
      telemetry.position.lat,
      pivotLng,
      pivotLat,
      overlayMirrorEW,
      overlayMirrorNS,
      overlayRotationDeg,
      overlayEastM,
      overlayNorthM
    );
    return { lat, lng };
  }, [
    telemetry,
    pivotLng,
    pivotLat,
    overlayMirrorEW,
    overlayMirrorNS,
    overlayRotationDeg,
    overlayEastM,
    overlayNorthM,
  ]);

  const dockDisplay = useMemo(() => {
    if (!telemetry || (telemetry.dock.lat === 0 && telemetry.dock.lng === 0)) return null;
    const [lng, lat] = alignLonLat(
      telemetry.dock.lng,
      telemetry.dock.lat,
      pivotLng,
      pivotLat,
      overlayMirrorEW,
      overlayMirrorNS,
      overlayRotationDeg,
      overlayEastM,
      overlayNorthM
    );
    return { lat, lng };
  }, [
    telemetry,
    pivotLng,
    pivotLat,
    overlayMirrorEW,
    overlayMirrorNS,
    overlayRotationDeg,
    overlayEastM,
    overlayNorthM,
  ]);

  const alignedSatSamples = useMemo(() => {
    if (!satSamples.length) return satSamples;
    return satSamples.map((s) => {
      const [lng, lat] = alignLonLat(
        s.lng,
        s.lat,
        pivotLng,
        pivotLat,
        overlayMirrorEW,
        overlayMirrorNS,
        overlayRotationDeg,
        overlayEastM,
        overlayNorthM
      );
      return { ...s, lat, lng };
    });
  }, [
    satSamples,
    pivotLng,
    pivotLat,
    overlayMirrorEW,
    overlayMirrorNS,
    overlayRotationDeg,
    overlayEastM,
    overlayNorthM,
  ]);

  const center: [number, number] = mowerDisplay
    ? [mowerDisplay.lat, mowerDisplay.lng]
    : DEFAULT_CENTER;

  const alignedBoundaries = useMemo(() => {
    if (!boundaries?.features.length) return boundaries;
    return alignGeoJSON(
      boundaries,
      pivotLng,
      pivotLat,
      overlayMirrorEW,
      overlayMirrorNS,
      overlayRotationDeg,
      overlayEastM,
      overlayNorthM
    );
  }, [
    boundaries,
    pivotLng,
    pivotLat,
    overlayMirrorEW,
    overlayMirrorNS,
    overlayRotationDeg,
    overlayEastM,
    overlayNorthM,
  ]);

  const alignedMowPath = useMemo(() => {
    if (!mowPath?.features.length) return mowPath;
    return alignGeoJSON(
      mowPath,
      pivotLng,
      pivotLat,
      overlayMirrorEW,
      overlayMirrorNS,
      overlayRotationDeg,
      overlayEastM,
      overlayNorthM
    );
  }, [
    mowPath,
    pivotLng,
    pivotLat,
    overlayMirrorEW,
    overlayMirrorNS,
    overlayRotationDeg,
    overlayEastM,
    overlayNorthM,
  ]);

  return (
    <MapContainer center={center} zoom={DEFAULT_ZOOM} maxZoom={21} className="map-container" style={{ height: '100%', width: '100%' }}>
      <FitBounds boundaries={alignedBoundaries} />
      {mowerDisplay && (
        <AutoFly displayLat={mowerDisplay.lat} displayLng={mowerDisplay.lng} />
      )}
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

      {alignedBoundaries && (
        <ZoneLayer
          key={`z-${overlayMirrorEW}-${overlayMirrorNS}-${overlayRotationDeg}-${overlayEastM}-${overlayNorthM}`}
          geojson={alignedBoundaries}
          selectedZones={selectedTaskZones}
        />
      )}
      {alignedMowPath && (
        <MowPathLayer
          key={`m-${overlayMirrorEW}-${overlayMirrorNS}-${overlayRotationDeg}-${overlayEastM}-${overlayNorthM}-${alignedMowPath.features.length}`}
          geojson={alignedMowPath}
        />
      )}
      {mowerDisplay && (
        <MowerMarker position={mowerDisplay} orientation={telemetry?.orientation ?? 0} />
      )}
      {dockDisplay && (
        <DockMarker position={dockDisplay} />
      )}
      {showHeatmap && <SatelliteHeatmap samples={alignedSatSamples} />}
    </MapContainer>
  );
}
