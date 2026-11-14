// NASA POWER (https://power.larc.nasa.gov) — климат точки по месячным данным, запрос прямо из браузера (CORS открыт).
export type Climate = {
  period: string;
  summerT: number;  // средняя температура июня–августа, °C (последние 10 лет)
  julTmax: number;  // средний максимум июля, °C
  gsP: number;      // осадки апреля–сентября, мм
  yrP: number;      // осадки за год, мм
  tTrend: number;   // тренд годовой температуры, °C за 10 лет
  pTrend: number;   // тренд годовых осадков, % за 10 лет
  dryYears: number; // засушливых сезонов из последних 10
  series: { y: number; T: number; P: number }[];
};

const cache = new Map<string, Promise<Climate>>();
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function getClimate(lat: number, lon: number): Promise<Climate> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!cache.has(key)) {
    const p = load(lat, lon);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

async function load(lat: number, lon: number): Promise<Climate> {
  const y1 = 2001, y2 = new Date().getFullYear() - 2;
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_MAX,PRECTOTCORR&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${y1}&end=${y2}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER ответил ${res.status}`);
  const p = (await res.json()).properties.parameter as Record<string, Record<string, number>>;
  const rows: { y: number; T: number; summerT: number; julTmax: number; gsP: number; yrP: number }[] = [];
  for (let y = y1; y <= y2; y++) {
    const g = (k: string, m: number) => p[k][`${y}${String(m).padStart(2, "0")}`];
    if (g("T2M", 1) == null || g("T2M", 1) < -900) continue;
    let gsP = 0, yrP = 0;
    for (let m = 1; m <= 12; m++) { const mm = g("PRECTOTCORR", m) * DAYS[m - 1]; yrP += mm; if (m >= 4 && m <= 9) gsP += mm; }
    rows.push({ y, T: p.T2M[`${y}13`], summerT: (g("T2M", 6) + g("T2M", 7) + g("T2M", 8)) / 3, julTmax: g("T2M_MAX", 7), gsP, yrP });
  }
  const last = rows.slice(-10);
  const mean = <K extends keyof (typeof rows)[0]>(a: typeof rows, k: K) => a.reduce((s, r) => s + (r[k] as number), 0) / a.length;
  const slope = (k: "T" | "yrP") => {
    const xm = mean(rows, "y"), ym = mean(rows, k);
    let a = 0, b = 0;
    rows.forEach((r) => { a += (r.y - xm) * (r[k] - ym); b += (r.y - xm) ** 2; });
    return (a / b) * 10;
  };
  const gsMean = mean(rows, "gsP");
  return {
    period: `${y1}–${y2}`,
    summerT: mean(last, "summerT"), julTmax: mean(last, "julTmax"),
    gsP: mean(last, "gsP"), yrP: mean(last, "yrP"),
    tTrend: slope("T"), pTrend: (slope("yrP") / mean(rows, "yrP")) * 100,
    dryYears: last.filter((r) => r.gsP < 0.7 * gsMean).length,
    series: rows.map((r) => ({ y: r.y, T: r.T, P: r.yrP })),
  };
}
