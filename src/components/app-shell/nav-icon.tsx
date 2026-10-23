import {
  ChartColumn,
  ClipboardPlus,
  House,
  Truck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { NavIcon as NavIconName } from "@/lib/navigation";

const ICONS: Record<NavIconName, LucideIcon> = {
  inicio: House,
  camiones: Truck,
  servicios: Wrench,
  registrar: ClipboardPlus,
  reportes: ChartColumn,
  usuarios: UsersRound,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
