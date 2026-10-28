# ESTADO — Administración Trailers

> Actualizar este archivo al cerrar cada sección. Es lo primero que se lee al iniciar una sesión.

## Sección actual
**Salida a producción (2026-10-28).** Cerradas: 0, 1, 2, 2.5, 3 (con 3B), 4, 5A, 5B y 5C. La app ya está publicada en Vercel (plan Hobby) con su dirección `.vercel.app`; variables, Site URL / Redirect URLs de Supabase y freno de login hechos.

### Próximos pasos para retomar
1. **Limpieza:** borrar los 700 servicios `[PRUEBA]` con sus gastos, historial y PDF en Storage (~970 MB) antes de usar datos reales.
2. **Arranque:** crear el gerente y los capturistas reales en Admin → Usuarios.
3. **Dominio (al final, lo pidió el usuario):** `flotilla.bajaws.com.mx` en Cloudflare apuntando a Vercel, SSL en Full (strict); Claude pasa el registro DNS exacto. Después, actualizar Site URL / Redirect URLs de Supabase con el dominio.
4. **Opcional:** mover el proyecto fuera de OneDrive (bloquea `.next` y rompe el build con EPERM).
5. **Extras después de arrancar** (por decidir): mantenimientos preventivos con alertas; bitácora de catálogos y usuarios.

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
- D7: hasta 10 comprobantes por servicio; duplicado en otro servicio se avisa y se puede subir; agregar y quitar como editar (quitar con motivo); el gerente solo ve.
- Categorías: todas aplican a todos los tipos de unidad (se propuso filtrarlas por tipo y el usuario lo descartó).
- Fotos: se reducen en el navegador a 2000 px / JPEG 82 % (el usuario lo confirmó así).
- D8 (5B): gastos en pesos o en dólares por renglón; en dólares la BD calcula `monto` (MXN) = `round(monto_usd × tipo_cambio, 2)`. Tipo de cambio sugerido: FIX publicado en el DOF el día hábil anterior a la fecha del servicio (Banxico SF60653), editable.
- D9 (5C): la sesión termina al cerrar la pestaña **y** al cerrar el navegador (el usuario eligió ambas). Abrir la app en otra pestaña pide entrar de nuevo y cierra la sesión de las demás.
- Hosting: Vercel plan **Hobby** (el usuario no pagará Pro); 1 regla de rate limit por proyecto (usada en `/login`). El dominio se conecta al final.
- Reportes: admin y gerente; PDF con "Imprimir o guardar PDF" del navegador (sin servidor, vertical u horizontal) y Excel con el detalle y resúmenes. Inicio de admin y gerente = pendientes (servicios sin factura, unidades en taller); el capturista tiene su propio Inicio.

## Decisiones pendientes
- Ninguna.

## Bloqueos
- Ninguno.

## Entorno
- Supabase: proyecto "Administracion de trailers", ref `judgscglqwdkxnhixopv`, región West US (Oregon). Enlazado con `npx supabase link`.
- La cuenta de Supabase tiene otros proyectos (BAJAWS, Soporte): no tocarlos.
- Variables: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`; `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, gestión de usuarios; validada contra la Auth Admin API) también en `.env.local` y falta ponerla en Vercel.
- Registro público deshabilitado en Supabase Auth (verificado `disable_signup=true`).
- Usuarios: `sistemas@bajaws.com.mx` (admin) y `capturista@bajaws.com.mx` (capturista). Desde la Sección 5A se crean en Admin → Usuarios (contraseña inicial puesta por el admin, sin correo de invitación).
- Windows: la política de ejecución de PowerShell del usuario es `RemoteSigned` (para `npm` / `npx`). El CLI de Supabase detecta a Claude Code como agente: los comandos interactivos (`login`, `link`) se ejecutan en una ventana de CMD aparte con `--agent no`.
- No correr `npm run build` con `npm run dev` encendido: ambos escriben en `.next` y las Server Actions nuevas fallan en dev. Con el servidor encendido se verifica con `npx tsc --noEmit` y `npm run lint`; el build completo se corre en un worktree aparte (`git worktree add` en la carpeta temporal + `npm ci`, un `node_modules` enlazado no sirve con Turbopack). Para saber si el dev está encendido, revisar el puerto 3000 desde PowerShell (`netstat` en Git Bash no lo detectó). Si dev muestra "Jest worker encountered … child process exceptions", detenerlo, borrar `.next` y volver a levantarlo. El proyecto está en OneDrive, que llegó a bloquear archivos de `.next` (EPERM); conviene excluir `.next` y `node_modules` de la sincronización.
- Un valor nuevo de enum va en su propia migración (no se puede usar en la misma transacción); para aplicar solo esa, se aparta temporalmente la siguiente migración.
- SQL de prueba contra la nube: `npx supabase db query --linked -f <archivo>` (vía Management API). Los ensayos de migraciones van dentro de `begin; … rollback;`.

