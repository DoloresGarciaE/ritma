"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Sheet de acción — Componentes §3.8. El contenedor de TODOS los formularios de acción
 * (alta express, registrar pago, inscribir alumno).
 *
 * Mobile: bottom sheet con handle y cierre por gesto (Drawer de Base UI, el único que trae
 * swipe). Desktop (≥ md): el mismo contenido como Dialog de 480 px.
 *
 * Es CONTROLADO a propósito: el formulario lo cierra al completar la acción, y así no hay
 * que exponer dos `Trigger` distintos según el breakpoint.
 */

type ActionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Contexto de una línea debajo del título. */
  description?: string;
  className?: string;
  children: React.ReactNode;
};

function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: ActionSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 48rem)");

  const header = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      {isDesktop ? (
        <>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </>
      ) : (
        <>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </>
      )}
    </div>
  );

  const closeButton = (
    <Button variant="ghost" size="sm" aria-label="Cerrar" className="size-11 shrink-0 px-0">
      <X aria-hidden />
    </Button>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={className}>
          <header className="flex shrink-0 items-start gap-2 p-4 pb-2">
            {header}
            <DialogClose render={closeButton} />
          </header>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className={className}>
        <header className="flex shrink-0 items-start gap-2 p-4 pb-2">
          {header}
          <DrawerClose render={closeButton} />
        </header>
        {children}
      </DrawerContent>
    </Drawer>
  );
}

/** Contenido scrolleable. Va dentro del `<form>`, arriba del footer. */
function ActionSheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="action-sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2", className)}
      {...props}
    />
  );
}

/**
 * El CTA primario, fijo al fondo (§3.8): lg y de ancho completo. El padding extra abajo lo
 * despega de la barra de gestos del teléfono.
 */
function ActionSheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="action-sheet-footer"
      className={cn(
        "shrink-0 border-t border-border bg-surface-raised p-4",
        "pb-[calc(1rem_+_env(safe-area-inset-bottom))] md:pb-4",
        "[&>button]:w-full",
        className,
      )}
      {...props}
    />
  );
}

export { ActionSheet, ActionSheetBody, ActionSheetFooter };
