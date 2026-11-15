"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed, Mountain } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { FieldSheet } from "@/components/field-sheet";
import { Drawer } from "@/components/motion/drawer";
import { AnimatedToastStack, useAnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { FieldPanel } from "@/components/field-panel";
import type { FieldMapHandle } from "@/components/field-map";
import type { Field } from "@/lib/engine";
import { currentPosition, getField } from "@/lib/geo";

// WebGL-карта только на клиенте
const FieldMap = dynamic(() => import("@/components/field-map").then((m) => m.FieldMap), { ssr: false });

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setD(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

export function AppShell() {
  const mapRef = useRef<FieldMapHandle>(null);
  const [field, setField] = useState<Field | null>(null);
  const [open, setOpen] = useState(false);
  const [lhasa, setLhasa] = useState(true);
  const desktop = useIsDesktop();
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ limit: 3 });

  // нажатие на поле → панель с историей и характеристиками
  const onFieldClick = useCallback(async (id: number) => {
    const f = await getField(id);
    if (!f) return;
    setField(f); setOpen(true);
    mapRef.current?.select(f.id);
  }, []);

  // «Я здесь»: только показать моё положение на карте, без поиска поля
  const onLocate = useCallback(async () => {
    try {
      const pos = await currentPosition();
      mapRef.current?.showMe(pos.lon, pos.lat);
    } catch (e) {
      showToast({ title: "Геолокация недоступна", description: (e as Error).message, status: "error" });
    }
  }, [showToast]);

  const toggleLhasa = useCallback(() => {
    const next = !lhasa;
    setLhasa(next);
    mapRef.current?.setLhasa(next);
  }, [lhasa]);

  const content = field && <FieldPanel key={field.id} field={field} />;

  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-900">
      <FieldMap ref={mapRef} onFieldClick={onFieldClick} />

      {/* легенда NASA LHASA */}
      {lhasa && (
        <div className="pointer-events-none absolute bottom-0 left-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="max-w-[calc(100vw-6.5rem)] rounded-2xl bg-background/90 px-3 py-2 text-[11px] shadow-lg backdrop-blur">
            <div className="mb-1 font-semibold">Риск селей и оползней · NASA LHASA</div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {[["#ffeb3b", "низкий"], ["#ff9800", "средний"], ["#e53935", "высокий"], ["#880e4f", "очень высокий"]].map(([c, t]) => (
                <span key={t} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: c }} />{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 right-0 flex flex-col gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Button variant="secondary" size="lg" aria-label={lhasa ? "Скрыть слой NASA LHASA" : "Показать слой NASA LHASA"} aria-pressed={lhasa} onClick={toggleLhasa}
          className={`size-14 rounded-full p-0 shadow-xl ${lhasa ? "!bg-rose-600 !text-white" : ""}`}>
          <Mountain className="size-6" />
        </Button>
        <Button variant="secondary" size="lg" aria-label="Моё местоположение" onClick={onLocate} className="size-14 rounded-full p-0 shadow-xl">
          <LocateFixed className="size-6" />
        </Button>
      </div>

      {desktop ? (
        <Drawer open={open} onOpenChange={setOpen} side="right" ariaLabel="Поле" className="w-[440px] max-w-full overflow-y-auto p-5"
          modal={false}>
          <h2 className="mb-3 text-lg font-semibold">Поле</h2>
          {content}
        </Drawer>
      ) : (
        <FieldSheet open={open} onOpenChange={setOpen} title={field?.id ? `Поле #${field.id}` : "Поле"}>
          {content}
        </FieldSheet>
      )}

      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="top-center" fixed />
    </main>
  );
}
