# ARQUITECTURA — Administración Trailers

## Enfoque
Arquitectura **por features (módulos verticales)** sobre Next.js App Router.
Cada feature agrupa todo lo suyo: componentes, lecturas, escrituras, validaciones y tipos.
La seguridad real vive en la base de datos (RLS); el servidor valida y la UI solo presenta.

No se usan capas tipo "Clean Architecture" con repositorios, casos de uso e interfaces:
para este tamaño agregan archivos sin aportar. Si algún día crece, la estructura por features
permite extraer capas sin reescribir.

## Estructura de carpetas

```
src/
├── app/                         # SOLO rutas: páginas delgadas, layouts, loading, error
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/                   # Todo lo que requiere sesión
│   │   ├── layout.tsx           # Shell: navegación según rol
│   │   ├── page.tsx             # Inicio
│   │   ├── unidades/            # Trailers, cajas, camiones rabones y camionetas (D3)
│   │   ├── servicios/
│   │   ├── dashboard/           # Solo admin
│   │   └── admin/               # Solo admin: catálogos, usuarios
│   └── layout.tsx               # Raíz: fuentes, tema, toaster
│
├── features/                    # Lógica de negocio, un folder por módulo
│   ├── auth/
│   ├── unidades/
│   ├── catalogos/               # categorías y proveedores
│   ├── servicios/               # servicios y sus gastos
│   ├── comprobantes/
│   ├── usuarios/                # alta, rol, desactivar, contraseña (solo admin)
│   └── dashboard/
│       ├── components/          # Componentes propios del feature
│       ├── queries.ts           # Lecturas (solo servidor)
│       ├── actions.ts           # Escrituras (Server Actions)
│       ├── schemas.ts           # Validaciones Zod
│       └── types.ts             # Tipos derivados
│
├── components/
│   ├── ui/                      # shadcn/ui generado por CLI. No editar a mano salvo tema
│   ├── layout/                  # Sidebar, navegación inferior móvil, header
│   └── shared/                  # Reutilizables: EmptyState, PageHeader, HomePanel (tarjetas de Inicio)…
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts            # Cliente para Server Components y Actions
│   │   ├── client.ts            # Cliente para navegador (solo donde sea indispensable)
│   │   ├── proxy.ts             # Refresco de sesión
│   │   ├── cookie-options.ts    # Cookies de sesión httpOnly / secure
│   │   ├── storage.ts           # Bucket de comprobantes y borrado de archivos
│   │   ├── admin.ts             # Cliente service_role (server-only): Auth Admin API para usuarios
│   │   └── database.types.ts    # GENERADO. Nunca editar a mano
│   ├── auth/                    # getCurrentUser(), requireRole()
│   ├── banxico.ts               # Tipo de cambio FIX de Banxico (server-only, BANXICO_TOKEN)
│   ├── env.ts                   # Variables de entorno validadas con Zod
│   ├── action-result.ts         # Tipo de respuesta común de las actions
│   └── utils/                   # formatMoney, formatDate, cn; files.ts (tipos de archivo, firma de bytes, reducir fotos)
│
├── mock/                        # Datos de ejemplo temporales (se borra al conectar BD)
└── proxy.ts                     # Protección de rutas (en Next.js 16 `middleware` se renombró a `proxy`)

supabase/
├── migrations/                  # Una migración por cambio, nunca editar aplicadas
└── seed.sql                     # Solo para entornos locales: `db push` NO lo aplica.
                                 # Datos iniciales de producción (categorías) van dentro de una migración.
```

## Reglas de dependencia
La dirección permitida es: `app → features → components/shared → lib`.

- `app/` importa de `features/`, `components/` y `lib/`. Nunca al revés.
- Un feature **no importa internals de otro feature**. Si dos features necesitan lo mismo,
  se mueve a `components/shared/` o `lib/`.
  - Sí puede importar el `types.ts` de otro feature (tipos y etiquetas, p. ej. `UNIT_TYPE_LABELS`).
  - Componentes públicos a propósito: `catalogos/components/supplier-quick-add` (alta rápida de
    proveedor dentro del formulario de servicio), `comprobantes/components/receipt-picker` y
    `comprobantes/components/upload-receipts` (elegir y subir comprobantes en el servicio nuevo),
    `comprobantes/components/view-receipts-button` ("Ver factura" en la lista de gastos).
  - Nunca `queries.ts` ni `actions.ts` de otro feature: eso lo compone la página en `app/`.
