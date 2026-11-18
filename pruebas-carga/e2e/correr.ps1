# Corre un guion de las pruebas de punta a punta (5L) y deja su resultado en
# e2e/resultados/<guion>.json. La app debe estar en http://localhost:3100.
#
#   powershell -ExecutionPolicy Bypass -File pruebas-carga/e2e/correr.ps1 capturas

param([Parameter(Mandatory = $true)][string]$Guion)

$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$k6 = "C:\Program Files\k6\k6.exe"
if (-not $env:K6_BROWSER_EXECUTABLE_PATH) {
  $env:K6_BROWSER_EXECUTABLE_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

New-Item -ItemType Directory -Force (Join-Path $here "resultados") | Out-Null
Push-Location $root
try {
  $lines = & $k6 run --quiet "e2e/$Guion.js" 2>&1 | ForEach-Object { "$_" }
} finally {
  Pop-Location
}

foreach ($line in $lines) {
  $msg = if ($line -match 'msg="(.*)" source=') { $Matches[1] -replace '\\"', '"' -replace '\\n', "`n" } else { $line }
  if ($msg.StartsWith("LEDGER ")) {
    $msg.Substring(7) | Out-File -Encoding utf8 (Join-Path $here "resultados\$Guion.json")
  } elseif ($msg -match '^(BIEN|FALLA|avisos al guardar|HORA|CARRERA|AVISO|ADMIN abri|GERENTE abri)|casos bien|^\s+FALLA|Uncaught|level=error') {
    $msg
  }
}
