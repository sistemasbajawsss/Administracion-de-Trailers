# Pruebas de carga (5K)

Usuarios simulados con [k6](https://grafana.com/docs/k6/) para medir cuánto aguanta
la app y cuánto procesador gasta cada pantalla (el límite de Vercel Hobby es de 4 h al mes).
Plan y decisiones: `docs/PLAN.md` › 5K. No es parte de la app: no entra en el build.

**Nunca contra producción en Vercel.** La app corre compilada en modo producción en
la computadora, conectada al Supabase de siempre (nadie la usa todavía, D21). Solo
lectura: los usuarios simulados abren pantallas, no guardan nada (D22).

## Preparar (una vez)

1. k6: `winget install GrafanaLabs.k6` (queda en `C:\Program Files\k6\k6.exe`).
2. Cuentas de prueba: `node pruebas-carga/cuentas.mjs crear`. Crea `[PRUEBA K6] Admin`,
   `Capturista` y `Gerente` y guarda sus contraseñas en `pruebas-carga/.env.k6`
   (no se sube a git). Al terminar: `node pruebas-carga/cuentas.mjs borrar`.
3. La app en modo producción en una copia aparte (el modo dev no sirve para medir y
   no se compila con dev encendido):
   ```
   git worktree add <carpeta temporal>/app-k6 HEAD --detach
   copiar .env.local a esa carpeta
   cd <carpeta temporal>/app-k6 && npm ci && npm run build && npx next start -p 3100
   ```
4. Comprobar: `k6 run pruebas-carga/humo.js` (cada rol entra y ve su Inicio).

## Medir

Las corridas se lanzan con `medir.ps1`, que además mide el procesador de la app
(los procesos node del puerto 3100) y lo divide entre las peticiones:

```
powershell -ExecutionPolicy Bypass -File pruebas-carga/medir.ps1 -Usuarios 5
powershell -ExecutionPolicy Bypass -File pruebas-carga/medir.ps1 -Usuarios 20
powershell -ExecutionPolicy Bypass -File pruebas-carga/medir.ps1 -Usuarios 50
# Una sola pantalla, para saber cuánto procesador gasta ella sola:
powershell -ExecutionPolicy Bypass -File pruebas-carga/medir.ps1 -Usuarios 5 -Pagina reportes_admin -Duracion 1m
```

- `recorridos.js`: 70 % capturistas, 20 % admin, 10 % gerente; cada uno recorre sus
  pantallas con pausas de 5 a 15 s. Las pantallas se piden como al moverse dentro de
  la app (`RSC: 1` y `?_rsc=`). La sesión de cada cuenta se comparte entre sus
  usuarios simulados y dura una hora: cada corrida debe durar menos.
- Resultado: tabla por pantalla (típica, 5 % más lento, máximo) y un JSON en
  `pruebas-carga/resultados/` con el procesador por petición.

## Regresar a una pantalla ya vista

`navegador.js` abre un Chromium real, entra como el admin de prueba y cuenta las
peticiones a la app al ir a una pantalla nueva, al volver desde el menú y con atrás:

```
K6_BROWSER_EXECUTABLE_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" k6 run pruebas-carga/navegador.js
```

(Sin Chrome instalado se usa Edge. `K6_BROWSER_HEADLESS=false` muestra la ventana.)

## Notas

- Supabase Auth guarda `app_metadata` después de crear el usuario: el trigger que crea
  el perfil no ve el rol y lo deja en capturista. `cuentas.mjs` pone el rol después.
- La capturista de prueba no tiene servicios propios: sus pantallas pesan menos que las
  de una capturista real. El admin y el gerente sí ven todos los datos `[PRUEBA]`.

## Pruebas de punta a punta (5L)

Usuarios simulados que usan la app como personas (k6 browser con Edge aislado):
capturan servicios, mantenimientos, tickets y kilometraje, y se comprueba que los
totales cuadren en todas las pantallas. Todo lo que capturan lleva `[PRUEBA E2E]`
y se borra en la limpieza. Plan en `docs/PLAN.md` › 5L.

```
node pruebas-carga/cuentas.mjs crear          # admin, gerente y 5 capturistas
cd pruebas-carga
k6 run e2e/preparar.js                        # unidades T-901, T-902, R-901, C-901
```

Cada guion se corre con `powershell -ExecutionPolicy Bypass -File e2e/correr.ps1 <guion>`
(deja el resultado en `e2e/resultados/<guion>.json`):

- `capturas`: etapa 2, un usuario a la vez (servicios, kilometraje, taller, tickets, editar, eliminar, mes cerrado).
- `numeros` y `node e2e/excel.mjs`: etapa 3, Reportes, ficha, Gastos y Excel contra un cálculo aparte.
- `android`: comprobante PDF sin tipo, como llega de algunos celulares.
- `simultaneo`: etapa 4, siete navegadores a la vez (unos 15 minutos). Entran uno cada
  20 s: si arrancan juntos, el procesador de la laptop se satura y la app, que corre
  en la misma laptop, tarda en contestar. Conviene cerrar los programas pesados.

Las capturas de pantalla de las fallas quedan en `e2e/capturas/` (no se suben a git).
