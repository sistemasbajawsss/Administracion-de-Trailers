import type { Role } from "@/lib/auth/types";

export type NavIcon =
  | "inicio"
  | "camiones"
  | "servicios"
  | "registrar"
  | "reportes"
  | "usuarios";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

export const NAVIGATION: Record<Role, NavItem[]> = {
  admin: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/camiones", label: "Camiones", icon: "camiones" },
    { href: "/servicios", label: "Servicios", icon: "servicios" },
    { href: "/reportes", label: "Reportes", icon: "reportes" },
    { href: "/usuarios", label: "Usuarios", icon: "usuarios" },
  ],
  capturista: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/servicios/nuevo", label: "Registrar servicio", icon: "registrar" },
  ],
};
