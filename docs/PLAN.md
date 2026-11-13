# PLAN — Administración Trailers

## Permisos por rol

| Acción | admin | capturista | gerente (D4) |
|---|---|---|---|
| Iniciar sesión | Sí | Sí | Sí |
| Ver unidades, categorías y proveedores activos | Sí | Sí | Sí (también inactivos y de baja) |
| Crear / editar / desactivar unidades y categorías | Sí | No | No |
| Crear proveedor nuevo | Sí | Sí (para no frenar la captura) | No |
| Editar / desactivar proveedores | Sí | No | No |
| Registrar servicios, gastos y comprobantes | Sí | Sí | No |
| Ver registros | Todos | Solo los propios | Todos |
| Editar registros | Todos | Solo los propios, con motivo obligatorio (D1) | No |
| Eliminar registros | Sí | No | No |
| Ver historial de cambios de un registro | Todos | Solo de los propios | Todos |
| Dashboard y reportes | Sí | No | Sí |
| Crear y cancelar tickets de taller (D16) | Sí | No | Sí (único permiso de escritura) |
| Aceptar o rechazar tickets de taller (D16) | Sí | Sí | No |
| Kilometraje semanal (D15) | Sí, cualquier día; elige los días de registro | Sí, en los días de registro (lunes y martes al empezar) | Solo ve |
| Gestionar usuarios | Sí | No | No |

## Decisiones tomadas
- **D1 — Edición de registros** (resuelta 2026-10-23): el capturista puede editar sus propios servicios y gastos sin aprobación de un admin. Cada edición exige un motivo y queda en un historial de cambios (quién, cuándo, qué valores cambiaron y por qué). Los registros editados se marcan como "Editado" y muestran su línea de cambios. No hay estados `pendiente` / `aprobado`.
- **D2 — Dominio** (resuelta 2026-10-23): dominio final `flotilla.bajaws.com.mx` (Cloudflare → Vercel). Mientras tanto se usa el dominio gratuito `*.vercel.app`.
- **D3 — Unidades** (resuelta 2026-10-23, ampliada el mismo día): la tabla, el feature y la ruta se llaman `unidades`; en la interfaz, "Unidades".
  - Tipo (enum `tipo_unidad`) y prefijo obligatorio del número económico: `trailer` (T-), `camion_rabon` (F-), `pipa` (P-), `caja` (R-), `camioneta` (C-). Formato: prefijo, guion y número (`T-17`).
  - Operación (enum `operacion_unidad`): `local` o `foraneo`. Las camionetas no tienen operación: forman su propio grupo. La pantalla de Unidades se divide en Locales, Foráneos y Camionetas, y los reportes pueden separar el gasto por operación. Una unidad puede cambiar de operación.
  - Las cajas de los trailers son unidades individuales, con su propio número económico e historial de gastos, y guardan su longitud en pies (40, 50 o 53). No se registra qué caja lleva cada trailer.
  - Chofer: catálogo `choferes`; cada unidad tiene un chofer opcional.
  - Estatus (enum `estatus_unidad`): `activo`, `en_taller`, `por_llegar`, `baja`.
  - Obligatorios: número económico, tipo y operación (excepto camionetas). Opcionales: placas, marca, modelo, año, VIN, chofer, longitud (solo cajas) y notas.
  - Se pueden dar de alta más unidades de cualquier tipo; agregar un tipo nuevo requiere una migración.
- **D4 — Rol gerente** (resuelta 2026-10-23, dentro de la Sección 2): rol `gerente` de solo lectura para los gerentes. Ve unidades, servicios, gastos, historial y reportes de todos; no registra, edita ni elimina nada, ni crea proveedores. Solo un admin asigna el rol. Se aplica en RLS (funciones `puede_ver_todo()` y `puede_capturar()`) y en el servidor.
- **D5 — Eliminar una unidad por completo** (resuelta 2026-10-23, dentro de la Sección 2): además de darla de baja (reversible), el admin puede eliminar una unidad con todos sus servicios, gastos y línea de cambios. Exige escribir `ELIMINAR REGISTRO` en la pantalla y la función `eliminar_unidad()` vuelve a revisarlo. No se puede deshacer. Queda un renglón en `bitacora_eliminaciones` (número económico, tipo, servicios, gastos, total, quién y cuándo). Es la única excepción a "el historial no se puede alterar" de D1, junto con la siguiente.
  - Servicios eliminados (con motivo) quedan en **Servicios › Eliminados**: el admin los puede restaurar tal como estaban (`restaurar_servicio()`, con motivo) o eliminarlos para siempre escribiendo `ELIMINAR REGISTRO` (`eliminar_servicio_definitivo()`), lo que borra su copia y su línea de cambios y deja una nota en la bitácora.

- **D6 — Sin verificación en dos pasos** (resuelta 2026-10-26, Sección 2.5): se implementó un código de app autenticadora para admin y gerente y el usuario decidió quitarlo. Todos los roles entran solo con contraseña. La protección de la cuenta queda en la política de contraseñas, la protección contra contraseñas filtradas y el cierre por inactividad de Supabase Auth.
- **D7 — Comprobantes** (resuelta 2026-10-26, Sección 3): hasta 10 comprobantes (PDF o foto) por servicio. Si el archivo ya está en otro servicio se avisa y se puede subir de todos modos; el mismo archivo dos veces en un servicio no se permite. Agregar y quitar sigue las reglas de editar (D1): el capturista en sus servicios y el admin en todos; quitar pide motivo y queda en la línea de cambios. El gerente solo los ve. Sin folio, fecha ni total propios: ya están en el servicio y sus gastos.

---

## Sección 0 — Fundación
Se divide en dos partes porque el proyecto de Supabase en la nube aún no está disponible. Ambas se trabajan en la rama `seccion-0-fundacion`; la sección se cierra (merge a `main`) solo al terminar 0B.

