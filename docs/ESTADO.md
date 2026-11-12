# ESTADO — Administración Trailers

> Actualizar este archivo al cerrar cada sección. Es lo primero que se lee al iniciar una sesión.

## Sección actual
**Salida a producción (2026-10-30).** Cerradas: 0, 1, 2, 2.5, 3 (con 3B), 4, 5A, 5B, 5C, 5D y 5E. La 5F (Mantenimientos) está terminada en su rama, esperando el visto bueno para subir. La app ya está publicada en Vercel (plan Hobby) con su dirección `.vercel.app`; variables, Site URL / Redirect URLs de Supabase y freno de login hechos.

### Próximos pasos para retomar
- **Sección 5H (Kilometraje semanal y tickets de taller, D15 y D16): en curso en la rama `seccion-5h-tickets-y-kilometraje` (2026-11-12).** Etapas 1 y 2 (kilometraje semanal) y 3 (BD de tickets) aplicadas; sigue la Etapa 4 (pantallas de tickets). Plan en `docs/PLAN.md` › 5H.
- La 5G (¿Dónde se hizo?) ya está en `main` (0779698).
- **Sección 5F (Mantenimientos): terminada en la rama `seccion-5f-mantenimientos` (2026-11-09), falta el visto bueno del usuario para el merge y push a `main`.** Pendiente del usuario: revisar en el iPhone (360 px) la ficha, Mantenimientos, el formulario de servicio e Inicio; capturar los intervalos reales de cada unidad (T-17 ya tiene "Cambio de aceite", 15,000 km o 6 meses, desde el 09/11/2026); registrar el primer correctivo real desde "Registrar" para ver que el contador se reinicie.
- **Siguiente (a futuro):** Fase 2 (Almacén) cuando el almacén físico esté ordenado.
0. **Probar en el navegador lo de la 5D** que depende de cómo navega Next (no se puede probar por SQL): guardar un servicio y volver a "Nuevo servicio" (debe salir vacío); eliminar o editar un servicio y regresar a la lista (debe actualizarse); "Nuevo proveedor" dentro del formulario (no debe guardar el servicio); escribir `1500,50` (debe quedar $1,500.50); salir de un formulario con cambios (debe avisar).
1. **Limpieza:** datos de prueba nuevos (2026-11-10, pedidos por el usuario; se borraron los 700 de antes y sus 931 MB de PDF): 1,230 servicios `[PRUEBA]` (30 por unidad, nov 2025 a oct 2026) con gastos, entradas y salidas de taller, los tres lugares y 148 PDF (~200 MB); 103 mantenimientos, 5 talleres y 3 proveedores `[PRUEBA]`. Borrarlos antes de que se capturen datos reales (los pasos están en la memoria `datos-de-prueba`): suman en Reportes, totales e Inicio.
2. **Arranque:** gerente ya creado y probado (2026-10-28: 14 casos de RLS, ve todo y no escribe nada). Faltan los capturistas reales en Admin → Usuarios.
3. **Dominio (al final, lo pidió el usuario):** `flotilla.bajaws.com.mx` en Cloudflare apuntando a Vercel, SSL en Full (strict); Claude pasa el registro DNS exacto. Después, actualizar Site URL / Redirect URLs de Supabase con el dominio.
4. **Recomendado:** mover el proyecto fuera de OneDrive. Bloquea `.next` (build con EPERM) y el 2026-10-29 liberó archivos de `node_modules` ("Archivos a petición": faltaba `globals/globals.json` y ESLint tronaba); se arregló con `npm ci`.
5. **Extras después de arrancar** (por decidir): bitácora de catálogos y usuarios.

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
- D10 (5D): Reportes compara por calendario: este mes contra el mismo tramo del mes anterior, mes pasado contra el mes completo anterior, últimos N meses contra los N anteriores, este año contra el mismo tramo del año pasado; un rango libre, contra los días previos del mismo largo. La tarjeta y el Excel muestran las fechas comparadas.
- D11 (5D): montos con coma: de miles si está bien puesta (`1,500`), decimal si es una sola con 1–2 dígitos al final (`1500,50` = 1,500.50); cualquier otra coma se rechaza. Aviso al salir de un formulario con cambios (cerrar o recargar la pestaña, enlaces de la app, Cancelar); el gesto de "atrás" no se intercepta.
- Hosting: Vercel plan **Hobby** (el usuario no pagará Pro); 1 regla de rate limit por proyecto (usada en `/login`). El dominio se conecta al final.
- D14 (5F): tipo de servicio con los nombres del usuario (preventivo = antes de que falle; correctivo = lo que toca cada cierto km o tiempo; servicio = lo demás), obligatorio en servicios nuevos. Kilometraje obligatorio en servicios nuevos y entradas a taller (menos cajas); una lectura que no cuadra con las de antes o después no se guarda; solo el admin corrige el kilometraje, con motivo. Mantenimientos programados por unidad (por km, por meses o lo que pase primero; cajas solo por meses), en la ficha. Solo un correctivo marcado como cumplimiento reinicia el contador. Por vencer: 1,000 km o menos, o 15 días o menos.
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
- Enums: `moneda` (MXN, USD), `rol_usuario` (admin, capturista, gerente), `operacion_unidad`, `estatus_unidad`, `accion_historial`.
- Funciones: `es_admin()`, `rol_actual()`, `puede_ver_todo()`, `puede_capturar()`, `actualizar_updated_at()`, `crear_perfil_nuevo_usuario()` (trigger `al_crear_usuario` en `auth.users`), `prefijo_tipo_unidad()`, `normalizar_unidad()`, `preparar_servicio()`, `preparar_gasto()`, `registrar_historial()` (triggers); `registrar_servicio()`, `actualizar_servicio()`, `eliminar_servicio()`, `restaurar_servicio()`, `eliminar_servicio_definitivo()` y `eliminar_unidad()` (ambas regresan las rutas de archivos a borrar), `quitar_comprobante()`, `buscar_comprobante_duplicado()`, `listar_gastos()`, `resumen_gastos()`, `reporte_gastos()` y `exportar_gastos()` (estas dos solo admin y gerente) (las llama la app); `nombre_usuario()` (nombre de quien capturó, para el gerente); `listar_usuarios()` (solo admin, con correo y último acceso); `gastos_para_reporte()` y `validar_reporte()` (apoyo de reportes); `preparar_comprobante()` (trigger), `archivo_comprobante_en_uso()`, `patron_busqueda()` y `filtro_gastos()` (apoyo de políticas y búsquedas); `validar_servicio_con_gastos()` (constraint triggers diferidos, 5D); `cerrar_sesiones_usuario()` (solo admin, 5D).
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
- 5F:
  - Tablas: `correcciones_kilometraje` (solo lectura para admin y gerente; se escribe con `corregir_kilometraje()`), `mantenimientos_unidad` (los tres roles leen; admin agrega y edita; quitar = `activo = false`).
  - Columnas: `servicios.tipo` (enum `tipo_servicio`, null en los de antes), `servicios.mantenimientos` (ids de `mantenimientos_unidad` que cumplió el correctivo; entra al historial y a la copia de un eliminado), `entradas_taller.kilometraje`.
  - Funciones: `validar_kilometraje()` (interna), `kilometraje_unidades()`, `corregir_kilometraje()` (admin), `mantenimientos_pendientes()` (security definer: mismo cálculo para los tres roles; cuenta desde el correctivo más reciente que lo cumplió), `agregar_mantenimiento()` (admin: a la unidad y, en la misma transacción, a otras), `copiar_mantenimientos()` (admin, ya sin uso en la pantalla), triggers `preparar_mantenimiento()` y `validar_mantenimientos_servicio()`. `registrar_servicio()` / `actualizar_servicio()` con `p_tipo` y `p_mantenimientos` opcionales; `registrar_entrada_taller()` con `p_kilometraje`. Reportes y Excel con gasto por tipo de servicio.
  - Rutas: `/mantenimientos` (los tres roles; pestañas Correctivos y Preventivos; "Registrar" para admin y capturista abre `/servicios/nuevo?unidad=&tipo=correctivo&mantenimiento=`).
  - Código: `features/mantenimientos` (ficha, página, aviso de Inicio), `lib/utils/mileage.ts`, `servicios/components/service-type-picker`, `service-type-badge`, `service-maintenance-picker`, `service-brief-feed`; `unidades/components/unit-mileage`.