## Seguridad
- **Lecturas con rol:** toda política de lectura exige tener rol (`rol_actual()` no nulo). Un usuario desactivado con token vigente ve 0 registros y no puede escribir, ni por API.
- **Cookies de sesión** `httpOnly`, `secure` en producción y `sameSite=lax` (`lib/supabase/cookie-options.ts`): ningún script del navegador lee el token.
- **Encabezados** en `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara solo para la app), sin `X-Powered-By`.
- **Sesión** (D9): cookies sin vencimiento (`asSessionCookie` en `lib/supabase/cookie-options.ts`, porque `@supabase/ssr` siempre pone 400 días) y marca por pestaña en `sessionStorage` (`TabSessionScript` oculta la app antes de pintarla y `TabSessionGuard` cierra la sesión si la pestaña no tiene marca).
- **Freno de login:** regla del Firewall de Vercel "Freno de login": `POST /login`, 10 por IP cada 60 s → 429. Probada por el usuario.
- **Permisos de `anon`:** ninguno en `public` (tablas, vistas, funciones, secuencias), y los permisos de fábrica de `postgres` ya no se los dan a lo nuevo (el EXECUTE de fábrica para PUBLIC se quitó con el ajuste global). `authenticated` sin TRUNCATE / REFERENCES / TRIGGER.
- **Ajustes del dashboard de Supabase** (no son migraciones; los hizo el usuario el 2026-10-28):
  - [x] Contraseñas filtradas (Sign In / Providers → Email). Reconfirmar con "Rerun linter" en el Security Advisor.
  - [x] Contraseñas: mínimo 12 con minúsculas, mayúsculas, números y símbolos.
  - [x] Sessions: cierre por inactividad 8 h.
  - [x] Enforce SSL (verificado: la conexión del CLI va cifrada).
  - [x] Spend Cap activado.
  - [ ] Opcional: Auth DB connections en porcentaje (solo importa si se sube el tamaño del servidor).
- **Advisors revisados (2026-10-28):**
  - Security: 11 avisos `authenticated_security_definer_function_executable`, todos intencionales: `es_admin`, `rol_actual`, `puede_capturar`, `puede_ver_todo` (las usan las políticas y solo responden sobre el propio usuario); `listar_usuarios`, `restaurar_servicio`, `eliminar_unidad`, `eliminar_servicio_definitivo` (revisan admin por dentro); `buscar_comprobante_duplicado` (exige poder capturar; D7); `nombre_usuario` y `archivo_comprobante_en_uso` (requieren un id o ruta exacta). No quitarles EXECUTE: rompe RLS.
  - Performance: las dos políticas de lectura de `perfiles` se unieron en una. Los 9 `created_by` sin índice se dejan (solo cuentan al borrar un usuario de Auth, y aquí se desactivan) y los "índices sin usar" también (tablas chicas; con volumen sí se usan, se vio en la prueba de carga).
- **Dominio (cuando se conecte `flotilla.bajaws.com.mx`):** Cloudflare con SSL en modo **Full (strict)**, nunca "Flexible".

## Existe actualmente
- Tablas:
  - `perfiles` (RLS: cada usuario lee el suyo; admin lee y edita todos; nadie inserta ni borra directamente; trigger `proteger_perfil`: nadie se quita su propio rol de admin ni se desactiva y siempre queda un admin activo).
  - `choferes`, `unidades`, `categorias`, `proveedores` (RLS: leer exige tener rol; capturista lee activos / unidades que no están de baja; admin y gerente ven todo; solo admin crea y edita; admin y capturista crean proveedores; nadie borra salvo `eliminar_unidad()`).
  - `unidades.numero_orden`: columna generada con el número del económico, para ordenar `T-2` antes de `T-10`.
  - `categorias.requiere_concepto`: marca de "Otros (especificar)"; el gasto debe llevar concepto.
  - `servicios`, `gastos` (RLS: capturista ve y edita los suyos; admin todo; gerente solo lee todo; solo admin elimina). Escritura por funciones `registrar_servicio()`, `actualizar_servicio()` (motivo obligatorio) y `eliminar_servicio()` (motivo obligatorio).
  - `historial_cambios` (lo llenan triggers; motivo obligatorio en todo cambio que no sea alta; nadie lo edita; solo se borra con `eliminar_unidad()` o `eliminar_servicio_definitivo()`).
  - `bitacora_eliminaciones` (unidades y servicios eliminados para siempre; solo admin la lee; nadie la edita).
  - `comprobantes` (D7; RLS: ve quien ve el servicio, agrega y quita quien lo puede editar; sin update; hasta 10 por servicio; `unique (servicio_id, hash_sha256)`). Entran en el historial y en la copia de un servicio eliminado.
  - Vistas `servicios_resumen` (total, número de gastos, marca "editado", `num_comprobantes`, `autor_nombre`), `totales_por_unidad` y `gastos_detalle` (un renglón por gasto con fecha, unidad, categoría, número de comprobantes y `tiene_pdf`), todas `security_invoker`.
- `gastos.moneda` (`MXN` / `USD`), `monto_usd` y `tipo_cambio` (5B; check: en MXN van nulos, en USD ambos > 0 y TC ≤ 100). `preparar_gasto()` recalcula `monto` en dólares aunque llegue otro por API.
- Enums: `moneda` (MXN, USD), `rol_usuario` (admin, capturista, gerente), `tipo_unidad`, `operacion_unidad`, `estatus_unidad`, `accion_historial`.
- Funciones: `es_admin()`, `rol_actual()`, `puede_ver_todo()`, `puede_capturar()`, `actualizar_updated_at()`, `crear_perfil_nuevo_usuario()` (trigger `al_crear_usuario` en `auth.users`), `prefijo_tipo_unidad()`, `normalizar_unidad()`, `preparar_servicio()`, `preparar_gasto()`, `registrar_historial()` (triggers); `registrar_servicio()`, `actualizar_servicio()`, `eliminar_servicio()`, `restaurar_servicio()`, `eliminar_servicio_definitivo()` y `eliminar_unidad()` (ambas regresan las rutas de archivos a borrar), `quitar_comprobante()`, `buscar_comprobante_duplicado()`, `listar_gastos()`, `resumen_gastos()`, `reporte_gastos()` y `exportar_gastos()` (estas dos solo admin y gerente) (las llama la app); `nombre_usuario()` (nombre de quien capturó, para el gerente); `listar_usuarios()` (solo admin, con correo y último acceso); `gastos_para_reporte()` y `validar_reporte()` (apoyo de reportes); `preparar_comprobante()` (trigger), `archivo_comprobante_en_uso()` y `patron_busqueda()` (apoyo de políticas y búsquedas).
- Datos: 35 unidades (11 locales, 22 foráneas, 2 camionetas), 9 choferes (nombres sin acentos), 17 categorías de gasto. La carga de la flotilla se hizo una sola vez por SQL, no está en migraciones. Servicios de prueba capturados por el usuario, más **700 servicios `[PRUEBA] …`** (20 por unidad, 1,401 gastos, cada uno con una copia de `Informacion_Cita.pdf`, ~970 MB en Storage). Se borran antes de usar datos reales (servicios, historial y archivos).
- Rutas:
  - Todos con sesión: `/comprobantes/[id]` (route handler: revisa sesión y RLS y redirige a una URL firmada de 60 s; `?descargar=1`).
  - Todos: `/login`, `/` (Inicio), `/servicios` (capturista: "Mis servicios"), `/servicios/[id]`.
  - Admin y capturista: `/servicios/nuevo` (`?unidad=` preselecciona), `/servicios/[id]/editar`.
  - Admin y gerente: `/unidades`, `/unidades/[id]` (ficha con total invertido y lista de gastos), `/dashboard` (Reportes), `/dashboard/exportar` (Excel, route handler).
  - Solo admin: `/unidades/nueva`, `/unidades/[id]/editar`, `/servicios/eliminados`, `/admin/catalogos`, `/admin/usuarios`.
- Código: `features/auth`, `features/unidades` (incluye `delete-unit-zone`), `features/catalogos`, `features/servicios` (formulario con selector de unidad, lista, detalle tipo ticket, línea de cambios, eliminar / restaurar / eliminar para siempre), `components/layout` (incluye `navigation-tracker`), `components/shared` (page-header, empty-state, list-pagination, back-button, go-back, typed-confirmation-dialog), `lib/auth` (`requireRole` acepta uno o varios roles; `CAPTURE_ROLES`, `VIEW_ALL_ROLES`), `lib/utils/format.ts` (dinero en centavos, fechas es-MX, hoy en Tijuana), `lib/action-result.ts`, `lib/env.ts`, `lib/supabase/cookie-options.ts` (cookies httpOnly), `lib/supabase/storage.ts` (bucket y borrado de archivos), `lib/utils/files.ts` (firma de bytes, reducir fotos, SHA-256). `features/comprobantes` (selector con cámara, subida, galería, visor en modal con pdf.js, quitar con motivo). `features/servicios` ahora tiene la lista de gastos (`expense-list`, `expense-feed` con scroll infinito) en lugar de la lista paginada de servicios. Encabezados de seguridad en `next.config.ts`. Dependencia nueva: `pdfjs-dist` 6.4.299 (se carga solo al abrir un PDF). `features/dashboard` (filtros, cifras clave, gráfica por mes en Recharts y su versión HTML para imprimir, rankings, grupos, Excel con `write-excel-file`). `components/shared/home-panel` (tarjetas de Inicio). `features/usuarios` (lista, alta, editar, desactivar, restablecer contraseña) y `lib/supabase/admin.ts` (cliente service_role, `server-only`). Dependencias nuevas: `recharts` 3.10.1 (solo en Reportes), `write-excel-file` 4.1.1 (solo en el servidor).
- 5B: `lib/banxico.ts` (tipo de cambio FIX, solo servidor, `BANXICO_TOKEN`), componentes `toggle` y `toggle-group` de shadcn, cifra "Pagado en dólares" en Reportes, columnas moneda / USD / tipo de cambio en el Excel.
- 5C: `listar_gastos`, `resumen_gastos` y `gastos_para_reporte` en plpgsql con SQL dinámico (solo los filtros que vienen, valores por parámetro; `filtro_gastos()` arma las condiciones); `gastos_para_reporte` trae `moneda`, `monto_usd` y `tipo_cambio`; `reporte_gastos` con `work_mem` 32MB. Lectura de `gastos` y `comprobantes`: `puede_ver_todo()` primero. `perfiles: leer` (una sola política). `features/auth/components/tab-session-script` y `tab-session-guard`. `body { overflow-wrap: anywhere }` en `globals.css` (regla en CLAUDE.md › UI).
- Buckets: `comprobantes` (privado; PDF, JPEG, PNG, WebP; 10 MB; ruta `servicio_id/comprobante_id.ext`; políticas en `storage.objects`).

## Historial de secciones

### Sección 5C — Optimización, seguridad y escalabilidad (cerrada 2026-10-28)
- Hecho:
  - Seguridad: sin permisos para `anon` en `public` y permisos de fábrica cerrados; sin TRUNCATE para `authenticated`; freno de login en el Firewall de Vercel (Hobby, sin costo) con mensaje claro en el login; ajustes de Supabase (contraseñas filtradas, política de 12, inactividad 8 h, Enforce SSL, Spend Cap); Advisors revisados.
  - Sesión (D9): se cierra al cerrar la pestaña y al cerrar el navegador, sin que se alcance a ver la app.
  - Prueba de carga: ~35,700 servicios, ~71,400 gastos, ~21,800 comprobantes y ~108 mil renglones de historial en transacción sin commit. Antes → después (admin): lista de Servicios 1,150 → 13 ms; búsqueda 2,294 → 355 ms; ficha de unidad 46 → 3 ms; Reportes 12 meses 854 → 467 ms; 3 años 1,976 → 1,113 ms (se acepta: el escenario equivale a casi un servicio diario por unidad); Excel 12 meses 446 → 200 ms; Inicio < 130 ms. Resultados idénticos antes y después en 25 comparaciones (admin y capturista).
  - UI: textos largos sin espacios ya no crean scroll lateral (regla global y en CLAUDE.md).
- Tablas / migraciones nuevas: `20261028170624_revocar_permisos_anon.sql`, `20261028172104_consultas_con_volumen.sql`, `20261028181259_perfiles_una_politica_de_lectura.sql`.
- Rutas nuevas: ninguna.
- Verificado: build limpio (worktree aparte con `npm ci`), lint, `tsc`, `npm audit --omit=dev` (0); tipos regenerados; ensayos en transacción sin commit: 18 casos de permisos (anon, admin y capturista), 4 de `perfiles`, regresión de los 17 casos de la 5B. El usuario probó el freno de login y el cierre de sesión sin parpadeo.
- Pendientes: reconfirmar en el Security Advisor que ya no salga "Leaked Password Protection Disabled"; opcional Auth DB connections en porcentaje.

### Sección 5B — Facturas en dólares (cerrada 2026-10-28)
- Hecho: cada renglón de gasto en pesos o dólares; en dólares se escribe cantidad y tipo de cambio (4 decimales) y la BD calcula los pesos. Sugerencia del tipo de cambio FIX de Banxico (SF60653, publicado en el DOF el día hábil anterior); otro renglón en dólares del mismo servicio reutiliza el ya escrito; sin token o sin respuesta se escribe a mano. Detalle, lista de gastos y línea de cambios muestran USD y tipo de cambio; Reportes muestra "Pagado en dólares"; Excel con moneda, USD y tipo de cambio.
- Tablas / migraciones nuevas: `20261027234242_gastos_en_dolares.sql`, `20261028162451_reporte_dolares.sql`.
- Rutas nuevas: ninguna.
- Verificado: build (worktree aparte), lint, `tsc`, tipos al día; 17 casos en transacción sin commit con admin: monto exacto al centavo en alta, update e insert directos por API (se ignora el monto mandado), USD sin tipo de cambio o con TC > 100 rechazado, MXN limpia USD/TC, editar TC o cantidad recalcula y queda en el historial con motivo y valores viejo/nuevo, USD → MXN, eliminar y restaurar conserva moneda/USD/TC, los 1,407 gastos anteriores siguen en MXN, vista, Excel y reporte con dólares. Las políticas RLS no cambiaron en esta sección.
- Auditoría: `deepmerge` (GHSA-gcqx-w48m-w2h4, severidad baja, sin versión corregida) llega por el CLI `shadcn`. Se pasó `shadcn` a `devDependencies` (la app solo usa su `tailwind.css` al compilar; Vercel instala las de desarrollo para el build): `npm audit --omit=dev` = 0. `npm audit` completo sigue con 3 avisos bajos hasta que shadcn o deepmerge publiquen arreglo; no bajar `shadcn` a 1.0.0 ni `deepmerge` a 4.1.x (lo que sugiere npm rompe la app o es más viejo).

### Sección 5A — Gestión de usuarios (cerrada 2026-10-26)
- Hecho: `/admin/usuarios` con buscador; alta con nombre, correo, rol y contraseña inicial (generada o escrita; se muestra una vez con "copiar"); editar nombre y rol; desactivar / reactivar; restablecer contraseña. Política de contraseña en la app: 12+ con mayúscula, minúscula, número y símbolo. Protección de admins en la BD.
- Tablas / migraciones nuevas: `20261026233925_gestion_usuarios.sql`.
- Rutas nuevas: `/admin/usuarios` dejó de ser placeholder.
- Verificado: build (worktree aparte), lint, `tsc`, `npm audit` (0); migración ensayada sin commit (lista solo admin, quitarse el rol o desactivarse rechazado, último admin protegido incluso por SQL directo, capturista no lista ni edita); llave service_role validada (rol, proyecto y Auth Admin API 200) sin imprimirla. El usuario probó la pantalla.
- Pendientes: crear el usuario gerente (aún no existe); poner `SUPABASE_SERVICE_ROLE_KEY` en Vercel al hacer el deploy.

### Sección 4 — Dashboard y reportes (cerrada 2026-10-26)
- Hecho:
  - Reportes (`/dashboard`, admin y gerente): filtros en la URL (este mes, mes pasado, 3 / 6 / 12 meses, este año o rango; grupo; tipo), cifras clave con comparación contra el periodo anterior, gasto por mes (Recharts, con tabla), por categoría y unidades (top 8 con "ver más"), grupo y tipo (barra apilada con colores validados para daltonismo), proveedores.
  - Exportar a Excel (6 hojas: resumen, detalle de gastos, por unidad, categoría, mes y proveedor) e "Imprimir o guardar PDF" con acomodo para hoja vertical y horizontal, encabezado, listas completas y gráfica por mes en HTML para que no se corte.
  - Inicio: admin y gerente ven pendientes (servicios sin factura con quién los capturó, unidades en taller); el capturista ve Registrar servicio, sus servicios sin factura y sus últimos 5.
  - Ajustes pedidos por el usuario en el detalle del servicio: comprobantes como botones compactos con "Elegir archivo" a la derecha, página a todo lo ancho en pantallas de 1280 px o más, línea de cambios fija al lado con su propio scroll.
- Tablas / migraciones nuevas: `20261026224237_reportes.sql`, `20261026232829_servicios_resumen_pendientes.sql`.
- Rutas nuevas: `/dashboard/exportar`; `/dashboard` dejó de ser placeholder; `/` cambió por rol.
- Verificado: build (worktree aparte), lint, `tsc` y `npm audit` (0); tipos regenerados; funciones de reporte ensayadas en transacción sin commit (22 casos: total de 12 meses igual al centavo a la suma directa, cada agrupado suma el total, filtros de grupo y tipo, Excel igual al total, rangos inválidos, gerente igual que admin, capturista y anon rechazados); vista de pendientes con los tres roles; Reportes y Excel sin sesión → `/login`; archivo `.xlsx` de prueba válido. El usuario revisó Reportes, el PDF, el detalle del servicio y el Inicio.
- Pendientes que pasan a la siguiente sección:
  - Borrar los 700 servicios `[PRUEBA]` con sus PDF antes de usar datos reales.
  - Ajustes del dashboard de Supabase de "Seguridad" (incluye Spend cap), crear el usuario gerente, deploy en Vercel con su dominio, prueba de carga final.

### Sección 3 — Comprobantes y lista de gastos (cerrada 2026-10-26)
- Hecho:
  - Comprobantes (D7): bucket privado, tabla con RLS, captura con cámara (solo en pantallas táctiles) o archivo, fotos reducidas en el navegador, SHA-256 y aviso de duplicado con "Subir de todos modos", revisión de firma de bytes y hash en el servidor, quitar con motivo en la línea de cambios.
  - Visor en modal sin salir de la página: fotos y PDF con pdf.js (funciona en Android), varios comprobantes con anterior / siguiente, descargar. pdf.js se adelanta al acercarse a "Ver factura" solo si hay PDF.
  - 3B: ficha de unidad y Servicios con lista de gastos (un renglón por gasto), buscador por categoría o concepto, fechas y unidad, total de lo filtrado, scroll infinito dentro de un cuadro (tandas de 25).
  - Eliminar / restaurar / eliminar para siempre conservan o borran los comprobantes y sus archivos. Corregido `eliminar_unidad()`: ya borra la copia de los servicios de esa unidad que estaban en Eliminados.
- Tablas / migraciones nuevas: `20261026213220_comprobantes.sql`, `20261026215401_gastos_detalle.sql`, `20261026221533_gastos_detalle_tiene_pdf.sql`.
- Rutas nuevas: `/comprobantes/[id]`. `/servicios` y `/unidades/[id]` cambiaron a la lista de gastos.
- Verificado: build (worktree aparte), lint, `tsc` y `npm audit` (0) sin errores; tipos regenerados; migraciones ensayadas en transacción sin commit (34 casos de comprobantes con los tres roles, Storage, límite de 10, duplicados, eliminar / restaurar / eliminar para siempre / eliminar unidad; lista y total de gastos con admin, capturista y anon, búsqueda con comodines y comillas); bucket no accesible por URL pública ni sin sesión; `/comprobantes/[id]` sin sesión → `/login`. El usuario abrió PDF en el visor y revisó la cámara en laptop.
- Pendientes que pasan a la siguiente sección:
  - El usuario cerró la sección sin probar en el navegador todos los flujos (subir desde formulario y detalle, aviso de duplicado, quitar, eliminar y restaurar con factura, scroll infinito con más de 25). Revisarlos si aparece algo.
  - Borrar los 700 servicios `[PRUEBA]` con sus PDF antes de usar datos reales (sirven para el dashboard de la Sección 4).
  - Ajustes del dashboard de Supabase de "Seguridad" (incluye confirmar el Spend cap) y crear el usuario gerente (vienen de antes).

### Sección 2.5 — Seguridad (cerrada 2026-10-26)
- Hecho:
  - Encabezados de seguridad en todas las respuestas: CSP (sin dominios ajenos salvo Supabase), HSTS de 2 años, `X-Frame-Options: DENY` / `frame-ancestors none`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara solo para la app); sin `X-Powered-By`.
  - Cookies de sesión `httpOnly`, `secure` en producción y `sameSite=lax`.
  - Las políticas de lectura de choferes, unidades, categorías y proveedores exigen tener rol: un usuario desactivado con token vigente ya no ve nada.
  - `npm audit`: 0 vulnerabilidades.
  - Verificación en dos pasos (TOTP) para admin y gerente: se implementó, se probó en RLS y el usuario decidió quitarla (D6). Se revirtió el código y una migración nueva regresó `rol_actual()`; no quedó ningún factor dado de alta.
- Tablas / migraciones nuevas: `20261026184334_verificacion_dos_pasos.sql` (segundo paso + lecturas con rol), `20261026204626_quitar_verificacion_dos_pasos.sql` (quita el segundo paso; se quedan las lecturas con rol).
- Rutas nuevas: ninguna (`/verificacion` se creó y se quitó).
- Verificado: build (en worktree aparte), lint y `tsc` sin errores; tipos regenerados; cada migración ensayada en transacción sin commit con admin, capturista, gerente simulado y capturista desactivado; encabezados revisados con `curl`; sin sesión todo redirige a `/login`; el usuario probó la app en el navegador.
- Pendientes que pasan a la siguiente sección:
  - Ajustes del dashboard de Supabase de la sección "Seguridad" de este archivo (los hace el usuario).
  - La CSP se amplía en la Sección 3 para el visor y la compresión de comprobantes, sin comodines.
  - Crear el usuario gerente y probar esa vista (viene de la Sección 2).

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