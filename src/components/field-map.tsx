"use client";

// Полноэкранная WebGL-карта (MapLibre): спутниковая подложка + только слой полей.
// Поля раскрашиваются по культуре прямо на GPU (data-driven `match`), выбранное поле — фильтром,
// без пересоздания источников. Тайлы — один PMTiles-файл, грузятся только видимые квадраты.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { CROP_CODES, CROP_COLORS } from "@/lib/crops";

export type FieldMapHandle = {
  select: (id: number | null) => void;
  /** Показать моё местоположение синей точкой и перелететь к нему — без поиска поля. */
  showMe: (lon: number, lat: number) => void;
  /** Показать/скрыть слой NASA LHASA. */
  setLhasa: (visible: boolean) => void;
};

type Props = { onFieldClick: (id: number, lon: number, lat: number) => void; onMapClick?: (lon: number, lat: number) => void };

const KG_BOUNDS: [[number, number], [number, number]] = [[69.2, 39.1], [80.3, 43.3]];
let protocolAdded = false;

const colorExpr = ["match", ["get", "c"], ...CROP_CODES.flatMap((name, i) => [i, CROP_COLORS[name]]), "#9e9e9e"] as unknown as maplibregl.ExpressionSpecification;

export const FieldMap = forwardRef<FieldMapHandle, Props>(function FieldMap({ onFieldClick, onMapClick }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const cb = useRef({ onFieldClick, onMapClick });
  cb.current = { onFieldClick, onMapClick };

  useEffect(() => {
    if (!protocolAdded) {
      // MapLibre 6 грузит WebGL-воркер отдельным файлом; после бандлинга Next путь теряется — указываем явно
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      protocolAdded = true;
    }
    const m = new maplibregl.Map({
      container: box.current!,
      bounds: KG_BOUNDS,
      minZoom: 6,                                        // поля есть в тайлах с z6 — дальше не отдаляем
      maxBounds: [[64, 36], [86, 46]],
      maxZoom: 18,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      fadeDuration: 0,                                   // без кроссфейда тайлов — меньше перерисовок
      pixelRatio: Math.min(window.devicePixelRatio, 2),  // не рендерим 3x на телефонах
      cancelPendingTileRequestsWhileZooming: true,
      maxTileCacheSize: 200,
      canvasContextAttributes: { antialias: false, powerPreference: "high-performance" },
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          sat: {
            type: "raster", tileSize: 256, maxzoom: 17, attribution: "Esri World Imagery",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          },
          // NASA LHASA: глобальная карта восприимчивости к оползням/селям (~1 км), обрезана по КР
          lhasa: {
            type: "image", url: "/data/lhasa_susceptibility.png",
            coordinates: [[69.2, 43.30006], [80.3, 43.30006], [80.3, 39.10006], [69.2, 39.10006]],
          },
          fields: {
            type: "vector", url: `pmtiles://${window.location.origin}/data/fields.pmtiles`,
            attribution: "Поля: AgroMap · Риск селей: NASA LHASA · Влажность: NASA SMAP",
          },
        },
        layers: [
          { id: "sat", type: "raster", source: "sat", paint: { "raster-fade-duration": 0 } },
          {
            id: "lhasa", type: "raster", source: "lhasa",
            paint: { "raster-opacity": 0.65, "raster-resampling": "nearest", "raster-fade-duration": 0 },
          },
          {
            id: "fields-fill", type: "fill", source: "fields", "source-layer": "fields",
            paint: { "fill-color": colorExpr, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.75, 12, 0.45, 16, 0.3] },
          },
          {
            id: "fields-line", type: "line", source: "fields", "source-layer": "fields", minzoom: 11,
            paint: { "line-color": colorExpr, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 1.5] },
          },
          {
            id: "fields-selected", type: "line", source: "fields", "source-layer": "fields",
            filter: ["==", ["get", "id"], -1],
            paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 16, 4] },
          },
        ],
      },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const attr = new maplibregl.AttributionControl({ compact: true });
    m.addControl(attr, "top-left");
    // компактная подпись источников: свернуть сразу, чтобы не перекрывала кнопки
    m.once("load", () => document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    (window as unknown as { __fsMap?: MlMap }).__fsMap = m; // для отладки/тестов
    m.on("click", (e: MapMouseEvent) => {
      const f = m.queryRenderedFeatures(e.point, { layers: ["fields-fill"] })[0];
      if (f) cb.current.onFieldClick(Number(f.properties.id), e.lngLat.lng, e.lngLat.lat);
      else cb.current.onMapClick?.(e.lngLat.lng, e.lngLat.lat);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useImperativeHandle(ref, () => ({
    showMe(lon, lat) {
      const m = map.current!;
      if (!me.current) {
        const dot = document.createElement("div");
        dot.className = "size-4 rounded-full border-[3px] border-white bg-blue-500 shadow-[0_0_0_6px_rgba(59,130,246,0.25)]";
        me.current = new maplibregl.Marker({ element: dot });
      }
      me.current.setLngLat([lon, lat]).addTo(m);
      m.flyTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), 14), duration: 1200, essential: true });
    },
    setLhasa(visible) {
      map.current?.setLayoutProperty("lhasa", "visibility", visible ? "visible" : "none");
    },
    select(id) {
      map.current?.setFilter("fields-selected", ["==", ["get", "id"], id ?? -1]);
    },
  }), []);

  // MapLibre ставит контейнеру position:relative — поэтому позиционируем обёртку, а контейнер растягиваем на 100%
  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
});
