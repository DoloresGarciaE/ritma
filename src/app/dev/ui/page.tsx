import type { Metadata } from "next";
import { Check, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, MetricCard } from "@/components/ui/card";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { StatusBadge, type InstallmentStatus } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Componentes · Ritma",
  robots: { index: false, follow: false },
};

const STATUSES: InstallmentStatus[] = ["PENDING", "PARTIAL", "PAID", "OVERDUE", "WAIVED"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-wide text-text-secondary">{title}</h3>
      {children}
    </section>
  );
}

function Showcase({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6 rounded-card border border-border bg-background p-4 text-text md:p-6">
      <h2 className="font-display text-xl font-medium">{title}</h2>

      <Section title="Botón · variantes">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Registrar pago</Button>
          <Button variant="secondary">Ver ficha</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="destructive">Dar de baja</Button>
          <Button variant="link">Ver todas las cuotas</Button>
        </div>
      </Section>

      <Section title="Botón · tamaños (sm 32 · md 40 · lg 48)">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Registrar pago</Button>
          <Button size="md">Registrar pago</Button>
          <Button size="lg">Registrar pago</Button>
        </div>
      </Section>

      <Section title="Botón · con ícono, disabled y loading">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Plus />}>Nueva alumna</Button>
          <Button variant="secondary" icon={<Check />}>
            Marcar asistencia
          </Button>
          <Button disabled>Registrar pago</Button>
          <Button loading icon={<Check />}>
            Registrar pago
          </Button>
          <Button loading>Registrar pago</Button>
        </div>
      </Section>

      <Section title="Botón · CTA de formulario en mobile (lg, ancho completo)">
        <Button size="lg" className="w-full">
          Registrar pago
        </Button>
      </Section>

      <Section title="Campos">
        <div className="flex flex-col gap-4">
          <Field label="Nombre y apellido">
            <Input placeholder="Sofi Herrera" />
          </Field>

          <Field label="Teléfono" helpText="Con código de área, sin 0 ni 15.">
            <Input type="tel" placeholder="11 5555 5555" defaultValue="11 5555 5555" />
          </Field>

          <Field label="Teléfono" error="Ingresá un teléfono con código de área.">
            <Input type="tel" defaultValue="5555 5555" />
          </Field>

          <Field label="Monto" helpText="Llega pre-cargado con la deuda de la alumna.">
            <AmountInput defaultValue={20000} />
          </Field>

          <Field label="Monto">
            <AmountInput placeholder="0" disabled />
          </Field>
        </div>
      </Section>

      <Section title="Badge de estado de cuota">
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} dot />
          ))}
        </div>
      </Section>

      <Section title="Card de métrica">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            href="#"
            label="Cobrado en julio"
            value={formatMoney(180000)}
            context="12 pagos"
          />
          <MetricCard href="#" label="Por cobrar" value={formatMoney(95000)} context="3 deudores" />
        </div>
      </Section>

      <Section title="Card contenedora">
        <Card className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-medium">Sofi Herrera</span>
              <span className="text-xs text-text-secondary">
                Árabe intermedio · martes y jueves 19:00
              </span>
            </div>
            <StatusBadge status="OVERDUE" dot />
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-xs text-text-secondary">Marzo 2026</span>
            <span className="font-display text-xl font-medium tabular-nums">
              {formatMoney(20000)}
            </span>
          </div>
        </Card>
      </Section>
    </div>
  );
}

export default function DevUiPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-text md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-medium">Componentes</h1>
          <p className="text-text-secondary">
            Test visual de F0.2. Pasá el mouse y tabulá con el teclado para ver hover, pressed y
            foco. El fondo de esta página sigue el modo del sistema; los dos paneles lo fuerzan.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="light">
            <Showcase title="Modo claro" />
          </div>
          <div className="dark">
            <Showcase title="Modo oscuro" />
          </div>
        </div>
      </div>
    </main>
  );
}
