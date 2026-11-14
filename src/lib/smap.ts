// NASA SMAP L4 — влажность почвы (м³/м³) через открытый сервис NASA GIBS, без логина.
// GIBS отдаёт картинку, поэтому берём центральный пиксель (сетка SMAP L4 ≈ 9 км)
// и переводим цвет обратно в значение по официальной цветовой шкале NASA.
export const SMAP_LAYERS = {
  root: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",   // корневая зона, 0–100 см
  surface: "SMAP_L4_Analyzed_Surface_Soil_Moisture",  // поверхность, 0–5 см
} as const;
type LayerKey = keyof typeof SMAP_LAYERS;

const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const COLORMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Analyzed_Soil_Moisture.xml";

let cmap: Promise<Map<string, number>> | null = null;
function colormap() {
  cmap ??= fetch(COLORMAP).then((r) => r.text()).then((xml) => {
    const m = new Map<string, number>();
    const re = /rgb="(\d+),(\d+),(\d+)"[^>]*?value="\[([-\d.]+),([-\d.+INF]+)\)"/g;
    for (const x of xml.matchAll(re)) {
      const lo = parseFloat(x[4]), hi = x[5].includes("INF") ? lo : parseFloat(x[5]);
      if (lo < 0) continue; // nodata
      m.set(`${x[1]},${x[2]},${x[3]}`, (lo + hi) / 2);
    }
    return m;
  });
  return cmap;
}

function nearest(m: Map<string, number>, r: number, g: number, b: number) {
  const exact = m.get(`${r},${g},${b}`);
  if (exact != null) return exact;
  let best = Infinity, val = NaN;
  for (const [k, v] of m) {
    const [R, G, B] = k.split(",").map(Number);
    const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2;
    if (d < best) { best = d; val = v; }
  }
  return best < 300 ? val : NaN;
}

/** Значение SMAP (м³/м³) в точке на дату YYYY-MM-DD или null, если снимка нет. */
export async function smapAt(layer: LayerKey, lat: number, lon: number, date: string): Promise<number | null> {
  const d = 0.12, N = 5;
  const url = `${WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${SMAP_LAYERS[layer]}&CRS=EPSG:4326` +
    `&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=${N}&HEIGHT=${N}&FORMAT=image/png&TIME=${date}`;
  const [m, res] = await Promise.all([colormap(), fetch(url)]);
  if (!res.ok || !res.headers.get("content-type")?.includes("image")) return null;
  const bmp = await createImageBitmap(await res.blob());
  const cv = new OffscreenCanvas(N, N);
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(Math.floor(N / 2), Math.floor(N / 2), 1, 1).data;
  if (px[3] < 128) return null;
  const v = nearest(m, px[0], px[1], px[2]);
  return Number.isFinite(v) ? v : null;
}

export type SmapSample = { date: string; root: number | null; surface: number | null };
export type SmapSeries = {
  source: "opendap" | "gibs";        // точные значения (OPeNDAP, токен) или восстановленные по цвету (GIBS)
  cell?: { lat: number | null; lon: number | null };
  latest: SmapSample | null;
  months: SmapSample[];              // 15-е число каждого месяца
  sameMonthMean: number | null;      // средняя влажность корней в этом месяце в прошлые годы
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
async function pool<T>(tasks: (() => Promise<T>)[], n = 6) {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

function withMean(s: Omit<SmapSeries, "sameMonthMean">): SmapSeries {
  const ref = s.latest ? new Date(s.latest.date) : new Date();
  const same = s.months.filter((m) => new Date(m.date).getUTCMonth() === ref.getUTCMonth() && m.root != null && m.date !== s.latest?.date).map((m) => m.root!);
  return { ...s, sameMonthMean: same.length ? same.reduce((a, b) => a + b, 0) / same.length : null };
}

const cache = new Map<string, Promise<SmapSeries>>();
export function getSmap(lat: number, lon: number): Promise<SmapSeries> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!cache.has(key)) {
    const p = loadExact(lat, lon).catch(() => loadGibs(lat, lon));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

// точные значения через серверный маршрут (Earthdata токен + OPeNDAP)
async function loadExact(lat: number, lon: number): Promise<SmapSeries> {
  const r = await fetch(`/api/smap?lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error(`api/smap ${r.status}`);
  const d = await r.json();
  if (!d.latest && !d.months?.some((m: SmapSample) => m.root != null)) throw new Error("пусто");
  return withMean({ source: "opendap", cell: d.cell, latest: d.latest, months: d.months });
}

// запасной путь без токена: картинки GIBS → значения по цветовой шкале
async function loadGibs(lat: number, lon: number): Promise<SmapSeries> {
  const today = new Date();
  let latest: SmapSample | null = null;
  for (let back = 3; back <= 40 && !latest; back += 3) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - back);
    const root = await smapAt("root", lat, lon, iso(d)).catch(() => null);
    if (root != null) latest = { date: iso(d), root, surface: await smapAt("surface", lat, lon, iso(d)).catch(() => null) };
  }
  const dates: Date[] = [];
  for (let k = 24; k >= 1; k--) dates.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - k, 15)));
  const vals = await pool(dates.map((d) => () => smapAt("root", lat, lon, iso(d)).catch(() => null)));
  return withMean({ source: "gibs", latest, months: dates.map((d, i) => ({ date: iso(d), root: vals[i], surface: null })) });
}

/** Простая агрономическая шкала для корневой зоны (м³/м³). */
export function moistureLabel(v: number) {
  if (v < 0.1) return { text: "очень сухо", status: "danger" as const };
  if (v < 0.18) return { text: "сухо", status: "warning" as const };
  if (v < 0.3) return { text: "норма", status: "success" as const };
  if (v < 0.4) return { text: "влажно", status: "info" as const };
  return { text: "переувлажнено", status: "info" as const };
}
