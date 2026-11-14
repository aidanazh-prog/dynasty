# Dynasty

Карта полей Кыргызстана с историей культур и характеристиками поля по данным **AgroMap** и **NASA**
(NASA Space Apps Challenge, задача *Field Shift: Adapting Farms with NASA Data*).

- Next.js 16, React 19, Tailwind 4, компоненты [beUI](https://beui.dev)
- MapLibre GL (WebGL) + PMTiles: ~108 тыс. полей
- Нажатие на поле → история культур, площадь, район, почва, расстояние до канала,
  риск селей **NASA LHASA**, влажность почвы **NASA SMAP L4** (корневая зона и поверхность, ряд за 24 мес.)

## Источники данных
| Данные | Источник |
|---|---|
| Поля, культуры по годам, почвы, каналы, районы | AgroMap (agromap.gov.kg), открытый GeoServer WFS |
| Риск оползней и селей | NASA LHASA, глобальная карта восприимчивости (~1 км) |
| Влажность почвы | NASA SMAP L4 SPL4SMGP v008 (NSIDC), CMR + OPeNDAP; запасной путь — NASA GIBS |
| Подложка | Esri World Imagery |

## Запуск
```bash
npm install                 # postinstall копирует воркер MapLibre в public/maplibre
npm run build && npm start  # http://localhost:3000
```

### Данные (не хранятся в git)
`public/data/` (тайлы полей, паспорта полей, сетка LHASA) генерируется скриптами из родительской папки проекта:
`download_agromap.py` → `build_fields.py` → `build_web_data.py`.

### Earthdata токен
Уже прописан в `src/app/api/smap/route.ts` (истекает ~13.01.2027). Новый: https://urs.earthdata.nasa.gov → Profile → Generate Token —
замените строку в коде или задайте переменную окружения `EARTHDATA_TOKEN`.
Если токен не сработает, влажность берётся приблизительно из NASA GIBS.
