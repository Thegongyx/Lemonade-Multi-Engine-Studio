# 打包与分发

> 从根 README 移出的打包内容。返回 [studio 文档索引](README.md)。

## 应用包

```powershell
.\scripts\package.ps1                 # 不含引擎（约 4 MB zip，对方自行添加引擎）
.\scripts\package.ps1 -WithEngines    # 含 engines/（约 1.1 GB zip）
```

产物：`dist\LemonadeMultiEngineStudio\`（文件夹）与 `dist\LemonadeMultiEngineStudio.zip`。

## 单独打包引擎

每个引擎一个 zip，用于 Release 分发：

```powershell
.\scripts\package-engines.ps1                       # 打包 engines/ 下全部引擎
.\scripts\package-engines.ps1 -Only roc_official    # 只打包指定引擎
```

产物：`dist\engines\engine-<引擎名>_gfx1151_win.zip`。
**每个 zip 内已含顶层 `<引擎名>/` 目录**，所以解压到 `engines\` 后天然得到
`engines\<引擎名>\llama-server.exe`（引擎扫描器要求的层级）。

## 安装程序

需 Inno Setup 6（`winget install --exact --id JRSoftware.InnoSetup`）：

```powershell
.\scripts\build-installer.ps1                 # 不含引擎
.\scripts\build-installer.ps1 -WithEngines    # 含 engines/
```

产物：`dist\LemonadeMultiEngineStudio-Setup.exe`（安装向导，免管理员装到
`%LOCALAPPDATA%\Programs\Lemonade Multi-Engine Studio`）。安装后：

- **开始菜单**出现「应用 + 卸载」两项，**桌面图标**可选（默认勾选）。
- **开机自启**可选（默认不勾）。
- 注册表写入**卸载条目**（设置 → 应用 里可卸载）。
- **卸载**时会先关闭 `LemonadeMultiEngineStudio` / `lemond` / `llama-server`，并清理 `data\`。

## 分发给别人

解压后双击 `LemonadeMultiEngineStudio.exe` 即可——**无需源码、无需额外运行时**
（`lemond.exe` 为静态链接，第三方依赖已内置）。

- 只需 **Windows x64**；用 ROCm/HIP 引擎需装 **AMD 驱动**（引擎目录已带 `amdhip64_7.dll` 等，
  不依赖系统安装 ROCm）。
- **模型文件不含**，对方在「模型管理 → 模型下载」里自行下载。
- 打包时会把 `config.json` 的引擎路径改为**相对路径**（`engines\<name>\llama-server.exe`），因此可移植；
  未打包引擎时这些条目显示为未安装，对方可在「引擎管理」里添加自己的引擎。
- `config.json` / `recipe_options.json` **不在仓库里**（本机私有、自动生成）；从源码 clone 的人请看
  [quick-start.md](quick-start.md)。

## Release 资产约定

一次发布（tag，如 `v0.1.2`）通常包含：

| 资产 | 说明 |
|---|---|
| `LemonadeMultiEngineStudio-Setup.exe` | 安装版 |
| `LemonadeMultiEngineStudio-portable.zip` | 便携版 |
| `engine-<引擎名>_gfx1151_win.zip` × N | 每个引擎一个包，解压到 `engines\` |

引擎包内容与版本随引擎更新而更新（例如 strixllama 引擎升级到 0.1.17 时只替换对应 zip）；
引擎清单与来源见 [../engines/README.md](../engines/README.md)。