- Buckets: `comprobantes` (privado; PDF, JPEG, PNG, WebP; 10 MB; ruta `servicio_id/comprobante_id.ext`; políticas en `storage.objects`).

## Historial de secciones

### Sección 5H — Kilometraje semanal y tickets de taller (en curso, rama `seccion-5h-tickets-y-kilometraje`, pedida por el usuario el 2026-11-12)
- Decisiones D15 (kilometraje semanal) y D16 (tickets) en `docs/PLAN.md` › 5H.
- Etapa 1, BD del kilometraje semanal (`20261112185135_kilometraje_semanal.sql`, aplicada): tablas `lecturas_kilometraje` (una por unidad y semana; los tres roles leen; nadie escribe directo) y `cambios_lecturas_kilometraje` (correcciones y lecturas quitadas, con motivo). Funciones `inicio_semana()`, `es_dia_de_captura_semanal()` (lunes y martes), `registrar_lecturas_kilometraje(jsonb)` (varias; cada una se guarda o regresa su motivo; capturista lunes y martes, admin cualquier día; solo activas con odómetro), `corregir_lectura_kilometraje()` y `quitar_lectura_kilometraje()` (autor el mismo día; admin con motivo; interna `puede_cambiar_lectura()`), `lecturas_semana()` (lista de la semana con km actual y lectura). `validar_kilometraje()` gana `p_lectura_id` y compara contra las lecturas; `kilometraje_unidades()` las toma como fuente "lectura semanal" (Mantenimientos e Inicio se actualizan solos). App: solo la etiqueta de la fuente nueva.
- Etapa 2 (2026-11-12): página `/kilometraje` (menú de los tres roles), tarjeta roja en Inicio (admin y capturista, en los días de registro), "Lecturas semanales" en la ficha (admin corrige y quita con motivo). Pedido del usuario: el admin elige uno o dos días de registro (`20261112192726_dias_captura_kilometraje.sql`, aplicada: tabla `ajustes_kilometraje`, `dias_captura_kilometraje()`, `cambiar_dias_captura_kilometraje()`; `es_dia_de_captura_semanal()` lee los días elegidos). Prueba `dias-captura-kilometraje.sql` 13/13. Revisada en el navegador con el admin (escritorio y celular, `npm start`). Tarjeta del Inicio en un solo renglón (pedido del usuario). El usuario confirmó: el "¿Seguro?" crece con las semanas sin lectura (7,000 km por semana en foráneas) y el gerente no ve la tarjeta roja. Falta ver las pantallas con sesión de capturista y gerente. Queda una lectura de prueba de T-10 (424,600 km, semana del 09/11).
- Etapa 3, BD de tickets (`20261112221529_tickets_taller.sql`, aplicada): enums `prioridad_ticket` y `estatus_ticket`; tabla `tickets_taller` (folio, unidad, falla, prioridad, estatus, quién y cuándo lo atendió, `entrada_id` de la entrada que creó, motivo de rechazo, Enterado, cancelación; uno pendiente por unidad; los tres roles leen todo, nadie escribe directo; en la publicación de Realtime). Funciones `crear_ticket_taller()` (admin y gerente), `aceptar_ticket_taller()` (capturista y admin; pide km si hay odómetro y crea la entrada de hoy con la falla del ticket; si la entrada falla, el ticket sigue pendiente), `rechazar_ticket_taller()` (motivo de 5 letras o más), `cancelar_ticket_taller()` (quien lo levantó o admin), `marcar_ticket_enterado()` (quien lo levantó). `registrar_entrada_taller()` rechaza unidades con ticket pendiente. Decisión propia: si una unidad se vende o se da de baja, su ticket pendiente se cancela solo (trigger). Relaciones de la API revisadas con llamadas reales (sin PGRST200/201). Pruebas: `tickets-taller.sql` 42/42, `gerente.sql` 17/17 (casos de tickets); regresión completa en verde.
- Pruebas: `kilometraje-semanal.sql` 40/40 (ensayo y después de aplicar). Regresión completa en verde: se arreglaron 6 baterías que se habían roto por los datos de prueba del 10/11 y los tipos Dolly y Góndola, no por la app (ver ERRORES.md › 5). `capturista.sql` ahora da 43/43.

