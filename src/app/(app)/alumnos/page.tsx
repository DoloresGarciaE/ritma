import type { Metadata } from "next";
import { Users } from "lucide-react";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";

export const metadata: Metadata = {
  title: "Alumnos · Ritma",
};

/** Placeholder: el padrón de alumnos es F1·S1. */
export default function AlumnosPage() {
  return (
    <>
      <AppBar title="Alumnos" />

      <EmptyState
        icon={Users}
        title="Todavía no hay alumnos"
        description="Acá vas a tener tu padrón: quién es quién, en qué grupos está y qué debe. Estamos armándolo."
      />
    </>
  );
}