### 0A — Sin conexión a Supabase
**Alcance**
- Proyecto Next.js + TypeScript strict + Tailwind + shadcn/ui inicializado.
- Supabase CLI configurado con `npx supabase init` (sin `link`, sin Docker ni entorno local).
- Migración escrita pero NO aplicada: enum `rol_usuario` (`admin`, `capturista`) y tabla `perfiles` (id = `auth.users.id`, nombre, rol, activo, created_at). Trigger que crea el perfil al crear un usuario. RLS habilitado en `perfiles`.
- Funciones SQL de apoyo para RLS: `es_admin()` y `rol_actual()` (en la misma migración, sin aplicar).
- Clientes de Supabase (navegador y servidor) con `@supabase/ssr`, leyendo URL y publishable key de `.env.local`.
- Middleware que protege todas las rutas excepto `/login`, leyendo de `.env.local`.
- `.env.example` sin valores reales; `.env.local` excluido por `.gitignore`.
- Pantalla de `/login` (correo y contraseña) con UI y validación Zod, sin funcionalidad real de autenticación.
- Layout base con navegación según rol y botón de cierre de sesión (sin funcionalidad real).
- Datos de ejemplo (usuario/rol simulado) aislados en `src/mock/`, nunca dentro de componentes; se eliminan en 0B.
- Archivos `CLAUDE.md`, `docs/PLAN.md` y `docs/ESTADO.md` en el repo.

**Terminado cuando**
- `npm run build` y `npm run lint` pasan sin errores.
- `/login` y el layout se ven correctamente en celular y escritorio, con ambas navegaciones (admin y capturista) visibles usando los datos de `src/mock/`.
- La migración existe en `supabase/migrations/` y no se ha aplicado.

