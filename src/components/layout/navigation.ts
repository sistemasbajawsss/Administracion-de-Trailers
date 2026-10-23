import type { Role } from "@/lib/auth/types";

export type NavIcon =
  | "inicio"
  | "unidades"
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
    { href: "/unidades", label: "Unidades", icon: "unidades" },
    { href: "/servicios", label: "Servicios", icon: "servicios" },
    { href: "/dashboard", label: "Reportes", icon: "reportes" },
    { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios" },
  ],
  capturista: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/servicios/nuevo", label: "Registrar servicio", icon: "registrar" },
  ],
};
