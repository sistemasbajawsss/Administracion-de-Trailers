export const CATALOG_KINDS = ["choferes", "categorias", "proveedores"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export type CatalogItem = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export type DriverOption = { id: string; name: string };

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
    empty: "Talleres y refaccionarias donde se hacen los servicios.",
    hasPhone: true,
    hasNotes: true,
  },
};