- `lib/` no importa de `features/` ni de `app/`.
- `components/ui/` no conoce nada del negocio.

## Responsabilidades

**Páginas (`app/**/page.tsx`)**
- Delgadas: verifican rol si aplica, llaman a `queries.ts` y renderizan componentes del feature.
- Sin lógica de negocio ni llamadas directas a Supabase.

**Lecturas (`features/*/queries.ts`)**
- Empiezan con `import 'server-only'`.
- Única capa que hace `select` a Supabase. Excepción: `lib/auth/get-current-user.ts` lee `perfiles` para la sesión.
- Seleccionan columnas explícitas, nunca `select('*')` en código final.

**Escrituras (`features/*/actions.ts`)**
- Empiezan con `'use server'`.
- Orden fijo en cada action:
  1. Validar entrada con el schema Zod del feature
  2. `requireRole()` para verificar sesión y permiso
  3. Operación en Supabase
  4. `revalidatePath()` de las rutas afectadas
  5. Regresar `ActionResult` (`{ ok: true, data }` o `{ ok: false, error }`), nunca lanzar errores crudos a la UI

**Validaciones (`features/*/schemas.ts`)**
- Un schema Zod por formulario. El mismo schema se usa en el cliente (react-hook-form) y en el servidor.
- Mensajes de error en español.

**Componentes**
- Server Components por defecto.
- `'use client'` solo en la hoja que necesita interactividad (formularios, diálogos, gráficas), nunca en layouts ni páginas completas.

**Base de datos**
- Integridad en la BD: `check`, `unique`, llaves foráneas y RLS. No confiar solo en validaciones de la app.
- Reglas de flujo (qué puede hacer quién y en qué orden) en las actions.

## Excepción: subida de comprobantes
Los archivos no pasan por el servidor de Next.js (límite de tamaño en Server Actions).
Flujo:
1. El cliente comprime la imagen.
2. Una Server Action valida el rol y genera una URL firmada de subida.
3. El cliente sube directo a Supabase Storage con esa URL.
4. Una Server Action descarga el archivo, revisa su firma de bytes, recalcula el SHA-256 y lo registra en la tabla. Si no cuadra, lo borra.

Para ver un archivo, la app nunca guarda URLs firmadas: enlaza a `/comprobantes/[id]` (route handler), que revisa sesión y RLS en cada petición y redirige a una URL firmada de 60 segundos.

## Datos y rendimiento

### Cómo viajan las peticiones
| Necesidad | Dónde | Cómo |
|---|---|---|
| Leer datos | `features/*/queries.ts` | Server Component → Supabase. La página llega armada; el navegador no hace peticiones extra. |
| Escribir datos | `features/*/actions.ts` | Server Action llamada desde el formulario. |
| Endpoints HTTP (`route.ts`) | `app/**/route.ts` | Solo cuando no hay alternativa: descargas (Excel), webhooks o integraciones externas. |
| Archivos | Navegador → Supabase Storage | Ver "Excepción: subida de comprobantes". |

- NO crear endpoints `/api/*` para que la propia app lea o escriba datos.
- Excepción, lecturas que pide el navegador después de cargar la página: la siguiente tanda del scroll infinito (`servicios/actions.ts › loadMoreExpenses`) y los comprobantes al abrir el visor (`comprobantes/actions.ts › getServiceReceipts`). Son Server Actions que solo llaman a `queries.ts` con la sesión del usuario (RLS aplica) y validan su entrada con Zod.
- NO consultar Supabase desde el navegador (`lib/supabase/client.ts`) salvo para Storage o algo que realmente lo requiera.
- La cookie de sesión es `httpOnly`: el navegador no tiene sesión de Supabase. Lo que haga desde ahí (subir comprobantes) usa URLs firmadas que genera una Server Action.

