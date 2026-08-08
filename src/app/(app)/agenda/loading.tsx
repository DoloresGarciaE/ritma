import { Skeleton } from "@/components/ui/skeleton";

/** Silueta de la agenda (§3.14): toggle Semana|Día, navegación y los días con bloques. */
export default function AgendaLoading() {
  return (
    <div role="status" aria-label="Cargando la agenda">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:px-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-2 pb-6 md:px-6">
        <Skeleton className="h-11" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-11" />
          <Skeleton className="mx-auto h-4 w-32" />
          <Skeleton className="size-11" />
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        ))}
      </div>
    </div>
  );
}
