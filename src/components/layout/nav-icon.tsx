import {
  ChartColumn,
  ClipboardPlus,
  House,
  Tags,
  Truck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { NavIcon as NavIconName } from "./navigation";

const ICONS: Record<NavIconName, LucideIcon> = {
  inicio: House,
  unidades: Truck,
  servicios: Wrench,
  registrar: ClipboardPlus,
  reportes: ChartColumn,
  catalogos: Tags,
  usuarios: UsersRound,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
