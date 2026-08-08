import { Skeleton } from "@/components/ui/skeleton";

/** Silueta de la ficha (§3.14): app bar con volver, datos de contacto y estado de cuenta. */
export default function FichaLoading() {
  return (
    <div role="status" aria-label="Cargando la ficha">
      <div className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-border bg-background px-4 md:px-6">
        <Skeleton className="-ml-2 size-11" />
        <Skeleton className="h-5 w-44" />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-2 pb-6 md:px-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-4 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
