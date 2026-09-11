# Build the webui and stage it into lemond's resources so lemond serves it at /app.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$env:npm_config_registry = "https://registry.npmmirror.com"

Write-Host "[1/2] Building webui ..." -ForegroundColor Cyan
Set-Location (Join-Path $root "webui")
npm run build

Write-Host "[2/2] Staging into lemond resources/web-app ..." -ForegroundColor Cyan
$res = Join-Path $root "build\Release\resources\web-app"
New-Item -ItemType Directory -Path $res -Force | Out-Null
Get-ChildItem $res -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $root "webui\dist\*") $res -Recurse -Force
Write-Host "Done. lemond will serve it at /app." -ForegroundColor Green
