# Подготовка данных (Python)

Скрипты рассчитаны на структуру папок `agromap_data/` (рядом с `web/`):

1. `download_agromap.py` — выгрузка слоёв AgroMap через открытый WFS → `geojson/`
2. `build_tiles.py` — GeoJSON → PMTiles (для старой карты) и таблицы
3. `build_fields.py` — слой «поля»: история культур, почва, район, расстояние до канала, NASA LHASA
4. `build_web_data.py` — данные для веб-приложения → `web/public/data/`

Нужно: `pip install pyogrio geopandas rasterio pillow`.
NASA LHASA: `nasa/lhasa_susceptibility_kg.tif` — обрезка глобальной карты
https://gpm.nasa.gov/sites/default/files/downloads/global-landslide-susceptibility-map-2-27-23.tif
