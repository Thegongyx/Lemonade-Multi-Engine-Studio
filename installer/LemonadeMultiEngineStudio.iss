; Inno Setup script for Lemonade Multi-Engine Studio.
; Build with: .\scripts\build-installer.ps1   (runs package.ps1 first)
; Requires Inno Setup 6 (ISCC.exe).

#define AppName "Lemonade Multi-Engine Studio"
#define AppVersion "0.1.2"
#define AppExe "LemonadeMultiEngineStudio.exe"

[Setup]
AppId={{9F3C2A7E-2B4D-4C1A-9E5F-7A1B2C3D4E5F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppName}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
OutputDir=..\dist
OutputBaseFilename=LemonadeMultiEngineStudio-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "开机时自动启动服务 (autostart with Windows)"; GroupDescription: "其它 / Other:"; Flags: unchecked

[Files]
; Program files. config.json is excluded here and installed separately below as
; user data: the automatic uninstall that runs before an in-place upgrade would
; otherwise delete the user's model paths, engine registrations and per-model
; options on every update.
Source: "..\dist\LemonadeMultiEngineStudio\*"; DestDir: "{app}"; \
    Excludes: "config\config.json"; Flags: recursesubdirs createallsubdirs ignoreversion
; User data: write only when absent, and never delete on uninstall.
Source: "..\dist\LemonadeMultiEngineStudio\config\config.json"; DestDir: "{app}\config"; \
    Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; \
    ValueName: "LemonadeMultiEngineStudio"; ValueData: """{app}\{#AppExe}"""; \
    Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM {#AppExe} /T"; Flags: runhidden; RunOnceId: "KillLauncher"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM lemond.exe /T"; Flags: runhidden; RunOnceId: "KillLemond"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM llama-server.exe /T"; Flags: runhidden; RunOnceId: "KillLlama"

[UninstallDelete]
; Only logs. data\cache holds downloaded backends/engines (hundreds of MB) and
; must survive an upgrade, otherwise every update re-downloads them.
Type: filesandordirs; Name: "{app}\data\logs"
