# ESTADO — Administración Trailers

> Actualizar este archivo al cerrar cada sección. Es lo primero que se lee al iniciar una sesión.

## Sección actual
**Sección 0 — Fundación** · Estado: en curso · Rama: `seccion-0-fundacion`

Dividida en dos partes (ver `docs/PLAN.md`):
- **0A — Sin conexión a Supabase**: terminada (2026-10-23). Build y lint sin errores.
- **0B — Con conexión a Supabase**: bloqueada hasta que el proyecto de Supabase esté aprobado y disponible.

### Hecho en 0A
- Next.js 16.4.3 (App Router, Turbopack, Cache Components activado por defecto) + TypeScript strict + Tailwind v4.
- shadcn/ui estilo `base-nova` (usa Base UI, no Radix): button, input, label, field, card, sonner, dropdown-menu, sheet, avatar, separator. Se agregó el tamaño `touch` (48px) e `icon-touch` (44px) a Button.
- Zod 4, react-hook-form, @hookform/resolvers, @supabase/ssr, @supabase/supabase-js y Supabase CLI (devDependency).
- `.npmrc` con `legacy-peer-deps=true`: @hookform/resolvers declara peers opcionales que npm 11 no logra resolver.
- `supabase init` con registro público deshabilitado en `supabase/config.toml`.
- Migración `20261023173401_perfiles_y_roles.sql` escrita, **NO aplicada**.
- Clientes `src/lib/supabase/{client,server,proxy}.ts` y `src/proxy.ts` (en Next 16 `middleware.ts` se renombró a `proxy.ts`). Ante cualquier error redirige a `/login`. Verificado: sin modo simulado, todas las rutas responden 307 → `/login`.
- `/login` con validación Zod (sin autenticación real) y layout con navegación por rol (barra lateral en escritorio, menú lateral en celular).
- Diseño: paleta del logo de Baja Wastewater Solutions, tipografía Barlow / Barlow Semi Condensed.

### Pendientes para 0B
- `npx supabase link`, `db push` de la migración y regenerar `src/lib/supabase/database.types.ts`.
- Implementar en `src/lib/auth/get-current-user.ts` la lectura real (getClaims + tabla `perfiles`).
- Login y cierre de sesión reales (`login-form.tsx` y `user-menu.tsx` hoy muestran un toast).
- Eliminar `src/mock/`, `USE_MOCK_AUTH` / `MOCK_ROLE` (en `.env.example`, `src/lib/env.ts` y `src/proxy.ts`).
- Crear usuarios admin y capturista; dar rol admin con `raw_app_meta_data.rol = 'admin'` o actualizando `perfiles`.
- Al usar la sesión real, las páginas pasan de estáticas a dinámicas; hoy, con el mock, el rol queda fijo en el build.

## Decisiones tomadas
- Stack: Next.js + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.
- Proyecto independiente en subdominio propio.
- Roles: `admin` (Edgar y jefe) y `capturista` (solo registra montos y comprobantes).
- Comprobantes: PDF o foto de ticket (sin XML de CFDI). Montos con IVA incluido.
- Arquitectura por features definida en `docs/ARQUITECTURA.md`.
- Desarrollo directo contra Supabase en la nube (sin Docker). Proyecto `administracion-trailers-dev` aparte cuando haya datos reales.
- D1: el capturista edita sus propios registros sin aprobación; cada edición pide motivo y queda en `historial_cambios` con su línea de cambios. Solo admin elimina.
- D2: dominio final `flotilla.bajaws.com.mx`; mientras tanto, dominio gratuito de Vercel.
- D3: `unidades` con tipo `trailer` / `caja` / `camion_rabon` / `camioneta`; las cajas de los trailers son unidades individuales. En la interfaz, "Unidades".

## Decisiones pendientes
- Ninguna.

## Bloqueos
- Proyecto de Supabase en la nube pendiente de aprobación. Bloquea la Sección 0B.

## Existe actualmente
- Tablas: — (`perfiles` escrita en migración, sin aplicar)
- Rutas: `/login`, `/` (Inicio), `/unidades`, `/servicios`, `/dashboard`, `/admin/usuarios` (solo admin, placeholders), `/servicios/nuevo` (ambos roles, placeholder)
- Código organizado según `docs/ARQUITECTURA.md`: `features/auth` (schemas, login-form, require-role), `components/layout`, `components/shared`, `mock/`.
- Buckets: —

## Historial de secciones
<!-- Plantilla para cada cierre:
### Sección N — Nombre (cerrada AAAA-MM-DD)
- Hecho:
- Tablas / migraciones nuevas:
- Rutas nuevas:
- Pendientes que pasan a la siguiente sección:
-->