### 0B — Con conexión a Supabase
**Alcance**
- Proyecto en la nube enlazado con `npx supabase link`.
- Migración de 0A aplicada con `npx supabase db push` y tipos regenerados en `src/lib/supabase/database.types.ts`.
- `.env.local` con URL y publishable key reales (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- Registro público deshabilitado en Supabase Auth.
- Login, cierre de sesión y proxy funcionando contra Supabase.
- Layout leyendo el rol real desde `perfiles`; se elimina `src/mock/`.
- Usuarios de prueba creados manualmente: un admin y un capturista.

**Terminado cuando**
- Un admin y un capturista creados manualmente pueden entrar y ven navegaciones distintas.
- Sin sesión, cualquier ruta redirige a `/login`.
- RLS de `perfiles` probado con ambos roles.
- Checklist de cierre de `CLAUDE.md` completo.

## Sección 1 — Catálogos
**Alcance**
- Enums `tipo_unidad` (`trailer`, `caja`, `camion_rabon`, `pipa`, `camioneta`), `operacion_unidad` (`local`, `foraneo`) y `estatus_unidad` (`activo`, `en_taller`, `por_llegar`, `baja`).
- Tablas:
  - `choferes` (nombre único sin importar mayúsculas, telefono, activo).
  - `unidades` (numero_economico único con prefijo según tipo, tipo, operacion, estatus, chofer_id opcional, longitud_pies solo para cajas, placas, marca, modelo, anio, vin único opcional, notas).
  - `categorias` (nombre único, activo) y `proveedores` (nombre único, telefono, notas, activo).
- Seed de categorías dentro de la migración: Motor, Transmisión, Frenos, Suspensión, Eléctrico, Llantas, Carrocería, Mantenimiento preventivo, Otros.
- CRUD de unidades, choferes y categorías (solo admin). Alta rápida de proveedor disponible para ambos roles.
- Lista de unidades separada en Locales, Foráneos y Camionetas, con búsqueda por número económico y filtros por tipo, estatus y "sin chofer".
- Carga inicial única de la flotilla actual (fuera de migraciones), revisada antes de aplicarla.

**Terminado cuando**
- RLS impide que un capturista modifique unidades, choferes o categorías, incluso por API directa.
- No se pueden repetir números económicos (en ningún tipo, sin importar mayúsculas o espacios) ni usar un prefijo que no corresponda al tipo.
- La flotilla actual está cargada y coincide con la lista entregada.

## Sección 2 — Servicios y gastos
**Alcance**
- Tabla `servicios`: unidad_id, fecha, kilometraje, descripcion, proveedor_id, created_by, updated_by.
- Tabla `gastos`: servicio_id, categoria_id, concepto, monto `numeric(12,2)`.
- Un servicio puede tener varios gastos (ej. frenos + aceite en la misma visita).
- Si la categoría es "Otros (especificar)", el concepto del gasto es obligatorio y debe decir qué fue.
- Formulario de captura mobile-first: elegir unidad, fecha, km, proveedor y agregar renglones de gasto.
- Ficha de la unidad con su historial de servicios y total invertido.
- Edición (D1): el capturista edita sus propios servicios y gastos; admin edita todos. Motivo obligatorio en cada edición.
- Tabla `historial_cambios` (tabla, registro_id, accion: insert / update / delete, datos_anteriores y datos_nuevos en `jsonb`, motivo, created_by, created_at), llenada por triggers en `servicios` y `gastos`. Sin políticas de update ni delete: el historial no se puede alterar.
- Marca "Editado" en los registros con cambios y vista de su línea de cambios (qué campo cambió, de qué valor a qué valor, quién, cuándo y por qué).
- Eliminar servicios: solo admin; queda registrado en el historial.

**Terminado cuando**
- Capturista solo ve y edita sus propios servicios; admin ve y edita todos.
- El total del servicio cuadra con la suma de sus gastos.
- Toda edición deja un renglón en `historial_cambios` con motivo, incluso si se hace por API directa.
- Un capturista no puede eliminar registros ni modificar el historial, incluso por API directa.

## Sección 2.5 — Seguridad
Se agregó entre la 2 y la 3 (2026-10-26) para que todo lo que sigue nazca protegido. Toca código de secciones cerradas (configuración, clientes de Supabase, políticas de lectura) con autorización del usuario.

**Alcance**
- Encabezados de seguridad en todas las respuestas (`next.config.ts`): HSTS, Content-Security-Policy, `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara solo para la propia app) y sin `X-Powered-By`.
- Cookies de sesión `httpOnly`, `secure` (en producción) y `sameSite=lax`: ningún script del navegador puede leer el token.
- Las políticas de lectura de catálogos (choferes, unidades, categorías, proveedores) exigen tener rol, no solo sesión: un usuario desactivado deja de ver todo aunque su token siga vigente.
- `npm audit` sin vulnerabilidades altas o críticas.
- Ajustes del dashboard de Supabase que hace el usuario (no son migraciones): protección contra contraseñas filtradas, política de contraseñas, cierre de sesión por inactividad.

**Terminado cuando**
- Las respuestas de la app traen todos los encabezados de seguridad y la app funciona con la CSP activa.
- La cookie de sesión aparece como `HttpOnly` en el navegador.
- Un usuario desactivado con sesión todavía vigente no ve ni modifica nada, ni por API directa.
- Admin, capturista y gerente siguen entrando y trabajando igual que antes.
- Checklist de cierre de `CLAUDE.md` completo.

## Sección 3 — Comprobantes
**Alcance**
- Bucket privado `comprobantes` (PDF, JPEG, PNG, WebP; máximo 10 MB), creado por migración, con políticas por rol. Ruta `servicio_id/comprobante_id.ext`.
- Tabla `comprobantes`: servicio_id, ruta_archivo, tipo_mime, tamano_bytes, hash_sha256, nombre_archivo, created_at, created_by. Hasta 10 por servicio (D7).
- RLS: ve quien ve el servicio; agrega y quita quien puede editarlo; el gerente solo ve. Las mismas reglas en `storage.objects`.
- Historial: agregar y quitar quedan en la línea de cambios (quitar con motivo). Al eliminar un servicio, sus comprobantes van en la copia y los archivos se conservan; restaurar los regresa. Eliminar para siempre (servicio o unidad) borra también los archivos.
- Subida: el navegador reduce las fotos (lado mayor 2000 px, JPEG) sin librerías y calcula SHA-256; una Server Action da una URL firmada de subida; el archivo va directo a Storage; otra Server Action lo descarga, revisa su firma de bytes (PDF, JPEG, PNG o WebP), recalcula el hash y lo registra.
- Duplicados: si el hash ya está en otro servicio, se avisa (unidad y fecha) y se puede subir de todos modos.
- Captura en el formulario de servicio nuevo (cámara o archivo, vista previa) y en el detalle del servicio (agregar y quitar).
- Visor: `/comprobantes/[id]` revisa la sesión y RLS en cada petición y redirige a una URL firmada de 60 segundos; ningún enlace guardado sirve sin sesión.
- Corrige `eliminar_unidad()` (Sección 2): también borra la copia de los servicios de esa unidad que estaban en Eliminados.

**Terminado cuando**
- Ningún archivo es accesible sin sesión ni por URL pública o vencida.
- El capturista no ve, sube ni quita comprobantes de servicios ajenos, ni por API directa.
- Subir el mismo archivo dos veces muestra advertencia.
- Un archivo que no es PDF ni imagen aunque tenga esa extensión se rechaza.
- Eliminar y restaurar un servicio conserva sus comprobantes; eliminarlo para siempre borra los archivos.

### 3B — Lista de gastos (pedida por el usuario el 2026-10-26)
**Alcance**
- En la ficha de la unidad y en Servicios (incluye "Mis servicios"): un renglón por gasto con fecha, categoría (y concepto), monto y botón "Ver factura". En Servicios también la unidad.
- Buscador por categoría o concepto, rango de fechas y, en Servicios, número económico; todo en la URL. Total y número de gastos de lo filtrado, sumados en la BD.
- La lista vive en un cuadro con su propio scroll (unos 10 renglones visibles) y carga tandas de 25 al acercarse al fondo.
- "Ver factura" abre un modal sin salir de la página: fotos y PDF (pdf.js, se descarga solo al abrir un PDF; funciona en Android). Varios comprobantes: anterior / siguiente. El detalle del servicio usa el mismo visor.
- BD: vista `gastos_detalle` y funciones `listar_gastos()` / `resumen_gastos()` (security invoker, filtros en SQL sin comodines del usuario).

**Terminado cuando**
- Con más de 25 gastos, el scroll del cuadro carga el resto sin repetir ni saltar renglones.
- El total filtrado cuadra con la suma en la BD; el capturista solo ve lo suyo.
- Un PDF se ve dentro del modal en un celular Android.

## Sección 4 — Dashboard y reportes (admin y gerente, D4)
**Alcance**
- Filtros en la URL: periodo (atajos: este mes, mes pasado, últimos 3 / 6 / 12 meses, este año, o rango propio; por defecto últimos 12 meses), grupo (locales, foráneos, camionetas) y tipo de unidad.
- Cifras clave: total invertido con comparación contra el periodo anterior del mismo largo, servicios, gastos y promedio por unidad.
- Gráficas (Recharts, cargado solo en Reportes): gasto por mes, por categoría, por grupo y por tipo de unidad. Ranking de las 10 unidades con más gasto y de los 10 proveedores.
- Exportar a Excel (`/dashboard/exportar`, route handler, `write-excel-file` en el servidor): detalle de gastos y resúmenes por unidad, categoría, mes y proveedor del periodo filtrado.
- Inicio del admin y gerente: total del mes en curso, las 3 unidades con más gasto y enlace a Reportes.
- BD: `reporte_gastos()` (todos los agrupados en una consulta, montos como texto) y `exportar_gastos()`; ambas exigen admin o gerente.

**Terminado cuando**
- Los totales del dashboard y del Excel coinciden con la suma de gastos en BD para el mismo filtro.
- El capturista no puede entrar a Reportes ni descargar el Excel, ni por URL o API directa.
- Las gráficas se leen bien en el celular.

## Sección 5 — Extras (opcional)

### 5A — Gestión de usuarios (aprobada 2026-10-26)
**Alcance**
- `/admin/usuarios` (solo admin): lista con nombre, correo, rol, activo y último acceso, con buscador.
- Nuevo usuario: correo, nombre, rol y contraseña inicial (escrita o generada por la app y mostrada una sola vez). Sin correo de invitación: el correo de fábrica de Supabase tiene límite bajo y cae en spam.
- Editar nombre y rol; desactivar o reactivar; restablecer contraseña.
- Protecciones en la BD: nadie se quita a sí mismo el rol de admin ni se desactiva, y siempre queda al menos un admin activo.
- La llave `service_role` solo en el servidor (`SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y en Vercel), en `lib/supabase/admin.ts` con `server-only`.

