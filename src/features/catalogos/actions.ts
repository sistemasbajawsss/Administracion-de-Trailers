"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { catalogItemSchema, type CatalogItemInput } from "./schemas";
import { CATALOG_KINDS, CATALOG_LABELS, type CatalogKind } from "./types";

const emptyToNull = (value: string) => (value.trim() === "" ? null : value.trim());

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Inserta solo las columnas que existen en cada tabla. */
function insertRow(supabase: Supabase, kind: CatalogKind, item: CatalogItemInput, userId: string) {
  switch (kind) {
    case "choferes":
      return supabase
        .from("choferes")
        .insert({ nombre: item.name, telefono: emptyToNull(item.phone), created_by: userId })
        .select("id, nombre")
        .single();
    case "categorias":
      return supabase
        .from("categorias")
        .insert({ nombre: item.name, created_by: userId })
        .select("id, nombre")
        .single();
    case "proveedores":
      return supabase
        .from("proveedores")
        .insert({
          nombre: item.name,
          telefono: emptyToNull(item.phone),
          notas: emptyToNull(item.notes),
          created_by: userId,
        })
        .select("id, nombre")
        .single();
  }
}

function updateRow(supabase: Supabase, kind: CatalogKind, id: string, item: CatalogItemInput) {
  switch (kind) {
    case "choferes":
      return supabase
        .from("choferes")
        .update({ nombre: item.name, telefono: emptyToNull(item.phone) })
        .eq("id", id)
        .select("id");
    case "categorias":
      return supabase.from("categorias").update({ nombre: item.name }).eq("id", id).select("id");
    case "proveedores":
      return supabase
        .from("proveedores")
        .update({ nombre: item.name, telefono: emptyToNull(item.phone), notas: emptyToNull(item.notes) })
        .eq("id", id)
        .select("id");
  }
}

function errorMessage(kind: CatalogKind, error: { code?: string }) {
  const { singular, a, the, title } = CATALOG_LABELS[kind];
  if (error.code === "23505") return `Ya existe ${a} ${singular} con ese nombre.`;
  if (error.code === "42501") return `No tienes permiso para modificar ${title.toLowerCase()}.`;
  return `No se pudo guardar ${the} ${singular}. Inténtalo de nuevo.`;
}

function notFoundMessage(kind: CatalogKind) {
  const { singular, the } = CATALOG_LABELS[kind];
  return `${the === "el" ? "El" : "La"} ${singular} ya no existe.`;
}

function revalidateCatalogs() {
  revalidatePath("/admin/catalogos");
  // Los choferes aparecen en el formulario y la lista de unidades.
  revalidatePath("/unidades", "layout");
}

function isCatalogKind(kind: unknown): kind is CatalogKind {
  return CATALOG_KINDS.includes(kind as CatalogKind);
}

export async function createCatalogItem(
  kind: CatalogKind,
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  if (!isCatalogKind(kind)) return fail("Catálogo no válido.");
  const parsed = catalogItemSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos.");

  // Proveedores: quien captura (alta rápida). El resto: solo admin. El gerente no escribe.
  const user = await requireRole(kind === "proveedores" ? CAPTURE_ROLES : "admin");

  const supabase = await createClient();
  const { data, error } = await insertRow(supabase, kind, parsed.data, user.id);
  if (error) return fail(errorMessage(kind, error));

  revalidateCatalogs();
  return ok({ id: data.id, name: data.nombre });
}

export async function updateCatalogItem(
  kind: CatalogKind,
  id: string,
  input: unknown,
): Promise<ActionResult> {
  if (!isCatalogKind(kind)) return fail("Catálogo no válido.");
  const parsed = catalogItemSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await updateRow(supabase, kind, id, parsed.data);
  if (error) return fail(errorMessage(kind, error));
  if (!data.length) return fail(notFoundMessage(kind));

  revalidateCatalogs();
  return ok();
}

export async function setCatalogItemActive(
  kind: CatalogKind,
  id: string,
  active: boolean,
): Promise<ActionResult> {
  if (!isCatalogKind(kind) || typeof active !== "boolean") return fail("Datos no válidos.");

  await requireRole("admin");

  const supabase = await createClient();
  // Las tres tablas comparten la columna activo, así que aquí basta una consulta.
  const { data, error } = await supabase
    .from(kind as "choferes")
    .update({ activo: active })
    .eq("id", id)
    .select("id");
  if (error) return fail(errorMessage(kind, error));
  if (!data.length) return fail(notFoundMessage(kind));

  revalidateCatalogs();
  return ok();
}
