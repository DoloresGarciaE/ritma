import { Skeleton } from "@/components/ui/skeleton";

/** Silueta de Cobranzas (§3.14): período, chips de grupo, total y filas de deudores. */
export default function CobranzasLoading() {
  return (
    <div role="status" aria-label="Cargando cobranzas">
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background px-4 md:px-6">
        <Skeleton className="h-5 w-28" />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-2 pb-6 md:px-6">
        <div className="flex items-center gap-2">
          <Skeleton className="size-11" />
          <Skeleton className="mx-auto h-4 w-28" />
          <Skeleton className="size-11" />
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-11 w-16 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-24 rounded-full" />
        </div>

        <Skeleton className="h-[88px]" />

        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
