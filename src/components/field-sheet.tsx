"use client";

// Шторка поля на vaul: две точки остановки (50% / 94%), немодальная — карта под ней кликабельна.
// Тянется только за верхнюю полосу (handleOnly), поэтому контент скроллится нативно, без борьбы жестов.
import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

const SNAPS = [0.5, 0.94];
const HEADER_PX = 64; // высота полосы с ручкой и заголовком
const SHEET_GAP = 0.03; // шторка высотой 97% экрана — vaul опускает её на эти 3% ниже точки остановки

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
  const visible = typeof snap === "number" ? snap : SNAPS[0];

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
      handleOnly
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
          {/* верхняя полоса: за неё тянется шторка */}
          <div className="relative shrink-0 px-4" style={{ height: HEADER_PX }}>
            <span className="pointer-events-none absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/35" />
            <Drawer.Title className="pointer-events-none absolute bottom-3 left-4 text-base font-semibold">{title}</Drawer.Title>
            {/* прозрачная ручка на всю полосу */}
            <Drawer.Handle
              preventCycle
              className="!absolute !inset-0 !m-0 !h-full !w-full !cursor-grab !rounded-none !bg-transparent !opacity-100 active:!cursor-grabbing"
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Закрыть"
              className="absolute bottom-2.5 right-4 z-10 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground active:scale-95"
            >
              ✕
            </button>
          </div>
          {/* область прокрутки = видимая часть шторки, поэтому до конца можно долистать на любой высоте */}
          <div
            className="touch-pan-y overflow-y-auto overscroll-contain px-4 [-webkit-overflow-scrolling:touch]"
            style={{ height: `calc(${(visible - SHEET_GAP) * 100}dvh - ${HEADER_PX}px)` }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
