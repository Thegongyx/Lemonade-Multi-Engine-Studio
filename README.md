# Lemonade Multi-Engine Studio

> **Lemonade 的 Windows / AMD 优化版 fork**（中文名：**Lemonade 多引擎工作台**）。
> 在保留 lemonade 全部能力（OpenAI / Anthropic / Ollama 兼容 API、模型下载、多后端）的基础上，
> 重点解决了 **"同一种后端类型只能用一个 llama.cpp 二进制"** 的限制，并配了一套功能更全的
> 中英双语 WebUI 与一键启动器。

---

## ✨ 相对 lemonade 原版的核心优化

### 1. 多引擎兼容：同一后端类型下可注册/运行多个 llama.cpp 编译产物

原版 lemonade 的 `config.json` 里，`llamacpp.rocm_bin` / `vulkan_bin` 是**每个后端全局一个二进制**，
因此同一个 `rocm`（HIP）下**无法**同时挂载两个不同编译的 llama.cpp。

本 fork 新增了 **自定义引擎注册表**（`llamacpp.custom_engines`）：

```jsonc
"llamacpp": {
  "engines_dir": "…\\engines",              // 自动扫描的引擎目录
  "custom_engines": {
    "roc_official":  { "path": "…\\roc_official\\llama-server.exe",  "backend": "rocm",   "device": "ROCm0" },
    "rocm_ciru":     { "path": "…\\rocm_ciru\\llama-server.exe",     "backend": "rocm",   "device": "ROCm0" },
    "vulkan_cm1":    { "path": "…\\vulkan_official_cm1\\llama-server.exe", "backend": "vulkan", "device": "Vulkan0",
                       "env": { "GGML_VK_ROCMFP4_COOPMAT": "1" } }
  }
}
```

每个模型通过 `llamacpp_engine` **按模型选择任意引擎构建**：

```jsonc
// recipe_options.json
"extra.MyModel": { "llamacpp_engine": "roc_official", "llamacpp_args": "-ngl 99 -fa on" }
```

**效果**：同一台机器上，不同模型可以跑在**不同编译的 llama.cpp 引擎**上（例如 `roc_official`、
`rocm_ciru`、`vulkan_official`、`vulkan_official_cm1` …），并且**同时运行**，统一挂在
**一个 OpenAI 兼容端口**（默认 `http://localhost:13310/v1`）下按 model 名路由。

> 原版 lemonade：一个后端类型 = 一个二进制。
> 本 fork：一个后端类型 = 任意多个二进制，按模型选择。

### 2. WebUI：比原版更完整的管理台（中英双语，默认中文）

左侧导航顺序：**模型管理 → 聊天测试 → 引擎管理 → 运行控制**。

- **模型管理**（两个 Tab）
  - **模型列表**（默认）
    - **多本地路径扫描**：添加任意多个本地目录，自动发现模型；兼容 HF 缓存布局
      `models--org--repo/snapshots/<commit>/`，按仓库名命名。
    - **每模型独立配置**：选择**引擎构建**、配置**双模式参数**（整串输入 / 参数构建器 +
      一键暴露全部参数）、设置上下文长度。
    - **启动 / 停止 / 实时日志**：每行操作，加载失败自动弹出日志。
  - **模型下载**：内置 HuggingFace（可走 hf-mirror）/ ModelScope 搜索，展开变体后一键下载。
- **聊天测试**
  - 选择模型进行**流式对话**测试（逐字输出）。
  - 右侧**可折叠实时日志面板**：点「显示日志」展开、再点「隐藏日志」收起；聊天区与日志面板上下对齐。
- **引擎管理**（两个 Tab）
  - **引擎列表**（默认）
    - **添加自编引擎**：填入自编 llama.cpp 的构建目录，自动识别 rocm / vulkan / cpu 并登记。
    - 列出已登记 + 自动扫描到的引擎，可删除自编引擎。
    - **一键暴露引擎全部参数**：解析所选引擎的 `llama-server --help` 为结构化参数表（可搜索、多选、批量加入）。
  - **引擎下载**：按 **recipe 大分类折叠**（`llamacpp` / `flm` / `whispercpp` / `sd-cpp` /
    `ryzenai-llm` …），点开才显示该分类的后端明细并一键安装；自动隐藏本机 `unsupported` 的后端。
