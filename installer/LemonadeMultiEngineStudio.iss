; Inno Setup script for Lemonade Multi-Engine Studio.
; Build with: .\scripts\build-installer.ps1   (runs package.ps1 first)
; Requires Inno Setup 6 (ISCC.exe).

#define AppName "Lemonade Multi-Engine Studio"
#define AppVersion "0.1.0"
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
Source: "..\dist\LemonadeMultiEngineStudio\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

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
Type: filesandordirs; Name: "{app}\data"
