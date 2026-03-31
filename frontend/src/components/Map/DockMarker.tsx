import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Position } from '../../types/mower';

const DOCK_ICON = L.divIcon({
  className: 'dock-icon',
  html: `<div style="
    width: 26px; height: 26px;
    background: #3b82f6;
    border: 3px solid #fff;
    border-radius: 5px;
    box-shadow: 0 0 8px rgba(59,130,246,0.7);
    display: flex; align-items: center; justify-content: center;
  "><svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M5 12H2'/><path d='M22 12h-3'/><path d='M12 2v3'/><path d='M12 19v3'/><circle cx='12' cy='12' r='4'/></svg></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
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