- **运行控制**：仅展示 **OpenAI 兼容端点** 与**各运行模型所在端口**。
- **i18n**：中文 / English 一键切换（默认中文）。

### 3. 参数优先级与兼容性修复

- **手写优先**：`手写参数 > 模型默认参数 > 全局默认`；自动注入的默认值（`--spec-type draft-mtp`、`--parallel`）
  只在用户没写时才加。
- **别名自动归并**：`--temp`/`--temperature`、`--top_p`/`--top-p`、`-ngl`/`--n-gpu-layers` 等会归一到统一 key，
  手写的顶掉默认，不再出现重复 flag。
- **JSON kwargs 引号保留**：`--chat-template-kwargs {"reasoning_effort":"low"}` 的引号不再被误当分组引号剥除。
- **上下文**：用 `ctx_size` 设置（`/v1/models/<id>/options` 或 WebUI），避免手写重复 `--ctx-size`。

### 4. 一键启动器（Windows）

- `LemonadeMultiEngineStudio.exe`：带图标、**单实例**（重复点击不会多开托盘图标），启动后端并自动打开 WebUI。
- **退出即清理**：用 Windows Job Object 把 `lemond` 与其派生的**所有 `llama-server` 一起关闭**，不留孤儿进程。

---

## 📁 目录结构

```
├── CMakeLists.txt / src/ / cmake/ / tools/ / test/ …   # lemonade 源码（本 fork 的服务器）
├── webui/          # React + TS + Vite 前端（中英双语）
├── engines/        # 预编译 llama.cpp 引擎（含 .installed），可被自动扫描
├── config/         # 运行配置：config.example.json（示例，tracked）；
│                   #   config.json / recipe_options.json（本机私有，自动生成，已 ignore）
├── launcher/       # LemonadeStudio 启动器源码与图标
├── scripts/        # start.ps1 / install.ps1 / build-webui.ps1
├── docs/           # lemonade 文档；docs/engines/ 为引擎编译文档
├── build/          # 构建产物（build/Release/lemond.exe）
└── LemonadeMultiEngineStudio.exe
```

---

## 📦 打包分发

```powershell
.\scripts\package.ps1                 # 不含引擎（约 4 MB zip，对方自行添加引擎）
.\scripts\package.ps1 -WithEngines    # 含 engines/（约 1.1 GB zip）
```

产物：`dist\LemonadeMultiEngineStudio\`（文件夹）与 `dist\LemonadeMultiEngineStudio.zip`。

**做成真正的安装程序**（需 Inno Setup 6：`winget install --exact --id JRSoftware.InnoSetup`）：

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

**分发给别人**：解压后双击 `LemonadeMultiEngineStudio.exe` 即可——**无需源码、无需额外运行时**
（`lemond.exe` 为静态链接，第三方依赖已内置）。

- 只需 **Windows x64**；用 ROCm/HIP 引擎需装 **AMD 驱动**（引擎目录已带 `amdhip64_7.dll` 等）。
- **模型文件不含**，对方在「模型管理 → 模型下载」里自行下载。
- 打包时会把 `config.json` 的引擎路径改为**相对路径**（`engines\<name>\llama-server.exe`），因此可移植；
  未打包引擎时这些条目显示为未安装，对方可在「引擎管理」里添加自己的引擎。
- `config.json` / `recipe_options.json` **不在仓库里**（本机私有、自动生成）；从源码 clone 的人请看
  [首次使用：获取并注册引擎](#-首次使用获取并注册引擎)。

---

## 🚀 快速开始

**方式一：一键启动器（推荐）**
1. 双击 `LemonadeMultiEngineStudio.exe`（或先跑一次 `scripts\install.ps1` 创建桌面快捷方式）。
2. 浏览器打开 `http://localhost:13310/app/`。