### Sección 5G — ¿Dónde se hizo? (2026-11-10, rama `seccion-5g-donde-se-hizo`, pedida por el usuario)
- Qué: cada servicio dice dónde se hizo el trabajo: **Taller Realso** (el taller propio), **taller de fuera** o **en camino**; fuera y en camino dicen qué taller. El proveedor sigue siendo dónde se compran las piezas (el formulario dice "Proveedor de las piezas").
- BD (`20261110150813_donde_se_hizo.sql`, aplicada): enum `lugar_servicio`; tabla `talleres` (como proveedores: admin y capturista dan de alta, solo el admin edita y desactiva, RLS); `servicios.lugar` y `servicios.taller_id` con candado (Realso sin taller; fuera y en camino con taller); trigger `validar_lugar_servicio` (taller activo; al restaurar no revisa); `registrar_servicio` / `actualizar_servicio` con `p_lugar` y `p_taller_id` opcionales al final (sin lugar al editar se conserva); `restaurar_servicio` y `servicios_resumen` con los dos datos. Opcional en la BD: lo exige el servidor de la app en servicios nuevos.
- BD (`20261110151818_reporte_donde_se_hizo.sql`, aplicada): `reporte_gastos` con `por_lugar` y `por_taller`; `gastos_para_reporte` y `exportar_gastos` con lugar y taller.
- App: "¿Dónde se hizo?" en el formulario de servicio (obligatorio en alta; al editar uno de antes puede quedar sin dato) y "¿Qué taller?" con "Nuevo taller"; pestaña Talleres en Catálogos; "Hecho en …" en el detalle; línea de cambios con lugar y taller; Reportes: tarjeta "Dónde se hizo" (barra, tres bloques y talleres de fuera), en el PDF y en el Excel (columnas y hojas "Dónde se hizo" y "Por taller").
- Se quitó el motivo "Mantenimiento taller Realso" (antes "Mantenimiento en patio") de "sin entrada a taller": en Realso primero se da la entrada; si no se dio, es "Se olvidó la entrada". Los servicios que ya lo tenían lo muestran como "Otro".
- No se muestra en la lista de gastos de la ficha (es por gasto, no por servicio).
- Pruebas: `donde-se-hizo.sql` 21/21, `reporte-donde-se-hizo.sql` 5/5; regresión igual a la línea base (capturista 42/43, la falla conocida).

