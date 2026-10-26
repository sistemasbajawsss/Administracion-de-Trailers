# ESTADO — Administración Trailers

> Actualizar este archivo al cerrar cada sección. Es lo primero que se lee al iniciar una sesión.

## Sección actual
**Sección 2.5 — Seguridad** · Estado: en curso · Rama: `seccion-2-5-seguridad`. Después sigue la Sección 3 — Comprobantes.

## Decisiones tomadas
- Stack: Next.js + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.
- Proyecto independiente en subdominio propio.
- Roles: `admin` (Edgar y jefe), `capturista` (registra y corrige sus propios servicios) y `gerente` (solo lectura de todo, D4).
- Comprobantes: PDF o foto de ticket (sin XML de CFDI). Montos con IVA incluido.
- Arquitectura por features definida en `docs/ARQUITECTURA.md`.
- Desarrollo directo contra Supabase en la nube (sin Docker). Proyecto `administracion-trailers-dev` aparte cuando haya datos reales.
- D1: el capturista edita sus propios registros sin aprobación; cada edición pide motivo y queda en `historial_cambios` con su línea de cambios. Solo admin elimina.
- D2: dominio final `flotilla.bajaws.com.mx`; mientras tanto, dominio gratuito de Vercel.
- D3: `unidades` con tipo `trailer` (T-) / `caja` (R-) / `camion_rabon` (F-) / `pipa` (P-) / `camioneta` (C-), operación `local` / `foraneo`, chofer opcional (catálogo `choferes`) y longitud en pies para cajas. Las cajas son unidades individuales, sin relación con el trailer que las jala. Detalle en `docs/PLAN.md`.
- D4: rol `gerente` de solo lectura (ve unidades, servicios, gastos, historial y reportes de todos; no escribe nada).
- D5: dar de baja una unidad es reversible; eliminarla por completo (con su historial) exige escribir `ELIMINAR REGISTRO` y deja nota en `bitacora_eliminaciones`. Los servicios eliminados se pueden restaurar o eliminar para siempre (también con `ELIMINAR REGISTRO`) desde Servicios › Eliminados.
- D6: sin verificación en dos pasos (se implementó y el usuario decidió quitarla); todos entran solo con contraseña.

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
- No correr `npm run build` con `npm run dev` encendido: ambos escriben en `.next` y las Server Actions nuevas fallan en dev. Con el servidor encendido se verifica con `npx tsc --noEmit` y `npm run lint`. El proyecto está en OneDrive, que llegó a bloquear archivos de `.next` (EPERM); conviene excluir `.next` y `node_modules` de la sincronización.
- Un valor nuevo de enum va en su propia migración (no se puede usar en la misma transacción); para aplicar solo esa, se aparta temporalmente la siguiente migración.
- SQL de prueba contra la nube: `npx supabase db query --linked -f <archivo>` (vía Management API). Los ensayos de migraciones van dentro de `begin; … rollback;`.

