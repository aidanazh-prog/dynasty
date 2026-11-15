"use client";

// Шторка поля на vaul (как нативный bottom sheet iOS):
// две точки остановки, перетаскивание за ручку/контент, немодальная — карта под ней кликабельна.
import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

const SNAPS: (number | string)[] = [0.5, 0.94];

export function FieldSheet({ open, onOpenChange, title, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const [snap, setSnap] = useState<number | string | null>(SNAPS[0]);
  // каждое новое открытие — с половины экрана (подстройка состояния при рендере, без эффекта)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSnap(SNAPS[0]);
  }
  const expanded = snap === SNAPS[SNAPS.length - 1];

  // vaul возвращает body pointer-events:auto только при открытии своим триггером;
  // мы открываем шторку программно (нажатие на поле), поэтому делаем это сами — иначе карта не кликается
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => { document.body.style.pointerEvents = "auto"; });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={SNAPS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      modal={false}
      noBodyStyles
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          // нажатие по карте не закрывает шторку: выбор другого поля просто меняет её содержимое
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-full max-h-[97%] max-w-2xl flex-col rounded-t-[28px] border border-border/60 bg-background shadow-[0_-8px_40px_rgba(0,0,0,0.25)] outline-none"
        >
          <div className="flex shrink-0 flex-col items-center px-4 pb-2 pt-2.5">
            <Drawer.Handle className="!h-1.5 !w-10 !bg-muted-foreground/35" />
            <div className="mt-2.5 flex w-full items-center justify-between">
              <Drawer.Title className="text-base font-semibold">{title}</Drawer.Title>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Закрыть"
                className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground active:scale-95"
              >
                ✕
              </button>
            </div>
          </div>
          {/* пока шторка не раскрыта полностью, контент не скроллится — свайп вверх раскрывает её */}
          <div className={`flex-1 overscroll-contain px-4 ${expanded ? "overflow-y-auto" : "overflow-hidden"}`}>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