### Sección 5F — Mantenimientos (terminada 2026-11-09, rama `seccion-5f-mantenimientos`, sin merge)
- Etapa 1, kilometraje (`20261109185639_kilometraje.sql`): el km actual se calcula (última lectura desde la última corrección), no se guarda; la revisión es cronológica (no menor a lo de antes ni mayor a lo de después; el mismo día no se compara). Al editar servicios de antes el km sigue opcional. Corrección del admin con motivo en la ficha; el gerente ve las correcciones.
- Etapa 2, tipo de servicio (`20261109201501_tipo_servicio.sql`): selector en el formulario, etiqueta en detalle, Inicio y listas cortas; Reportes "Por tipo de servicio" (PDF y hoja de Excel). No se muestra en la lista de Gastos ni en los renglones de las estancias.
- Etapa 3, mantenimientos por unidad (`20261109205535_mantenimientos_unidad.sql`): sección en la ficha (agregar, editar, quitar, copiar de otra unidad), estados Vencido / Por vencer / Al corriente / Sin kilometraje.
- Etapa 4, cumplimiento (`20261109221717_mantenimientos_cumplidos.sql`): el plan decía una tabla `servicios_mantenimientos`; se guardó como columna `servicios.mantenimientos` para que el historial registre el cambio con motivo, la copia de un eliminado lo regrese al restaurar y la fecha y el km salgan siempre del servicio. Página Mantenimientos, "¿Cuenta como un mantenimiento programado?" en el formulario (solo correctivos), "Cuenta como mantenimiento" en el detalle y en la línea de cambios.
- Etapa 5: tarjeta "Mantenimientos" (vencidos y por vencer, 8 más urgentes) en el Inicio de los tres roles; el capturista abre el servicio ya preparado.
- Pruebas: `kilometraje.sql` 31/31, `tipo-servicio.sql` 15/15, `mantenimientos.sql` 27/27, `mantenimientos-cumplidos.sql` 27/27; regresión igual a la línea base (capturista 42/43, la falla conocida). Se cambiaron `capturista.sql` y `salida-servicio.sql` (usaban 1000 km fijos, que ya no cuadran).
- Carga (`carga-5f.sql`, en `begin … rollback`: ~35,700 servicios, ~71 mil gastos, 176 mantenimientos, 5,790 correctivos que cumplen): lo pendiente de todas 19–20 ms con los tres roles (el capturista ve los mismos 176), preventivos 22 ms, ficha 4 ms, guardar un correctivo que cumple 7–8 ms; Inicio "sin factura" 103–173 ms (de antes).
- Datos reales que quedaron: el mantenimiento "Cambio de aceite" de T-17 (lo pidió el usuario).
- Corrección posterior (2026-11-10, pedida por el usuario, rama `seccion-5f-aplicar-a-varias`): "Copiar de otra unidad" solo listaba unidades que ya tenían mantenimientos y copiaba todo junto. Se quitó y el modal de Agregar ahora tiene "Aplicar también a": el selector de unidades de Registrar servicio, con varias o todas (`20261110003905_agregar_mantenimiento_a_varias.sql`). Decisiones del usuario: en las otras cuenta desde hoy y su km actual; si ya lo tienen, se saltan. A cajas y unidades sin kilometraje solo pasa la parte por meses (si es solo por km, se saltan). El aviso dice dónde se agregó y cuáles se saltaron. Prueba `mantenimientos-varias.sql` 23/23.
- Corrección posterior (2026-11-10, pedida por el usuario, misma rama): en Reportes, sección "Mantenimiento y reparaciones" en lugar de "Por tipo de servicio". Mantenimiento = correctivo + preventivo; Reparaciones = tipo Servicio (en la captura sigue diciendo "Servicio"); los de antes, "Sin tipo". Barra al 100 %, dos bloques con total y parte, y gráfica "Gasto por mes por tipo" (columnas apiladas, con tabla), también en la hoja impresa y el PDF del iPhone. Excel: columna "Mantenimiento / Reparación" en Gastos y por tipo, y columnas por tipo en "Por mes". `reporte_gastos()` trae lo de cada tipo en cada mes (`20261110005952_reporte_mantenimiento.sql`). Prueba `reporte-mantenimiento.sql` 6/6; `tipo-servicio.sql` 15/15.
- Corrección posterior (2026-11-10, pedida por el usuario, misma rama): **tipos de unidad como catálogo** (`20261110011123_tipos_de_unidad_catalogo.sql`). El enum `tipo_unidad` se quitó; ahora es la tabla `tipos_unidad` (clave, nombre, prefijo, `lleva_kilometraje`, `lleva_largo`, `lleva_operacion`, orden, activo; RLS: los tres roles leen, solo admin crea y edita). Catálogos tiene la pestaña "Tipos de unidad" con "Nuevo tipo". Solo el nombre se cambia después: la letra y las reglas quedan fijas. Se agregaron Dolly (D-) y Góndola (G-), los dos sin kilometraje. Las reglas que decían "si es caja" ahora preguntan al tipo (`tipo_lleva_kilometraje()`); las de la unidad (letra, local/foráneo, largo) pasaron de CHECK a trigger `validar_tipo_de_unidad()`; `unidades.orden_tipo` conserva el orden de las listas; el grupo Camionetas = sin operación. `reporte_gastos`, `exportar_gastos` y `gastos_para_reporte` reciben el tipo como texto. Prueba `tipos-unidad.sql` 28/28; todas las demás iguales que antes (capturista 42/43, la falla conocida). Pendiente: dar de alta D-1 y D-2 (foráneos) y G-1 a G-4 (locales).

### Corrección posterior — Salida de taller sin servicios con motivo (2026-11-06, pedida por el usuario)
- "Dar salida" de una estancia sin ningún servicio registrado exige motivo (la nota). Con servicios, o cuando la salida la da un servicio con la casilla, la nota sigue opcional. En la BD (`20261107005412_salida_sin_servicio_con_motivo.sql`, `dar_salida_taller()` con la misma firma) y en el diálogo de Taller (el campo pasa a "Motivo" y explica por qué). La venta de una unidad en taller no cambia (cierra la entrada con "Unidad vendida").
- Pruebas: `salida-servicio.sql` 9/9 (sin servicios y sin motivo rechazada, con motivo sale); regresión igual a la línea base.
- Nota: el capturista cuenta solo sus propios servicios en la estancia (RLS), así que puede pedírsele motivo aunque otro ya haya registrado uno; nunca al revés.