**Terminado cuando**
- Un admin crea un usuario de cada rol y ese usuario entra con la contraseña inicial.
- Un capturista o gerente no puede ver la lista ni crear, editar o desactivar usuarios, ni por API directa.
- No se puede dejar el sistema sin admin activo.

### 5B — Facturas en dólares (aprobada 2026-10-27)
**Alcance**
- Cada renglón de gasto se captura en pesos (MXN, como hasta ahora) o en dólares (USD).
- En dólares se escribe el tipo de cambio (hasta 4 decimales) y la cantidad en dólares; el monto en pesos se calcula solo (`round(monto_usd × tipo_cambio, 2)`) y lo calcula la BD, no el navegador.
- Al poner un renglón en dólares se sugiere el tipo de cambio FIX que aplica en la fecha del servicio, el publicado en el DOF el día hábil anterior (regla de contabilidad; serie SF60653 de Banxico, por fecha de liquidación, no la SF43718 por fecha de determinación); se puede corregir. Reportes muestra además "Pagado en dólares" del periodo. Otro renglón en dólares del mismo servicio reutiliza el que ya se escribió. Token de Banxico solo en el servidor (`BANXICO_TOKEN`); sin token o sin respuesta, se escribe a mano.
- `gastos.monto` sigue siendo el monto en MXN: reportes, totales y gráficas no cambian.
- Detalle del servicio, lista de gastos y línea de cambios muestran el monto en dólares y el tipo de cambio. El Excel agrega moneda, monto en USD y tipo de cambio en el detalle.

**Terminado cuando**
- Un gasto en dólares guarda el monto en pesos exacto al centavo, también si alguien manda otro monto en pesos por API directa.
- Editar el tipo de cambio o la cantidad en dólares recalcula el monto en pesos y queda en la línea de cambios con su motivo.
- Eliminar y restaurar un servicio conserva la moneda y el tipo de cambio.
- Los servicios existentes quedan en pesos sin cambios.

### 5C — Optimización, seguridad y escalabilidad (aprobada 2026-10-28)
**Alcance**
- Freno de login: 1 regla de límite de intentos por IP en el Firewall de Vercel para `/login` (plan Hobby, sin costo; la configura el usuario con los valores que pasa Claude). El login corre en el servidor, así que el límite por IP de Supabase ve la IP de Vercel y no la de la persona.
- Migración: quitar al rol `anon` los permisos sobrantes en `perfiles` y la ejecución de funciones auxiliares (`actualizar_updated_at`, `normalizar_unidad`, `prefijo_tipo_unidad`).
- Ajustes del dashboard de Supabase de "Seguridad" (los hace el usuario) y revisión de Advisors (Security y Performance); lo que salga se atiende aquí.
- Prueba de carga: ~1,000 servicios por unidad (~35 mil) en transacción sin commit; medir lista de gastos, ficha de unidad, Reportes, Excel e Inicio, y optimizar (índices, consultas) lo que pase de ~1 s.

**Terminado cuando**
- `anon` no tiene permisos en ninguna tabla ni vista de `public` y no ejecuta funciones de `public`; los tres roles siguen funcionando igual.
- Las consultas principales responden en menos de ~1 s con el volumen de la prueba de carga.
- Advisors de Supabase sin avisos de seguridad pendientes (o justificados en `docs/ESTADO.md`).
- La regla de login está publicada y un exceso de intentos regresa 429.

### 5D — Correcciones de la auditoría (aprobada 2026-10-28)
Auditoría con 5 agentes en paralelo (BD, permisos, servidor, dinero y fechas, pantallas). El usuario aprobó todo.

**Alcance**
- Lote 1 (BD): motivo exigido también en gastos por API; id y fechas de auditoría los fija la BD; todo servicio con al menos un gasto; ids ajenos rechazados en `actualizar_servicio`; proveedor desactivado rechazado; `eliminar_unidad` sin tocar servicios que ya no son de esa unidad; usuario desactivado sin respuesta en funciones auxiliares; base de reportes solo para quien ve todo; candados de concurrencia (10 comprobantes, último admin); restaurar sin exigir concepto.
- Lote 2 (app): "Nuevo proveedor" no envía el formulario del servicio; coma decimal (`1500,50` = 1,500.50); formularios limpios al volver; lista de gastos al día tras editar o eliminar; sin doble envío; scroll infinito sin bucle sin conexión; aviso al salir de un formulario con cambios; periodo anterior de Reportes por calendario (mes anterior, mismo tramo, año anterior); nombre de descarga saneado; restablecer contraseña cierra las sesiones abiertas.
- Lote 3 (menores): fechas inexistentes en filtros, pantalla de error, "+0%", montos de la BD con signo o más decimales, búsqueda `T17` = `T-17`, tipo de cambio al cambiar la fecha, reintentos de fotos con el mismo nombre, fugas de vistas previas, topes en schemas e ids como uuid, tope de USD, archivos huérfanos de comprobantes.

**Terminado cuando**
- Cada hallazgo tiene una prueba que antes fallaba y ahora pasa, y las baterías de capturista, gerente, dólares y validaciones siguen pasando.

### 5E — Entradas a taller y unidades vendidas (propuesta 2026-11-06, pendiente de que el usuario diga "empieza")
Decisiones del usuario (D12, 2026-11-06):
- Un servicio sin entrada a taller se permite con aviso.
- La salida se da con una casilla en el servicio o con un botón en Taller.
- Entrada y salida las dan admin y capturista; el gerente solo ve.
- "En taller" no se elige a mano (hecho en la rama `fix-estatus-taller`).
- Estatus propio "Vendida" (solo admin, desde la ficha de la unidad, con confirmación); libera la entrada a taller en automático; se puede deshacer (solo admin).
- Una unidad en taller no se da de "Baja" directo: primero salida.

