import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Position } from '../../types/mower';

const DOCK_ICON = L.divIcon({
  className: 'dock-icon',
  html: `<div style="
    width: 24px; height: 24px;
    background: #3b82f6;
    border: 3px solid #fff;
    border-radius: 4px;
    box-shadow: 0 0 6px rgba(59,130,246,0.5);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
  ">🔌</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface DockMarkerProps {
  position: Position;
}

export function DockMarker({ position }: DockMarkerProps) {
  return (
    <Marker position={[position.lat, position.lng]} icon={DOCK_ICON}>
      <Popup>
        <strong>Charging Dock</strong><br />
        Lat: {position.lat.toFixed(7)}<br />
        Lng: {position.lng.toFixed(7)}
      </Popup>
    </Marker>
  );
}
