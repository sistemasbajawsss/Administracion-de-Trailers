import type { Role } from "@/lib/auth/types";

export type NavIcon =
  | "inicio"
  | "taller"
  | "tickets"
  | "unidades"
  | "servicios"
  | "mantenimientos"
  | "kilometraje"
  | "registrar"
  | "reportes"
  | "catalogos"
  | "usuarios";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Cuántas cosas esperan ahí (p. ej. tickets por atender); sin número si es 0. */
  badge?: number;
};

export const NAVIGATION: Record<Role, NavItem[]> = {
  admin: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/taller", label: "Taller", icon: "taller" },
    { href: "/tickets", label: "Tickets", icon: "tickets" },
    { href: "/unidades", label: "Unidades", icon: "unidades" },
    { href: "/servicios", label: "Servicios", icon: "servicios" },
    { href: "/mantenimientos", label: "Mantenimientos", icon: "mantenimientos" },
    { href: "/kilometraje", label: "Kilometraje", icon: "kilometraje" },
    { href: "/dashboard", label: "Reportes", icon: "reportes" },
    { href: "/admin/catalogos", label: "Catálogos", icon: "catalogos" },
    { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios" },
  ],
  capturista: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/taller", label: "Taller", icon: "taller" },
    { href: "/tickets", label: "Tickets", icon: "tickets" },
    { href: "/servicios/nuevo", label: "Registrar servicio", icon: "registrar" },
    { href: "/servicios", label: "Mis servicios", icon: "servicios" },
    { href: "/mantenimientos", label: "Mantenimientos", icon: "mantenimientos" },
    { href: "/kilometraje", label: "Kilometraje", icon: "kilometraje" },
  ],
  gerente: [
    { href: "/", label: "Inicio", icon: "inicio" },
    { href: "/taller", label: "Taller", icon: "taller" },
    { href: "/tickets", label: "Tickets", icon: "tickets" },
    { href: "/unidades", label: "Unidades", icon: "unidades" },
    { href: "/servicios", label: "Servicios", icon: "servicios" },
    { href: "/mantenimientos", label: "Mantenimientos", icon: "mantenimientos" },
    { href: "/kilometraje", label: "Kilometraje", icon: "kilometraje" },
    { href: "/dashboard", label: "Reportes", icon: "reportes" },
  ],
};
