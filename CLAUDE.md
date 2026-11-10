# CLAUDE.md — Administración Trailers

Sistema web para registrar reparaciones, gastos y comprobantes (PDF / foto de ticket) de ~38 unidades (trailers, cajas de trailer, camiones rabones, pipas y camionetas), de operación local o foránea, identificadas por su número económico interno (`T-17`, `R-39`…). Objetivo: saber cuánto se invierte en cada unidad, por tipo, por operación, por categoría y por periodo.

## Antes de empezar cualquier tarea

0. Lee completo `docs/ERRORES.md` (errores que ya pasaron y su regla). Al terminar la tarea, vuélvelo a leer y revisa lo hecho contra cada regla antes de decir que está listo. Todo error nuevo que se corrija se agrega ahí.
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

- Roles: `admin`, `capturista` y `gerente` (solo lectura) (enum `rol_usuario`, en la tabla `perfiles`).
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
- Texto escrito por usuarios nunca debe salirse de su contenedor ni crear scroll lateral (pasó en la línea de cambios con un motivo largo sin espacios). Reglas:
  - `body` tiene `overflow-wrap: anywhere` en `globals.css` (red de seguridad heredada a toda la app). No quitarla ni poner `overflow-wrap: normal` / `break-normal` en contenedores de texto libre.
  - **Nunca cortar texto con "…"** (lo prohibió el usuario): nada de `truncate`, `line-clamp`, `text-ellipsis` ni `text-overflow: ellipsis`. El texto libre o de catálogo (descripción, falla, motivo, concepto, notas, nombres de proveedor/chofer/categoría/usuario, archivos, correos, placas, VIN) se muestra completo y baja de renglón; su contenedor flex/grid lleva `min-w-0`. Las listas desplegables (Select) también: su regla está en `globals.css`, fuera de `@layer`.
  - **Nunca un cuadro con scroll propio dentro de la página** (lo pidió el usuario): en el celular atrapa el dedo y ya no se puede regresar hasta arriba. Única excepción, pedida por el usuario el 2026-11-10: los gastos de la ficha de la unidad (cuadro de unos 10 renglones, máximo 60 % de la pantalla, sin `overscroll-contain`). Las listas largas cargan por tandas (scroll infinito) con el scroll normal de la página (`IntersectionObserver` sin `root`), como Gastos y las estancias en taller de la ficha; las tarjetas de Inicio muestran los N más recientes. Dentro de ventanas u hojas que se abren encima (diálogos, selector de unidad, visor) sí puede haber scroll propio.
  - Cifras y montos que no deben partirse: `whitespace-nowrap` (o `shrink-0` si están en una fila flex).
  - Nunca scroll lateral (lo prohibió el usuario): `html` y `body` llevan `overflow-x: clip`, así que lo que se pase se recorta y no se ve. Toda cuadrícula responsiva lleva `grid-cols-1` en celular (sin él, la columna crece con su contenido y empuja gráficas y tarjetas fuera de la pantalla); columnas a medida con `minmax(0,1fr)`, no `1fr`; tarjetas con gráfica, `min-w-0`; nada de filas con `overflow-x-auto` (usar `flex-wrap` o repartir el ancho).
  - Probar cada pantalla nueva con un texto de 200 caracteres sin espacios, en 360 px y en escritorio.
- **Nunca `window.confirm`, `alert` ni `prompt`**: los avisos son diálogos de la app (`AlertDialog`) y dicen exactamente lo que va a pasar (ver `useUnsavedChanges`).
- Si la BD o el servidor siempre rechazan algo, la pantalla no lo ofrece: se deshabilita con la explicación.
- **Prohibido usar emojis** (lo pidió el usuario): ni en la interfaz (textos, botones, avisos, toasts, estados vacíos) ni en el código (comentarios, mensajes de commit, nombres, logs, SQL, documentación). Para lo visual se usan los íconos de `lucide-react`. Símbolos tipográficos como "→", "·" o "…" en texto normal no son emojis.

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