### Corrección posterior — Tarjetas desplegables y scroll de la página (2026-11-06, pedida por el usuario)
- Estancias en taller de la ficha: tarjetas desplegables que salen cerradas y se abren al tocarlas; se cargan de 10 en 10 con el scroll de la página (`unidades/actions.ts › loadMoreShopStays`). Gastos (Servicios y ficha) sin cuadro con scroll propio: la siguiente tanda se pide con el scroll de la página. Inicio: "Servicios sin factura" y "Sin entrada a taller" muestran los 10 más recientes sin scroll propio. Reglas nuevas en CLAUDE.md › UI (sin "…", sin cuadros con scroll propio, sin emojis).

### Corrección posterior — Celular y estancias en taller (2026-11-06, pedida por el usuario al probar la 5E en el iPhone)
- Jalar hacia abajo para actualizar en la app instalada (`components/layout/pull-to-refresh.tsx`, en `(app)/layout.tsx`): desde el tope de la pantalla, sin diálogos abiertos ni dentro de una lista con scroll propio; usa `router.refresh()` (no se pierde lo escrito en formularios). Además, en app y navegador, la pantalla se actualiza sola al volver después de 30 s en otra app.
- Ficha de la unidad: cada estancia en taller es una tarjeta que se abre (`<details>`; la más reciente abierta): fechas, días, falla y total; abierta, sus servicios con enlace y "Salió de taller con este servicio". BD (`20261106233851_salida_con_servicio.sql`): `entradas_taller.servicio_salida_id`, `dar_salida_taller()` con `p_servicio_id` opcional (versión de 3 argumentos reemplazada), `registrar_servicio()` / `actualizar_servicio()` le pasan su servicio, vista `entradas_taller_resumen` (total y número de servicios por estancia, `security_invoker`); la salida real de P-05 quedó ligada a su servicio.
- Filtros Desde / Hasta encimados en el iPhone (Servicios, ficha, Reportes): `appearance: none` en campos de fecha en pantallas táctiles (`globals.css`) y columnas `minmax(0,1fr)`.
- **Incidente (~10 min):** la llave foránea de `servicio_salida_id` creó una segunda relación `servicios` ↔ `entradas_taller` y la API dejó de saber cuál usar al anidarlas: el detalle del servicio y la ficha de la unidad daban error, también en la app publicada. Se quitó la llave (`20261106234820_salida_sin_llave_foranea.sql`); el dato se conserva. Las pruebas en SQL no lo detectan: anotado en `supabase/tests/README.md`.
- Verificado: `tsc`, lint y build (copia aparte); `salida-servicio.sql` 7/7, `taller` 32/32, `servicios-taller` 22/22, `ventas` 36/36 (las dos primeras ya no dependen de los datos del momento: P-05 salió de taller con un servicio real); detalle del servicio y ficha cargan otra vez. Falta que el usuario pruebe en el iPhone la ficha nueva, el jalar para actualizar y los filtros.

### Sección 5E — Entradas a taller y unidades vendidas (en curso, rama `seccion-5e-taller`)
- **Etapa 0 — Línea base (2026-11-06, hecha).** Sin cambios en la app ni en la BD.
  - Baterías (en transacción sin commit): capturista 42/43 (el caso restante es el conocido: los `[PRUEBA]` comparten PDF), validaciones 13/13, gerente 14/14, Lote 1 de la 5D 24/24, dólares 17/17. Igual que al cerrar la 5D. A la batería de validaciones se le quitaron las definiciones viejas de `preparar_servicio` / `preparar_gasto` que traía dentro, para probar las de producción.
  - Tiempos en la BD (mediana de 5, ms) con los datos actuales:

    | Consulta | Admin | Capturista |
    |---|---|---|
    | Servicios: lista (25) | 3.6 | 4.5 |
    | Servicios: total filtrado | 3.7 | 4.5 |
    | Servicios: búsqueda | 9.8 | 9.4 |
    | Inicio | 6.0 | 6.6 |
    | Unidades: lista | 0.6 | — |
    | Ficha de unidad | 6.6 | — |
    | Reportes 12 meses | 17.3 | — |

  - Respaldos: diarios y completos en Supabase (el último, 2026-11-06 11:05 UTC); PITR apagado.
  - Pruebas guardadas en `supabase/tests/` (README con cómo correrlas y el resultado esperado).
- **Etapa 1 — Entradas a taller (2026-11-06, hecha; falta revisar en celular y subir).**
  - BD (`20261106201328_entradas_taller.sql`, aplicada): tabla `entradas_taller` sin escritura directa (RLS: los tres roles ven las abiertas; las cerradas, admin y gerente); `registrar_entrada_taller()` y `dar_salida_taller()` (admin y capturista); trigger `proteger_estatus_taller` en `unidades`: `en_taller` solo lo ponen y quitan esas funciones. P-05 (ya estaba en taller) recibió su entrada abierta. Cambio respecto al plan: la entrada y la salida no van a `historial_cambios` (es solo de servicios); cada renglón guarda quién la abrió y quién la cerró.
  - App: `/taller` (los tres roles; días en taller, en ámbar desde 7), `/taller/entrada` (admin y capturista; `?unidad=` preselecciona), "Dar salida" con fecha y nota, enlace "Taller" en el menú. Editar unidad: estatus fijo si está en taller. `servicios/components/unit-picker` ahora es público y recibe `title`.
  - Pruebas: `supabase/tests/taller.sql` 32/32; regresión igual a la línea base; tiempos iguales. En el navegador (escritorio): entrada con falla de 200 caracteres sin espacios, salida con nota, formulario de unidad bloqueado.
