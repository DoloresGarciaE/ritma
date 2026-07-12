import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/**
 * App bar (Componentes §3.6): título de la pantalla en 18 px peso 500, back a la izquierda
 * cuando hay jerarquía, y una acción contextual a la derecha como máximo.
 *
 * La compone cada página, no el layout: así el título puede salir de los datos (el nombre
 * del alumno en su ficha) y cada pantalla trae su propia acción.
 */
export function AppBar({
  title,
  back,
  action,
}: {
  title: string;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-border bg-background px-4 md:px-6">
      {back ? (
        <Link
          href={back}
          aria-label="Volver"
          className="-ml-2 flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
      ) : null}

      <h1 className="flex-1 truncate text-[18px] font-medium text-text">{title}</h1>

      {action}
    </header>
  );
}
