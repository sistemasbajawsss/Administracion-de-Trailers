# Errores corregidos y reglas para que no vuelvan

**Se lee completo antes de empezar cualquier tarea y otra vez al terminarla**
(CLAUDE.md lo exige). Al terminar, revisar lo hecho contra cada regla de aquí;
si se corrigió un error nuevo, se agrega aquí en el mismo formato.

Formato: **Qué pasó** — Causa — **Regla** — Fuente.

---

## 1. Formularios, avisos y navegación

- **El aviso al salir de un formulario era el confirm del navegador y mentía**: decía que los cambios no se guardarían, pero al volver el formulario seguía lleno. — Causa: `window.confirm` nativo; Next conserva la pantalla oculta con su estado (Activity). — **Regla:** nunca `window.confirm` / `alert` / `prompt`; los avisos son diálogos de la app (`AlertDialog`). "Salir y borrar" de verdad borra (`useUnsavedChanges(enabled, onDiscard)` + `useRemountAfterSave`). Todo mensaje debe decir exactamente lo que va a pasar. Al cerrar o recargar la pestaña solo existe el aviso del navegador (no se puede cambiar). — Usuario, 2026-11-10.
- **"Nuevo proveedor" (diálogo) enviaba también el formulario del servicio.** — Causa: el submit sube por el árbol de React aunque el diálogo esté en un portal. — **Regla:** `stopPropagation` en formularios dentro de diálogos. — ESTADO 5D, commit bde42a5.
- **Volver a "Nuevo servicio" después de guardar mostraba los datos de antes** (y se podía guardar duplicado). — Causa: Next conserva las pantallas ocultas. — **Regla:** `useRemountAfterSave` en todo formulario de página; botón deshabilitado después de guardar. — ESTADO 5D, bde42a5.
- **Se podía salir de un formulario a medio llenar sin aviso.** — **Regla:** `useUnsavedChanges` en todo formulario de página (servicio, entrada a taller, unidad): enlaces, Cancelar y cerrar pestaña. El gesto "atrás" no se intercepta (D11). — ESTADO 5D.
- **Coma decimal (`1500,50`) mal leída.** — **Regla (D11):** coma de miles si está bien puesta (`1,500`); decimal si es una sola con 1 o 2 dígitos al final; otra coma se rechaza. — ESTADO D11.
- **La lista de gastos no se actualizaba al volver tras editar/eliminar, y el scroll infinito entraba en bucle con error.** — **Regla:** el `key` de la lista lleva una firma de los datos; con error no se vigila el sentinela, se reintenta con botón. — ESTADO 5D.
- **El tipo de cambio quedaba en el renglón equivocado o no se volvía a sugerir al cambiar la fecha.** — **Regla:** va por id de renglón y se resugiere al cambiar la fecha. — ESTADO 5D.
- **Vistas previas de comprobantes perdidas/fugas al volver; reintentos de fotos con el mismo nombre chocaban.** — **Regla:** se recrean al volver; reintentos por clave, no por nombre. — ESTADO 5D.
- **Volver y Cancelar no regresaban a la pantalla de origen.** — **Regla:** `useGoBack`, con respaldo a la lista si la página se abrió directo. — commit c66ee8d.
- **Tras eliminar un servicio, "volver" caía en su pantalla de editar (404).** — **Regla:** `useGoBack` con `gone`. — commit 3d2ab3f.
- **El error del kilometraje no salía junto con los demás.** — **Regla:** los errores de todos los campos se muestran juntos. — commit 9ff7686.
- **"En taller" se podía poner a mano en la unidad.** — **Regla:** solo lo ponen y quitan las entradas/salidas de taller (pantalla, servidor y trigger `proteger_estatus_taller`). — commit d3d596d.
- **Salida de taller sin servicios y sin explicación.** — **Regla:** sin servicios, la salida exige motivo (BD y diálogo). — commit ce7d1da.
- **Fechas inexistentes en filtros, sin pantalla de error, `T17` no encontraba `T-17`, faltaban topes en Zod.** — **Regla:** descartar fechas inexistentes; ids uuid; topes en Zod; `src/app/(app)/error.tsx`; `T17` = `T-17`. — commit 6a0bc04.

## 2. Pantallas que ofrecen algo que después se rechaza

