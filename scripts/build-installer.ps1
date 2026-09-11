# Builds the Windows installer (Inno Setup).
#   .\scripts\build-installer.ps1                 # without engines
#   .\scripts\build-installer.ps1 -WithEngines    # include engines/ (~1.1 GB)
param([switch]$WithEngines)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

# Locate ISCC.exe (Inno Setup 6).
$candidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)
$iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($cmd) { $iscc = $cmd.Source }
}
if (-not $iscc) {
    Write-Error "ISCC.exe (Inno Setup 6) not found. Install with: winget install --exact --id JRSoftware.InnoSetup"
    exit 1
}

# Assemble the payload folder first.
if ($WithEngines) { & "$PSScriptRoot\package.ps1" -WithEngines } else { & "$PSScriptRoot\package.ps1" }

Write-Host "Compiling installer with $iscc ..." -ForegroundColor Cyan
& $iscc "$root\installer\LemonadeMultiEngineStudio.iss"
if ($LASTEXITCODE -ne 0) { Write-Error "ISCC failed (exit $LASTEXITCODE)"; exit $LASTEXITCODE }

Write-Host ""
Write-Host "Installer: $root\dist\LemonadeMultiEngineStudio-Setup.exe" -ForegroundColor Green
