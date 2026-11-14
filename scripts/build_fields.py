#!/usr/bin/env python3
"""
Слой «Поля для севооборота»: одно поле = один полигон forecast_culture (по osm_id) +
  history     — культуры по годам ("2022:Пшеница;2024:Ячмень;2025:Пшеница")
                (forecast_culture за все годы + культура 2022 из contours_main по пересечению)
  soil        — тип почвы (soil_agromap)
  region/district — область/район (agro_district_raw)
  canal_m     — расстояние до ближайшего канала, м (меж- и внутрихозяйственные)
  lhasa       — класс восприимчивости к оползням/селям NASA LHASA (1..5)
  area_ha, lon, lat
Результат: geojson/fields.geojson -> map/tiles/fields.pmtiles (через build_tiles.py)
"""
import os
import numpy as np
import pandas as pd
import geopandas as gpd
import pyogrio
import rasterio

B = os.path.dirname(os.path.abspath(__file__))
G = lambda n: os.path.join(B, "geojson", n + ".geojson")
UTM = 32643

fc = pyogrio.read_dataframe(G("forecast_culture"))
fc = fc[fc.geometry.notna()]
fc["year"] = fc["year"].astype(int)

# --- история культур из forecast_culture
hist = (fc.sort_values("year").groupby("osm_id")
        .apply(lambda d: {int(y): c for y, c in zip(d.year, d.culture)}).to_dict())

# одна геометрия на поле (берём самую свежую запись)
fields = fc.sort_values("year").groupby("osm_id").tail(1)[["osm_id", "geometry"]].reset_index(drop=True)
fields = fields.set_crs(4326, allow_override=True)
fu = fields.to_crs(UTM)
fields["area_ha"] = (fu.area / 1e4).round(2)
pt = fields.geometry.representative_point()
fields["lon"], fields["lat"] = pt.x.round(5), pt.y.round(5)
pts = gpd.GeoDataFrame(fields[["osm_id"]], geometry=pt, crs=4326)
print("fields:", len(fields))

# --- культура 2022 из contours_main (точка контура внутри поля)
EN = {"Alfalfa": "Люцерна", "Wheat": "Пшеница", "Barley": "Ячмень", "Soy": "Соя", "Potato": "Картофель",
      "Corn": "Кукуруза на зерно", "Beet": "Свекла сахарная"}
cm = pyogrio.read_dataframe(G("contours_main"), columns=["prd_clt_n", "year", "ltype"])
cm = cm[cm.prd_clt_n.isin(EN)]
cmp_ = gpd.GeoDataFrame({"clt": cm.prd_clt_n.map(EN), "y": cm.year.astype(int)},
                        geometry=cm.geometry.representative_point(), crs=4326)
j = gpd.sjoin(cmp_, fields[["osm_id", "geometry"]], predicate="within")
added = 0
for oid, g in j.groupby("osm_id"):
    h = hist.setdefault(oid, {})
    y = int(g.y.iloc[0])
    if y not in h:
        h[y] = g.clt.mode().iloc[0]
        added += 1
print("2022 из contours_main добавлено:", added)
fields["history"] = fields.osm_id.map(lambda o: ";".join(f"{y}:{c}" for y, c in sorted(hist.get(o, {}).items())))
fields["n_years"] = fields.osm_id.map(lambda o: len(hist.get(o, {})))

# --- почва
soil = pyogrio.read_dataframe(G("soil_agromap"), columns=["name_ru"])
s = gpd.sjoin(pts, soil.set_crs(4326, allow_override=True), predicate="within").drop_duplicates("osm_id")
fields["soil"] = fields.osm_id.map(s.set_index("osm_id").name_ru).fillna("")

# --- область / район
dist = pyogrio.read_dataframe(G("agro_district_raw"), columns=["pname_r", "dname_r"])
d = gpd.sjoin(pts, dist.set_crs(4326, allow_override=True), predicate="within").drop_duplicates("osm_id").set_index("osm_id")
fields["region"] = fields.osm_id.map(d.pname_r).fillna("")
fields["district"] = fields.osm_id.map(d.dname_r).fillna("")

# --- расстояние до канала
canals = pd.concat([pyogrio.read_dataframe(G(n), columns=[]) for n in
                    ["Mezhhozyajstvennye_kanaly", "Внутрихозяйственные_каналы"]], ignore_index=True)
canals = gpd.GeoDataFrame(geometry=canals.geometry, crs=4326).to_crs(UTM)
canals = canals[canals.geometry.notna() & ~canals.geometry.is_empty]
nn = gpd.sjoin_nearest(fu[["osm_id", "geometry"]], canals, max_distance=20000, distance_col="dist")
fields["canal_m"] = fields.osm_id.map(nn.groupby("osm_id").dist.min()).fillna(20000).round(0).astype(int)

# --- NASA LHASA
with rasterio.open(os.path.join(B, "nasa", "lhasa_susceptibility_kg.tif")) as r:
    a = r.read(1)
    rows, cols = rasterio.transform.rowcol(r.transform, fields.lon.values, fields.lat.values)
    rows = np.clip(rows, 0, a.shape[0] - 1); cols = np.clip(cols, 0, a.shape[1] - 1)
    fields["lhasa"] = a[rows, cols].astype(int)

out = G("fields")
if os.path.exists(out):
    os.remove(out)
pyogrio.write_dataframe(fields, out, driver="GeoJSON")
fields.drop(columns="geometry").to_csv(os.path.join(B, "nasa", "fields_passport.csv"), index=False)
print(fields.drop(columns="geometry").head(3).to_string())
print("с историей >=2 лет:", (fields.n_years >= 2).sum())
print("канал <300м:", (fields.canal_m < 300).mean().round(3), " <1500м:", (fields.canal_m < 1500).mean().round(3))
