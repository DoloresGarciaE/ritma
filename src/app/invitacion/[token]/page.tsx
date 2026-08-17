import type { Metadata } from "next";
import Link from "next/link";

import { RitmaLogotipo } from "@/components/brand/ritma-logotipo";
import { buttonVariants } from "@/components/ui/button";
import { listMembershipsForUser } from "@/lib/active-org";
import { getSession } from "@/lib/auth";
import { getInvitationByToken } from "@/server/public/invitations";

import { AcceptInvitation } from "./_components/accept-invitation";

/**
 * `/invitacion/[token]` (S7, HU1.3): la puerta de entrada al equipo. Vive FUERA de
 * `(app)` y de `(auth)` a propósito — quien llega puede no tener sesión, no tener org,
 * o tener otra org activa: ninguna de las dos guardias aplica. El proxy no la matchea
 * (un link abierto sin cookie tiene que llegar acá, no rebotar a /login).
 *
 * Estados (decisión S7 — "sin filtrar información de la org"): la válida muestra org y
 * rol; usada/vencida/revocada muestran SOLO el estado, con voz de marca. Aceptar exige
 * sesión: sin ella, login/registro con `?next=` de vuelta acá — y el flujo de Google
 * desemboca igual (callbackURL = next).
 */

export const metadata: Metadata = {
  title: "Invitación",
  robots: { index: false, follow: false },
};

const ROLE_LABEL = { ADMIN: "Admin", TEACHER: "Profe" } as const;

type Props = { params: Promise<{ token: string }> };

export default async function InvitacionPage({ params }: Props) {
  const { token } = await params;
  const [invitation, session] = await Promise.all([getInvitationByToken(token), getSession()]);

  let content: React.ReactNode;

  if (!invitation) {
    content = (
      <State
        title="Esta invitación no existe o fue revocada"
        description="Revisá que el link esté completo o pedile uno nuevo a quien te invitó."
      />
    );
  } else if (invitation.kind === "used") {
    content = (
      <State
        title="Esta invitación ya fue usada"
        description="Cada link sirve una sola vez. Si te falta entrar, pedí una invitación nueva."
      />
    );
  } else if (invitation.kind === "expired") {
    content = (
      <State
        title="Esta invitación venció"
        description="Los links duran 7 días. Pedile uno nuevo a quien te invitó."
      />
    );
  } else if (!session) {
    const next = `/invitacion/${encodeURIComponent(token)}`;
    content = (
      <>
        <Heading orgName={invitation.orgName} roleLabel={ROLE_LABEL[invitation.role]} />
        <p className="text-text-secondary">
          Para aceptar, entrá con tu cuenta — o creá una: es un minuto.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className={buttonVariants({ size: "lg" })}
          >
            Iniciar sesión
          </Link>
          <Link
            href={`/registro?next=${encodeURIComponent(next)}`}
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            Crear cuenta
          </Link>
        </div>
      </>
    );
  } else {
    const memberships = await listMembershipsForUser(session.userId);
    const alreadyMember = memberships.some((m) => m.orgId === invitation.orgId);

    content = alreadyMember ? (
      <State
        title={`Ya sos parte de ${invitation.orgName}`}
        description="No hay nada que aceptar: tu lugar en el equipo sigue como siempre."
        cta={{ label: "Ir a Ritma", href: "/" }}
      />
    ) : (
      <>
        <Heading orgName={invitation.orgName} roleLabel={ROLE_LABEL[invitation.role]} />
        <p className="text-text-secondary">
          Vas a entrar como <span className="font-medium text-text">{session.email}</span>.
        </p>
        <AcceptInvitation token={token} />
      </>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <RitmaLogotipo className="h-8 w-auto self-start text-text" />
        {content}
      </div>
    </main>
  );
}

function Heading({ orgName, roleLabel }: { orgName: string; roleLabel: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-2xl font-medium text-text">
        {orgName} te invita a su equipo
      </h1>
      <p className="text-text-secondary">
        Entrás como <span className="font-medium text-text">{roleLabel}</span>.
      </p>
    </header>
  );
}

function State({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-2xl font-medium text-text">{title}</h1>
      <p className="text-text-secondary">{description}</p>
      {cta ? (
        <Link href={cta.href} className={`${buttonVariants({ size: "lg" })} mt-2`}>
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