**Alcance**
- BD:
  - Valor `vendida` en `estatus_unidad` (en su propia migración).
  - Tabla `entradas_taller`: unidad_id, fecha_entrada (`date`), falla (obligatoria), fecha_salida (`date`, nula mientras esté en taller), nota_salida, salida_by, created_by, created_at, updated_at. Índice único parcial: una sola entrada abierta por unidad.
  - Columnas en `servicios`: `entrada_taller_id` (opcional) y `sin_entrada_taller` (boolean; solo la pone `registrar_servicio()` en servicios nuevos, para no marcar los que ya existen).
  - Columnas en `unidades`: `fecha_venta`, `nota_venta`.
- Funciones (todas revisan rol por dentro):
  - `registrar_entrada_taller()`: ni dada de baja, ni vendida, ni ya en taller. Pone `estatus = en_taller`.
  - `dar_salida_taller()`: fecha de salida ≥ fecha de entrada. Regresa la unidad a `activo`.
  - `marcar_unidad_vendida()` y `deshacer_venta()`, solo admin. Vender cierra la entrada abierta con la fecha de venta y la nota "Unidad vendida". Deshacer regresa la unidad a `activo`, no a taller.
  - `registrar_servicio()` y `actualizar_servicio()`:
    - Ligan el servicio a la entrada abierta de la unidad solo si la fecha del servicio es ≥ la fecha de entrada.
    - Con la casilla marcada, dan la salida en la misma transacción (fecha de salida = fecha del servicio).
    - Si se cambia la unidad, el servicio se desliga y se vuelve a evaluar.
- Reglas: con una entrada abierta, el estatus no se cambia a mano (solo con salida o venta). Eliminar un servicio no regresa la unidad a taller. Restaurarlo lo vuelve a ligar si la entrada existe. Las vendidas se ocultan al capturista igual que las de baja y no admiten servicios nuevos ni entradas.
- RLS: admin, capturista y gerente ven todas las entradas; admin y capturista registran entrada y salida; nadie borra. Entrada, salida, venta y deshacer venta quedan en `historial_cambios`.
- Página `/taller` (los tres roles; mobile-first):
  - Unidades en taller con los días que llevan, la falla, quién la reportó y los servicios de la estancia.
  - Botones "Registrar servicio" (abre el formulario con la unidad), "Dar salida" y "Registrar entrada a taller".
  - Enlace en la navegación.
- Formulario de servicio: si la unidad está en taller, muestra la falla y la casilla "La unidad sale de taller con este servicio" (marcada). Si no, aviso "Esta unidad no tiene entrada a taller".
- Marca "Sin entrada a taller" en el detalle del servicio y aviso en el Inicio del admin. El Inicio de admin y gerente toma "Unidades en taller" de las entradas abiertas.
- Ficha de la unidad: historial de entradas a taller (entrada, salida, días, falla); botones "Marcar como vendida" / "Deshacer venta" (solo admin, con confirmación).
- La unidad que hoy está en taller recibe una entrada abierta con la falla "Registrada antes de las entradas a taller".

**Terminado cuando**
- Una unidad no puede tener dos entradas abiertas ni quedar `en_taller` sin entrada, ni por API directa.
- El gerente ve Taller pero no registra entradas, salidas ni ventas; el capturista no vende ni deshace ventas, ni por API directa.
- Registrar un servicio con la casilla marcada saca la unidad del taller; desmarcada, la deja en taller con el servicio ligado a la misma entrada.
- Un servicio nuevo de una unidad sin entrada abierta (o con fecha anterior a la entrada) se guarda marcado y aparece en el aviso del admin; los servicios anteriores a la 5E no se marcan.
- Vender una unidad en taller la quita de Taller y conserva su historial y gastos en Reportes; deshacer la venta la regresa a Activo.
- Las baterías de capturista, gerente, dólares y validaciones siguen pasando; Taller e Inicio responden en menos de ~1 s.

#### Plan de trabajo de la 5E (acordado 2026-11-06)
Cada etapa se sube y se prueba sola. No se pasa a la siguiente hasta que el usuario confirme en producción que todo lo anterior sigue funcionando. Ninguna etapa empieza sin su "empieza".

**Reglas para todas las etapas**
1. La BD va un paso adelante y es compatible con la app publicada (las migraciones se aplican antes de que Vercel publique):
   - Solo se agregan tablas y columnas opcionales.
   - Las funciones existentes conservan su firma; lo nuevo va con parámetros con valor por defecto.
   - Nada se borra ni se renombra.
2. Cada migración se ensaya en `begin … rollback` con los tres roles y con las pruebas de `supabase/tests`. Si todo pasa, Claude la aplica (`db push`) y reporta el resultado.
3. En cada etapa se corren las baterías existentes (capturista 43, gerente 14, dólares 17, validaciones 13) más las pruebas nuevas. Si una prueba que pasaba ahora falla, la etapa no se sube.
4. Antes de unir a `main`: `tsc`, lint y build completo en una copia aparte, `npm audit --omit=dev` en 0 y tipos regenerados.
5. El usuario prueba en el navegador (celular de 360 px y escritorio, con texto de 200 caracteres sin espacios).
6. Se miden los tiempos de Inicio, Servicios, Unidades, ficha de unidad y Reportes antes de empezar y al final de cada etapa. Si algo sale más lento, se corrige antes de subir.
7. Plan de regreso: cada etapa es un merge que se puede revertir. Si se cambia una función existente, su versión anterior se guarda para regresarla con otra migración.

**Etapas**
- **Etapa 0 — Línea base** (sin cambios): correr las baterías y guardar los resultados; medir tiempos; confirmar los respaldos diarios de Supabase.
- **Etapa 1 — Entradas a taller y página Taller.**
  - Se agrega: tabla `entradas_taller` con RLS, `registrar_entrada_taller()` y `dar_salida_taller()`, página `/taller` y su enlace; la unidad que hoy está en taller recibe su entrada abierta. Incluye la rama `fix-estatus-taller`.
  - No se toca: servicios, Reportes ni gastos.
  - Riesgo: bajo.
