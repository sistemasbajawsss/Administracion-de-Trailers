import "server-only";

import { createClient } from "@/lib/supabase/server";

import type {
  CatalogItem,
  CategoryOption,
  DriverOption,
  MergeableKind,
  SimilarCatalogItem,
  SupplierOption,
  WorkshopOption,
} from "./types";

/**
 * Los cuatro catálogos en paralelo (una sola espera para la pantalla de
 * catálogos). RLS decide qué ve cada rol: el admin también ve los inactivos.
 */
export async function listCatalogs(): Promise<{
  choferes: CatalogItem[];
  categorias: CatalogItem[];
  proveedores: CatalogItem[];
  talleres: CatalogItem[];
}> {
  const supabase = await createClient();

  const [drivers, categories, suppliers, workshops] = await Promise.all([
    supabase.from("choferes").select("id, nombre, telefono, activo").order("nombre"),
    supabase.from("categorias").select("id, nombre, activo").order("nombre"),
    supabase.from("proveedores").select("id, nombre, telefono, notas, activo").order("nombre"),
    supabase.from("talleres").select("id, nombre, activo").order("nombre"),
  ]);

  if (drivers.error || categories.error || suppliers.error || workshops.error) {
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
    talleres: workshops.data.map((w) => ({ id: w.id, name: w.nombre, phone: null, notes: null, active: w.activo })),
  };
}

/** Activos con nombre parecido, para no dar de alta un repetido (5I). Admin y capturista. */
export async function findSimilarCatalogItems(kind: MergeableKind, name: string): Promise<SimilarCatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalogo_parecidos", { p_catalogo: kind, p_nombre: name });
  if (error) throw new Error("No se pudieron buscar los parecidos");
  return data.map((row) => ({ id: row.id, name: row.nombre }));
}

/** Cuántos servicios usan un proveedor o taller (para explicar qué pasa al unirlo). */
export async function countServicesUsing(kind: MergeableKind, id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("servicios")
    .select("id", { count: "exact", head: true })
    .eq(kind === "proveedores" ? "proveedor_id" : "taller_id", id);
  if (error) throw new Error("No se pudieron contar los servicios");
  return count ?? 0;
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

/** Categorías activas para los renglones de gasto. */
export async function listActiveCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, requiere_concepto")
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error("No se pudieron cargar las categorías");
  return data.map((c) => ({ id: c.id, name: c.nombre, requiresConcept: c.requiere_concepto }));
}

/** Proveedores activos para el formulario de servicio. */
export async function listActiveSuppliers(): Promise<SupplierOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error("No se pudieron cargar los proveedores");
  return data.map((s) => ({ id: s.id, name: s.nombre }));
}

/** Talleres de fuera activos para "¿Dónde se hizo?" del formulario de servicio (5G). */
export async function listActiveWorkshops(): Promise<WorkshopOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("talleres").select("id, nombre").eq("activo", true).order("nombre");

  if (error) throw new Error("No se pudieron cargar los talleres");
  return data.map((w) => ({ id: w.id, name: w.nombre }));
}