- **El admin podía intentar cambiarse su propio rol y al guardar marcaba error.** — Causa: la BD lo prohíbe (`proteger_perfil`) pero el diálogo ofrecía el selector. — **Regla:** si la BD o el servidor siempre rechazan algo, la pantalla no lo ofrece: se deshabilita con la explicación, y el servidor da el mismo mensaje claro. El propio rol queda bloqueado (decisión del usuario, 2026-11-10). — Usuario, 2026-11-10.
- **"Copiar de otra unidad" solo listaba unidades que ya tenían mantenimientos y copiaba todo junto.** — **Regla:** "Aplicar también a" con el selector de unidades (todas, salvo baja/vendidas). Las listas para elegir unidades muestran todas las que aplican, no solo las que ya tienen algo. — ESTADO 5F, 2026-11-10.
- **Las cajas se tomaban como único tipo sin kilometraje; al agregar dolly y góndola había 35 reglas con `'caja'` fijo.** — **Regla:** nada de comparar contra un tipo fijo (`'caja'`, `'camioneta'`): preguntar al catálogo (`lleva_kilometraje`, `lleva_largo`, `lleva_operacion`; grupo Camionetas = sin operación). — 2026-11-10.

## 3. Textos

- **Un motivo largo sin espacios se salía del contenedor y creaba scroll lateral.** — **Regla:** `body` con `overflow-wrap: anywhere` en `globals.css` (no quitarla ni poner `break-normal`). Probar cada pantalla con 200 caracteres sin espacios, en 360 px y escritorio. — CLAUDE.md, commits eafb48e, b4d3829.
- **Textos cortados con "…" en 12 componentes y en la 5E.** — **Regla:** nunca `truncate`, `line-clamp`, `text-ellipsis`; el texto baja de renglón y su contenedor flex/grid lleva `min-w-0`. — CLAUDE.md, commits 8c46aed, 8c1ced6.
- **Select: el texto elegido no bajaba de renglón.** — **Regla:** su regla en `globals.css` (`[data-slot=select-trigger]`), fuera de `@layer`, mínimo 44 px. — commits 32fde0b, 8c1ced6.
- **Emojis.** — **Regla:** prohibidos en interfaz y código; íconos de `lucide-react`. — CLAUDE.md.
- **Reportes decía "+0% menos".** — **Regla:** "Casi igual". — commit 6a0bc04.

## 4. Scroll, móvil y acomodo

- **El Inicio del capturista tenía tres tarjetas en una cuadrícula de dos: la tercera quedaba sola y desfasada.** — **Regla:** el Inicio de cada rol se acomoda en columnas que se apilan (izquierda: lo propio; derecha: avisos), igual que el del admin; no dejar tarjetas sueltas en una cuadrícula. Revisar el Inicio de los tres roles cuando se agrega una tarjeta. — Usuario, 2026-11-10.
- **En la ficha de la unidad, los gastos con scroll infinito de página hacían imposible llegar a lo que sigue (vender, eliminar) cuando había muchos.** — **Regla:** en la ficha, los gastos van en un cuadro con su propio scroll, del alto de unos 10 renglones, cargando por tandas dentro del cuadro (`ExpenseFeed scrollBox`). Para no atrapar el dedo: máximo 60 % de la pantalla y sin `overscroll-contain`. Es la única excepción a "sin cuadros con scroll propio" (pedida por el usuario el 2026-11-10). — Usuario, 2026-11-10.
- **Gráficas y tarjetas se salían del ancho en celular (13 cuadrículas sin `grid-cols-1`).** — **Regla:** toda cuadrícula responsiva lleva `grid-cols-1`; columnas a medida con `minmax(0,1fr)`; tarjetas con gráfica `min-w-0`; montos `whitespace-nowrap`. — commit 32fde0b.
- **Scroll lateral en celular (periodos, pestañas, fecha del iPhone, menú de usuario).** — **Regla:** nunca scroll lateral; `html` y `body` con `overflow-x: clip`; nada de `overflow-x-auto`; usar `flex-wrap`. Pestañas con más de 3 opciones: `h-auto flex-wrap`. — commit e107230.
- **Cuadros con scroll propio en Gastos e Inicio atrapaban el dedo en el celular.** — **Regla:** listas largas por tandas con el scroll de la página; Inicio muestra los 10 más recientes. Excepción: los gastos de la ficha (ver arriba). Dentro de diálogos y hojas sí puede haber scroll. — commit f563910.
- **Al elegir unidad en pantalla táctil se abría el teclado y tapaba la lista.** — **Regla:** en táctil el foco va a la lista; deslizar cierra el teclado. — commit e107230.
- **Desde / Hasta se encimaban en el iPhone.** — **Regla:** `appearance: none` en fechas táctiles, `minmax(0,1fr)` y `min-w-0`. — commit 48ae321.
- **"Tomar foto" salía en pantallas no táctiles.** — **Regla:** solo en táctiles. — commit faac05b.
- **Sin forma de actualizar en la app instalada.** — **Regla:** jalar hacia abajo (`router.refresh()`), y actualizar sola al volver después de 30 s. — commit 48ae321.
- **Se hicieron las estancias "siempre abiertas" cuando el usuario quería tarjetas desplegables cerradas.** — Causa: se leyó como queja algo que era un deseo. — **Regla:** tarjetas desplegables salen cerradas. Si un pedido de UI se puede leer de dos formas, repetir la interpretación o preguntar antes. — commit f563910.