- **Etapa 2 — Estatus "Vendida".**
  - Se agrega: el valor de enum en su propia migración, `fecha_venta` / `nota_venta`, `marcar_unidad_vendida()` y `deshacer_venta()`, botones en la ficha y el filtro en Unidades.
  - Se ajusta: las políticas que ocultan las de baja al capturista también ocultan las vendidas; no se registran servicios a vendidas.
  - Prueba clave: el total de Reportes es igual antes y después de vender.
  - Riesgo: medio-bajo (se repiten completas las baterías de capturista y gerente).
- **Etapa 3 — Ligar servicios con el taller.**
  - Decisiones del usuario (D13, 2026-11-06): un servicio de una unidad sin entrada a taller (no está en taller, o la fecha del servicio es anterior a su entrada) exige un **motivo**, con botones rápidos "Reparación en camino", "Mantenimiento en patio", "Se olvidó la entrada" y "Otro…" (texto). Lo exige el servidor (Zod); la BD lo guarda (`servicios.motivo_sin_entrada`) sin exigirlo, para no romper la app publicada durante el cambio. "Se olvidó la entrada" solo aparece al registrar un servicio nuevo de una unidad que no está en taller ahora: pide fecha de entrada (≤ fecha del servicio) y falla, crea la entrada en la misma transacción, liga el servicio y aplica la casilla de salida (marcada: la estancia queda cerrada con la fecha del servicio; desmarcada: la unidad queda en taller). Al editar se puede corregir el motivo, no crear la entrada.
  - Se agregan columnas opcionales en `servicios`.
  - Se ajustan `registrar_servicio()` y `actualizar_servicio()` (parámetros nuevos opcionales: llamadas como las de hoy se comportan igual) y el formulario de servicio.
  - Prueba clave: los totales de Reportes y por unidad son idénticos al centavo antes y después.
  - Riesgo: medio. Va sola, después de que las etapas 1 y 2 estén probadas en producción.
- **Etapa 4 — Avisos, Inicio y ficha.** Marca "Sin entrada a taller", aviso en el Inicio del admin, "Unidades en taller" desde las entradas abiertas, historial de estancias en la ficha. Los servicios anteriores no se marcan. Riesgo: bajo.
- **Etapa 5 — Cierre.** Prueba de carga como la de la 5C (Taller, Inicio, formulario y Reportes en menos de ~1 s), regresión completa, Advisors y `docs/ESTADO.md`.

Costo: ninguno extra (los ensayos van en transacciones). El proyecto aparte `administracion-trailers-dev` se usará cuando haya datos reales.

### 5F — Mantenimientos (acordada 2026-11-06, pendiente de que el usuario diga "empieza")
Decisiones del usuario (D14, 2026-11-06), con sus nombres para los tipos:
- **Tipo de servicio**, obligatorio en servicios nuevos (los anteriores quedan sin tipo):
  - **Preventivo:** se hace antes de que algo falle (ej. balatas gastadas).
  - **Correctivo:** lo constante, cada cierto kilometraje o tiempo (ej. cambio de aceite). Es el que se programa y avisa.
  - **Servicio:** todo lo demás (reparaciones).
  - Se ve como etiqueta en el detalle y en las listas.
- **El tipo va en el servicio; la categoría del gasto dice qué se compró.** El aceite que se pone al reparar un motor es un gasto de aceite dentro de un *servicio*: no reinicia el cambio de aceite programado. Solo un correctivo que se marca como cumplimiento de un mantenimiento reinicia su contador. En Reportes todo sigue siendo gasto (los totales no cambian) y se agrega el gasto por tipo.
- **Mantenimientos por unidad**, en la ficha de la unidad (admin agrega, edita y quita): nombre; intervalo por kilometraje, por tiempo (meses: 6, 12…) o "lo que pase primero"; desde cuándo cuenta (último km y fecha). Las cajas solo por tiempo. Atajo "Copiar de otra unidad". Cada unidad tiene los suyos (no son iguales por tipo).
- **Kilometraje:**
  - Cada unidad tiene un kilometraje actual: el primero lo captura el admin; después se actualiza con cada servicio y entrada a taller.
  - Obligatorio en servicios nuevos (menos cajas) y en la entrada a taller.
  - **Si es menor al último registrado, no se guarda** ("El kilometraje no cuadra: el último de T-17 es 250,000 km").
  - Solo el admin corrige el kilometraje actual (odómetro cambiado, error anterior), con motivo; queda registrado.
- **Una sola captura:** todo se registra en "Registrar servicio". La página **Mantenimientos** solo organiza, con dos pestañas:
  - Correctivos: qué le toca a cada unidad y cuánto falta, en verde / ámbar / rojo.
  - Preventivos: historial.
  - Su botón "Registrar" abre el formulario de servicio con la unidad, el tipo y el mantenimiento ya puestos.

**Alcance**
- BD:
  - Enum `tipo_servicio` (`preventivo`, `correctivo`, `servicio`) y `servicios.tipo` (null en los de antes).
  - `unidades.kilometraje_actual`, tomado al inicio del mayor kilometraje registrado en sus servicios.
  - Tabla de correcciones de kilometraje (quién, cuándo, de cuánto a cuánto, motivo).
  - Tabla `mantenimientos_unidad`: unidad, nombre, `cada_km`, `cada_meses` (al menos uno), km y fecha de partida, activo.
  - Tabla `servicios_mantenimientos`: qué mantenimientos cumplió un correctivo, con su km y fecha.
  - Función que calcula lo pendiente por unidad: próximo km / fecha y estado.
  - Validaciones en la BD: kilometraje no menor al actual; un mantenimiento solo lo cumple un correctivo de su misma unidad.
- RLS:
  - Los tres roles ven los mantenimientos y lo pendiente.
  - Solo el admin configura mantenimientos y corrige el kilometraje.
  - Admin y capturista registran servicios, como hoy.
- App:
  - Kilometraje obligatorio en el formulario de servicio y en la entrada a taller.
  - Tipo de servicio en el formulario, con "¿Cuenta como el cambio de … programado?" en los correctivos.
  - Sección Mantenimientos y corrección de kilometraje en la ficha de la unidad.
  - Página `/mantenimientos` y su enlace en el menú.
  - Gráfica de gasto por tipo en Reportes.
  - Aviso de vencidos / por vencer en Inicio.
