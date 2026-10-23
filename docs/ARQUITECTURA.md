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
│   │   ├── unidades/            # Nombre final según decisión D3
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
│   └── shared/                  # Reutilizables: MoneyText, DateText, EmptyState, ConfirmDialog
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts            # Cliente para Server Components y Actions
│   │   ├── client.ts            # Cliente para navegador (solo donde sea indispensable)
│   │   ├── middleware.ts        # Refresco de sesión
│   │   └── database.types.ts    # GENERADO. Nunca editar a mano
│   ├── auth/                    # getCurrentUser(), requireRole()
│   ├── env.ts                   # Variables de entorno validadas con Zod
│   ├── action-result.ts         # Tipo de respuesta común de las actions
│   └── utils/                   # formatMoney, formatDate, cn
│
├── mock/                        # Datos de ejemplo temporales (se borra al conectar BD)
└── middleware.ts                # Protección de rutas

supabase/
├── migrations/                  # Una migración por cambio, nunca editar aplicadas
└── seed.sql                     # Datos iniciales (categorías)
```

## Reglas de dependencia
La dirección permitida es: `app → features → components/shared → lib`.

- `app/` importa de `features/`, `components/` y `lib/`. Nunca al revés.
- Un feature **no importa internals de otro feature**. Si dos features necesitan lo mismo,
  se mueve a `components/shared/` o `lib/`.
- `lib/` no importa de `features/` ni de `app/`.
- `components/ui/` no conoce nada del negocio.

## Responsabilidades

**Páginas (`app/**/page.tsx`)**
- Delgadas: verifican rol si aplica, llaman a `queries.ts` y renderizan componentes del feature.
- Sin lógica de negocio ni llamadas directas a Supabase.

**Lecturas (`features/*/queries.ts`)**
- Empiezan con `import 'server-only'`.
- Única capa que hace `select` a Supabase.
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
4. Una Server Action registra el comprobante en la tabla.

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
