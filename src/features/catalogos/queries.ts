import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { CatalogItem, DriverOption } from "./types";

/**
 * Los tres catálogos en paralelo (una sola espera para la pantalla de
 * catálogos). RLS decide qué ve cada rol: el admin también ve los inactivos.
 */
export async function listCatalogs(): Promise<{
  choferes: CatalogItem[];
  categorias: CatalogItem[];
  proveedores: CatalogItem[];
}> {
  const supabase = await createClient();

  const [drivers, categories, suppliers] = await Promise.all([
    supabase.from("choferes").select("id, nombre, telefono, activo").order("nombre"),
    supabase.from("categorias").select("id, nombre, activo").order("nombre"),
    supabase.from("proveedores").select("id, nombre, telefono, notas, activo").order("nombre"),
  ]);

  if (drivers.error || categories.error || suppliers.error) {
    throw new Error("No se pudieron cargar los catálogos");
  }

  return {
    choferes: drivers.data.map((d) => ({
      id: d.id,
      name: d.nombre,
      phone: d.telefono,
      notes: null,
      active: d.activo,
    })),
    categorias: categories.data.map((c) => ({
      id: c.id,
      name: c.nombre,
      phone: null,
      notes: null,
      active: c.activo,
    })),
    proveedores: suppliers.data.map((s) => ({
      id: s.id,
      name: s.nombre,
      phone: s.telefono,
      notes: s.notas,
      active: s.activo,
    })),
  };
}

/** Choferes activos para el selector del formulario de unidades. */
export async function listActiveDrivers(): Promise<DriverOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("choferes")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error("No se pudieron cargar los choferes");
  return data.map((d) => ({ id: d.id, name: d.nombre }));
}
