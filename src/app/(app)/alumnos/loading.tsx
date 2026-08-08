import { Skeleton } from "@/components/ui/skeleton";

/** Silueta del padrón (§3.14): app bar, buscador con chips y filas de alumnos. */
export default function AlumnosLoading() {
  return (
    <div role="status" aria-label="Cargando alumnos">
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background px-4 md:px-6">
        <Skeleton className="h-5 w-24" />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-2 pb-6 md:px-6">
        <Skeleton className="h-12" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-20 rounded-full" />
          <Skeleton className="h-11 w-24 rounded-full" />
        </div>

        <div className="flex flex-col gap-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex min-h-16 items-center gap-3 px-1">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
