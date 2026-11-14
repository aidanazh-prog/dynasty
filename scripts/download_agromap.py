#!/usr/bin/env python3
"""
Выгрузка всех векторных слоёв AgroMap (agromap.gov.kg) через публичный GeoServer WFS.

Запуск:   python3 download_agromap.py            # все слои из LAYERS
          python3 download_agromap.py contours_main soil_agromap   # только выбранные
Результат: ./geojson/<layer>.geojson (EPSG:4326) + ./summary.csv

Докачка: уже скачанные слои пропускаются (файл .part -> .geojson только после успеха).
"""
import json, os, sys, time, csv, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

WFS = "https://agromap.gov.kg/geoserver/wfs"
PAGE = 5000          # объектов за запрос
WORKERS = 2          # параллельных слоёв — не перегружаем гос. сервер
PAUSE = 0.5          # пауза между запросами, сек
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geojson")

# слой -> описание (что это для задачи севооборотов)
LAYERS = {
    # --- поля / контуры ---
    "agromap:contours_main":      "Контуры полей: тип угодья, культура, год, площадь, продуктивность",
    "agromap:contours_main_2":    "Контуры полей (версия 2)",
    "agromap:contours_main_ai":   "Контуры полей, выделенные ИИ (с районом/культурой)",
    "agromapv2:v_osm_pashni":     "Пашни (полигоны)",
    "agromapv2:v_osm_pastbishcha":"Пастбища (полигоны)",
    "agromapv2:forecast_culture": "Прогноз культуры на поле по ML-модели (год, культура)",
    # --- культуры по годам (классификация) ---
    "zzzz:Corn_2022":             "Кукуруза 2022",
    "zzzz:Sugar_beet_2022":       "Сахарная свёкла 2022",
    "zzzz:Sugar_beet_2024":       "Сахарная свёкла 2024",
    # --- почвы ---
    "agromap:soil_agromap":       "Почвенная карта КР",
    "agromapv2:district_soil_agromap": "Почвы с привязкой к областям/районам, площадь",
    # --- вегетационные индексы ---
    "agromapv2:district_statistics_mv": "NDVI/др. индексы по районам, по датам (временной ряд)",
    "agromapv2:regional_statistics_mv": "NDVI/др. индексы по областям, по датам (временной ряд)",
    "agromapv2:vindexv":          "Каталог растров индексов Sentinel-2 (NDVI/NDWI...) по датам",
    # --- пастбища / растительность ---
    "agromapv2:v_agro_pasture_productivity_geoserver": "Индекс продуктивности пастбищ",
    "agromapv2:v_agro_pasture_productivity_negative_geoserver": "Пастбища с негативной динамикой",
    "agromap:geobotanika_kg":     "Геоботаника: тип растительности, урожайность пастбищ",
    "agromap:forestry":           "Лесхозы",
    # --- вода ---
    "agromap:Mezhhozyajstvennye_kanaly": "Межхозяйственные каналы",
    "agromap:Внутрихозяйственные_каналы": "Внутрихозяйственные каналы",
    "agromap:АВП":                "Ассоциации водопользователей",
    # --- рельеф / границы ---
    "agromap:Vysota_KR_GPX_CK-42":"Высоты (изолинии/точки)",
    "agromapv2:agro_region_raw":  "Границы областей",
    "agromapv2:agro_district_raw":"Границы районов",
    "mosaic:kgz_admbnda_adm3_moes_20181119": "Границы айыл аймаков",
    "agromap:locations":          "Населённые пункты / локации",
    # --- кадастр (большой, ~400k) ---
    "agromap:zemdoli":            "Земельные доли (кадастр) — ~400 тыс. объектов",
}


def get(params, retries=5):
    url = WFS + "?" + urllib.parse.urlencode(params)
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "agromap-research-downloader"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 400:
                raise ValueError("HTTP 400")
            wait = 5 * (i + 1)
            print(f"   ! {params.get('typeNames')} @{params.get('startIndex')}: {e}; retry in {wait}s")
            time.sleep(wait)
        except Exception as e:
            wait = 5 * (i + 1)
            print(f"   ! {params.get('typeNames')} @{params.get('startIndex')}: {e}; retry in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"failed: {url}")


def count(layer):
    xml = get({"service": "WFS", "version": "2.0.0", "request": "GetFeature",
               "typeNames": layer, "resultType": "hits"}).decode("utf-8", "replace")
    import re
    m = re.search(r'numberMatched="(\d+)"', xml)
    return int(m.group(1)) if m else None


def download(layer):
    name = layer.split(":", 1)[1]
    final = os.path.join(OUT, f"{name}.geojson")
    if os.path.exists(final):
        print(f"= {layer}: уже скачан")
        return layer, "skipped", None
    total = count(layer)
    print(f"> {layer}: {total} объектов")
    part = final + ".part"
    # Представления без первичного ключа не листаются без sortBy -> сортируем по первому атрибуту
    sort = None
    try:
        get({"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": layer,
             "outputFormat": "application/json", "count": 1, "startIndex": 0})
    except ValueError:
        one = json.loads(get({"service": "WFS", "version": "1.0.0", "request": "GetFeature",
                              "typeName": layer, "outputFormat": "application/json", "maxFeatures": 1}))
        sort = next(iter(one["features"][0]["properties"]))
        print(f"   {layer}: без ключа, сортировка по '{sort}'")
    n, seen, start = 0, set(), 0
    with open(part, "w", encoding="utf-8") as f:
        f.write('{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:4326"}},"features":[\n')
        first = True
        while True:
            raw = get({"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                       "typeNames": layer, "outputFormat": "application/json",
                       "srsName": "EPSG:4326", "count": PAGE, "startIndex": start,
                       **({"sortBy": sort} if sort else {})})
            try:
                feats = json.loads(raw)["features"]
            except Exception:
                raise RuntimeError(f"{layer}: не JSON: {raw[:200]!r}")
            for ft in feats:
                fid = ft.get("id")
                if fid in seen:
                    continue
                seen.add(fid)
                f.write(("" if first else ",\n") + json.dumps(ft, ensure_ascii=False))
                first = False
                n += 1
            start += len(feats)
            if total:
                print(f"   {layer}: {min(start, total)}/{total}")
            if len(feats) < PAGE:
                break
            time.sleep(PAUSE)
        f.write("\n]}\n")
    os.replace(part, final)
    status = "ok" if total in (None, n) else f"mismatch (server {total})"
    print(f"✓ {layer}: {n} объектов -> {final} [{status}]")
    return layer, status, n


def main():
    os.makedirs(OUT, exist_ok=True)
    wanted = sys.argv[1:]
    layers = [l for l in LAYERS if not wanted or l.split(":", 1)[1] in wanted or l in wanted]
    results = []
    with ThreadPoolExecutor(WORKERS) as ex:
        for fut in [ex.submit(download, l) for l in layers]:
            try:
                results.append(fut.result())
            except Exception as e:
                print(f"✗ {e}")
                results.append(("?", f"error: {e}", None))
    with open(os.path.join(os.path.dirname(OUT), "summary.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["layer", "status", "features", "description"])
        for l, s, n in results:
            w.writerow([l, s, n, LAYERS.get(l, "")])
    print("Готово. Сводка: summary.csv")


if __name__ == "__main__":
    main()