- Por vencer (valor inicial, ajustable): faltan 1,000 km o menos, o 15 días o menos.

**Etapas** (mismas reglas de trabajo que la 5E: la BD compatible con la app publicada, ensayo en `begin … rollback`, regresión de `supabase/tests`, tiempos medidos, revisión en navegador y celular)
- **Etapa 0 — Línea base.**
- **Etapa 1 — Kilometraje:**
  - Kilometraje actual por unidad (inicial desde los servicios) y obligatorio en servicio y entrada a taller (menos cajas).
  - No menor al último; corrección del admin con motivo y registro.
- **Etapa 2 — Tipo de servicio:** columna, formulario, etiqueta en detalle y listas, gasto por tipo en Reportes.
- **Etapa 3 — Mantenimientos por unidad:** en la ficha (agregar, editar, quitar, copiar de otra unidad); cálculo de lo pendiente.
- **Etapa 4 — Página Mantenimientos y cumplimiento:**
  - Pestañas Correctivos (pendientes, por estado) y Preventivos (historial).
  - Registrar un correctivo desde ahí con el mantenimiento marcado; su contador se reinicia.
- **Etapa 5 — Avisos en Inicio, prueba de carga y cierre.**

**Pendiente del usuario:** los intervalos de cada unidad (los puede capturar él mismo en la ficha cuando estén listos).

**Terminado cuando**
- Un servicio nuevo no se guarda sin tipo, sin kilometraje (salvo cajas) o con un kilometraje menor al actual, ni por API directa.
- Solo un correctivo marcado como cumplimiento reinicia el contador de ese mantenimiento; un "servicio" con los mismos gastos no lo reinicia.
- Lo pendiente cuadra con los intervalos: por km, por tiempo y "lo que pase primero"; las cajas, solo por tiempo.
- Los totales de Reportes son iguales antes y después; el gasto por tipo suma el total del periodo.
- Las baterías anteriores siguen pasando; Mantenimientos e Inicio responden en menos de ~1 s con volumen.

### 5H — Kilometraje semanal y tickets de taller (acordada 2026-11-12, el usuario dijo "empieza")
**D15 — Kilometraje semanal** (decisiones del usuario, 2026-11-12):
- Cada lunes los choferes mandan foto del tablero (por fuera de la app, p. ej. WhatsApp) y un capturista escribe el número en la página **Kilometraje**. La app no guarda la foto. Sin rol nuevo: lo hace un capturista (puede haber uno solo para esto).
- Se piden las unidades con estatus **activo** cuyo tipo lleva kilometraje. En taller, vendidas, de baja o por llegar no se piden.
- La captura semanal se abre **lunes y martes** (hora de Tijuana). Los demás días queda cerrada para el capturista; la unidad sin lectura queda "Sin lectura esa semana". El admin puede capturar cualquier día.
- **Días de registro configurables** (pedido del usuario, 2026-11-12, para probar antes de los datos reales): el admin elige en la página Kilometraje uno o dos días de la semana; se repiten cada semana (`ajustes_kilometraje`). Empieza en lunes y martes.
- Una lectura por unidad por semana (la semana empieza el lunes).
- Lectura menor que la anterior: no se guarda y avisa ("T-17 tiene menos kilometraje que la semana pasada"). Las demás de la lista sí se guardan.
- Salto grande: pregunta "¿Seguro que T-17 recorrió N km esta semana?" si pasa de **3,000 km** (local) o **7,000 km** (foráneo y sin operación).
- Corregir: quien la capturó, el mismo día; después solo el admin, desde la ficha de la unidad, con motivo (queda registrado). La corrección de km del admin (5F) sigue igual.
- Lunes y martes, tarjeta roja "Actualizar kilometraje" en el Inicio de admin y capturista con las unidades pendientes.
- Las lecturas son una fuente más del km actual: Mantenimientos e Inicio se actualizan solos.

**D16 — Tickets de taller** (decisiones del usuario, 2026-11-12):
- **Crean:** admin y gerente (único permiso de escritura del gerente). Unidad, falla y prioridad (**Urgente / Normal / Baja**). Sin fecha límite.
- No se crea si la unidad está en taller, vendida, de baja o ya tiene un ticket pendiente.
- **Llegan a todos los capturistas**; el primero que acepta se lo queda. El admin también acepta y rechaza.
- **Aceptar** pide el kilometraje y crea la entrada a taller en automático (falla del ticket, fecha de hoy); desde ahí cuentan los días en taller. Se mide también cuánto tardaron en aceptarlo.
- **Rechazar** exige motivo. Quien lo levantó ve el aviso con el motivo en su Inicio hasta que toque "Enterado", y siempre en la página Tickets.
- **Cancelar:** quien lo levantó o el admin, mientras siga pendiente.
- Entrada directa a taller (capturista y admin) sin ticket, como hoy, **salvo** si la unidad tiene un ticket pendiente: entonces se acepta desde Tickets.
- Aviso: número de pendientes en el menú y tarjeta en el Inicio que se actualizan solos (Supabase Realtime).
- Detalles de la Etapa 3 (decisiones propias, 2026-11-12): los tres roles ven todos los tickets (Realtime solo avisa de lo que el usuario puede ver); aceptar exige km si el tipo lleva odómetro; si la unidad se vende o se da de baja, su ticket pendiente se cancela solo. Etapa 4: el admin ve los tickets como renglones arriba de su cuadrícula (ya tiene 4 tarjetas); capturista y gerente, como tarjeta.

