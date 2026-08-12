import type { Metadata } from "next";

import { RitmaLogotipo } from "@/components/brand/ritma-logotipo";

import { Wizard } from "./wizard";

export const metadata: Metadata = {
  title: "Creá tu organización",
};

export default function CrearOrganizacionPage() {
  return (
    <>
      <RitmaLogotipo className="mb-8 w-24" />
      <Wizard />
    </>
  );
}
