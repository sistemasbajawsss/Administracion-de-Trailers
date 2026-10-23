import type { Role } from "@/lib/auth/types";

export type NavIcon =
  | "inicio"
  | "unidades"
  | "servicios"
  | "registrar"
  | "reportes"
  | "catalogos"
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
    { href: "/admin/catalogos", label: "Catálogos", icon: "catalogos" },
    { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios" },
  ],
  capturista: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/servicios/nuevo", label: "Registrar servicio", icon: "registrar" },
    { href: "/servicios", label: "Mis servicios", icon: "servicios" },
  ],
  gerente: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/unidades", label: "Unidades", icon: "unidades" },
    { href: "/servicios", label: "Servicios", icon: "servicios" },
    { href: "/dashboard", label: "Reportes", icon: "reportes" },
  ],
};
