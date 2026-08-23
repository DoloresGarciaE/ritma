"use client";

import { DoorOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { SpaceListItem } from "@/server/services/spaces";

import {
  createSpaceAction,
  deactivateSpaceAction,
  reactivateSpaceAction,
  renameSpaceAction,
} from "../actions";

/**
 * Salones (S8): lista con grupos asignados, alta/renombre en sheet (§3.8) y baja lógica
 * con confirmación que nombra la consecuencia — sus grupos quedan SIN salón, avisado
 * ANTES con el número real. "Inactivo" es etiqueta de texto, jamás solo color.
 */
export function SalonesManager({ spaces }: { spaces: SpaceListItem[] }) {
  const router = useRouter();
  const toast = useToast();

  // Un solo sheet para alta y renombre: `editing` decide.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SpaceListItem | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [deactivating, setDeactivating] = useState<SpaceListItem | null>(null);
  const [confirming, startConfirm] = useTransition();

  const openCreate = () => {
    toast.closeAll();
    setEditing(null);
    setName("");
    setNameError(null);
    setSheetOpen(true);
  };

  const openRename = (space: SpaceListItem) => {
    toast.closeAll();
    setEditing(space);
    setName(space.name);
    setNameError(null);
    setSheetOpen(true);
  };

  const handleSave = () => {
    startSave(async () => {
      const result = editing
        ? await renameSpaceAction(editing.id, name)
        : await createSpaceAction(name);
      if (result.error) {
        setNameError(result.error);
        return;
      }
      setSheetOpen(false);
      toast.notify(editing ? `Guardaste ${name.trim()}` : `Creaste ${name.trim()}`);
      router.refresh();
    });
  };

  const handleDeactivate = () => {
    if (!deactivating) return;
    startConfirm(async () => {
      const result = await deactivateSpaceAction(deactivating.id);
      if (result.error) toast.error(result.error);
      else {
        toast.notify(
          result.unassigned
            ? `${deactivating.name} quedó inactivo; ${
                result.unassigned === 1
                  ? "1 grupo quedó sin salón"
                  : `${result.unassigned} grupos quedaron sin salón`
              }.`
            : `${deactivating.name} quedó inactivo.`,
        );
      }
      setDeactivating(null);
      router.refresh();
    });
  };

  const handleReactivate = (space: SpaceListItem) => {
    startConfirm(async () => {
      const result = await reactivateSpaceAction(space.id);
      if (result.error) toast.error(result.error);
      else toast.notify(`${space.name} vuelve al calendario. Sus grupos no se re-asignan solos.`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      {spaces.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <DoorOpen aria-hidden className="size-12 text-text-muted" />
          <h2 className="font-display text-lg font-medium text-text">
            Tus salones, con nombre propio
          </h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Creá los espacios del estudio y asignalos a los grupos: el calendario por salón y los
            avisos de cruce salen de acá.
          </p>
          <Button size="lg" onClick={openCreate}>
            Crear el primer salón
          </Button>
        </div>
      ) : (
        <>
          <Card className="flex flex-col gap-0 p-0">
            <ul className="flex flex-col">
              {spaces.map((space, index) => (
                <li
                  key={space.id}
                  className={`flex min-h-16 flex-col gap-2 px-4 py-3 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-text">{space.name}</span>
                    {!space.active ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                        Inactivo
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs text-text-secondary">
                      {space.groupCount === 1 ? "1 grupo" : `${space.groupCount} grupos`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openRename(space)}>
                      Renombrar
                    </Button>
                    {space.active ? (
                      <Button variant="ghost" size="sm" onClick={() => setDeactivating(space)}>
                        Desactivar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={confirming}
                        onClick={() => handleReactivate(space)}
                      >
                        Reactivar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div>
            <Button variant="secondary" onClick={openCreate}>
              Nuevo salón
            </Button>
          </div>
        </>
      )}

      <ActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Renombrar salón" : "Nuevo salón"}
        description={
          editing
            ? "El nombre nuevo aparece en grupos, agenda y calendario."
            : "Un salón es un espacio físico del estudio: Salón A, Terraza, la sala de ensayo."
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ActionSheetBody className="flex flex-col gap-4 py-4">
            <Field label="Nombre del salón" error={nameError ?? undefined}>
              <Input
                autoFocus
                maxLength={40}
                placeholder="Salón A"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
              />
            </Field>
          </ActionSheetBody>
          <ActionSheetFooter>
            <Button type="submit" size="lg" loading={saving}>
              {editing ? "Guardar cambios" : "Crear salón"}
            </Button>
          </ActionSheetFooter>
        </form>
      </ActionSheet>

      {/* §3.8: la confirmación nombra el objeto y la consecuencia, con el número real. */}
      <Dialog open={deactivating !== null} onOpenChange={(next) => !next && setDeactivating(null)}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Desactivar {deactivating?.name}?</DialogTitle>
          <DialogDescription>
            {deactivating?.groupCount
              ? `${
                  deactivating.groupCount === 1
                    ? "Su grupo queda sin salón"
                    : `Sus ${deactivating.groupCount} grupos quedan sin salón`
                } y el salón sale del calendario. Si lo reactivás, los grupos no se re-asignan solos.`
              : "El salón sale del calendario. Lo podés reactivar cuando quieras."}
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={confirming}
              onClick={handleDeactivate}
            >
              Desactivar salón
            </Button>
            <DialogClose
              render={
                <Button variant="ghost" size="lg" className="w-full">
                  Volver
                </Button>
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