**方式二：脚本**
```powershell
.\scripts\start.ps1            # 默认端口 13310
```

**OpenAI 兼容端点**
```
base_url = http://localhost:13310/v1
api_key  = lemonade            # 若设置了 LEMONADE_API_KEY
```

---

## 🧩 首次使用：获取并注册引擎

> 仓库**不包含** `config/config.json` 与 `config/recipe_options.json` —— 它们是**本机私有配置**，
> 应用**第一次保存设置时自动生成**。因此新克隆的仓库里**引擎列表是空的**，需要你自己放引擎。

1. **下载引擎**：到 [Releases](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases)
   下载 `engine-*_gfx1151_win.zip`（如 `engine-roc_official_gfx1151_win.zip`），解压到 `engines\`，
   使结构为 `engines\<引擎名>\llama-server.exe`。
2. **注册引擎**：启动 `LemonadeMultiEngineStudio.exe` → WebUI「引擎管理 → 引擎列表 → 添加自编引擎」，
   填入引擎目录（如 `engines\roc_official`）；程序会自动识别 rocm / vulkan / cpu 并写入你的 `config.json`。
   - 也可以照着 `config/config.example.json` 手写 `config/config.json`（**格式示例，请替换成你自己的引擎**）。
3. **添加模型**：在「模型管理 → 本地路径」添加你的模型目录（兼容 HF 缓存布局
   `models--org--repo/snapshots/<commit>/`），或在「模型下载」里在线拉取。
4. **按模型选引擎**：在模型行的「配置」里选择引擎构建、填写参数 —— 写入本机的 `recipe_options.json`。

---

## 🔨 从源码构建

```powershell
# 1) 配置（首次会下载依赖，走 GitHub 镜像更快）
cmake --preset vs18 -DBUILD_WEB_APP=OFF

# 2) 编译服务器
cmake --build build --config Release --target lemond

# 3) 构建前端并 staging 到 lemond 的 resources/web-app（供 /app 访问）
.\scripts\build-webui.ps1
```
> Windows 构建提示：libwebsockets 的 `-Werror` 在 MSVC 下需关掉；建议构建时注入
> `CL=/utf-8 /WX-`，并用 `-DDISABLE_WERROR=ON`、`-DCMAKE_DISABLE_FIND_PACKAGE_nlohmann_json=ON`
> 避免用到 ROCm/conda 自带的不兼容 nlohmann_json。

---

## 🆚 与原版 lemonade 的差异一览

| 能力 | lemonade 原版 | 本 fork |
|---|---|---|
| 同后端类型多编译产物 | ❌ 每后端一个二进制 | ✅ `custom_engines` + 按模型选 `llamacpp_engine` |
| 多引擎同时挂一个 OpenAI 端口 | ❌ | ✅ |
| 引擎下载 | ✅（CLI/桌面） | ✅ + WebUI 内一键下载 |
| 添加自编引擎 | 手改 config | ✅ WebUI 填目录自动登记 |
| 一键暴露引擎全部参数 | ❌ | ✅（解析 `--help`） |
| 模型本地路径扫描 | 单个 `extra_models_dir` | ✅ 多个路径 + HF 缓存命名兼容 |
| 模型下载源 | HF / ModelScope | ✅ + hf-mirror |
| 每模型选引擎/双模式参数/启停/日志 | 部分 | ✅ 完整 WebUI |
| 参数别名归并 / JSON kwargs | ❌ | ✅ |
| 一键启动器 + 退出清理 | 桌面 App | ✅ 单实例 + Job Object 清理 |
| 中英双语 WebUI | 部分 | ✅ 默认中文 |

---

## 🙏 致谢

本 fork 基于 [lemonade-sdk/lemonade](https://github.com/lemonade-sdk/lemonade)（MIT）构建。
引擎来自 [ROCmFPX/ROCmFPX](https://github.com/ROCmFPX/ROCmFPX) 及各社区 fork 的本地编译产物，
感谢 [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) 与 AMD ROCm 社区。

## 📄 License

继承 lemonade 的 MIT License（见 `LICENSE`）。
