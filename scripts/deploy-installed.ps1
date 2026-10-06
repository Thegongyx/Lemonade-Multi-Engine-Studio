# Deploys the locally built lemond + WebUI into the installed app, then restarts
# the launcher. Use this to test changes against an Inno Setup installation
# without rebuilding the installer. A reinstall/repair will overwrite these files.
#
#   .\scripts\deploy-installed.ps1
#   .\scripts\deploy-installed.ps1 -InstallDir "D:\Lemonade Multi-Engine Studio"
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\Lemonade Multi-Engine Studio")
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$srcExe = Join-Path $root "build\Release\lemond.exe"
$dstExe = Join-Path $InstallDir "build\Release\lemond.exe"
$dstRes = Join-Path $InstallDir "build\Release\resources\web-app"
$webui  = Join-Path $root "webui\dist"

if (-not (Test-Path $srcExe)) { Write-Error "Missing $srcExe - build the server first."; exit 1 }
if (-not (Test-Path $dstExe)) { Write-Error "Install not found at '$InstallDir' (no lemond.exe)."; exit 1 }
if (-not (Test-Path (Join-Path $webui "index.html"))) { Write-Error "Missing webui build - run scripts\build-webui.ps1 first."; exit 1 }

Write-Host "Stopping launcher + lemond ..." -ForegroundColor Cyan
Get-Process LemonadeMultiEngineStudio -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process lemond -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Write-Host "Backing up lemond.exe -> lemond.exe.bak-$stamp" -ForegroundColor Cyan
Copy-Item $dstExe "$dstExe.bak-$stamp" -Force

Write-Host "Deploying lemond.exe ..." -ForegroundColor Cyan
Copy-Item $srcExe $dstExe -Force

Write-Host "Deploying WebUI ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $dstRes | Out-Null
Get-ChildItem $dstRes -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $webui "*") $dstRes -Recurse -Force

$launcher = Join-Path $InstallDir "LemonadeMultiEngineStudio.exe"
if (Test-Path $launcher) {
    Write-Host "Restarting launcher ..." -ForegroundColor Cyan
    Start-Process -FilePath $launcher
}
Write-Host "Done. Hard-refresh http://localhost:13310/app/ in the browser." -ForegroundColor Green