- **Etapa 2 — Unidades vendidas (2026-11-06, hecha; falta revisar en celular y subir).**
  - BD (`20261106203640_estatus_vendida.sql` sola por ser valor de enum, y `20261106203645_ventas_unidades.sql`, aplicadas): tabla `ventas_unidades` (venta vigente y ventas deshechas con quién, cuándo y motivo; solo admin y gerente la leen); `marcar_unidad_vendida()` y `deshacer_venta()` (solo admin); vender una unidad en taller cierra su entrada con la fecha de venta. "Vendida" se trata como "baja": política de lectura de `unidades`, `preparar_servicio()` (copia de la 5D, solo cambia esa condición) y `registrar_entrada_taller()`. El candado de estatus también cubre `vendida`. Cambio respecto al plan: la fecha y nota de venta van en `ventas_unidades`, no en columnas de `unidades`, para que deshacer quede registrado.
  - App: "Marcar como vendida" (sección Venta de la ficha) y "Deshacer venta" con motivo (aviso arriba de la ficha; el gerente solo lo ve); etiqueta y filtro "Vendida"; lista de unidades la muestra atenuada; formulario de unidad con estatus fijo; ya no aparece para elegir en servicio nuevo ni en entrada a taller.
  - Pruebas: `supabase/tests/ventas.sql` 36/36 (incluye: total de Reportes y suma de gastos iguales antes y después de vender); regresión igual a la línea base; taller 32/32; tiempos iguales. En el navegador: T-17 a taller → vendida (salió de Taller, total igual) → filtro Vendida → deshacer venta con motivo.
- **Etapa 3 — Servicios ligados al taller (2026-11-06, hecha; falta revisar en celular y subir).**
  - BD (`20261106205646_servicios_taller.sql`, aplicada): `servicios.entrada_taller_id`, `sin_entrada_taller` (null = anterior a la 5E, no se evalúa) y `motivo_sin_entrada`. La liga la calcula `preparar_servicio()` (estancia abierta de la unidad con entrada ≤ fecha del servicio; al editar se desliga si cambia la unidad o la fecha queda antes de la entrada). `registrar_servicio()` y `actualizar_servicio()` se reemplazaron por una sola versión con parámetros opcionales (`p_salida_taller`, `p_motivo_sin_entrada`, `p_entrada_fecha`, `p_entrada_falla`): llamadas como las de antes guardan igual. `restaurar_servicio()` regresa la liga. Las versiones anteriores están en las migraciones que cita el encabezado.
  - App: panel de taller en el formulario de servicio (`servicios/components/service-shop-panel`): en taller, falla y casilla "La unidad sale de taller con este servicio" (marcada en alta, desmarcada al editar); sin entrada, motivo obligatorio (D13) con "Reparación en camino", "Mantenimiento en patio", "Se olvidó la entrada" (fecha y falla; solo en alta y si no está en taller) y "Otro…". Mismas reglas en el navegador, en el servidor (`shopIssues` / `fallsInStay` en `servicios/schemas.ts`) y en la BD. `listUnitOptions` trae la estancia abierta de cada unidad. La línea de cambios muestra el motivo.
  - Pruebas: `supabase/tests/servicios-taller.sql` 22/22; totales, número de servicios y datos de cada servicio idénticos antes y después de la migración; regresión igual a la línea base (ventas.sql ahora cuenta solo sus ventas); guardar un servicio ~4 ms antes y después. En el navegador: caso A (P-05, sin guardar), caso C (fecha antes de la entrada, sin "Se olvidó"), "Se olvidó la entrada" guardado (estancia creada y cerrada, T-17 Activo), sin motivo rechazado, motivo guardado, edición con el motivo elegido. Los dos servicios de prueba ($1.00 c/u, "PRUEBA 5E") se mandaron a Eliminados; el total de gastos volvió a $8,944,518.81.
  - Encontrado y corregido (no era de la 5E): después de eliminar un servicio, "volver" podía caer en la pantalla de editar de ese mismo servicio (404). `useGoBack` acepta `gone`: si la pantalla anterior es del servicio eliminado, va a la lista. Falta probarlo en el navegador.
- **Etapa 4 — Avisos (2026-11-06, hecha; falta revisarla en el navegador).**
  - BD (`20261106215754_servicios_resumen_taller.sql`, aplicada): `servicios_resumen` con `entrada_taller_id`, `sin_entrada_taller` y `motivo_sin_entrada` al final (las columnas de antes, idénticas en los 705 servicios) e índice parcial `servicios_sin_entrada_idx`.
  - App: detalle del servicio con renglón "Taller" (entrada / salida y falla de su estancia, o "Sin entrada a taller" con su motivo; nada en servicios de antes de la 5E). Inicio del admin con "Sin entrada a taller" (últimos 30 días, con motivo y quién lo capturó). "Unidades en taller" de Inicio sale de las entradas abiertas (días, falla, enlace a Taller). Ficha de la unidad con sus estancias en taller (entrada → salida, días, falla, quién reportó, nota de salida, número de servicios; 20 más recientes).
  - Pruebas: regresión completa igual a la línea base; tiempos nuevos < 1 ms (Taller, aviso, estancias).
