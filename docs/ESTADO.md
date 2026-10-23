# ESTADO — Administración Trailers

> Actualizar este archivo al cerrar cada sección. Es lo primero que se lee al iniciar una sesión.

## Sección actual
**Sección 1 — Catálogos** · Estado: plan pendiente de aprobación · Rama: `seccion-1-catalogos`

- Reglas de "Datos y rendimiento" agregadas a `docs/ARQUITECTURA.md` y `vercel.json` con región `pdx1` (Oregon, igual que Supabase).

## Decisiones tomadas
- Stack: Next.js + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.
- Proyecto independiente en subdominio propio.
- Roles: `admin` (Edgar y jefe) y `capturista` (solo registra montos y comprobantes).
- Comprobantes: PDF o foto de ticket (sin XML de CFDI). Montos con IVA incluido.
- Arquitectura por features definida en `docs/ARQUITECTURA.md`.
- Desarrollo directo contra Supabase en la nube (sin Docker). Proyecto `administracion-trailers-dev` aparte cuando haya datos reales.
- D1: el capturista edita sus propios registros sin aprobación; cada edición pide motivo y queda en `historial_cambios` con su línea de cambios. Solo admin elimina.
- D2: dominio final `flotilla.bajaws.com.mx`; mientras tanto, dominio gratuito de Vercel.
- D3: `unidades` con tipo `trailer` (T-) / `caja` (R-) / `camion_rabon` (F-) / `pipa` (P-) / `camioneta` (C-), operación `local` / `foraneo`, chofer opcional (catálogo `choferes`) y longitud en pies para cajas. Las cajas son unidades individuales, sin relación con el trailer que las jala. Detalle en `docs/PLAN.md`.

## Decisiones pendientes
- Ninguna.

## Bloqueos
- Ninguno.

## Entorno
- Supabase: proyecto "Administracion de trailers", ref `judgscglqwdkxnhixopv`, región West US (Oregon). Enlazado con `npx supabase link`.
- La cuenta de Supabase tiene otros proyectos (BAJAWS, Soporte): no tocarlos.
- Variables: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`.
- Registro público deshabilitado en Supabase Auth (verificado `disable_signup=true`).
- Usuarios: `sistemas@bajaws.com.mx` (admin) y `capturista@bajaws.com.mx` (capturista). Se crean en Authentication → Users con "Auto Confirm User"; el rol admin se asigna actualizando `perfiles`.
- Windows: la política de ejecución de PowerShell del usuario es `RemoteSigned` (para `npm` / `npx`). El CLI de Supabase detecta a Claude Code como agente: los comandos interactivos (`login`, `link`) se ejecutan en una ventana de CMD aparte con `--agent no`.

## Existe actualmente
- Tablas: `perfiles` (RLS: cada usuario lee el suyo; admin lee y edita todos; nadie inserta ni borra directamente).
- Enums: `rol_usuario`.
- Funciones: `es_admin()`, `rol_actual()`, `actualizar_updated_at()`, `crear_perfil_nuevo_usuario()` (trigger `al_crear_usuario` en `auth.users`).
- Rutas: `/login`, `/` (Inicio), `/unidades`, `/servicios`, `/dashboard`, `/admin/usuarios` (solo admin, placeholders), `/servicios/nuevo` (ambos roles, placeholder).
- Código: `features/auth` (schemas, actions `signIn` / `signOut`, login-form, require-role), `components/layout`, `components/shared`, `lib/auth/get-current-user.ts`, `lib/action-result.ts`.
- Buckets: —

## Historial de secciones

### Sección 0 — Fundación (cerrada 2026-10-23)
- Hecho:
  - Next.js 16.4.3 (App Router, Turbopack, Cache Components) + TypeScript strict + Tailwind v4.
  - shadcn/ui estilo `base-nova` (Base UI, no Radix): button, input, label, field, card, sonner, dropdown-menu, sheet, avatar, separator. Tamaños `touch` (48px) e `icon-touch` (44px) en Button.
  - Zod 4, react-hook-form, @hookform/resolvers, @supabase/ssr, @supabase/supabase-js, Supabase CLI. `.npmrc` con `legacy-peer-deps=true` por peers opcionales de @hookform/resolvers.
  - `src/proxy.ts` (en Next 16 `middleware` se renombró a `proxy`): refresca la sesión con `getClaims()` y manda a `/login` ante cualquier error.
  - Login y cierre de sesión con Server Actions; rol leído de `perfiles`; usuarios desactivados no pueden entrar.
  - Layout con navegación por rol (barra lateral en escritorio, menú lateral en celular). Diseño con la paleta del logo de Baja Wastewater Solutions y tipografía Barlow.
  - Código reorganizado según `docs/ARQUITECTURA.md`.
- Tablas / migraciones nuevas: `20261023173401_perfiles_y_roles.sql` (enum `rol_usuario`, tabla `perfiles`, funciones de RLS, trigger de alta de perfil).
- Rutas nuevas: las de "Existe actualmente".
- Verificado: build y lint sin errores; sin sesión todas las rutas → 307 `/login`; RLS de `perfiles` probado con admin, capturista y anon; login con ambos usuarios probado en el navegador.
- Pendientes que pasan a la siguiente sección:
  - Avisos de `supabase db advisors` (aceptados): `es_admin()` y `rol_actual()` son llamables por RPC (intencional, solo devuelven el rol propio); dos políticas SELECT en `perfiles` (rendimiento menor; se pueden unir en una migración futura).