## Seguridad
- **Lecturas con rol:** toda política de lectura exige tener rol (`rol_actual()` no nulo). Un usuario desactivado con token vigente ve 0 registros y no puede escribir, ni por API.
- **Cookies de sesión** `httpOnly`, `secure` en producción y `sameSite=lax` (`lib/supabase/cookie-options.ts`): ningún script del navegador lee el token.
- **Encabezados** en `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara solo para la app), sin `X-Powered-By`.
- **Ajustes del dashboard de Supabase** (no son migraciones; los hace el usuario):
  - [ ] Authentication → Attack Protection: protección contra contraseñas filtradas.
  - [ ] Authentication → Policies / Passwords: mínimo 12 caracteres con minúsculas, mayúsculas, números y símbolos.
  - [ ] Authentication → Sessions: cierre por inactividad (8 h).
  - [ ] Database → Settings: "Enforce SSL on incoming connections".
- **Dominio (cuando se conecte `flotilla.bajaws.com.mx`):** Cloudflare con SSL en modo **Full (strict)**, nunca "Flexible".

## Existe actualmente
- Tablas:
  - `perfiles` (RLS: cada usuario lee el suyo; admin lee y edita todos; nadie inserta ni borra directamente).
  - `choferes`, `unidades`, `categorias`, `proveedores` (RLS: capturista lee activos / unidades que no están de baja; admin y gerente ven todo; solo admin crea y edita; admin y capturista crean proveedores; nadie borra salvo `eliminar_unidad()`).
  - `unidades.numero_orden`: columna generada con el número del económico, para ordenar `T-2` antes de `T-10`.
  - `categorias.requiere_concepto`: marca de "Otros (especificar)"; el gasto debe llevar concepto.
  - `servicios`, `gastos` (RLS: capturista ve y edita los suyos; admin todo; gerente solo lee todo; solo admin elimina). Escritura por funciones `registrar_servicio()`, `actualizar_servicio()` (motivo obligatorio) y `eliminar_servicio()` (motivo obligatorio).
  - `historial_cambios` (lo llenan triggers; motivo obligatorio en todo cambio que no sea alta; nadie lo edita; solo se borra con `eliminar_unidad()` o `eliminar_servicio_definitivo()`).
  - `bitacora_eliminaciones` (unidades y servicios eliminados para siempre; solo admin la lee; nadie la edita).
  - Vistas `servicios_resumen` (total, número de gastos, marca "editado") y `totales_por_unidad`, ambas `security_invoker`.
- Enums: `rol_usuario` (admin, capturista, gerente), `tipo_unidad`, `operacion_unidad`, `estatus_unidad`, `accion_historial`.
- Funciones: `es_admin()`, `rol_actual()`, `puede_ver_todo()`, `puede_capturar()`, `actualizar_updated_at()`, `crear_perfil_nuevo_usuario()` (trigger `al_crear_usuario` en `auth.users`), `prefijo_tipo_unidad()`, `normalizar_unidad()`, `preparar_servicio()`, `preparar_gasto()`, `registrar_historial()` (triggers); `registrar_servicio()`, `actualizar_servicio()`, `eliminar_servicio()`, `restaurar_servicio()`, `eliminar_servicio_definitivo()`, `eliminar_unidad()` (las llama la app).
- Datos: 35 unidades (11 locales, 22 foráneas, 2 camionetas), 9 choferes (nombres sin acentos), 17 categorías de gasto. La carga de la flotilla se hizo una sola vez por SQL, no está en migraciones. Servicios de prueba capturados por el usuario.
- Rutas:
  - Todos: `/login`, `/` (Inicio), `/servicios` (capturista: "Mis servicios"), `/servicios/[id]`.
  - Admin y capturista: `/servicios/nuevo` (`?unidad=` preselecciona), `/servicios/[id]/editar`.
  - Admin y gerente: `/unidades`, `/unidades/[id]` (ficha con total invertido), `/dashboard` (placeholder).
  - Solo admin: `/unidades/nueva`, `/unidades/[id]/editar`, `/servicios/eliminados`, `/admin/catalogos`, `/admin/usuarios` (placeholder).
- Código: `features/auth`, `features/unidades` (incluye `delete-unit-zone`), `features/catalogos`, `features/servicios` (formulario con selector de unidad, lista, detalle tipo ticket, línea de cambios, eliminar / restaurar / eliminar para siempre), `components/layout` (incluye `navigation-tracker`), `components/shared` (page-header, empty-state, list-pagination, back-button, go-back, typed-confirmation-dialog), `lib/auth` (`requireRole` acepta uno o varios roles; `CAPTURE_ROLES`, `VIEW_ALL_ROLES`), `lib/utils/format.ts` (dinero en centavos, fechas es-MX, hoy en Tijuana), `lib/action-result.ts`, `lib/env.ts`.
- Buckets: —

## Historial de secciones

### Sección 2 — Servicios y gastos (cerrada 2026-10-23)
- Hecho:
  - Captura mobile-first: selector de unidad en hoja con botones agrupados (Locales / Foráneos / Camionetas) y buscador; km oculto en cajas; proveedor opcional con alta rápida; renglones de gasto con total en vivo (centavos enteros); "Otros (especificar)" exige concepto.
  - Lista de servicios con filtros por unidad y fechas (en la URL), detalle tipo ticket, edición con motivo obligatorio, marca "Editado" y línea de cambios (qué campo, de qué a qué, quién, cuándo, por qué).
  - Ficha de unidad con total invertido, número de servicios, último servicio e historial.
  - Rol `gerente` de solo lectura (D4), en RLS y servidor.
  - Eliminar servicio (admin, motivo) → Servicios › Eliminados: restaurar tal cual o eliminar para siempre con `ELIMINAR REGISTRO`. Eliminar unidad completa desde su ficha con `ELIMINAR REGISTRO` (D5). Bitácora de eliminaciones.
  - "Volver" y "Cancelar" regresan a la pantalla de origen (con respaldo a la lista si la página se abrió directo).
  - Corregidos: error `Date.now()` en prerender (lecturas de Supabase con `connection()`), cierre de sesión con alerta falsa y login con datos escritos, `usePathname` fuera de Suspense.
- Tablas / migraciones nuevas: `20261023224341_servicios_y_gastos.sql`, `20261023231027_rol_gerente.sql`, `20261023231030_permisos_gerente.sql`, `20261023232046_eliminar_unidad.sql`, `20261023233026_restaurar_servicio.sql`, `20261023233900_eliminar_servicio_definitivo.sql`.
- Rutas nuevas: `/servicios/[id]`, `/servicios/[id]/editar`, `/servicios/eliminados`, `/unidades/[id]`; `/servicios` y `/servicios/nuevo` dejaron de ser placeholders.
- Verificado: build y lint sin errores; tipos regenerados; cada migración ensayada antes de aplicarla en transacciones sin commit con admin, capturista y gerente (incluye intentos por API directa sin motivo, sin permiso y con frase incorrecta); pantallas revisadas por el usuario.
- Pendientes que pasan a la siguiente sección:
  - Crear el usuario gerente (lo da de alta el usuario en Supabase; el rol se asigna en `perfiles`) y probar esa vista.
  - Avisos de `supabase db advisors` aceptados: funciones `security definer` llamables por usuarios con sesión (`es_admin`, `rol_actual`, `puede_ver_todo`, `puede_capturar`, `eliminar_unidad`, `restaurar_servicio`, `eliminar_servicio_definitivo`); las de acción revisan rol y confirmación adentro. Siguen: dos políticas SELECT en `perfiles` y la protección contra contraseñas filtradas (requiere plan Pro).
  - Inicio del admin y gerente todavía sin resumen: llega con la Sección 4.

### Sección 1 — Catálogos (cerrada 2026-10-23)
- Hecho:
  - Unidades: lista separada en Locales / Foráneos / Camionetas con conteos, búsqueda por número económico, filtros por tipo, estatus y "sin chofer" (en la URL), paginación de 25, alta y edición solo admin.
  - Catálogos (`/admin/catalogos`): choferes, categorías y proveedores con alta, edición y activar / desactivar.
  - Componentes shadcn agregados: table, dialog, alert-dialog, select, badge, textarea, tabs, skeleton, switch, pagination. En dialog y sheet se tradujo "Close" → "Cerrar".
  - Reglas de "Datos y rendimiento" en `docs/ARQUITECTURA.md`; `vercel.json` con región `pdx1`.
- Tablas / migraciones nuevas: `20261023195238_catalogos.sql`, `20261023200156_unidades_orden_numerico.sql`, `20261023223053_categorias_ampliadas.sql`.
- Rutas nuevas: `/unidades/nueva`, `/unidades/[id]/editar`, `/admin/catalogos`; `/unidades` dejó de ser placeholder.
- Verificado: build y lint sin errores; tipos regenerados; RLS de las cuatro tablas probado con admin y capturista (incluye intentos de escritura rechazados); pantallas revisadas por el usuario.
- Pendientes que pasan a la siguiente sección:
  - El capturista no tiene pantalla de Unidades: verá las unidades al elegirlas en el formulario de servicio.
  - "Otros (especificar)" exige concepto en el gasto (anotado en la Sección 2 de `docs/PLAN.md`).
  - Aviso `auth_leaked_password_protection` de `supabase db advisors`: activar la protección contra contraseñas filtradas en Supabase Auth (requiere plan Pro; evaluar).

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