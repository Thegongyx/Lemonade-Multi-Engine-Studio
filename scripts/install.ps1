# Installs Lemonade Multi-Engine Studio: creates Desktop + Start Menu shortcuts to
# LemonadeMultiEngineStudio.exe (which starts the backend and opens the webui).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$exe  = Join-Path $root "LemonadeMultiEngineStudio.exe"

if (-not (Test-Path $exe)) {
    Write-Error "LemonadeMultiEngineStudio.exe not found at $exe"
    exit 1
}

$ws = New-Object -ComObject WScript.Shell
$shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "Lemonade Multi-Engine Studio.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Programs")) "Lemonade Multi-Engine Studio.lnk")
)

foreach ($lnkPath in $shortcutPaths) {
    $lnk = $ws.CreateShortcut($lnkPath)
    $lnk.TargetPath       = $exe
    $lnk.WorkingDirectory = $root
    $lnk.IconLocation     = "$exe,0"
    $lnk.Description      = "Lemonade Multi-Engine Studio"
    $lnk.Save()
    Write-Host "Created shortcut: $lnkPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "Installed. Double-click 'Lemonade Multi-Engine Studio' on the Desktop to start." -ForegroundColor Cyan
