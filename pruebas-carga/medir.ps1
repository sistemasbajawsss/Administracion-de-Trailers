# Corre recorridos.js y mide el procesador que gastó la app (5K).
#
#   powershell -ExecutionPolicy Bypass -File pruebas-carga/medir.ps1 -Usuarios 20
#   powershell -ExecutionPolicy Bypass -File pruebas-carga/medir.ps1 -Usuarios 5 -Pagina reportes_admin -Duracion 1m
#
# La app debe estar corriendo en modo producción (next start) en el puerto 3100.
# Suma el tiempo de procesador de los procesos node de esa app antes y después
# de la corrida y lo divide entre las peticiones: ms de procesador por pantalla,
# comparable con el "Fluid Active CPU" de Vercel (4 h al mes en Hobby).
# El resultado queda en pruebas-carga/resultados/.

param(
  [int]$Usuarios = 5,
  [string]$Duracion = "8m",
  [string]$Pagina = "",
  [string]$BaseUrl = "http://localhost:3100"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$k6 = "C:\Program Files\k6\k6.exe"

# Procesos de la app: los node que escuchan en el puerto y sus hijos.
function Get-AppCpuSeconds {
  $port = ([Uri]$BaseUrl).Port
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
  $all = Get-CimInstance Win32_Process
  $ids = @($listener.OwningProcess)
  $parent = ($all | Where-Object { $_.ProcessId -eq $listener.OwningProcess }).ParentProcessId
  $ids += ($all | Where-Object { $_.ParentProcessId -in $ids -or ($_.ProcessId -eq $parent -and $_.Name -eq "node.exe") }).ProcessId
  $total = 0.0
  foreach ($id in ($ids | Select-Object -Unique)) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "node") { $total += $p.TotalProcessorTime.TotalSeconds }
  }
  return $total
}

New-Item -ItemType Directory -Force (Join-Path $here "resultados") | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$name = if ($Pagina) { "$stamp`_$Pagina`_$Usuarios" } else { "$stamp`_$Usuarios`usuarios" }
$json = Join-Path $here "resultados\$name.json"

$before = Get-AppCpuSeconds
Push-Location $here
try {
  $k6Args = @("run", "--quiet", "-e", "USUARIOS=$Usuarios", "-e", "DURACION=$Duracion", "-e", "BASE_URL=$BaseUrl", "-e", "SALIDA=$json")
  if ($Pagina) { $k6Args += @("-e", "PAGINA=$Pagina") }
  & $k6 @k6Args recorridos.js
} finally {
  Pop-Location
}
$after = Get-AppCpuSeconds

$result = Get-Content $json -Raw | ConvertFrom-Json
$cpu = $after - $before
$perRequest = if ($result.peticiones -gt 0) { [math]::Round($cpu * 1000 / $result.peticiones, 1) } else { 0 }
$result | Add-Member -NotePropertyName cpu_segundos -NotePropertyValue ([math]::Round($cpu, 1))
$result | Add-Member -NotePropertyName cpu_ms_por_peticion -NotePropertyValue $perRequest
$result | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $json

"Procesador de la app: $([math]::Round($cpu, 1)) s en $($result.peticiones) peticiones = $perRequest ms por pantalla"
"Resultado: $json"
