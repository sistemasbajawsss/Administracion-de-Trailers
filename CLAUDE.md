# CLAUDE.md — Administración Trailers

Sistema web para registrar reparaciones, gastos y comprobantes (PDF / foto de ticket) de ~30 unidades (trailers, cajas de trailer, camiones rabones y camionetas) identificadas por su número económico interno. Objetivo: saber cuánto se invierte en cada unidad, por tipo, por categoría y por periodo.

## Antes de empezar cualquier tarea

1. Lee `docs/ESTADO.md` para saber en qué sección vamos y qué ya existe.
2. Lee la sección correspondiente en `docs/PLAN.md`.
3. Respeta la estructura y reglas de `docs/ARQUITECTURA.md`. Ningún archivo se crea fuera de ella; si algo no encaja, pregunta antes.
4. Trabaja SOLO dentro del alcance de la sección actual. Si algo requiere tocar código o tablas de una sección ya cerrada, detente y pregunta antes.

## Stack

- Next.js (App Router) + TypeScript en modo strict
- Tailwind CSS + shadcn/ui (no instalar otras librerías de componentes)
- Supabase: Postgres, Auth, Storage. Cliente con `@supabase/ssr`
- Validación con Zod; formularios con react-hook-form
- Gráficas con Recharts
- Gestor de paquetes: npm
- Deploy en Vercel, subdominio vía Cloudflare

## Convenciones

- Base de datos (tablas, columnas, enums): español, snake_case, tablas en plural (`unidades`, `gastos`).
- Código TypeScript (variables, funciones, componentes): inglés, camelCase / PascalCase.
- Textos de interfaz: español de México.
- Moneda: MXN, formato es-MX (`$12,345.67`). Fechas en pantalla: dd/mm/aaaa.
- Montos: columna `numeric(12,2)`, IVA incluido, nunca float. En TS manejarlos como string o centavos, nunca sumar floats.
- Fechas en BD: `date` para fechas de servicio, `timestamptz` para auditoría (`created_at`, `updated_at`).
- Catálogos no se borran: se desactivan con `activo = false`.
- Toda tabla lleva `created_at`, y las editables también `updated_at` y `created_by` (uuid del usuario).

## Base de datos y migraciones

- No se usa Supabase local ni Docker: se trabaja contra el proyecto en la nube enlazado con `npx supabase link`.
- Todo cambio de esquema va como migración nueva: `npx supabase migration new <nombre>`.
- Las migraciones se aplican con `npx supabase db push`. NUNCA crear ni modificar tablas, columnas o políticas desde el dashboard de Supabase.
- NUNCA editar una migración ya aplicada. Para corregir, crear otra migración.
- RLS habilitado en TODAS las tablas, sin excepción, con políticas explícitas por rol.
- Después de cada migración, regenerar tipos: `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts`.
- Cuando el sistema tenga datos reales, los cambios se prueban primero en un proyecto aparte (`administracion-trailers-dev`) antes de aplicarlos a producción.
- No inventar columnas: consultar el esquema real (migraciones o MCP de Supabase) antes de escribir queries.

## Roles y seguridad

- Roles: `admin` y `capturista` (enum `rol_usuario`, en la tabla `perfiles`).
- No hay registro público. Los usuarios los crea un admin.
- Los permisos se aplican en RLS y en el servidor. Ocultar un botón NO es seguridad.
- La `service_role` key solo se usa en código de servidor y nunca se expone al cliente ni con prefijo `NEXT_PUBLIC_`.
- El bucket de comprobantes es privado; los archivos se muestran con URLs firmadas de corta duración.
- Validar con Zod en el servidor todo lo que llega de formularios, aunque ya se haya validado en el cliente.

## UI

- Cada vez que una tarea involucre diseño o UI (crear o modificar interfaces, componentes, pantallas, estilos, layouts, colores, tipografía), carga primero la skill `frontend-design:frontend-design` antes de escribir código, sin importar el tamaño del cambio.
- Mobile-first en las pantallas del capturista (captura desde el celular en el taller).
- Usar componentes de shadcn/ui; agregarlos con el CLI de shadcn, no copiarlos a mano.
- Toda acción muestra estados de carga, éxito y error (toasts).
- Botones y campos táctiles cómodos (mínimo 44px de alto) en vistas de captura.

## Git y cierre de sección

- Una rama por sección: `seccion-<n>-<nombre>` (ej. `seccion-1-catalogos`).
- Commits con prefijos convencionales: `feat:`, `fix:`, `chore:`, `docs:`, `db:`.
- Una sección se considera cerrada solo cuando:
  - [ ] `npm run build` y `npm run lint` pasan sin errores
  - [ ] Migraciones aplicadas y tipos regenerados
  - [ ] Políticas RLS probadas con ambos roles
  - [ ] Criterios de "terminado" de `docs/PLAN.md` cumplidos
  - [ ] `docs/ESTADO.md` actualizado (qué se hizo, tablas/rutas nuevas, pendientes)
- Al cerrar, merge a `main` antes de iniciar la siguiente sección.
