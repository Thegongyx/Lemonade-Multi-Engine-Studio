# Starts the patched lemond (backend + hosted webui) and opens the browser.
# Usage:  .\scripts\start.ps1            (default port 13310)
#         .\scripts\start.ps1 -Port 13305
param([int]$Port = 13310)

$ErrorActionPreference = "Stop"
$root   = Split-Path $PSScriptRoot -Parent
$lemond = Join-Path $root "build\Release\lemond.exe"
$cfg    = Join-Path $root "config"
$cache  = Join-Path $root "data\cache"
New-Item -ItemType Directory -Path $cache -Force | Out-Null

if (-not (Test-Path $lemond)) { Write-Error "lemond.exe not found at $lemond - build it first."; exit 1 }

Get-Process lemond -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Write-Host "Starting lemond on http://localhost:$Port ..." -ForegroundColor Cyan
Start-Process -FilePath $lemond -ArgumentList "`"$cache`"", "`"$cfg`"", "--port", "$Port"
Start-Sleep -Seconds 8

$url = "http://localhost:$Port/app/"
Write-Host "WebUI: $url" -ForegroundColor Green
Start-Process $url
