# PLAN — Administración Trailers

## Permisos por rol

| Acción | admin | capturista |
|---|---|---|
| Iniciar sesión | Sí | Sí |
| Ver camiones, categorías y proveedores activos | Sí | Sí |
| Crear / editar / desactivar camiones y categorías | Sí | No |
| Crear proveedor nuevo | Sí | Sí (para no frenar la captura) |
| Editar / desactivar proveedores | Sí | No |
| Registrar servicios, gastos y comprobantes | Sí | Sí |
| Ver registros | Todos | Solo los propios |
| Editar / eliminar registros | Todos | Ver decisión pendiente D1 |
| Dashboard y reportes | Sí | No |
| Gestionar usuarios | Sí | No |

## Decisiones pendientes
- **D1**: ¿El capturista puede editar sus registros después de guardarlos? ¿Los registros requieren aprobación de un admin (estado `pendiente` / `aprobado`)? Se resuelve antes de la Sección 2.
- **D2**: Nombre del subdominio. Se resuelve antes del primer deploy.

---

## Sección 0 — Fundación
**Alcance**
- Proyecto Next.js + TypeScript strict + Tailwind + shadcn/ui inicializado.
- Supabase CLI configurado (`npx supabase init`) y proyecto en la nube enlazado con `npx supabase link` (sin Docker ni entorno local).
- Variables de entorno en `.env.local` (URL y anon key) y `.env.example` sin valores reales; `.env.local` en `.gitignore`.
- Migración: enum `rol_usuario` (`admin`, `capturista`) y tabla `perfiles` (id = `auth.users.id`, nombre, rol, activo, created_at). Trigger que crea el perfil al crear un usuario.
- Funciones SQL de apoyo para RLS: `es_admin()` y `rol_actual()`.
- Login con correo y contraseña; registro público deshabilitado.
- Middleware que protege todas las rutas excepto `/login`.
- Layout base con navegación según rol y cierre de sesión.
- Archivos `CLAUDE.md`, `docs/PLAN.md` y `docs/ESTADO.md` en el repo.

**Terminado cuando**
- Un admin y un capturista creados manualmente pueden entrar y ven navegaciones distintas.
- Sin sesión, cualquier ruta redirige a `/login`.
- Checklist de cierre de `CLAUDE.md` completo.

## Sección 1 — Catálogos
**Alcance**
- Tablas `camiones` (numero_economico único, placas, marca, modelo, anio, vin, estatus: activo / en_taller / baja, notas), `categorias` (nombre único, activo) y `proveedores` (nombre, telefono, notas, activo).
- Seed inicial de categorías: Motor, Transmisión, Frenos, Suspensión, Eléctrico, Llantas, Carrocería, Mantenimiento preventivo, Otros.
- CRUD de camiones y categorías (solo admin). Alta rápida de proveedor disponible para ambos roles.
- Lista de camiones con búsqueda por número económico.

**Terminado cuando**
- RLS impide que un capturista modifique camiones o categorías, incluso por API directa.
- No se pueden repetir números económicos.

## Sección 2 — Servicios y gastos
**Alcance** (requiere D1 resuelta)
- Tabla `servicios`: camion_id, fecha, kilometraje, descripcion, proveedor_id, created_by.
- Tabla `gastos`: servicio_id, categoria_id, concepto, monto `numeric(12,2)`.
- Un servicio puede tener varios gastos (ej. frenos + aceite en la misma visita).
- Formulario de captura mobile-first: elegir camión, fecha, km, proveedor y agregar renglones de gasto.
- Ficha del camión con su historial de servicios y total invertido.

**Terminado cuando**
- Capturista solo ve sus propios servicios; admin ve todos.
- El total del servicio cuadra con la suma de sus gastos.

## Sección 3 — Comprobantes
**Alcance**
- Bucket privado `comprobantes` en Supabase Storage con políticas por rol.
- Tabla `comprobantes`: servicio_id, ruta_archivo, tipo_mime, tamano_bytes, hash_sha256, folio (opcional), fecha, total, created_by.
- Subida de PDF o imagen; desde el celular se puede usar la cámara directamente.
- Compresión de imágenes en el cliente antes de subir.
- Hash SHA-256 del archivo; si ya existe, se avisa de posible duplicado.
- Visor del comprobante con URL firmada.

**Terminado cuando**
- Ningún archivo es accesible sin sesión ni por URL pública.
- Subir el mismo archivo dos veces muestra advertencia.

## Sección 4 — Dashboard y reportes (solo admin)
**Alcance**
- Total invertido por camión, por categoría, por proveedor y por mes, con filtros de rango de fechas.
- Ranking de camiones con mayor gasto.
- Gráficas con Recharts.
- Exportación a Excel del periodo filtrado.

**Terminado cuando**
- Los totales del dashboard coinciden con la suma de gastos en BD para el mismo filtro.

## Sección 5 — Extras (opcional)
- Mantenimientos preventivos por kilometraje o fecha, con alertas.
- Bitácora de auditoría (quién modificó qué y cuándo).
- Gestión de usuarios desde la interfaz (invitar, desactivar, cambiar rol).
