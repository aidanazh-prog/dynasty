"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudRain, Droplets, Leaf, Scale, Sprout, Thermometer, TrendingUp, Wallet, Mountain, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/motion/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { RangeSlider } from "@/components/motion/range-slider";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Loader } from "@/components/motion/loader";
import { Collapsible, CollapsibleContent, CollapsibleIndicator, CollapsibleTrigger } from "@/components/motion/collapsible";
import { CROPS, CROP_COLORS } from "@/lib/crops";
import { HORIZON, plan, type Field, type Scenario, type Weights } from "@/lib/engine";
import { getClimate, type Climate } from "@/lib/power";
import { LHASA_LABEL } from "@/lib/geo";

export type PhotoCtx = { url?: string; source: string; taken?: string; lat: number; lon: number };

const PRESETS: Record<string, Weights & { label: string; icon: React.ReactNode }> = {
  balance: { income: 1, water: 1, soil: 1, label: "Баланс", icon: <Scale className="size-3.5" /> },
  income: { income: 4, water: 1, soil: 1, label: "Доход", icon: <Wallet className="size-3.5" /> },
  water: { income: 1, water: 4, soil: 1, label: "Вода", icon: <Droplets className="size-3.5" /> },
  soil: { income: 1, water: 1, soil: 4, label: "Почва", icon: <Leaf className="size-3.5" /> },
};
const som = (n: number) => `${Math.round(n).toLocaleString("ru")}`;