- **Etapa 5 — Cierre (2026-11-06).**
  - Prueba de carga (`supabase/tests/carga-5e.sql`, en transacción sin commit): 35,705 servicios, 71,408 gastos, 1,024 estancias cerradas con 5,488 servicios ligados, 9 unidades en taller y 29,512 servicios sin entrada. Admin: Servicios 3.9 ms, búsqueda 340 ms, total 141 ms, Inicio sin factura 82 ms, Reportes 12 meses 410 ms, Excel 156 ms, Taller 0.6 ms, aviso sin entrada 2.0 ms, estancias de la ficha 0.8 ms, guardar servicio 2.6 ms. Capturista: Servicios 15 ms, búsqueda 292 ms. Todo igual o mejor que la 5C.
  - Advisors: Security con 4 avisos nuevos `authenticated_security_definer_function_executable` (`registrar_entrada_taller`, `dar_salida_taller`, `marcar_unidad_vendida`, `deshacer_venta`), intencionales como los anteriores: revisan rol por dentro (probado con gerente, capturista, desactivado y anon). Performance: sin avisos. **Sigue `auth_leaked_password_protection`**: la protección contra contraseñas filtradas aparece apagada en Supabase Auth; hay que volver a activarla en el dashboard (Authentication → Sign In / Providers → Email) y confirmar con "Rerun linter".
  - Build completo en copia aparte (`npm ci`): sin errores; `npm audit --omit=dev` = 0; `tsc` y lint sin errores.
  - Pendiente para cerrar la sección: revisar en el navegador las Etapas 4 y la corrección de "volver" (el servidor de desarrollo se apagó por memoria baja de la computadora); revisar todas las etapas en celular (360 px); unir a `main` y subir (Vercel) cuando el usuario lo diga.
- Datos de prueba que quedaron (todos con "PRUEBA 5E"): dos estancias cerradas de T-17 en `entradas_taller` y una venta deshecha en `ventas_unidades`. T-17 quedó Activo. Se borran junto con los `[PRUEBA]`.
- El servidor de desarrollo tuvo que reiniciarse dos veces (error "Jest worker" y un módulo que no se recargó): ambos por el proyecto dentro de OneDrive.

### Corrección posterior — "En taller" ya no se pone a mano (2026-11-06, pedida por el usuario)
- En alta y edición de unidad, el estatus "En taller" ya no aparece. Solo se muestra si la unidad ya lo tiene (hoy 1), para poder cambiarla a Activo.
- El servidor rechaza `en_taller` en `createUnit` y en `updateUnit` si la unidad no lo tenía (`getUnitStatus` en `unidades/queries.ts`). El candado en la BD llega con la 5E (entradas a taller).
- Sección 5E escrita en `docs/PLAN.md` con las decisiones D12; pendiente de aprobar.

### Corrección posterior — PDF de Reportes en iPhone (2026-11-06, pedida por el usuario)
- En iPhone con la app abierta desde la pantalla de inicio, "Imprimir o guardar PDF" no hacía nada: iOS no tiene cuadro de impresión en las apps de pantalla de inicio (`window.print()` no hace nada y no da error).
- Ahora, solo ahí (`navigator.standalone`), el botón pide los datos con `dashboard/actions.ts › getReportPdfData` (admin y gerente, mismos filtros de la URL), arma el PDF en el celular con jsPDF (`dashboard/components/report-pdf.ts`, se carga solo al tocar el botón) y abre el menú de compartir (Guardar en Archivos, Imprimir, WhatsApp…). Si iOS no deja abrir el menú por el tiempo transcurrido, el botón cambia a "Compartir PDF". En el navegador (escritorio, Safari, Android) sigue el cuadro de impresión de siempre.
- PDF: carta vertical, mismo contenido que la hoja impresa (encabezado con logo, cifras clave, gasto por mes, grupos y tipos, listas completas), textos largos recortados con "…", número de página. Sin costo de servidor.
- Dependencia nueva: `jspdf` 4.2.1 (la 3.x tiene avisos de seguridad; `npm audit --omit=dev` = 0).
- Verificado: `tsc` y lint; PDF de prueba con nombres de 200 caracteres sin espacios revisado en pantalla. Falta que el usuario lo pruebe en el iPhone.

### Corrección posterior — Celular y app instalable (2026-11-04, pedida por el usuario)
- App instalable: `src/app/manifest.ts` (`/manifest.webmanifest`, `display: standalone`, fuera del proxy de sesión), `appleWebApp` y `themeColor` en `src/app/layout.tsx`, íconos en `public/brand/` (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, hechos con la gota del logo). Agregada a la pantalla de inicio se abre sin barra del navegador. Por D9, cerrar la app pide entrar de nuevo.
- Elegir unidad: en pantalla táctil el foco va a la lista y no al buscador (se abría el teclado, tapaba las unidades y no se podía deslizar); deslizar la lista cierra el teclado.
- Sin scroll lateral (lo prohibió el usuario): `overflow-x: clip` en `html` y `body` como red de seguridad; periodos de Reportes bajan de renglón; pestañas de Unidades se reparten el ancho; campo de fecha de iPhone sin ancho mínimo; nombre y correo truncados en el menú de usuario.
- Gráficas y tarjetas que se salían del ancho (Reportes y demás): 13 cuadrículas sin `grid-cols-1` en celular (Inicio, login, Reportes, detalle y filtros de servicios, formularios de servicio y unidad); tarjetas de Reportes y gráfica con `min-w-0`; cifras clave de Reportes en una columna en celular y montos sin partirse; listas desplegables (Select) que no se encogían, arregladas en `globals.css` (`[data-slot=select-trigger]`) sin editar `components/ui`; campos de fecha de los filtros con `min-w-0`.

