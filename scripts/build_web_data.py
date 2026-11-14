#!/usr/bin/env python3
"""
Данные для Next.js-приложения (web/public/data):
  fields.pmtiles      — лёгкие векторные тайлы полей: только id и код культуры c (для WebGL-раскраски)
  fields/{b}.json     — паспорта полей, разбиты на 256 корзин по id % 256 (грузятся по клику)
  lhasa.json, lhasa_grid.bin — сетка NASA LHASA для поиска риска в любой точке
Запуск после build_fields.py.
"""
import json, os, shutil
import pyogrio

B = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(B, "web", "public", "data")
os.makedirs(os.path.join(OUT, "fields"), exist_ok=True)

# порядок = код культуры в тайлах (совпадает с web/src/lib/crops.ts CROP_CODES)
CODES = ["", "Пшеница", "Ячмень", "Кукуруза на зерно", "Люцерна", "Эспарцет", "Фасоль", "Соя", "Нут",
         "Картофель", "Свекла сахарная", "Подсолнечник", "Хлопок", "Другое"]
ALIAS = {"Свекла": "Свекла сахарная", "Кукуруза на силос": "Кукуруза на зерно", "Клубника": "Другое"}

g = pyogrio.read_dataframe(os.path.join(B, "geojson", "fields.geojson"))
def last_crop(h):
    if not h:
        return 0
    c = h.split(";")[-1].split(":", 1)[1]
    c = ALIAS.get(c, c)
    return CODES.index(c) if c in CODES else CODES.index("Другое")
g["id"] = g["osm_id"].astype(int)
g["c"] = g["history"].fillna("").map(last_crop).astype(int)

# паспорта
buckets = {}
for r in g.drop(columns="geometry").itertuples(index=False):
    buckets.setdefault(r.id % 256, {})[r.id] = {
        "h": r.history or "", "a": float(r.area_ha), "lon": float(r.lon), "lat": float(r.lat),
        "s": r.soil or "", "r": r.region or "", "d": r.district or "", "k": int(r.canal_m), "l": int(r.lhasa),
    }
for b, d in buckets.items():
    with open(os.path.join(OUT, "fields", f"{b}.json"), "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))

# лёгкие тайлы
out = os.path.join(OUT, "fields.pmtiles")
if os.path.exists(out):
    os.remove(out)
pyogrio.write_dataframe(
    g[["id", "c", "geometry"]], out, driver="PMTiles", layer="fields",
    dataset_options={"MINZOOM": 6, "MAXZOOM": 14, "MAX_SIZE": 1_500_000, "MAX_FEATURES": 400_000,
                     "SIMPLIFICATION": 2, "SIMPLIFICATION_MAX_ZOOM": 1},
)
print("fields.pmtiles", round(os.path.getsize(out) / 1e6, 1), "MB;", len(g), "fields;",
      g.c.value_counts().rename(lambda i: CODES[i] or "нет").to_dict())

for f in ["lhasa.json", "lhasa_grid.bin", "lhasa_susceptibility.png"]:
    shutil.copy(os.path.join(B, "map", f), os.path.join(OUT, f))
print("ok")
