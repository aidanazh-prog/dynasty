// Паспорта полей (корзины по id % 256), сетка NASA LHASA, геолокация.
import type { Field } from "./engine";

type Passport = { h: string; a: number; lon: number; lat: number; s: string; r: string; d: string; k: number; l: number };
const buckets = new Map<number, Promise<Record<string, Passport>>>();

export async function getField(id: number): Promise<Field | null> {
  const b = id % 256;
  if (!buckets.has(b)) buckets.set(b, fetch(`/data/fields/${b}.json`).then((r) => r.json()));
  const p = (await buckets.get(b)!)[id];
  if (!p) return null;
  return { id, history: p.h, area: p.a, lon: p.lon, lat: p.lat, soil: p.s, region: p.r, district: p.d, canal: p.k, lhasa: p.l };
}

let lhasa: Promise<{ g: Uint8Array; w: number; h: number; west: number; north: number; res: number }> | null = null;
export async function lhasaAt(lon: number, lat: number) {
  lhasa ??= Promise.all([
    fetch("/data/lhasa.json").then((r) => r.json()),
    fetch("/data/lhasa_grid.bin").then((r) => r.arrayBuffer()),
  ]).then(([m, buf]) => ({ g: new Uint8Array(buf), ...m.grid }));
  const L = await lhasa;
  const c = Math.floor((lon - L.west) / L.res), r = Math.floor((L.north - lat) / L.res);
  return c < 0 || r < 0 || c >= L.w || r >= L.h ? 0 : L.g[r * L.w + c];
}

export const LHASA_LABEL = ["нет данных", "очень низкий", "низкий", "средний", "высокий", "очень высокий"];

export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((ok, fail) => {
    if (!navigator.geolocation || !window.isSecureContext) return fail(new Error("Геолокация недоступна (нужен HTTPS)"));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => fail(new Error(e.message || "Нет доступа к геолокации")),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  });
}
