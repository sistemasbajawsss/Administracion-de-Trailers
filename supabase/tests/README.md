# Pruebas de la base de datos

Listas de casos que se corren contra el proyecto en la nube antes y después de
cada cambio de esquema, para confirmar que lo que ya funcionaba sigue igual.

Todas empiezan con `begin;` y terminan con `rollback;`: no guardan nada.
`db push` no las aplica.

```
npx supabase db query --linked -f supabase/tests/<archivo>.sql
```

| Archivo | Qué revisa | Resultado esperado |
|---|---|---|
| `capturista.sql` | Permisos del capturista (solo lo suyo, sin borrar, comprobantes, Storage) | 42/43: el caso "Ajeno Duplicado" falla porque los servicios `[PRUEBA]` comparten el mismo PDF |
| `gerente.sql` | El gerente ve todo y no escribe nada | 14/14 |
| `validaciones.sql` | Unidad de baja, categoría desactivada, restaurar | 13/13 |
| `auditoria-5d.sql` | Correcciones de la auditoría 5D (integridad, candados) | 24/24 |
| `dolares-5b.sql` | Gastos en dólares al centavo | 17/17 |
| `tiempos.sql` | Tiempos de las consultas principales (mediana en ms) | Ver la línea base en `docs/ESTADO.md` |

| `taller.sql` | Entradas a taller y candado del estatus (5E) | 32/32 |
| `ventas.sql` | Unidades vendidas (5E) | 36/36 |
| `servicios-taller.sql` | Servicios ligados al taller, motivo, "se olvidó la entrada" (5E) | 22/22 |
| `salida-servicio.sql` | Servicio que dio la salida, total de cada estancia y salida sin servicios con motivo (5E) | 9/9 |
| `carga-5e.sql` | Prueba de carga (~35 mil servicios); tarda ~1 min | Ver `docs/ESTADO.md` |
| `carga-5f.sql` | Prueba de carga de Mantenimientos con los tres roles (~35 mil servicios, 176 mantenimientos); tarda ~20 s | Ver `docs/ESTADO.md` |
| `kilometraje.sql` | Kilometraje por fecha, entrada a taller, correcciones del admin (5F) | 31/31 |
| `tipo-servicio.sql` | Tipo de servicio: alta, edición, restaurar, Reportes y Excel (5F) | 15/15 |
| `mantenimientos.sql` | Mantenimientos por unidad: cálculo de lo pendiente, validaciones, copiar, permisos (5F) | 27/27 |
| `mantenimientos-varias.sql` | Agregar un mantenimiento a varias unidades: desde hoy y su km, repetidos se saltan, cajas y sin km solo meses, todo o nada, permisos (5F) | 23/23 |
| `tipos-unidad.sql` | Tipos de unidad como catálogo: alta de tipos, letra, kilometraje, largo, local/foráneo, Dolly y Góndola, reportes, permisos | 28/28 |
| `reporte-mantenimiento.sql` | Reportes: gasto por mes partido por tipo de servicio, cuadra con el total y con por tipo (5F) | 6/6 |
| `donde-se-hizo.sql` | ¿Dónde se hizo?: Taller Realso sin taller, fuera y en camino con taller, talleres desactivados, editar, restaurar, permisos de `talleres` (5G) | 21/21 |
| `reporte-donde-se-hizo.sql` | Reportes y Excel: por lugar, por taller y columnas del Excel (5G) | 5/5 |
| `kilometraje-semanal.sql` | Kilometraje semanal: semana y días de captura, varias a la vez (las buenas se guardan), una por semana, solo activas con odómetro, revisión contra lecturas, corregir y quitar (autor el mismo día, admin con motivo), permisos de los tres roles (5H) | 40/40 (el caso del capturista cambia según el día: lunes y martes guarda, los demás rechaza) |
| `dias-captura-kilometraje.sql` | Días de registro del kilometraje: el admin elige uno o dos, el capturista registra solo esos días, permisos (5H) | 13/13 |
| `tickets-taller.sql` | Tickets de taller: crear (admin y gerente), aceptar (crea la entrada con km; si falla, todo se deshace), rechazar con motivo, cancelar (quien lo levantó o admin), Enterado, candados de unidad, entrada directa bloqueada con ticket pendiente, cancelación sola al dar de baja, permisos de los tres roles y anónimo, Realtime (5H) | 48/48 (con aprobación de admin, aceptar sin km y el contador de avisos) |
| `servicios-parecidos.sql` | Aviso de posible servicio duplicado: mismo día o misma estancia, el capturista ve también los de otros (solo lo necesario), gerente y anónimo no (5H) | 5/5 |
| `catalogos-repetidos.sql` | Parecidos (sin acentos ni razón social, errores de dedo), solo admin une, el que se queda debe estar activo, servicios movidos con motivo en el historial, repetido desactivado, bitácora (admin y gerente leen, nadie escribe), unir el proveedor y el taller `[PRUEBA]` con más servicios sin errores (5I) | 26/26 |
| `ediciones-simultaneas.sql` | `actualizar_servicio` con `p_version`: la vigente guarda, una vieja se rechaza con PT409 y dice quién y cuándo, sin versión guarda como antes, el intento rechazado no entra al historial (5I) | 8/8 |
| `mantenimientos-cumplidos.sql` | Un correctivo cumple mantenimientos y reinicia su contador: validaciones, edición, historial, eliminar y restaurar, mismo cálculo para los tres roles (5F) | 27/27 |

Notas:
- **Estas pruebas no ven la API (PostgREST).** Una llave foránea nueva entre dos tablas que la app ya anida (p. ej. `servicios` ↔ `entradas_taller`) crea una segunda relación y la API deja de saber cuál usar: las pruebas pasan y la pantalla falla (pasó el 2026-11-06). Antes de agregar una llave entre tablas que ya se anidan, buscar en `src` los `select` que las anidan y probar esas pantallas, o poner el nombre de la relación (`tabla!columna(...)`).
- La BD corre en UTC: en las pruebas, "hoy" es `(now() at time zone 'America/Tijuana')::date`, no `current_date`.
- Las pruebas eligen sus datos por la regla, no por suposición: unidades con odómetro con `public.tipo_lleva_kilometraje(tipo)` (no `tipo <> 'caja'`), servicios de antes de la 5E con `sin_entrada_taller is null`; y limpian lo que traen los datos `[PRUEBA]` (al quitar el km de un servicio, también `mantenimientos = '{}'`; mantenimientos que ya tiene la unidad).
- Una prueba nueva va en su propio archivo con el mismo formato (`begin`, tabla temporal `r` con `caso` / `ok` / `detalle`, `rollback`).
