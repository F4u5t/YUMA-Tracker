import 'leaflet';

declare module 'leaflet' {
  interface HeatLayer extends Layer {
    setLatLngs(latlngs: Array<[number, number, number]>): this;
    addLatLng(latlng: [number, number, number]): this;
    setOptions(options: HeatLayerOptions): this;
  }

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  function heatLayer(
    latlngs: Array<[number, number, number]>,
    options?: HeatLayerOptions
  ): HeatLayer;
}
