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

### Otros extras (por decidir)
- Mantenimientos preventivos por kilometraje o fecha, con alertas.
- Bitácora de auditoría para el resto de las tablas (catálogos y usuarios). Servicios y gastos ya la tienen desde la Sección 2.
