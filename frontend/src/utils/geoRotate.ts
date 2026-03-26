import type { GeoJSONFeatureCollection } from '../types/mower';

const METERS_PER_DEG = 111320;

export function pivotOk(lat: number, lng: number): boolean {
  return Math.abs(lat) > 1e-7 || Math.abs(lng) > 1e-7;
}

/** Shift [lon, lat] by east/north meters (ENU at point). */
export function translateLonLat(
  lon: number,
  lat: number,
  eastM: number,
  northM: number
): [number, number] {
  if (eastM === 0 && northM === 0) return [lon, lat];
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return [lon + eastM / (METERS_PER_DEG * cosLat), lat + northM / METERS_PER_DEG];
}

function translateCoordsNested(coords: unknown, eastM: number, northM: number): unknown {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  const a = coords[0];
  const b = coords[1];
  if (typeof a === 'number' && typeof b === 'number') {
    return translateLonLat(a, b, eastM, northM);
  }
  return (coords as unknown[]).map((c) => translateCoordsNested(c, eastM, northM));
}

export function translateGeoJSON(
  fc: GeoJSONFeatureCollection,
  eastM: number,
  northM: number
): GeoJSONFeatureCollection {
  if (eastM === 0 && northM === 0) return fc;
  return {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      if (!g || g.type === 'GeometryCollection') return f;
      return {
        ...f,
        geometry: {
          ...g,
          coordinates: translateCoordsNested(g.coordinates, eastM, northM) as typeof g.coordinates,
        },
      };
    }),
  };
}

/** Rotate [lon, lat] around pivot in the local tangent plane (small-area approximation). */
export function rotateLonLat(
  lon: number,
  lat: number,
  pivotLon: number,
  pivotLat: number,
  deg: number
): [number, number] {
  if (deg === 0) return [lon, lat];
  const cosLat = Math.cos((pivotLat * Math.PI) / 180);
  const mx = (lon - pivotLon) * METERS_PER_DEG * cosLat;
  const my = (lat - pivotLat) * METERS_PER_DEG;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const mx2 = mx * c - my * s;
  const my2 = mx * s + my * c;
  return [pivotLon + mx2 / (METERS_PER_DEG * cosLat), pivotLat + my2 / METERS_PER_DEG];
}

function rotateCoordsNested(
  coords: unknown,
  pivotLon: number,
  pivotLat: number,
  deg: number
): unknown {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  const a = coords[0];
  const b = coords[1];
  if (typeof a === 'number' && typeof b === 'number') {
    return rotateLonLat(a, b, pivotLon, pivotLat, deg);
  }
  return (coords as unknown[]).map((c) => rotateCoordsNested(c, pivotLon, pivotLat, deg));
}

/** Reflect [lon,lat] across pivot: negate east and/or north offset (ENU). */
export function mirrorLonLat(
  lon: number,
  lat: number,
  pivotLon: number,
  pivotLat: number,
  mirrorEW: boolean,
  mirrorNS: boolean
): [number, number] {
  if (!mirrorEW && !mirrorNS) return [lon, lat];
  const cosLat = Math.cos((pivotLat * Math.PI) / 180);
  let east = (lon - pivotLon) * METERS_PER_DEG * cosLat;
  let north = (lat - pivotLat) * METERS_PER_DEG;
  if (mirrorEW) east = -east;
  if (mirrorNS) north = -north;
  return [pivotLon + east / (METERS_PER_DEG * cosLat), pivotLat + north / METERS_PER_DEG];
}

function mirrorCoordsNested(
  coords: unknown,
  pivotLon: number,
  pivotLat: number,
  mirrorEW: boolean,
  mirrorNS: boolean
): unknown {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  const a = coords[0];
  const b = coords[1];
  if (typeof a === 'number' && typeof b === 'number') {
    return mirrorLonLat(a, b, pivotLon, pivotLat, mirrorEW, mirrorNS);
  }
  return (coords as unknown[]).map((c) => mirrorCoordsNested(c, pivotLon, pivotLat, mirrorEW, mirrorNS));
}

export function mirrorGeoJSON(
  fc: GeoJSONFeatureCollection,
  pivotLon: number,
  pivotLat: number,
  mirrorEW: boolean,
  mirrorNS: boolean
): GeoJSONFeatureCollection {
  if (!mirrorEW && !mirrorNS) return fc;
  return {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      if (!g || g.type === 'GeometryCollection') return f;
      return {
        ...f,
        geometry: {
          ...g,
          coordinates: mirrorCoordsNested(g.coordinates, pivotLon, pivotLat, mirrorEW, mirrorNS) as typeof g.coordinates,
        },
      };
    }),
  };
}

/** Deep-clone FeatureCollection and rotate every ring/line/point around the pivot. */
export function rotateGeoJSON(
  fc: GeoJSONFeatureCollection,
  pivotLon: number,
  pivotLat: number,
  deg: number
): GeoJSONFeatureCollection {
  if (deg === 0) return fc;
  return {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      if (!g || g.type === 'GeometryCollection') return f;
      return {
        ...f,
        geometry: {
          ...g,
          coordinates: rotateCoordsNested(g.coordinates, pivotLon, pivotLat, deg) as typeof g.coordinates,
        },
      };
    }),
  };
}

/** Same transform as alignGeoJSON, for a single WGS84 point (mower/dock markers). */
export function alignLonLat(
  lon: number,
  lat: number,
  pivotLon: number,
  pivotLat: number,
  mirrorEW: boolean,
  mirrorNS: boolean,
  rotationDeg: number,
  eastM: number,
  northM: number
): [number, number] {
  let lonOut = lon;
  let latOut = lat;
  if ((mirrorEW || mirrorNS) && pivotOk(pivotLat, pivotLon)) {
    [lonOut, latOut] = mirrorLonLat(lonOut, latOut, pivotLon, pivotLat, mirrorEW, mirrorNS);
  }
  if (rotationDeg !== 0 && pivotOk(pivotLat, pivotLon)) {
    [lonOut, latOut] = rotateLonLat(lonOut, latOut, pivotLon, pivotLat, rotationDeg);
  }
  if (eastM !== 0 || northM !== 0) {
    [lonOut, latOut] = translateLonLat(lonOut, latOut, eastM, northM);
  }
  return [lonOut, latOut];
}

/**
 * Full overlay fix: mirror → rotate → translate (all around RTK pivot except translate).
 * Mirror fixes left/right or upside-down map frame vs imagery.
 */
export function alignGeoJSON(
  fc: GeoJSONFeatureCollection,
  pivotLon: number,
  pivotLat: number,
  mirrorEW: boolean,
  mirrorNS: boolean,
  rotationDeg: number,
  eastM: number,
  northM: number
): GeoJSONFeatureCollection {
  let out = fc;
  if ((mirrorEW || mirrorNS) && pivotOk(pivotLat, pivotLon)) {
    out = mirrorGeoJSON(out, pivotLon, pivotLat, mirrorEW, mirrorNS);
  }
  if (rotationDeg !== 0 && pivotOk(pivotLat, pivotLon)) {
    out = rotateGeoJSON(out, pivotLon, pivotLat, rotationDeg);
  }
  if (eastM !== 0 || northM !== 0) {
    out = translateGeoJSON(out, eastM, northM);
  }
  return out;
}