### Reglas
1. **Región**: las funciones de Vercel corren en `pdx1` (Oregon), la misma región que Supabase (`vercel.json`). No cambiarla sin mover también la base de datos.
2. **Una consulta por necesidad**: traer los datos relacionados con selects anidados de PostgREST (`servicios` con `unidades(...)`, `gastos(...)`), nunca un `select` por renglón (N+1).
3. **Sin cascadas**: si una página necesita dos lecturas independientes, se piden en paralelo con `Promise.all`, o en componentes hermanos, cada uno con su `<Suspense>`.
4. **Totales en SQL**: sumas y agrupaciones (por unidad, categoría, mes) en vistas o funciones de Postgres, no sumando en JavaScript.
5. **Índices** en toda llave foránea y en cada columna usada para filtrar u ordenar (`unidad_id`, `fecha`, `created_by`, `numero_economico`). Se crean en la misma migración que la tabla.
6. **RLS eficiente**: `(select auth.uid())` y `(select public.es_admin())` envueltos en `select` para que Postgres los evalúe una vez por consulta, no por fila.
7. **Listas paginadas**: siempre `.range()` o `limit`. Nunca traer una tabla completa a la UI. Filtros y página viven en la URL (`?q=&tipo=&pagina=`) para que se puedan compartir y el botón "atrás" funcione.
8. **Streaming**: toda lectura de sesión o datos va dentro de `<Suspense>` con un skeleton del mismo tamaño que el contenido (sin saltos de layout). `loading.tsx` solo cuando toda la ruta depende de los datos.
9. **Respuesta inmediata en formularios**: botón con estado de carga, `useOptimistic` en listas donde se agrega o edita, y `toast` de éxito o error.
10. **JavaScript mínimo**: `'use client'` solo en la hoja interactiva; librerías pesadas (Recharts, compresión de imágenes) con `next/dynamic` solo en la pantalla que las usa.
11. **Caché medida, no supuesta**: no usar `'use cache'` por defecto. Si una lectura resulta lenta, se cachea con `cacheTag` y la action que la modifica llama `updateTag`. Ojo: dentro de `'use cache'` no hay cookies, así que no hay sesión ni RLS por usuario.

### Ejemplo

```ts
// features/unidades/queries.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export async function listUnits({ search, type, page }: ListUnitsParams) {
  const supabase = await createClient();
  let query = supabase
    .from("unidades")
    .select("id, numero_economico, tipo, placas, estatus", { count: "exact" })
    .order("numero_economico")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) query = query.ilike("numero_economico", `%${search}%`);
  if (type) query = query.eq("tipo", type);

  const { data, count, error } = await query;
  if (error) throw new Error("No se pudieron cargar las unidades");
  return { units: data, total: count ?? 0 };
}
```

```ts
// features/unidades/actions.ts
"use server";
export async function createUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = unitSchema.safeParse(input);          // 1. validar
  if (!parsed.success) return fail("Revisa los datos de la unidad.");
  await requireRole("admin");                          // 2. permiso
  const supabase = await createClient();               // 3. operación
  const { data, error } = await supabase.from("unidades").insert(parsed.data).select("id").single();
  if (error?.code === "23505") return fail("Ya existe una unidad con ese número económico.");
  if (error) return fail("No se pudo guardar la unidad.");
  revalidatePath("/unidades");                         // 4. revalidar
  return ok({ id: data.id });                          // 5. resultado
}
```

```tsx
// app/(app)/unidades/page.tsx — página delgada con streaming
export default function UnitsPage({ searchParams }: PageProps<"/unidades">) {
  return (
    <>
      <PageHeader title="Unidades" />
      <Suspense fallback={<UnitsTableSkeleton />}>
        <UnitsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
```

## Seguridad
- **Toda política de lectura exige un rol** (`(select public.rol_actual()) is not null` o una función derivada). Tener sesión no basta: un usuario desactivado no ve nada.
- **Encabezados** en `next.config.ts` (CSP, HSTS, anti-iframe). Si una pantalla necesita cargar algo de otro origen, se agrega solo ese origen a la directiva que corresponda, nunca comodines (`*`, `https:`).
- `npm audit` sin altas ni críticas antes de cerrar cada sección.

## Convenciones de nombres
- Archivos y carpetas: `kebab-case` (`service-form.tsx`).
- Componentes: `PascalCase` (`ServiceForm`).
- Funciones y variables: `camelCase`, en inglés.
- Queries: `getX` / `listX` (`listServicesByUnit`). Actions: verbo + entidad (`createService`, `deactivateCategory`).
- BD: español, `snake_case`, tablas en plural.

## Cómo agregar un feature nuevo
1. Migración en `supabase/migrations/` con tablas, constraints y RLS.
2. `db push` y regenerar `database.types.ts`.
3. Crear `features/<nombre>/` con `schemas.ts`, `queries.ts`, `actions.ts` y `components/`.
4. Crear la ruta en `app/(app)/<nombre>/` con páginas delgadas.
5. Agregar el enlace en la navegación de `components/layout/` según rol.
6. Actualizar `docs/ESTADO.md`.
