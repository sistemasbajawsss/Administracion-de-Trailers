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
Se divide en dos partes porque el proyecto de Supabase en la nube aún no está disponible. Ambas se trabajan en la rama `seccion-0-fundacion`; la sección se cierra (merge a `main`) solo al terminar 0B.

### 0A — Sin conexión a Supabase
**Alcance**
- Proyecto Next.js + TypeScript strict + Tailwind + shadcn/ui inicializado.
- Supabase CLI configurado con `npx supabase init` (sin `link`, sin Docker ni entorno local).
- Migración escrita pero NO aplicada: enum `rol_usuario` (`admin`, `capturista`) y tabla `perfiles` (id = `auth.users.id`, nombre, rol, activo, created_at). Trigger que crea el perfil al crear un usuario. RLS habilitado en `perfiles`.
- Funciones SQL de apoyo para RLS: `es_admin()` y `rol_actual()` (en la misma migración, sin aplicar).
- Clientes de Supabase (navegador y servidor) con `@supabase/ssr`, leyendo URL y anon key de `.env.local`.
- Middleware que protege todas las rutas excepto `/login`, leyendo de `.env.local`.
- `.env.example` sin valores reales; `.env.local` excluido por `.gitignore`.
- Pantalla de `/login` (correo y contraseña) con UI y validación Zod, sin funcionalidad real de autenticación.
- Layout base con navegación según rol y botón de cierre de sesión (sin funcionalidad real).
- Datos de ejemplo (usuario/rol simulado) aislados en `src/lib/mock/`, nunca dentro de componentes; se eliminan en 0B.
- Archivos `CLAUDE.md`, `docs/PLAN.md` y `docs/ESTADO.md` en el repo.

**Terminado cuando**
- `npm run build` y `npm run lint` pasan sin errores.
- `/login` y el layout se ven correctamente en celular y escritorio, con ambas navegaciones (admin y capturista) visibles usando los datos de `src/lib/mock/`.
- La migración existe en `supabase/migrations/` y no se ha aplicado.

### 0B — Con conexión a Supabase
**Alcance**
- Proyecto en la nube enlazado con `npx supabase link`.
- Migración de 0A aplicada con `npx supabase db push` y tipos regenerados en `src/lib/supabase/database.types.ts`.
- `.env.local` con URL y anon key reales.
- Registro público deshabilitado en Supabase Auth.
- Login, cierre de sesión y middleware funcionando contra Supabase.
- Layout leyendo el rol real desde `perfiles`; se elimina `src/lib/mock/`.
- Usuarios de prueba creados manualmente: un admin y un capturista.

**Terminado cuando**
- Un admin y un capturista creados manualmente pueden entrar y ven navegaciones distintas.
- Sin sesión, cualquier ruta redirige a `/login`.
- RLS de `perfiles` probado con ambos roles.
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
