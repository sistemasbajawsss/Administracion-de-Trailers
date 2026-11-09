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
| `salida-servicio.sql` | Servicio que dio la salida y total de cada estancia (5E) | 7/7 |
| `carga-5e.sql` | Prueba de carga (~35 mil servicios); tarda ~1 min | Ver `docs/ESTADO.md` |

Notas:
- **Estas pruebas no ven la API (PostgREST).** Una llave foránea nueva entre dos tablas que la app ya anida (p. ej. `servicios` ↔ `entradas_taller`) crea una segunda relación y la API deja de saber cuál usar: las pruebas pasan y la pantalla falla (pasó el 2026-11-06). Antes de agregar una llave entre tablas que ya se anidan, buscar en `src` los `select` que las anidan y probar esas pantallas, o poner el nombre de la relación (`tabla!columna(...)`).
- La BD corre en UTC: en las pruebas, "hoy" es `(now() at time zone 'America/Tijuana')::date`, no `current_date`.
- Una prueba nueva va en su propio archivo con el mismo formato (`begin`, tabla temporal `r` con `caso` / `ok` / `detalle`, `rollback`).
