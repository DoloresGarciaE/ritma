import { Skeleton } from "@/components/ui/skeleton";

/** Silueta del Inicio (§3.14): app bar, las tres cards de métrica y las clases de hoy. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Cargando el inicio">
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background px-4 md:px-6">
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="flex flex-col gap-4 px-4 pt-2 pb-6 md:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Skeleton className="col-span-2 h-[92px] md:col-span-1" />
          <Skeleton className="h-[108px]" />
          <Skeleton className="h-[108px]" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </div>
    </div>
  );
}
