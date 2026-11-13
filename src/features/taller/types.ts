import type { UnitOperation, UnitType } from "@/features/unidades/types";

/** Una unidad que está en el taller ahora (entrada abierta). */
export type ShopEntry = {
  id: string;
  unitId: string;
  economicNumber: string;
  unitType: UnitType;
  unitTypeName: string;
  unitOperation: UnitOperation | null;
  /** "aaaa-mm-dd". */
  entryDate: string;
  fault: string;
  /** Nombre de quien la reportó, como estaba al registrar la entrada. */
  reportedBy: string | null;
  /** Servicios registrados en la estancia. Sin ninguno, "Dar salida" exige motivo. */
  serviceCount: number;
  /** Entró por un ticket que aprobó un administrador (5H): va primero y destacada. */
  approval: { approverName: string | null; reason: string | null } | null;
};
