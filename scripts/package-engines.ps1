# Packages each engines/<name>/ folder into dist/engines/engine-<name>_gfx1151_win.zip.
#
# Every archive contains a single top-level <name>/ folder, so extracting it into
# engines/ yields engines/<name>/llama-server.exe -- the one-level layout the
# engine scanner (GET /v1/engines) expects. Archiving the *contents* instead would
# dump llama-server.exe straight into engines/ and the engines would never be found.
param([string[]]$Only)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$enginesDir = Join-Path $root "engines"
$outDir = Join-Path $root "dist\engines"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# Stage outside the engine folders so the archive can never nest into itself.
$stage = Join-Path $env:TEMP "lemonade-engine-stage"

$names = if ($Only) { $Only } else {
    Get-ChildItem $enginesDir -Directory | ForEach-Object { $_.Name }
}

$packed = 0
foreach ($name in $names) {
    $src = Join-Path $enginesDir $name
    if (-not (Test-Path (Join-Path $src "llama-server.exe"))) {
        Write-Host "skip $name (no llama-server.exe)" -ForegroundColor DarkYellow
        continue
    }

    $zip = Join-Path $outDir "engine-${name}_gfx1151_win.zip"
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

    $dest = Join-Path $stage $name
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item (Join-Path $src "*") $dest -Recurse -Force

    Compress-Archive -Path $dest -DestinationPath $zip -Force
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

    $mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
    Write-Host ("packed {0,-22} -> {1,-40} {2,7} MB" -f $name, (Split-Path $zip -Leaf), $mb) -ForegroundColor Green
    $packed++
}

Write-Host "Done. $packed engine archives in $outDir" -ForegroundColor Cyan
