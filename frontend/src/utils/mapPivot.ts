import type { GeoJSONFeatureCollection, Telemetry } from '../types/mower';

/** Walk GeoJSON coordinates to first [lon, lat] position. */
function firstLonLat(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const a = coords[0];
  if (typeof a === 'number' && typeof coords[1] === 'number') {
    return [a as number, coords[1] as number];
  }
  return firstLonLat(a);
}

function firstLonLatFromFeatureCollection(fc: GeoJSONFeatureCollection | null): [number, number] | null {
  if (!fc?.features.length) return null;
  for (const f of fc.features) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const p = firstLonLat(c);
    if (p) return p;
  }
  return null;
}

/**
 * Pivot for overlay + mower alignment (mirror / rotate).
 * Never use the mower position as pivot — that makes mirror+rotate identity for the mower
 * while polygons still transform, so the icon stays wrong vs zones.
 *
 * Priority: RTK base → dock → first vertex of boundaries.
 */
export function getAlignmentPivot(
  telemetry: Telemetry | null,
  boundaries: GeoJSONFeatureCollection | null
): { pivotLat: number; pivotLng: number } {
  if (telemetry) {
    if (telemetry.rtk_base.lat !== 0 || telemetry.rtk_base.lng !== 0) {
      return { pivotLat: telemetry.rtk_base.lat, pivotLng: telemetry.rtk_base.lng };
    }
    if (telemetry.dock.lat !== 0 || telemetry.dock.lng !== 0) {
      return { pivotLat: telemetry.dock.lat, pivotLng: telemetry.dock.lng };
    }
  }
  const first = firstLonLatFromFeatureCollection(boundaries);
  if (first) {
    const [lng, lat] = first;
    return { pivotLat: lat, pivotLng: lng };
  }
  return { pivotLat: 0, pivotLng: 0 };
}
