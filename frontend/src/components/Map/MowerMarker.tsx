import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { Position } from '../../types/mower';

const MOWER_ICON = L.divIcon({
  className: 'mower-icon',
  html: `<div style="
    width: 28px; height: 28px;
    background: #22c55e;
    border: 3px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 8px rgba(34,197,94,0.6);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  ">🤖</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface MowerMarkerProps {
  position: Position;
  orientation: number;
}

export function MowerMarker({ position, orientation }: MowerMarkerProps) {
  const map = useMap();
  const hasCentered = useRef(false);

  // Zoom to yard level as soon as we have a valid position (fires once)
  useEffect(() => {
    if (!hasCentered.current && position.lat !== 0 && position.lng !== 0) {
      map.setView([position.lat, position.lng], 19);
      hasCentered.current = true;
    }
  }, [map, position.lat, position.lng]);

  return (
    <Marker position={[position.lat, position.lng]} icon={MOWER_ICON}>
      <Popup>
        <strong>Mower</strong><br />
        Lat: {position.lat.toFixed(7)}<br />
        Lng: {position.lng.toFixed(7)}<br />
        Heading: {orientation}°
      </Popup>
    </Marker>
  );
}
