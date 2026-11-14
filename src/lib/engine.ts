// Движок сценариев севооборота: перебор допустимых планов на HORIZON сезонов и оценка
// по доходу, поливу и здоровью почвы с весами приоритетов фермера.
import { CROPS, CROP_ALIAS } from "./crops";
import type { Climate } from "./power";

export const HORIZON = 4;
export type Weights = { income: number; water: number; soil: number };
export type Field = {
  id: number | null;
  history: string;   // "2023:Пшеница;2024:Ячмень"
  area: number;
  lon: number; lat: number;
  soil: string; region: string; district: string;
  canal: number;     // м до канала
  lhasa: number;     // 0..5
  approx?: string;   // пометка, если данные взяты с ближайшего поля
};
export type Water = { irr: number; eff: number; avail: number; cls: string };
export type Scenario = {
  seq: string[]; income: number; irrigation: number; soil: number;
  n: { income: number; water: number; soil: number }; score: number; why: string[];
};
export type Plan = {
  start: number; hist: { y: number; c: string }[]; water: Water; allowed: string[];
  excluded: [string, string][]; top: Scenario[]; baseline: Scenario | null;
};

const canon = (c: string) => (c in CROP_ALIAS ? CROP_ALIAS[c] : CROPS[c] ? c : null);

export function startYear(d = new Date()) {
  return d.getFullYear() + (d.getMonth() >= 8 ? 1 : 0);
}

export function waterOf(f: Field, c: Climate): Water {
  const irr = f.canal < 300 ? 650 : f.canal < 1500 ? 300 : 0;
  const cls = f.canal < 300 ? "Орошаемое — канал рядом" : f.canal < 1500 ? "Ограниченный полив" : "Богара — канала рядом нет";
  const eff = c.gsP * 0.7 + Math.max(0, c.yrP - c.gsP) * 0.5; // летние осадки + запас влаги осени–весны
  return { irr, eff, avail: eff + irr, cls };
}

type Ctx = { hist: { y: number; c: string }[]; w: Water; lhasa: number; allowed: string[]; start: number };

function evaluate(seq: string[], ctx: Ctx) {
  const { hist, w, lhasa, start } = ctx;
  const tl = [...hist, ...seq.map((c, i) => ({ y: start + i, c }))];
  let income = 0, irrigation = 0, soil = 0;
  const fams = new Set<string>();
  seq.forEach((name, i) => {
    const k = CROPS[name], idx = hist.length + i;
    const prev = tl[idx - 1] && CROPS[tl[idx - 1].c] ? tl[idx - 1].c : null;
    const pk = prev ? CROPS[prev] : null;
    const sameFam = !!pk && pk.family === k.family && !(k.perennial && prev === name);
    let f = 1 - (Math.max(0, k.water - w.avail) / k.water) * (1 - k.drought);
    if (pk?.legume && !k.legume) f *= 1.1;
    if (sameFam) f *= 0.88;
    if (k.perennial && prev !== name) f *= 0.5;
    income += k.yield * 1000 * f * k.price - k.cost;
    irrigation += Math.max(0, Math.min(k.water, w.avail) - w.eff);
    let s = k.soil;
    if (pk?.legume && !k.legume) s += 1;
    if (sameFam) s -= 2;
    if (lhasa >= 4) s += k.row ? -2 : k.perennial ? 1 : 0;
    soil += s;
    fams.add(k.family);
  });
  soil += fams.size - 1;
  return { seq, income, irrigation: irrigation * 10, soil };
}

function generate(ctx: Ctx) {
  const { allowed, hist, start } = ctx, out: string[][] = [];
  const last0: Record<string, number> = {};
  hist.forEach((h) => { if (CROPS[h.c]) last0[h.c] = h.y; });
  const rec = (seq: string[], last: Record<string, number>) => {
    const i = seq.length;
    if (i === HORIZON) { out.push([...seq]); return; }
    const prev = i ? seq[i - 1] : hist.length ? hist[hist.length - 1].c : null;
    if (prev && CROPS[prev]?.perennial) {
      let run = 0;
      for (let j = i - 1; j >= 0 && seq[j] === prev; j--) run++;
      if (run === i) for (let j = hist.length - 1; j >= 0 && hist[j].c === prev; j--) run++;
      if (run > 0 && run < 3 && allowed.includes(prev)) { rec([...seq, prev], { ...last, [prev]: start + i }); return; }
    }
    for (const c of allowed) {
      const k = CROPS[c], y = start + i;
      if (last[c] != null && c !== prev && y - last[c] < k.gap) continue;
      if (c === prev && (k.perennial || k.gap > 1)) continue;
      if (prev && CROPS[prev] && c !== prev && CROPS[prev].family === k.family && k.family !== "злаковые") continue;
      rec([...seq, c], { ...last, [c]: y });
    }
  };
  rec([], last0);
  return out;
}