**Etapas** (mismas reglas de la 5E/5F: BD compatible con la app publicada, ensayo en `begin … rollback`, regresión de `supabase/tests`, revisión en navegador y celular)
- **Etapa 1 — Kilometraje semanal, BD:** tabla `lecturas_kilometraje` (RLS; una por unidad y semana), funciones para registrar varias, corregir (autor el mismo día; admin con motivo) y listar pendientes de la semana; las lecturas entran a `kilometraje_unidades()` y `validar_kilometraje()`.
- **Etapa 2 — Kilometraje semanal, pantallas:** página `/kilometraje`, tarjeta roja en Inicio, lecturas en la ficha con "Corregir".
- **Etapa 3 — Tickets, BD:** enums de prioridad y estatus, tabla `tickets_taller` con la entrada que generó, funciones crear / aceptar / rechazar / cancelar / enterado; `registrar_entrada_taller()` rechaza unidades con ticket pendiente; publicación de Realtime; pruebas del gerente actualizadas.
- **Etapa 4 — Tickets, pantallas:** página `/tickets` con número en el menú, tarjetas de Inicio (reacomodo 2 x 2 de los tres roles), tiempo de aceptación en la estancia de la ficha.

**Terminado cuando**
- Una lectura menor, de una unidad no activa, repetida en la semana o del capturista fuera de lunes y martes no se guarda, ni por API directa.
- Mantenimientos por km cambia con una lectura semanal sin registrar servicio.
- El gerente crea y cancela tickets y no puede escribir nada más; el capturista acepta (se crea la entrada a taller con su km) o rechaza con motivo; nadie acepta un ticket ya atendido.
- Las tarjetas de tickets cambian sin recargar.
- Las baterías anteriores siguen pasando.

### 5I — Datos confiables: ediciones simultáneas, catálogos sin repetidos y cierre de mes (acordada 2026-11-13, el usuario dijo "empieza")
Salió de la revisión de riesgos del 2026-11-13 (puntos 5, 6 y 7). Decisiones del usuario:
- **D17 — Cierre de mes:** las dos formas. Cada mes se cierra solo un día fijo del mes siguiente, y el admin además puede cerrarlo antes o reabrirlo con motivo. Cerrado: el capturista ya no agrega, edita ni cambia la fecha de servicios de ese mes; el admin sí, con motivo (como hoy).
- **D18 — Unir proveedores y talleres repetidos:** el admin une el repetido en el que se queda; sus servicios pasan al que se queda y el repetido se desactiva (no se borra). Queda registrado quién unió cuál y cuándo.
- Ediciones simultáneas: si otra persona guardó el servicio mientras se editaba, no se sobrescribe sin avisar.

- Confirmado por el usuario (2026-11-13): el cierre automático es el **día 5** del mes siguiente (el admin lo cambia, como los días de kilometraje). En un mes cerrado los comprobantes **sí se pueden agregar** (las facturas llegan tarde y no cambian montos); **quitarlos, solo el admin**.

**Etapas** (mismas reglas de la 5E-5H: BD compatible con la app publicada, ensayo en `begin … rollback`, regresión de `supabase/tests`, revisión en navegador y celular)
- **Etapa 1 — Ediciones simultáneas:** `actualizar_servicio()` recibe el `updated_at` con que se abrió el formulario; si cambió, rechaza con quién y cuándo lo cambió. El formulario lo explica en un diálogo ("Edgar guardó este servicio a las 10:42 mientras lo editabas") con "Ver sus cambios" (recarga y se pierde lo escrito, y lo dice) o "Seguir editando". Lo mismo en Editar unidad.
- **Etapa 2 — Proveedores y talleres repetidos:** al dar de alta uno nuevo (servicio y Catálogos) se muestran los parecidos que ya existen (sin acentos, mayúsculas ni puntos; similitud con `pg_trgm`) para elegir uno de ellos. En Catálogos, "Unir con…" (solo admin): función `unir_proveedores()` / `unir_talleres()` en una transacción, con bitácora `uniones_catalogo`; los servicios cambiados entran al historial con el motivo "Unión de proveedores". Reportes suma todo en el que se queda.
- **Etapa 3 — Cierre de mes:** tabla `cierres_mes` (mes, cerrado o reabierto, quién, cuándo, motivo) y ajuste del día automático; función `mes_cerrado(fecha)` usada por `preparar_servicio()` y las de gastos y comprobantes (también por API directa). Pantallas: estado de cada mes con "Cerrar" / "Reabrir" (admin); en el formulario del capturista la fecha no acepta meses cerrados y lo explica; "Editar" deshabilitado con la explicación en servicios de meses cerrados.

**Terminado cuando**
- Dos sesiones editando el mismo servicio: la segunda en guardar recibe el aviso y nada se pierde sin que lo sepa.
- Un proveedor unido no aparece para elegir y su gasto sale en el que se quedó; el total de Reportes no cambia al unir.
- El capturista no puede agregar, editar ni mover servicios a un mes cerrado, ni por API; el admin sí, con motivo; reabrir queda registrado.
- Las baterías anteriores siguen pasando.

### Fase 2 — Almacén (a futuro, cuando el almacén físico esté ordenado)
Decisiones del usuario (2026-11-06):
- Un solo almacén, con ubicaciones (pasillo / anaquel).
- La compatibilidad se marca directo contra las unidades (sin ficha técnica de motores).
- Usar una pieza del stock cuenta como gasto del servicio, para saber qué se gastó y cuánto, y reponer.

Etapas:
- **A — Almacén:** catálogo de piezas (número de parte, categoría, ubicación, mínimo), compatibilidad con unidades (atajos por tipo o longitud, o copiar de otra unidad), entradas de stock con costo y proveedor, ajustes. Independiente: no toca servicios.
- **B — Servicios con piezas:** al elegir unidad y categoría, sugiere las piezas compatibles con existencia y ubicación; al usarlas descuenta el stock y crea el gasto. Se cuelga de la entrada a taller.
- **C — Reposición y consumo:** piezas en o bajo el mínimo y consumo por periodo.

Rendimiento: existencias precalculadas (se actualizan con cada movimiento, sin sumar todo el historial), compatibilidad resuelta en SQL con índices, listas por tandas y prueba de carga antes de cerrar cada etapa.

Por decidir antes de la Etapa A:
- Costo de la pieza usada: promedio ponderado (recomendado) o último costo.
- Compras al almacén como inventario y no como gasto, para no contar dos veces en Reportes (recomendado).

### Otros extras (por decidir)
- Mantenimientos preventivos por kilometraje o fecha, con alertas.
- Bitácora de auditoría para el resto de las tablas (catálogos y usuarios). Servicios y gastos ya la tienen desde la Sección 2.