## 5. Base de datos y migraciones

- **Incidente en producción (2026-11-06): una llave foránea nueva creó una segunda relación `servicios` ↔ `entradas_taller` y la API dejó de saber cuál usar; el detalle y la ficha daban error.** — **Regla:** las pruebas SQL no ven PostgREST. Antes de una llave entre tablas que ya se anidan, buscar los `select` que las anidan, o nombrar la relación (`tabla!columna(...)`). Verificar con una llamada a la API (`/rest/v1/...?select=...`): una relación mala da `PGRST200/201` antes que el error de permisos. — README de pruebas.
- **Cambiar el tipo de una columna fallaba porque una vista dependía de ella, y una función regresaba filas de esa vista.** — **Regla:** antes de cambiar una columna, listar vistas que la usan (`pg_depend`) y funciones que regresan esas vistas (`prorettype`); quitarlas y recrearlas iguales con sus permisos en la misma migración. — 2026-11-10 (`listar_gastos` / `gastos_detalle`).
- **Al pasar un enum a texto, `order by tipo` cambió de orden (alfabético en vez del orden del enum).** — **Regla:** al quitar un enum, conservar el orden con una columna propia (`unidades.orden_tipo`). — 2026-11-10.
- **En `preparar_servicio()` la validación de unidad dada de baja nunca se cumplía.** — Causa: `current_setting(..., true)` es NULL y `NULL = id` anula el `if`. — **Regla:** `coalesce(..., '')` al comparar settings. — commit d4ebe33.
- **La BD aceptaba categorías desactivadas por API.** — **Regla:** la BD rechaza unidades de baja y catálogos desactivados aunque la UI ya los filtre. — commit d4ebe33.
- **Auditoría 5D:** gasto sin motivo rompía el historial; reusar el id de un eliminado bloqueaba restaurar; proveedor desactivado aceptado; servicios sin gastos; `actualizar_servicio` aceptaba ids ajenos; `eliminar_unidad` tomaba servicios ajenos; funciones que respondían sin rol; faltaban candados de 10 comprobantes y último admin. — **Regla:** toda función revisa rol y pertenencia; ninguna confía en la UI. — ESTADO 5D.
- **Un valor nuevo de enum no se puede usar en la misma transacción en que se crea.** — **Regla:** va en su propia migración. — ESTADO › Entorno.
- **Pruebas SQL después de las 17:00 de Tijuana fallaban por "fecha futura".** — Causa: la BD corre en UTC. — **Regla:** "hoy" = `(now() at time zone 'America/Tijuana')::date`. — README de pruebas.
- **Pruebas que dependían de datos reales o de valores fijos (1000 km) dejaron de cuadrar.** — **Regla:** las pruebas crean sus propios datos. — ESTADO 5F.
- **En una prueba PL/pgSQL, una variable llamada `k` chocaba con la columna `k` de la tabla temporal.** — **Regla:** nombres de variables que no existan como columna (`txt`, `v_...`). — 2026-11-10.
- **Falla conocida (no es error de la app):** `capturista.sql` 42/43, el caso del comprobante duplicado (los servicios `[PRUEBA]` comparten el mismo PDF). — README de pruebas.

## 6. Permisos, sesión y roles

- **Desactivar un usuario no cerraba sus sesiones.** — **Regla:** `cerrar_sesiones_usuario()` al desactivar y al restablecer contraseña. — commit cfc596a.
- **Al abrir una pestaña sin sesión se alcanzaba a ver la app.** — **Regla (D9):** se oculta antes de pintar. — commit c1ebfed.
- **El login no explicaba cuando el Firewall de Vercel frenaba intentos.** — commit d41a90d.
- **Un usuario desactivado con token vigente todavía podía leer.** — **Regla:** toda política de lectura exige `rol_actual()` no nulo. — ESTADO › Seguridad.
- **Se construyó TOTP y el usuario no lo quería.** — **Regla (D6):** no proponer MFA. — memoria.

