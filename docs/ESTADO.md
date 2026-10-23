# ESTADO — Administración Trailers

> Actualizar este archivo al cerrar cada sección. Es lo primero que se lee al iniciar una sesión.

## Sección actual
**Sección 0 — Fundación** · Estado: por iniciar · Rama: `seccion-0-fundacion`

Dividida en dos partes (ver `docs/PLAN.md`):
- **0A — Sin conexión a Supabase**: por iniciar (plan pendiente de aprobación).
- **0B — Con conexión a Supabase**: bloqueada hasta que el proyecto de Supabase esté aprobado y disponible.

## Decisiones tomadas
- Stack: Next.js + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.
- Proyecto independiente en subdominio propio.
- Roles: `admin` (Edgar y jefe) y `capturista` (solo registra montos y comprobantes).
- Comprobantes: PDF o foto de ticket (sin XML de CFDI). Montos con IVA incluido.
- Desarrollo directo contra Supabase en la nube (sin Docker). Proyecto `administracion-trailers-dev` aparte cuando haya datos reales.

## Decisiones pendientes
- D1: edición / aprobación de registros del capturista (antes de Sección 2).
- D2: nombre del subdominio (antes del primer deploy).

## Bloqueos
- Proyecto de Supabase en la nube pendiente de aprobación. Bloquea la Sección 0B.

## Existe actualmente
- Tablas: —
- Rutas: —
- Buckets: —

## Historial de secciones
<!-- Plantilla para cada cierre:
### Sección N — Nombre (cerrada AAAA-MM-DD)
- Hecho:
- Tablas / migraciones nuevas:
- Rutas nuevas:
- Pendientes que pasan a la siguiente sección:
-->