function explain(r: { seq: string[] }, ctx: Ctx, c: Climate) {
  const out: string[] = [], { hist, w, lhasa } = ctx, ks = r.seq.map((s) => CROPS[s]);
  let cereal = 0;
  for (let j = hist.length - 1; j >= 0 && CROPS[hist[j].c]?.family === "злаковые"; j--) cereal++;
  if (cereal >= 2 && ks[0].family !== "злаковые") out.push(`После ${cereal} лет злаковых подряд смена культуры разрывает цикл болезней и вредителей`);
  const leg = [...new Set(r.seq.filter((s) => CROPS[s].legume))];
  if (leg.length) out.push(`Бобовые (${leg.join(", ")}) фиксируют азот — следующая культура даёт ~+10% урожая без лишних удобрений`);
  if (ks.some((k) => k.perennial)) out.push("Многолетние травы 3 года без вспашки: растёт органика, почву меньше смывает и выдувает");
  if (lhasa >= 4) out.push(ks.some((k) => k.row)
    ? "⚠️ Высокий риск селей/эрозии (NASA LHASA), а в плане есть пропашные — нужны противоэрозионные меры"
    : "Высокий риск селей/эрозии (NASA LHASA): пропашных нет, почва всё время покрыта");
  if (w.irr === 0) out.push(`Богара: только осадки (~${Math.round(c.gsP)} мм за апрель–сентябрь, NASA POWER) — выбраны засухоустойчивые культуры`);
  const thirsty = [...new Set(r.seq.filter((s) => CROPS[s].water > w.avail))];
  if (thirsty.length) out.push(`Воды для «${thirsty.join(", ")}» впритык — в сухой год урожай упадёт`);
  return out;
}

export function plan(f: Field, c: Climate, weights: Weights): Plan {
  const start = startYear();
  const hist = (f.history || "").split(";").filter(Boolean).map((s) => {
    const [y, cr] = s.split(":"); return { y: +y, c: canon(cr) || cr };
  });
  const w = waterOf(f, c);
  const excluded: [string, string][] = [];
  const allowed = Object.keys(CROPS).filter((name) => {
    const k = CROPS[name];
    if (k.tsum > c.summerT + 0.5) { excluded.push([name, `холодно: нужно лето ≥${k.tsum}°C, здесь ${c.summerT.toFixed(1)}°C`]); return false; }
    if ((k.water - w.avail) / k.water > 0.5) { excluded.push([name, `не хватит воды: нужно ${k.water} мм, доступно ~${Math.round(w.avail)} мм`]); return false; }
    return true;
  });
  const ctx: Ctx = { hist, w, lhasa: f.lhasa, allowed, start };
  const all = generate(ctx).map((s) => evaluate(s, ctx));
  if (!all.length) return { start, hist, water: w, allowed, excluded, top: [], baseline: null };

  const rng = (k: "income" | "irrigation" | "soil") => { const v = all.map((r) => r[k]); return [Math.min(...v), Math.max(...v)] as const; };
  const R = { income: rng("income"), irrigation: rng("irrigation"), soil: rng("soil") };
  const nz = (v: number, [a, b]: readonly [number, number], inv = false) => (b === a ? 1 : Math.max(0, Math.min(1, inv ? (b - v) / (b - a) : (v - a) / (b - a))));
  const W = weights.income + weights.water + weights.soil || 1;
  const scored: Scenario[] = all.map((r) => {
    const n = { income: nz(r.income, R.income), water: nz(r.irrigation, R.irrigation, true), soil: nz(r.soil, R.soil) };
    return { ...r, n, score: (weights.income * n.income + weights.water * n.water + weights.soil * n.soil) / W, why: [] };
  }).sort((a, b) => b.score - a.score);

  const top: Scenario[] = [];
  for (const r of scored) {
    if (top.every((t) => t.seq.filter((c2, i) => c2 !== r.seq[i]).length >= 2)) top.push(r);
    if (top.length === 3) break;
  }
  top.forEach((t) => (t.why = explain(t, ctx, c)));

  const lastC = hist.length ? hist[hist.length - 1].c : null;
  let baseline: Scenario | null = null;
  if (lastC && CROPS[lastC]) {
    const b = evaluate(Array(HORIZON).fill(lastC), ctx);
    const n = { income: nz(b.income, R.income), water: nz(b.irrigation, R.irrigation, true), soil: nz(b.soil, R.soil) };
    baseline = { ...b, n, score: (weights.income * n.income + weights.water * n.water + weights.soil * n.soil) / W, why: [] };
  }
  return { start, hist, water: w, allowed, excluded, top, baseline };
}
