import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { Entity as OsintEntity, LayerId } from '@osint-globe/shared';
import { LiveStore } from './live.js';

/** Per-layer point styling: [color, pixelSize]. */
const STYLE: Partial<Record<LayerId, [Cesium.Color, number]>> = {
  flights: [Cesium.Color.CYAN, 5],
  satellites: [Cesium.Color.GOLD, 4],
  vessels: [Cesium.Color.SPRINGGREEN, 6],
  cameras: [Cesium.Color.ORANGE, 9],
  incidents: [Cesium.Color.RED, 7],
};

function describe(e: OsintEntity): string {
  const rows = Object.entries(e.properties ?? {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><th>${k}</th><td>${String(v)}</td></tr>`)
    .join('');
  return `<table class="cesium-infoBox-defaultTable"><tbody>${rows}</tbody></table>`;
}

export function Globe({
  store,
  enabled,
  photoreal,
}: {
  store: LiveStore;
  enabled: Set<LayerId>;
  photoreal: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer>();
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const refreshAllRef = useRef<() => void>(() => {});

  // ---- Viewer setup + live entity reconciliation ----
  useEffect(() => {
    if (!containerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (token) Cesium.Ion.defaultAccessToken = token;

    // Without an ion token, Cesium's default ion imagery fails to decode and
    // rendering stops. Fall back to keyless OpenStreetMap tiles so the globe
    // works with zero config; with a token we use ion imagery + the layer picker.
    const options: Cesium.Viewer.ConstructorOptions = {
      animation: false,
      timeline: false,
      sceneModePicker: true,
      navigationHelpButton: false,
      baseLayerPicker: Boolean(token),
      geocoder: Boolean(token), // default geocoder is ion-backed
    };
    if (!token) {
      options.baseLayer = new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          credit: '© OpenStreetMap contributors',
          maximumLevel: 19,
        }),
      );
    }

    const viewer = new Cesium.Viewer(containerRef.current, options);
    viewerRef.current = viewer;
    viewer.scene.globe.enableLighting = true;

    // World terrain (requires an ion token); harmless no-op otherwise.
    if (token) {
      Cesium.createWorldTerrainAsync()
        .then((tp) => {
          if (!viewer.isDestroyed()) viewer.terrainProvider = tp;
        })
        .catch(() => {});
    }

    const sources = new Map<LayerId, Cesium.CustomDataSource>();

    const reconcile = (layer: LayerId) => {
      let ds = sources.get(layer);
      if (!ds) {
        ds = new Cesium.CustomDataSource(layer);
        viewer.dataSources.add(ds);
        sources.set(layer, ds);
      }
      ds.show = enabledRef.current.has(layer);
      if (!ds.show) return;

      const entities = store.layers.get(layer);
      if (!entities) return;

      const [color, size] = STYLE[layer] ?? [Cesium.Color.WHITE, 5];
      const seen = new Set<string>();
      for (const e of entities.values()) {
        seen.add(e.id);
        const pos = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, e.position.alt ?? 0);
        const existing = ds.entities.getById(e.id);
        if (existing) {
          existing.position = new Cesium.ConstantPositionProperty(pos);
        } else {
          ds.entities.add({
            id: e.id,
            position: pos,
            point: { pixelSize: size, color, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
            name: e.label ?? e.id,
            description: describe(e),
          });
        }
      }
      for (const ent of [...ds.entities.values]) {
        if (!seen.has(ent.id)) ds.entities.remove(ent);
      }
    };

    const refreshAll = () => {
      for (const layer of store.layers.keys()) reconcile(layer);
    };
    refreshAllRef.current = refreshAll;
    refreshAll();

    const unsub = store.onChange((what) => {
      if (what === 'meta') refreshAll();
      else reconcile(what);
    });

    return () => {
      unsub();
      viewer.destroy();
      viewerRef.current = undefined;
    };
  }, [store]);

  // ---- Show/hide layers when the enabled set changes ----
  useEffect(() => {
    refreshAllRef.current();
  }, [enabled]);

  // ---- Photoreal 3D geometry toggle ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !photoreal) return;

    let tileset: Cesium.Cesium3DTileset | undefined;
    let cancelled = false;

    (async () => {
      try {
        const googleKey = import.meta.env.VITE_GOOGLE_3DTILES_KEY as string | undefined;
        if (googleKey) {
          // Most photoreal: Google Photorealistic 3D Tiles (opt-in, billed per session).
          Cesium.GoogleMaps.defaultApiKey = googleKey;
          tileset = await Cesium.createGooglePhotorealistic3DTileset();
          if (cancelled) return;
          viewer.scene.primitives.add(tileset);
          viewer.scene.globe.show = false; // tiles bring their own ground
        } else if (Cesium.Ion.defaultAccessToken) {
          // Free fallback: Cesium OSM Buildings (extruded global building shapes).
          tileset = await Cesium.createOsmBuildingsAsync();
          if (cancelled) return;
          viewer.scene.primitives.add(tileset);
        } else {
          console.warn('Photoreal 3D needs VITE_GOOGLE_3DTILES_KEY or VITE_CESIUM_ION_TOKEN.');
        }
      } catch (err) {
        console.error('3D tiles failed to load:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (tileset && !viewer.isDestroyed()) viewer.scene.primitives.remove(tileset);
      if (!viewer.isDestroyed()) viewer.scene.globe.show = true;
    };
  }, [photoreal]);

  return <div ref={containerRef} className="globe" />;
}
