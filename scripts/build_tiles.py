#!/usr/bin/env python3
"""
GeoJSON (./geojson) -> векторные тайлы PMTiles (./map/tiles) + ./map/layers.json для карты.
Временные ряды индексов (district/regional_statistics_mv) и каталог растров (vindexv)
экспортируются в ./tables/*.csv — это таблицы, а не карта (тысячи копий одних и тех же полигонов).

Нужно: pip install pyogrio geopandas
Запуск: python3 build_tiles.py            (пропускает уже собранные слои)
"""
import json, os, sys, glob
import geopandas as gpd
import pyogrio

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "geojson")
TILES = os.path.join(BASE, "map", "tiles")
TABLES = os.path.join(BASE, "tables")
TABULAR = {"district_statistics_mv", "regional_statistics_mv", "vindexv"}
MINZOOM, MAXZOOM = 5, 13

os.makedirs(TILES, exist_ok=True)
os.makedirs(TABLES, exist_ok=True)
meta_path = os.path.join(BASE, "map", "layers.json")
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}

for path in sorted(glob.glob(os.path.join(SRC, "*.geojson"))):
    name = os.path.basename(path)[:-8]
    if name in TABULAR:
        out = os.path.join(TABLES, name + ".csv")
        if not os.path.exists(out):
            df = pyogrio.read_dataframe(path, read_geometry=False)
            df.to_csv(out, index=False)
            print(f"table  {name}: {len(df)} rows -> {out}")
        continue
    out = os.path.join(TILES, name + ".pmtiles")
    if os.path.exists(out) and name in meta:
        print(f"skip   {name}")
        continue
    print(f"tiles  {name} ...", flush=True)
    gdf = pyogrio.read_dataframe(path)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    gtypes = set(gdf.geom_type.str.replace("Multi", ""))
    kind = "polygon" if "Polygon" in gtypes else "line" if "LineString" in gtypes else "point"
    # не-примитивные поля -> строки
    for c in gdf.columns:
        if c != "geometry" and gdf[c].dtype == object:
            gdf[c] = gdf[c].astype(str)
    if os.path.exists(out):
        os.remove(out)
    pyogrio.write_dataframe(
        gdf, out, driver="PMTiles", layer=name,
        dataset_options={"MINZOOM": MINZOOM, "MAXZOOM": MAXZOOM,
                         "MAX_SIZE": 2_000_000, "MAX_FEATURES": 500_000},
    )
    b = gdf.total_bounds.tolist()
    meta[name] = {"kind": kind, "count": int(len(gdf)), "bounds": b,
                  "fields": [c for c in gdf.columns if c != "geometry"]}
    json.dump(meta, open(meta_path, "w"), ensure_ascii=False, indent=1)
    print(f"       {name}: {len(gdf)} {kind} -> {os.path.getsize(out)/1e6:.1f} MB", flush=True)

print("done:", len(meta), "layers")
