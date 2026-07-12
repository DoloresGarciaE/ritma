import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/**
 * Estado vacío (Componentes §3.10): ícono de 48 px, título corto, una línea de contexto y
 * un CTA primario. El copy invita a actuar; no describe la ausencia (Marca §4).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <Icon aria-hidden className="size-12 text-text-muted" strokeWidth={1.75} />

      <h2 className="font-display text-xl font-medium text-text">{title}</h2>
      <p className="max-w-sm text-sm text-text-secondary">{description}</p>

      {cta ? (
        <Link href={cta.href} className={buttonVariants({ size: "lg", className: "mt-3" })}>
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
