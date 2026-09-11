# Packages a portable distribution folder (+ zip) others can run directly.
#   .\scripts\package.ps1                 # without engines (small, ~10 MB)
#   .\scripts\package.ps1 -WithEngines    # include engines/ (~1.1 GB)
param([switch]$WithEngines)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$name = "LemonadeMultiEngineStudio"
$out  = Join-Path $root "dist\$name"

if (-not (Test-Path (Join-Path $root "LemonadeMultiEngineStudio.exe"))) { Write-Error "Launcher exe missing; build it first."; exit 1 }
if (-not (Test-Path (Join-Path $root "build\Release\lemond.exe")))      { Write-Error "lemond.exe missing; build the server first."; exit 1 }

Write-Host "Assembling $out ..." -ForegroundColor Cyan
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$out\build\Release" -Force | Out-Null
New-Item -ItemType Directory -Path "$out\config" -Force | Out-Null
New-Item -ItemType Directory -Path "$out\scripts" -Force | Out-Null

Copy-Item (Join-Path $root "LemonadeMultiEngineStudio.exe") $out -Force
Copy-Item (Join-Path $root "build\Release\lemond.exe") "$out\build\Release\" -Force
Copy-Item (Join-Path $root "build\Release\resources") "$out\build\Release\" -Recurse -Force
Copy-Item (Join-Path $root "config\*") "$out\config\" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $root "scripts\install.ps1") "$out\scripts\" -Force
Copy-Item (Join-Path $root "README.md") $out -Force

# A portable config: drop machine-specific model paths, and make engine paths
# relative to the package root (lemond's working dir is the package root).
$cfgPath = Join-Path $out "config\config.json"
if (Test-Path $cfgPath) {
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    $cfg.PSObject.Properties.Remove("extra_models_dirs")
    $cfg.PSObject.Properties.Remove("extra_models_dir")
    if ($cfg.llamacpp) {
        $cfg.llamacpp.engines_dir = "engines"
        if ($cfg.llamacpp.custom_engines) {
            foreach ($e in $cfg.llamacpp.custom_engines.PSObject.Properties) {
                $e.Value.path = "engines\$($e.Name)\llama-server.exe"
            }
        }
    }
    $cfg | ConvertTo-Json -Depth 8 | Set-Content $cfgPath -Encoding UTF8
}
Remove-Item (Join-Path $out "config\recipe_options.json") -Force -ErrorAction SilentlyContinue

if ($WithEngines) {
    Write-Host "Including engines/ (~1.1 GB) ..." -ForegroundColor Yellow
    Copy-Item (Join-Path $root "engines") $out -Recurse -Force
} else {
    New-Item -ItemType Directory -Path "$out\engines" -Force | Out-Null
    Set-Content (Join-Path $out "engines\README.txt") "Put self-built llama.cpp engine folders here (each containing llama-server.exe), then register them in the WebUI > Engines." -Encoding UTF8
}

$zip = Join-Path $root "dist\$name.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Write-Host "Zipping -> $zip ..." -ForegroundColor Cyan
Compress-Archive -Path "$out\*" -DestinationPath $zip -Force

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Folder: $out"
Write-Host "Zip:    $zip"
