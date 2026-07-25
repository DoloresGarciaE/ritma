"use client";

import { ChevronRight } from "lucide-react";

import { ActionSheet, ActionSheetBody } from "@/components/ui/sheet";
import { shortWeekday } from "@/lib/format";
import type { GroupListItem } from "@/server/services/groups";

/**
 * Acceso "Grupos" (decisión de S2): la lista completa —activos e inactivos— para editar
 * cualquier grupo, aunque no tenga sesiones en la semana visible. Sin esto, un grupo
 * desactivado quedaría inalcanzable hasta S3.
 *
 * El estado "Inactivo" va con etiqueta de texto: ningún estado comunica solo con color.
 */
export function GroupsSheet({
  open,
  onOpenChange,
  groups,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupListItem[];
  onEdit: (group: GroupListItem) => void;
}) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Grupos"
      description="Tocá un grupo para editarlo."
    >
      <ActionSheetBody className="pb-4">
        <ul className="divide-y divide-border">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onEdit(group)}
                className="flex min-h-16 w-full cursor-pointer items-center gap-3 py-2 text-left transition-[background-color] hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{group.name}</span>
                    {!group.active ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                        Inactivo
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-text-secondary">
                    {group.discipline.name}
                    {group.slots.length > 0
                      ? ` · ${group.slots
                          .map((slot) => `${shortWeekday(slot.weekday)} ${slot.startTime}`)
                          .join(" · ")}`
                      : ""}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </ActionSheetBody>
    </ActionSheet>
  );
}
