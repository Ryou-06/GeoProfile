// @ts-nocheck
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// Vite emits this file as a fingerprinted public asset. Without an explicit
// URL, MapLibre's worker can be omitted from a Vercel deployment and the map
// fails before it renders.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/**
 * A small compatibility layer used while the two household maps move from
 * Leaflet to MapLibre. It deliberately retains the existing page behaviour
 * (markers, boundary, filters and selection) while bundling the map engine
 * with the app instead of loading it from a runtime CDN.
 *
 * @param {string | undefined} mapTilerKey
 */
export function createMapAdapter(mapTilerKey) {
  let nextLayerId = 0;

  return {
    latLngBounds(southWest, northEast) {
      return { southWest, northEast };
    },

    map(container, options) {
      const queued = [];
      let ready = false;
      const style = mapTilerKey
        ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapTilerKey)}`
        : FALLBACK_STYLE;
      const map = new maplibregl.Map({
        container,
        style,
        center: [options.center[1], options.center[0]],
        zoom: options.zoom,
        minZoom: options.minZoom,
        maxZoom: options.maxZoom,
        maxBounds: options.maxBounds
          ? [
              [options.maxBounds.southWest[1], options.maxBounds.southWest[0]],
              [options.maxBounds.northEast[1], options.maxBounds.northEast[0]]
            ]
          : undefined
      });
      let switchedToFallback = false;

      const wrapper = {
        raw: map,
        whenReady(action) {
          if (ready) action();
          else queued.push(action);
        },
        remove() {
          map.remove();
        },
        invalidateSize() {
          map.resize();
        },
        panTo(point, options = {}) {
          map.flyTo({ center: [point[1], point[0]], duration: (options.duration ?? 0) * 1000 });
        },
        addControl(control, position) {
          map.addControl(control, position);
        }
      };

      map.once('load', () => {
        ready = true;
        queued.splice(0).forEach((action) => action());
      });
      map.on('error', (event) => {
        console.error('Map service error:', event.error);
        // A bad/restricted MapTiler key must not make household locations
        // inaccessible. Before the first successful load, change to the
        // bundled fallback style and let the queued boundary/markers render.
        if (!ready && mapTilerKey && !switchedToFallback) {
          switchedToFallback = true;
          console.warn('MapTiler could not load; using the fallback basemap.');
          map.setStyle(FALLBACK_STYLE);
        }
      });
      return wrapper;
    },

    // The style is selected when the map is created. Keeping this no-op lets
    // current page code remain readable during the migration.
    tileLayer() {
      return { addTo() {} };
    },

    geoJSON(feature, options = {}) {
      return {
        addTo(map) {
          map.whenReady(() => {
            const id = `geoprofile-boundary-${nextLayerId++}`;
            const style = options.style ?? {};
            map.raw.addSource(id, { type: 'geojson', data: feature });
            map.raw.addLayer({
              id: `${id}-fill`,
              type: 'fill',
              source: id,
              paint: {
                'fill-color': style.fillColor ?? '#2563eb',
                'fill-opacity': style.fillOpacity ?? 0.08
              }
            });
            map.raw.addLayer({
              id: `${id}-line`,
              type: 'line',
              source: id,
              paint: {
                'line-color': style.color ?? '#2563eb',
                'line-width': style.weight ?? 2,
                'line-opacity': style.opacity ?? 1,
                'line-dasharray': style.dashArray ? style.dashArray.split(' ').map(Number) : [1, 0]
              }
            });
          });
        }
      };
    },

    control: {
      zoom() {
        return new maplibregl.NavigationControl({ showCompass: false });
      }
    },

    divIcon(options) {
      return options;
    },

    marker(point, { icon }) {
      let marker;
      let removed = false;
      let clickHandler;
      let tooltip;

      return {
        addTo(map) {
          map.whenReady(() => {
            if (removed) return;
            const element = document.createElement('button');
            element.type = 'button';
            element.className = 'geoprofile-map-marker';
            element.setAttribute('aria-label', tooltip || 'Open household');
            element.innerHTML = icon.html;
            element.addEventListener('click', () => clickHandler?.());
            marker = new maplibregl.Marker({ element, anchor: 'bottom' })
              .setLngLat([point[1], point[0]])
              .addTo(map.raw);
          });
          return this;
        },
        on(event, handler) {
          if (event === 'click') clickHandler = handler;
          return this;
        },
        bindTooltip(text) {
          tooltip = text;
          return this;
        },
        remove() {
          removed = true;
          marker?.remove();
        }
      };
    }
  };
}