## 7. Reportes, PDF y Excel

- **En iPhone con la app instalada, "Imprimir o guardar PDF" no hacía nada.** — Causa: iOS no tiene cuadro de impresión ahí. — **Regla:** con `navigator.standalone`, PDF con jsPDF 4.x y menú de compartir. — commit f778b3d.
- **El PDF no se acomodaba en vertical/horizontal; la gráfica no servía en papel.** — **Regla:** gráficas en HTML para papel (Recharts puede salir cortado). — commit 3c2e403.
- **Tarjetas de Reportes disparejas.** — **Regla:** acomodo en cuadrícula de 6 con anchos por tarjeta; una tarjeta nueva de ancho completo va en su propio renglón, nunca entre dos que comparten renglón. — commit 9eba0d6; 2026-11-10.
- **Millones mal en la gráfica impresa; Excel sin avisos.** — **Regla:** "$1 M" y avisos en el Excel. — ESTADO 5D.
- **Tipo de cambio sugerido distinto al publicado.** — **Regla:** FIX del DOF del día hábil anterior (Banxico SF60653). — commit 82b1f05.
- **Nombres de comprobante con caracteres problemáticos.** — **Regla:** sanear en servidor y descargar en ASCII. — ESTADO 5D.

## 8. Next.js

- **`Date.now()` en prerender.** — **Regla:** leer Supabase al momento de la petición (`connection()`). — commit 5942e69.
- **`usePathname` fuera de Suspense ("blocking route").** — **Regla:** dentro de Suspense. — commit 210d20f.

## 9. Herramientas y entorno

- **`npm run build` con `npm run dev` encendido rompió las Server Actions ("No se pudo conectar").** — Causa: los dos escriben en `.next`. — **Regla:** con dev encendido solo `npx tsc --noEmit` y `npm run lint`; para el build, detener dev primero (o worktree aparte con `npm ci`). Si sale "Jest worker": detener dev, borrar `.next`, levantarlo. — memoria.
- **OneDrive bloqueó `.next` y liberó archivos de `node_modules`.** — **Regla:** `npm ci`; excluir `.next` y `node_modules` de la sincronización. — ESTADO › Entorno.
- **Ediciones con Perl `s|...|...|` usando `\|` en el patrón corrompieron 4 archivos; ediciones con Perl o sed no aplicaban en archivos CRLF.** — **Regla:** editar con la herramienta Edit (o un script de Node que normalice CRLF y falle si no encuentra el texto). No usar Perl para reemplazos. Revisar con `npx tsc --noEmit` después. — 2026-11-09.
- **No hay Python en esta máquina; heredocs de Bash con comillas dentro fallaban.** — **Regla:** scripts con Node; textos largos (SQL) se escriben con la herramienta Write y se concatenan. — 2026-11-10.
- **El CLI de Supabase lee mal rutas con `C:` y detecta a Claude Code como agente.** — **Regla:** rutas relativas desde la carpeta del proyecto; `login`/`link` en CMD aparte con `--agent no`. — memoria, ESTADO.
- **`npm audit` marca `deepmerge` por `shadcn`.** — **Regla:** `shadcn` en devDependencies; no bajar versiones como sugiere npm. — ESTADO 5B.

## 10. Forma de trabajar

- **Se subieron ~970 MB de PDF de prueba sin avisar del costo.** — **Regla:** avisar tamaño y costo antes de operaciones pesadas. — memoria.
- **Se avisó de límites del plan gratuito y la cuenta es Pro.** — **Regla:** no mencionarlos. — memoria.
- **Se preguntó antes de un `db push` dentro de una etapa aprobada.** — **Regla:** dentro de una etapa aprobada, aplicar migraciones tras el ensayo y las pruebas; preguntar antes de unir o subir a `main`. — memoria.
- **Escribir datos directo en producción (alta de unidades por SQL) fue bloqueado por permisos.** — **Regla:** los datos reales se capturan en la app o con permiso explícito del usuario para ese paso; no buscar otra vía. — 2026-11-10.
- **Funciones nuevas sin platicar.** — **Regla:** platicar y planear por etapas; no escribir código hasta que el usuario diga que empiece. — memoria.
- **Se entregaba sin revisar en pantalla.** — **Regla:** antes de decir "listo", revisar en el navegador (360 px y escritorio) cada pantalla tocada, con los tres roles cuando aplica; si no se pudo (sin sesión), decirlo claro. — 2026-11-10.
