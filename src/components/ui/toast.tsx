"use client";

import { Toast } from "@base-ui/react/toast";
import { AlertCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Toast — Componentes §3.9. Una línea, sobre la bottom nav en mobile (esquina superior en
 * desktop), auto-cierre a los 4 s, y como máximo UNA acción.
 *
 * Los toasts de ERROR no se auto-cierran (`timeout: 0`) y explican qué pasó y qué hacer
 * (Marca §4.2). Además llevan ícono: ningún estado comunica solo con color.
 *
 * Se usa el Toast de Base UI y no sonner: sonner exige `next-themes`, y Ritma no tiene theme
 * provider a propósito (el modo lo decide el sistema, Color §7.5). Este es unstyled → 100 %
 * tokens de Ritma.
 */

/** `limit={1}`: un toast a la vez. La spec pide una línea, no una pila. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider limit={1} timeout={4000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          className={cn(
            "pointer-events-none fixed z-30",
            // Mobile: 12 px por encima de la bottom nav.
            "inset-x-4 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)]",
            // Desktop: no hay bottom nav → esquina superior derecha.
            "md:inset-x-auto md:top-6 md:right-6 md:bottom-auto md:w-[22.5rem]",
          )}
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      swipeDirection={["down", "right"]}
      className={cn(
        "group pointer-events-auto absolute inset-x-0 bottom-0 md:top-0 md:bottom-auto",
        "rounded-card border border-border bg-surface-raised text-text shadow-float",
        "[--enter-y:1.5rem] md:[--enter-y:-1.5rem]",
        "[transform:translate3d(var(--toast-swipe-movement-x),calc(var(--toast-swipe-movement-y)_+_var(--enter-offset,0px)),0)]",
        "transition-[transform,opacity] duration-200 ease-out data-swiping:duration-0",
        "data-starting-style:opacity-0 data-starting-style:[--enter-offset:var(--enter-y)]",
        "data-ending-style:opacity-0 data-ending-style:[--enter-offset:var(--enter-y)]",
        "data-limited:pointer-events-none data-limited:opacity-0",
      )}
    >
      <Toast.Content className="flex items-center gap-3 py-2 pr-2 pl-4">
        <AlertCircle
          aria-hidden
          className="hidden size-4 shrink-0 text-danger group-data-[type=error]:block"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Toast.Title className="truncate text-sm text-text" />
          <Toast.Description className="text-xs text-text-secondary" />
        </div>

        {/* Solo se renderiza si el toast trae `actionProps` (§3.9: UNA acción). */}
        <Toast.Action className="shrink-0 rounded-control px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted" />

        <Toast.Close
          aria-label="Cerrar"
          className="grid size-11 shrink-0 place-items-center rounded-control text-text-secondary hover:bg-muted"
        >
          <X aria-hidden className="size-4" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

/** Atajo tipado sobre el manager de Base UI. Solo dentro de `<ToastProvider>`. */
export function useToast() {
  const manager = Toast.useToastManager();

  return {
    /** Confirmación breve: se cierra sola a los 4 s. */
    notify: (title: string, options?: Parameters<typeof manager.add>[0]) =>
      manager.add({ title, type: "success", ...options }),

    /** Error: NO se auto-cierra y se anuncia con urgencia (§3.9, §4.4). */
    error: (title: string, options?: Parameters<typeof manager.add>[0]) =>
      manager.add({ title, type: "error", timeout: 0, priority: "high", ...options }),

    close: manager.close,
  };
}
