import type { UnitOperation, UnitType } from "@/features/unidades/types";

/** Una unidad que está en el taller ahora (entrada abierta). */
export type ShopEntry = {
  id: string;
  unitId: string;
  economicNumber: string;
  unitType: UnitType;
  unitOperation: UnitOperation | null;
  /** "aaaa-mm-dd". */
  entryDate: string;
  fault: string;
  /** Nombre de quien la reportó, como estaba al registrar la entrada. */
  reportedBy: string | null;
};
