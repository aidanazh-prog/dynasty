// NASA SMAP L4 (SPL4SMGP v008, NSIDC) — точные значения влажности почвы в ячейке 9 км под полем.
// Гранулы ищем в открытом CMR, значения вырезаем через облачный OPeNDAP NASA с токеном Earthdata
// (токен ниже — используется только на сервере, в браузер не попадает). Без кеша: каждый запрос идёт в NASA.
import type { NextRequest } from "next/server";

// Earthdata Login токен (NASA). Можно переопределить переменной окружения EARTHDATA_TOKEN. Истекает ~13.01.2027.
const EARTHDATA_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJvcmlnaW4iOiJFYXJ0aGRhdGEgTG9naW4iLCJzaWciOiJlZGxqd3RwdWJrZXlfb3BzIiwiYWxnIjoiUlMyNTYifQ.eyJ0eXBlIjoiVXNlciIsInVpZCI6ImRhbmNoaWsxIiwic3ViIjoiZGFuY2hpazEiLCJleHAiOjE3OTk4MzIyMzQsImlhdCI6MTc5NDY0ODIzNCwiaXNzIjoiaHR0cHM6Ly91cnMuZWFydGhkYXRhLm5hc2EuZ292IiwiaWRlbnRpdHlfcHJvdmlkZXIiOiJlZGxfb3BzIiwiYWNyIjoiZWRsIiwiYXNzdXJhbmNlX2xldmVsIjozfQ.3GILhYjuVgOPTBjWDE2t0zDL1Ak_n0wHNyFTyfc_6x6CCEae-olJ1MIiCUKdc391-1qldWTxk-bdGTHPd1v0sEAvQeD032KoXZz2WWUSbDAW1iuZBOjHWIjy71Pj4-kFrp-9rIxmhWXwIHsD0VdT6XXQEAgIc5wLT52AjU0VzsQfHwGIsXb09Vkk5ejgjX7QgWywRqwHi8pZ_bfJ6INRZkN12RS94n2unNvfDGEnnlEAUyt0NWAKTZJbpJIj6fCCM6A-QH9P-UxhVg2xK--LA1noEtdwi0qjnkXUJ6Dn0DWqUKQQuG-XbqBomaV9_75NVktmeul729rTpeADx0Q0oA";

const COLLECTION = "C3480440870-NSIDC_CPRD";
const CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json";
const MONTHS = 24;

type Sample = { date: string; root: number | null; surface: number | null };
export type SmapResponse = {
  source: "opendap";
  cell: { row: number; col: number; lat: number | null; lon: number | null };
  latest: Sample | null;
  months: Sample[];
};

// EASE-Grid 2.0 Global, 9 км (EPSG:6933) — сетка SMAP L4
function easeCell(lat: number, lon: number) {
  const a = 6378137.0, e2 = 0.0066943799901413165, e = Math.sqrt(e2), ps = (30 * Math.PI) / 180;
  const k0 = Math.cos(ps) / Math.sqrt(1 - e2 * Math.sin(ps) ** 2);
  const s = Math.sin((lat * Math.PI) / 180);
  const q = (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)));
  const x = a * k0 * ((lon * Math.PI) / 180), y = (a * q) / (2 * k0);
  const cell = 9008.055210146, x0 = -17367530.44516138, y0 = 7314540.83011823;
  return { row: Math.floor((y0 - y) / cell), col: Math.floor((x - x0) / cell) };
}

async function granuleFor(fromIso: string, toIso: string, latestFirst = false): Promise<{ id: string; date: string } | null> {
  const url = `${CMR}?collection_concept_id=${COLLECTION}&temporal=${fromIso},${toIso}&page_size=1${latestFirst ? "&sort_key=-start_date" : ""}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const item = (await r.json()).items?.[0]?.umm;
  if (!item) return null;
  const od = (item.RelatedUrls as { URL: string; Subtype?: string }[]).find((u) => u.Subtype === "OPENDAP DATA")?.URL;
  const date = item.TemporalExtent?.RangeDateTime?.BeginningDateTime?.slice(0, 10) ?? fromIso.slice(0, 10);
  return od ? { id: od, date } : null;
}

async function readCell(opendap: string, row: number, col: number, token: string) {
  const v = (name: string) => `${encodeURIComponent(name)}%5B${row}%5D%5B${col}%5D`;
  const url = `${opendap}.ascii?${[v("/Geophysical_Data/sm_rootzone"), v("/Geophysical_Data/sm_surface"), v("cell_lat"), v("cell_lon")].join(",")}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "follow" });
  if (!r.ok) throw new Error(`OPeNDAP ${r.status}`);
  const txt = await r.text();
  const num = (key: string) => {
    const m = txt.match(new RegExp(`${key.replace(/[/[\]]/g, "\\$&")}\\[0\\],\\s*([-\\d.eE]+)`));
    const n = m ? parseFloat(m[1]) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null; // -9999 = нет данных
  };
  const coord = (key: string) => { const m = txt.match(new RegExp(`${key}\\[0\\],\\s*([-\\d.]+)`)); return m ? parseFloat(m[1]) : null; };
  return { root: num("/Geophysical_Data/sm_rootzone"), surface: num("/Geophysical_Data/sm_surface"), lat: coord("cell_lat"), lon: coord("cell_lon") };
}

async function pool<T>(tasks: (() => Promise<T>)[], n = 6) {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

async function load(row: number, col: number, token: string): Promise<SmapResponse> {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  const ago = (days: number) => new Date(now.getTime() - days * 864e5);

  let cellLat: number | null = null, cellLon: number | null = null;
  const sample = async (g: { id: string; date: string } | null): Promise<Sample | null> => {
    if (!g) return null;
    try {
      const c = await readCell(g.id, row, col, token);
      if (cellLat == null && c.lat != null) { cellLat = c.lat; cellLon = c.lon; }
      return { date: g.date, root: c.root, surface: c.surface };
    } catch { return null; }
  };

  const latestP = granuleFor(iso(ago(30)), iso(now), true).then(sample);
  const monthDates = Array.from({ length: MONTHS }, (_, k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - k), 15)));
  const monthsP = pool(monthDates.map((d) => async () => {
    const from = iso(d), to = iso(new Date(d.getTime() + 3 * 3600e3));
    return (await sample(await granuleFor(from, to))) ?? { date: d.toISOString().slice(0, 10), root: null, surface: null };
  }));
  const [latest, months] = await Promise.all([latestP, monthsP]);
  return { source: "opendap", cell: { row, col, lat: cellLat, lon: cellLon }, latest, months };
}

export async function GET(request: NextRequest) {
  const token = process.env.EARTHDATA_TOKEN || EARTHDATA_TOKEN;
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
    return Response.json({ error: "Нужны lat и lon" }, { status: 400 });
  }
  const { row, col } = easeCell(lat, lon);
  try {
    const data = await load(row, col, token);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message) }, { status: 502 });
  }
}