export function Advisor({ field, photo }: { field: Field; photo?: PhotoCtx | null }) {
  const [clim, setClim] = useState<Climate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [w, setW] = useState<Weights>({ income: 1, water: 1, soil: 1 });

  useEffect(() => {
    let live = true;
    // Advisor пересоздаётся по key при смене поля, поэтому сбрасывать состояние не нужно
    getClimate(field.lat, field.lon).then((c) => live && setClim(c)).catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [field.lat, field.lon]);

  const res = useMemo(() => (clim ? plan(field, clim, w) : null), [field, clim, w]);
  const preset = Object.entries(PRESETS).find(([, p]) => p.income === w.income && p.water === w.water && p.soil === w.soil)?.[0] ?? "custom";
  const hist = (field.history || "").split(";").filter(Boolean).map((s) => s.split(":"));

  return (
    <div className="flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      {photo && (
        <div className="flex gap-3 rounded-2xl bg-muted p-2.5">
          {photo.url && <img src={photo.url} alt="Фото поля" className="size-20 shrink-0 rounded-xl object-cover" />}
          <div className="min-w-0 text-xs">
            <div className="flex items-center gap-1 font-semibold text-foreground"><MapPin className="size-3.5" />{photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}</div>
            <div className="text-muted-foreground">{photo.source}{photo.taken ? ` · снято ${photo.taken}` : ""}</div>
            {field.approx && <div className="mt-1 text-amber-600">{field.approx}</div>}
          </div>
        </div>
      )}

      {/* Паспорт поля */}
      <Card size="compact" variant="muted">
        <CardHeader>
          <CardTitle as="h3">{field.id ? `Поле #${field.id}` : "Точка без поля в базе"}</CardTitle>
          <CardDescription>
            {[field.region && `${field.region} обл.`, field.district && `${field.district} р-н`, field.area ? `${field.area.toFixed(1)} га` : ""].filter(Boolean).join(" · ") || "Данные по климату и рельефу точки"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {hist.length ? hist.map(([y, c]) => (
              <span key={y} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                <span className="size-2 rounded-full" style={{ background: CROP_COLORS[c] ?? CROP_COLORS["Другое"] }} />
                <b className="font-semibold text-muted-foreground">{y}</b> {c}
              </span>
            )) : <span className="text-xs text-muted-foreground">История культур неизвестна</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <AnimatedBadge size="sm" status={field.canal < 300 ? "success" : field.canal < 1500 ? "info" : "warning"} icon={<Droplets className="size-3" />}>
              Канал {field.canal >= 5000 ? "> 5 км" : `${som(field.canal)} м`}
            </AnimatedBadge>
            <AnimatedBadge size="sm" status={field.lhasa >= 4 ? "danger" : field.lhasa === 3 ? "warning" : "neutral"} icon={<Mountain className="size-3" />}>
              Сели: {LHASA_LABEL[field.lhasa] ?? "—"}
            </AnimatedBadge>
          </div>
          {field.soil && <div className="text-xs text-muted-foreground">Почва: <span className="text-foreground">{field.soil}</span></div>}
        </CardContent>
      </Card>

      {/* Климат NASA POWER */}
      <Card size="compact">
        <CardHeader>
          <CardTitle as="h3">Климат поля</CardTitle>
          <CardDescription>NASA POWER{clim ? ` · ${clim.period}` : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {!clim && !err && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader variant="dots" size={18} /> Загружаю данные NASA…</div>}
          {err && <div className="text-sm text-destructive">{err}</div>}
          {clim && (
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={<Thermometer className="size-4" />} label="Лето, °C" value={clim.summerT} digits={1} />
              <Stat icon={<CloudRain className="size-4" />} label="Осадки апр–сен, мм" value={clim.gsP} />
              <Stat icon={<TrendingUp className="size-4" />} label="Тренд t°, за 10 лет" value={clim.tTrend} digits={2} signed warn={clim.tTrend > 0.3} />
              <Stat icon={<CloudRain className="size-4" />} label="Тренд осадков, %/10 лет" value={clim.pTrend} signed warn={clim.pTrend < -5} />
              <Stat icon={<Sprout className="size-4" />} label="Засушливых сезонов из 10" value={clim.dryYears} warn={clim.dryYears >= 3} />
              {res && <Stat icon={<Droplets className="size-4" />} label="Воды культуре, мм" value={res.water.avail} />}
            </div>
          )}
          {res && <p className="mt-2 text-xs text-muted-foreground">{res.water.cls}: осадки ~{Math.round(res.water.eff)} мм + полив {res.water.irr} мм</p>}
        </CardContent>
      </Card>

      {/* Приоритет */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Что важнее?</div>
        <Tabs value={preset} onValueChange={(v) => { const p = PRESETS[v]; if (p) setW({ income: p.income, water: p.water, soil: p.soil }); }} variant="segment" className="w-full">
          <TabsList className="w-full">
            {Object.entries(PRESETS).map(([k, p]) => <TabsTrigger key={k} value={k} icon={p.icon}>{p.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {([["income", "Доход", <Wallet key="i" className="size-3.5" />], ["water", "Экономия воды", <Droplets key="w" className="size-3.5" />], ["soil", "Здоровье почвы", <Leaf key="s" className="size-3.5" />]] as const).map(([k, label, icon]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="flex w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</span>
            <RangeSlider className="flex-1" min={0} max={5} step={1} value={w[k]} onValueChange={(v) => setW((s) => ({ ...s, [k]: v }))} aria-label={label} />
            <span className="w-3 text-xs tabular-nums">{w[k]}</span>
          </div>
        ))}
      </div>

      {/* Сценарии */}
      {res && !res.top.length && <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Для этих условий нет подходящих культур.</div>}
      {res?.top.map((s, i) => <ScenarioCard key={s.seq.join()} s={s} i={i} start={res.start} />)}
      {res?.baseline && <ScenarioCard s={res.baseline} start={res.start} baseline />}

      {res && res.excluded.length > 0 && (
        <Collapsible className="rounded-xl border border-border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-sm">
            Не подходят этому полю ({res.excluded.length}) <CollapsibleIndicator />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col gap-1 px-3 pb-3 text-xs text-muted-foreground">
              {res.excluded.map(([c, r]) => <li key={c}><b className="text-foreground">{c}</b>: {r}</li>)}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Цены, урожайность и затраты — оценки для прототипа (src/lib/crops.ts). Поле: AgroMap · климат: NASA POWER · риск селей: NASA LHASA.
      </p>
    </div>
  );
}

function Stat({ icon, label, value, digits = 0, signed, warn }: { icon: React.ReactNode; label: string; value: number; digits?: number; signed?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-2.5 ${warn ? "bg-amber-500/10" : "bg-muted"}`}>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-600" : ""}`}>
        <AnimatedNumber value={value} format={(n) => `${signed && n > 0 ? "+" : ""}${n.toLocaleString("ru", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`} />
      </div>
    </div>
  );
}

function ScenarioCard({ s, i, start, baseline }: { s: Scenario; i?: number; start: number; baseline?: boolean }) {
  return (
    <Card size="compact" variant={baseline ? "muted" : "outlined"} className={baseline ? "border-dashed" : ""}>
      <CardHeader>
        <CardTitle as="h3">{baseline ? "Если продолжать как сейчас" : `Вариант ${(i ?? 0) + 1}`}</CardTitle>
        {!baseline && <CardDescription>Соответствие приоритетам: {Math.round(s.score * 100)} / 100</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1.5">
          {s.seq.map((c, j) => (
            <div key={j} className="rounded-xl p-2 text-center" style={{ background: `${CROP_COLORS[c]}33` }}>
              <div className="text-[10px] font-semibold text-muted-foreground">{start + j}</div>
              <div className="text-xs font-medium leading-tight">{c}</div>
              {CROPS[c]?.legume && <div className="text-[10px] text-emerald-600">+ азот</div>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric icon={<Wallet className="size-3.5" />} label={`сом/га за ${HORIZON} г.`} value={s.income} bar={s.n.income} color="#f9a825" />
          <Metric icon={<Droplets className="size-3.5" />} label="м³/га полива" value={s.irrigation} bar={s.n.water} color="#039be5" />
          <Metric icon={<Leaf className="size-3.5" />} label="баланс почвы" value={s.soil} bar={s.n.soil} color="#43a047" signed />
        </div>
        {s.why.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
            {s.why.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, bar, color, signed }: { icon: React.ReactNode; label: string; value: number; bar: number; color: string; signed?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
        {icon}<AnimatedNumber value={value} format={(n) => `${signed && n > 0 ? "+" : ""}${Math.round(n).toLocaleString("ru")}`} />
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(bar * 100)}%`, background: color }} />
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
