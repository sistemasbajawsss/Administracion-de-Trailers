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

- **D6 — Verificación en dos pasos** (resuelta 2026-10-26, Sección 2.5): `admin` y `gerente` (los roles que ven el dinero de toda la flotilla) entran con contraseña + código de 6 dígitos de una app autenticadora (TOTP: Google Authenticator, Microsoft Authenticator, etc.). El capturista entra solo con contraseña para no frenar la captura en el taller. Se exige en la base de datos (`rol_actual()` no reconoce a un admin o gerente sin sesión verificada, `aal2`) y en el servidor (`getCurrentUser()` lo manda a `/verificacion`). Si alguien pierde su celular, el procedimiento de recuperación está en `docs/ESTADO.md`.

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
Se agregó entre la 2 y la 3 (2026-10-26) para que todo lo que sigue nazca protegido. Toca código de secciones cerradas (configuración, login, funciones de rol) con autorización del usuario.

**Alcance**
- Encabezados de seguridad en todas las respuestas (`next.config.ts`): HSTS, Content-Security-Policy, `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara solo para la propia app) y sin `X-Powered-By`.
- Cookies de sesión `httpOnly`, `secure` (en producción) y `sameSite=lax`: ningún script del navegador puede leer el token.
- Verificación en dos pasos (D6) para admin y gerente: alta del autenticador con código QR la primera vez y código de 6 dígitos en cada inicio de sesión. Exigida en RLS y en el servidor.
- `npm audit` sin vulnerabilidades altas o críticas.
- Ajustes del dashboard de Supabase que hace el usuario (no son migraciones): protección contra contraseñas filtradas, política de contraseñas, cierre de sesión por inactividad.

**Terminado cuando**
- Las respuestas de la app traen todos los encabezados de seguridad y la app funciona con la CSP activa.
- La cookie de sesión aparece como `HttpOnly` en el navegador.
- Un admin o gerente con contraseña correcta pero sin código no ve ni modifica nada, ni en pantalla ni por API directa.
- El capturista sigue entrando solo con contraseña y todo le funciona igual.
- Checklist de cierre de `CLAUDE.md` completo.
## Sección 3 — Comprobantes
**Alcance**
- Bucket privado `comprobantes` en Supabase Storage con políticas por rol.
- Tabla `comprobantes`: servicio_id, ruta_archivo, tipo_mime, tamano_bytes, hash_sha256, folio (opcional), fecha, total, created_by.
- Subida de PDF o imagen; desde el celular se puede usar la cámara directamente.
- Compresión de imágenes en el cliente antes de subir.
- Hash SHA-256 del archivo; si ya existe, se avisa de posible duplicado.
- Visor del comprobante con URL firmada.
- Validar el tipo real del archivo (firma de bytes de PDF, JPEG, PNG o WebP, no solo la extensión) y un tamaño máximo, en el cliente, en el servidor y en el bucket.
- Ajustar la CSP de la Sección 2.5 para el visor y la compresión (sin abrirla a dominios ajenos).

**Terminado cuando**
- Ningún archivo es accesible sin sesión ni por URL pública.
- Subir el mismo archivo dos veces muestra advertencia.

## Sección 4 — Dashboard y reportes (solo admin)
**Alcance**
- Total invertido por unidad, por tipo de unidad, por operación (local / foráneo), por categoría, por proveedor y por mes, con filtros de rango de fechas.
- Ranking de unidades con mayor gasto.
- Gráficas con Recharts.
- Exportación a Excel del periodo filtrado.

**Terminado cuando**
- Los totales del dashboard coinciden con la suma de gastos en BD para el mismo filtro.

## Sección 5 — Extras (opcional)
- Mantenimientos preventivos por kilometraje o fecha, con alertas.
- Bitácora de auditoría para el resto de las tablas (catálogos y usuarios). Servicios y gastos ya la tienen desde la Sección 2.
- Gestión de usuarios desde la interfaz (invitar, desactivar, cambiar rol).
