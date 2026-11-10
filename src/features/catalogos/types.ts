export const CATALOG_KINDS = ["choferes", "categorias", "proveedores", "talleres"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export type CatalogItem = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export type DriverOption = { id: string; name: string };
export type SupplierOption = { id: string; name: string };
/** Taller de fuera (5G): quién hizo el trabajo si no fue en Taller Realso. */
export type WorkshopOption = { id: string; name: string };
/** requiresConcept: el gasto debe decir qué fue (p. ej. "Otros (especificar)"). */
export type CategoryOption = { id: string; name: string; requiresConcept: boolean };

export const CATALOG_LABELS: Record<
  CatalogKind,
  {
    title: string;
    singular: string;
    /** Artículos para que los mensajes concuerden: "un chofer", "la categoría". */
    a: "un" | "una";
    the: "el" | "la";
    empty: string;
    hasPhone: boolean;
    hasNotes: boolean;
  }
> = {
  choferes: {
    title: "Choferes",
    singular: "chofer",
    a: "un",
    the: "el",
    empty: "Agrega a los choferes para asignarlos a las unidades.",
    hasPhone: true,
    hasNotes: false,
  },
  categorias: {
    title: "Categorías",
    singular: "categoría",
    a: "una",
    the: "la",
    empty: "Las categorías clasifican cada gasto: motor, frenos, llantas…",
    hasPhone: false,
    hasNotes: false,
  },
  proveedores: {
    title: "Proveedores",
    singular: "proveedor",
    a: "un",
    the: "el",
    empty: "Refaccionarias y negocios donde se compran las piezas.",
    hasPhone: true,
    hasNotes: true,
  },
  talleres: {
    title: "Talleres",
    singular: "taller",
    a: "un",
    the: "el",
    empty: "Talleres de fuera que hacen trabajos, en su local o en camino. Taller Realso no va aquí: se elige aparte.",
    hasPhone: false,
    hasNotes: false,
  },
};