### Sección 5D — Correcciones de la auditoría (cerrada 2026-10-30)
- Auditoría con 5 agentes en paralelo coordinados por Claude (BD, permisos y Storage, servidor, dinero y fechas, pantallas). Sin fugas de datos entre usuarios; los permisos aguantan casi toda la matriz de rol × tabla × acción.
- Hecho:
  - BD (`20261028191347_auditoria_integridad.sql`): `registrar_historial` con `coalesce` (gasto por API sin motivo); `preparar_servicio`/`preparar_gasto` fijan id, `created_at`, `updated_at`, `updated_by` fuera de restauración (reusar el id de un servicio eliminado bloqueaba "Restaurar"); proveedor desactivado rechazado; restaurar no exige concepto; todo servicio con ≥1 gasto (constraint triggers diferidos `servicios_con_gastos` y `gastos_servicio_no_vacio`); `actualizar_servicio` rechaza ids ajenos; `eliminar_unidad` solo toma servicios eliminados cuya copia más reciente es de esa unidad; `nombre_usuario` y `archivo_comprobante_en_uso` no responden sin rol; `gastos_para_reporte` exige ver todo; candados (10 comprobantes, último admin); `reporte_gastos` con `p_anterior_desde`/`p_anterior_hasta` (regresa `anterior_desde`/`anterior_hasta`).
  - BD (`20261031005707_cerrar_sesiones_usuario.sql`): `cerrar_sesiones_usuario()` (solo admin), usada al restablecer contraseña y al desactivar.
  - App: "Nuevo proveedor" ya no envía el formulario del servicio (stopPropagation; en React el submit sube por el árbol aunque el diálogo esté en un portal); coma decimal; `useRemountAfterSave` (Next conserva pantallas ocultas con estado: después de guardar, volver muestra un formulario nuevo) en servicios y unidades; botón deshabilitado después de guardar; `useUnsavedChanges`; lista de gastos con `key` que incluye una firma de los datos; scroll infinito sin bucle con error; tipo de cambio por id de renglón y re-sugerido al cambiar la fecha; vistas previas de comprobantes recreadas al volver; reintentos por clave (no por nombre); nombre de comprobante saneado en el servidor y descarga en ASCII; Reportes por calendario; fechas inexistentes descartadas; ids como uuid y topes en schemas; tope de USD; `T17` = `T-17`; limpieza de archivos huérfanos (>1 h) al pedir una subida y tope de 10 antes de subir; `src/app/(app)/error.tsx`; avisos en el Excel; "$1 M" en la gráfica impresa; "Casi igual" en lugar de "+0% menos".
- Tablas / migraciones nuevas: las dos de arriba. Rutas nuevas: ninguna (solo `error.tsx`).
- Verificado: build limpio (worktree aparte con `npm ci`), lint, `tsc`, `npm audit --omit=dev` (0); tipos regenerados; ensayos sin commit: 24 casos del Lote 1, 3 de sesiones; regresión capturista 42/43 (el restante es una prueba mal planteada: los `[PRUEBA]` comparten PDF), gerente 14/14, validaciones 13/13, dólares 17/17; 14 casos de montos con coma y 9 de periodos (fin de mes, bisiesto).
- Nota para pruebas por SQL: la BD corre en UTC; después de las 17:00 de Tijuana `current_date` ya es "mañana" y la regla de fecha futura rechaza el servicio. Usar `(now() at time zone 'America/Tijuana')::date`.
- Pendientes / por decidir:
  - Probar en el navegador los puntos de la lista de arriba (0).
  - El capturista sigue pudiendo abrir los archivos de sus servicios que el admin mandó a Eliminados (rama `owner_id` de la política de Storage). Decidir si se quiere.
  - El gerente no ve la bitácora de eliminaciones (solo admin). Decidir si debe verla.
  - El token de acceso de una sesión cerrada vive hasta que caduca (duración de JWT en Auth).

### Corrección posterior — Validaciones de captura (2026-10-28, aprobada por el usuario)
- Encontrado en la batería de pruebas de capturista (43 casos). Toca funciones de la Sección 2:
  - `preparar_servicio()`: la validación de "unidad dada de baja" nunca se cumplía para ningún rol (`current_setting(..., true)` regresa NULL fuera de una restauración y `NULL = id` anulaba el `if`). Ahora usa `coalesce(..., '')`.
  - `preparar_gasto()`: ahora rechaza una categoría desactivada al agregar un gasto o al cambiarle la categoría.
  - Se sigue pudiendo editar un servicio o gasto viejo de una unidad o categoría ya dada de baja, y restaurar servicios eliminados.
- Desde la app no pasaba (los selectores solo muestran unidades y categorías activas); solo por API directa.
- Migración: `20261028185201_validar_unidad_baja_y_categoria_inactiva.sql`. Ensayada sin commit (13 casos con capturista y admin) y regresión: capturista 42/43 (el caso restante es una prueba mal planteada: los `[PRUEBA]` comparten el mismo PDF; con archivo único pasa), 5B 17/17, gerente 14/14.

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