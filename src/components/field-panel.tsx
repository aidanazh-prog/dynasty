"use client";

// Панель поля: история культур + характеристики (AgroMap, NASA LHASA, NASA SMAP). Без рекомендаций.
import { useEffect, useState } from "react";
import { Droplets, Layers, MapPin, Mountain, Ruler, Sprout, Waves } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/motion/card";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Loader } from "@/components/motion/loader";
import { Sparkline } from "@/components/charts/sparkline";
import { CROP_COLORS } from "@/lib/crops";
import type { Field } from "@/lib/engine";
import { LHASA_LABEL } from "@/lib/geo";
import { getSmap, moistureLabel, type SmapSeries } from "@/lib/smap";

export function FieldPanel({ field }: { field: Field }) {
  return (
    <div className="flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <History field={field} />
      <Characteristics field={field} />
      <SoilMoisture lat={field.lat} lon={field.lon} />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Поле и история: AgroMap · риск селей: NASA LHASA · влажность почвы: NASA SMAP L4 (SPL4SMGP, ячейка 9 км).
      </p>
    </div>
  );
}

function History({ field }: { field: Field }) {
  const items = (field.history || "").split(";").filter(Boolean).map((s) => { const [y, c] = s.split(":"); return { y: +y, c }; });
  // непрерывная шкала лет: пропущенные годы показываем как «нет данных»
  const years = items.length ? Array.from({ length: items[items.length - 1].y - items[0].y + 1 }, (_, i) => items[0].y + i) : [];
  const byYear = new Map(items.map((i) => [i.y, i.c]));
  return (
    <Card size="compact">
      <CardHeader>
        <CardTitle as="h3">{field.id ? `История поля #${field.id}` : "История поля"}</CardTitle>
        <CardDescription>Культуры по годам · AgroMap</CardDescription>
      </CardHeader>
      <CardContent>
        {!years.length ? (
          <p className="text-sm text-muted-foreground">Для этого места история культур неизвестна.</p>
        ) : (
          <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
            {years.map((y) => {
              const c = byYear.get(y);
              return (
                <li key={y} className="relative">
                  <span className="absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-background" style={{ background: c ? CROP_COLORS[c] ?? CROP_COLORS["Другое"] : "var(--border)" }} />
                  <div className="flex items-baseline gap-2">
                    <span className="w-10 text-xs font-semibold tabular-nums text-muted-foreground">{y}</span>
                    <span className={c ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{c ?? "нет данных"}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Characteristics({ field }: { field: Field }) {
  const rows: [React.ReactNode, string, React.ReactNode][] = [
    [<Ruler key="a" className="size-4" />, "Площадь", field.area ? `${field.area.toFixed(1)} га` : "—"],
    [<MapPin key="r" className="size-4" />, "Район", [field.region && `${field.region} обл.`, field.district && `${field.district} р-н`].filter(Boolean).join(", ") || "—"],
    [<Layers key="s" className="size-4" />, "Почва", field.soil || "—"],
    [<Waves key="c" className="size-4" />, "До канала", field.canal >= 5000 ? "> 5 км" : `${Math.round(field.canal).toLocaleString("ru")} м`],
    [<Mountain key="l" className="size-4" />, "Риск селей и оползней",
      <AnimatedBadge key="lv" size="sm" status={field.lhasa >= 4 ? "danger" : field.lhasa === 3 ? "warning" : "neutral"} showIcon={false}>
        {LHASA_LABEL[field.lhasa] ?? "—"} · NASA LHASA
      </AnimatedBadge>],
  ];
  return (
    <Card size="compact" variant="muted">
      <CardHeader>
        <CardTitle as="h3">Характеристики</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col divide-y divide-border">
          {rows.map(([icon, label, value]) => (
            <div key={label} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
              <span className="mt-0.5 text-muted-foreground">{icon}</span>
              <dt className="w-28 shrink-0 text-xs text-muted-foreground">{label}</dt>
              <dd className="min-w-0 flex-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function SoilMoisture({ lat, lon }: { lat: number; lon: number }) {
  const [d, setD] = useState<SmapSeries | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getSmap(lat, lon).then((x) => live && setD(x)).catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [lat, lon]);

  const root = d?.latest?.root ?? null, surf = d?.latest?.surface ?? null;
  const lab = root != null ? moistureLabel(root) : null;
  const anomaly = root != null && d?.sameMonthMean ? ((root - d.sameMonthMean) / d.sameMonthMean) * 100 : null;
  const pct = (v: number) => `${(v * 100).toLocaleString("ru", { maximumFractionDigits: 1 })}%`;

  return (
    <Card size="compact">
      <CardHeader>
        <CardTitle as="h3">Влажность почвы</CardTitle>
        <CardDescription>
          NASA SMAP L4{d?.latest ? ` · на ${new Date(d.latest.date).toLocaleDateString("ru")}` : ""}
          {d?.source === "gibs" ? " · приблизительно (GIBS)" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!d && !err && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader variant="dots" size={18} /> Загружаю данные спутника SMAP…</div>}
        {err && <div className="text-sm text-destructive">Не удалось загрузить SMAP: {err}</div>}
        {d && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Sprout className="size-3.5" />Корневая зона 0–100 см</div>
                <div className="text-xl font-semibold">{root != null ? <AnimatedNumber value={root * 100} startOnView={false} format={(n) => `${n.toFixed(1)}%`} /> : "—"}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {lab && <AnimatedBadge size="sm" status={lab.status} showIcon={false}>{lab.text}</AnimatedBadge>}
                  {anomaly != null && (
                    <AnimatedBadge size="sm" status={anomaly < -15 ? "warning" : anomaly > 15 ? "info" : "neutral"} showIcon={false}>
                      {anomaly >= 0 ? "+" : ""}{anomaly.toFixed(0)}% к прошлым годам
                    </AnimatedBadge>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-muted p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Droplets className="size-3.5" />Поверхность 0–5 см</div>
                <div className="text-xl font-semibold">{surf != null ? <AnimatedNumber value={surf * 100} startOnView={false} format={(n) => `${n.toFixed(1)}%`} /> : "—"}</div>
              </div>
            </div>
            {d.months.some((m) => m.root != null) && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Корневая зона по месяцам, последние {d.months.length} мес.</div>
                <Sparkline
                  label="Влажность корневой зоны"
                  data={d.months.map((m) => (m.root != null ? +(m.root * 100).toFixed(1) : null))}
                  labels={d.months.map((m) => new Date(m.date).toLocaleDateString("ru", { month: "short", year: "2-digit" }))}
                  variant="area"
                  color="#0284c7"
                  height={64}
                  interactive
                  formatValue={(v) => `${v.toFixed(1)}%`}
                />
              </div>
            )}
            <p className="text-[11px] leading-snug text-muted-foreground">
              Объёмная влажность (м³ воды на м³ почвы) в ячейке ~9 км вокруг поля{d.cell?.lat != null ? ` (центр ${d.cell.lat.toFixed(3)}, ${d.cell.lon?.toFixed(3)})` : ""}.
              Ориентир: ниже {pct(0.1)} — очень сухо, {pct(0.18)}–{pct(0.3)} — норма для большинства культур.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
