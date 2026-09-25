# 引擎注册表与目录结构

> 本页说明本 fork 的引擎发现/注册机制与仓库布局。引擎清单与编译方法见
> [../engines/README.md](../engines/README.md)。返回 [studio 文档索引](README.md)。

## 目录结构

```
├── CMakeLists.txt / src/ / cmake/ / tools/ / test/ …   # lemonade 源码（本 fork 的服务器）
├── webui/          # React + TS + Vite 前端（中英双语）
├── engines/        # 预编译 llama.cpp 引擎（含 .installed），可被自动扫描（二进制 git-ignore）
├── config/         # 运行配置：config.example.json（示例，tracked）；
│                   #   config.json / recipe_options.json（本机私有，自动生成，已 ignore）
├── launcher/       # LemonadeStudio 启动器源码与图标
├── scripts/        # start.ps1 / install.ps1 / build-webui.ps1 / package*.ps1 / build-installer.ps1
├── docs/           # 文档：docs/studio/（本 fork）、docs/engines/（引擎）、其余为 upstream lemonade
├── build/          # 构建产物（build/Release/lemond.exe）
└── LemonadeMultiEngineStudio.exe
```

## 引擎目录约定

```
engines\
└── <引擎名>\
    ├── llama-server.exe        # 入口（约 9–10KB 的启动壳，核心在 llama-server-impl.dll）
    ├── llama-server-impl.dll
    ├── llama.dll / ggml*.dll / mtmd.dll …
    ├── amdhip64_7.dll / rocblas.dll / …   # ROCm/HIP 引擎自带的运行时（不依赖系统 ROCm）
    ├── .installed              # 引擎扫描器/NovaMax 的识别标记（**UTF-8 无 BOM**）
    └── BUNDLE.json             # 运行时清单（可选，来自打包脚本）
```

- 目录名即引擎名，扫描到的条目默认以此命名。
- `path` 指向 `llama-server.exe`；用相对路径（`engines\<名>\llama-server.exe`）即可移植。
- `.installed` 必须是 **UTF-8 无 BOM**（带 BOM 会让 NovaMax 的 `JSON.parse` 失败）。

## 注册表（`config/config.json`）

```jsonc
"llamacpp": {
  "engines_dir": "…\\engines",         // 自动扫描的引擎目录（可选，默认仓库 engines/）
  "custom_engines": {
    "<引擎名>": {
      "path":    "engines\\<引擎名>\\llama-server.exe",
      "backend": "rocm" | "vulkan" | "cpu",   // 决定传 -dev / 设备名
      "device":  "ROCm0" | "Vulkan0" | "",   // 可选；空则由后端默认
      "env":     { "KEY": "VALUE" }          // 可选：该引擎的默认环境变量
    }
  }
}
```

- `env` 是**引擎级默认环境变量**，会被启动时注入；`roc_strixllama_env` 这类"烘焙版"引擎
  自身已带默认值，这里可用 `env` 覆盖。
- 引擎更新/新增后，WebUI「引擎列表」会合并显示已登记项与扫描发现项；**删除自编引擎**只从
  `custom_engines` 移除，不动磁盘文件。

## 按模型选引擎（`config/recipe_options.json`）

```jsonc
"extra.Qwen3.8-Flash-Next-GGUF": {
  "llamacpp_engine": "roc_strixllama",     // ← 选哪个引擎构建
  "ctx_size": 262144,
  "llamacpp_args": "-ngl 999 -fa on -ctk f16 -ctv f16 --cache-ram 1024 …",
  "llamacpp_env":  "LLAMA_MMB=1\nLLAMA_QSA_SPARSE=1\n…"   // ← 每模型 env（按行 KEY=VALUE）
}
```

- 同一后端类型下可挂任意多个引擎，模型之间互不影响；所有模型仍由**同一个 OpenAI 兼容端口**
  （默认 `http://localhost:13310/v1`）按 model 名路由。
- 参数优先级：**手写参数 > 模型默认 > 全局默认**；`--spec-type draft-mtp`、`--parallel` 等自动注入项
  只在未手写时添加。别名（`--temp` / `-ngl` / `--top_p` …）会归并去重。
- `-md` / `--model-draft` / `--mmproj` 属于 lemonade 保留参数，由模型的 checkpoint 自动注入，
  **不要**写在 `llamacpp_args` 里。

## 扫描与识别

- `engines_dir`（默认 `engines/`）下的每个子目录如果含 `llama-server.exe` 即视为一个引擎；
  backend/device 由目录内的 DLL 与 `.installed` 推断（`ggml-hip.dll` → rocm；`ggml-vulkan.dll` → vulkan）。
- WebUI「添加自编引擎」填一个构建目录 → 自动识别 backend/device 并写入 `custom_engines`。
- 「引擎下载」里的官方后端由 lemonade 的 backend 机制安装，与本 fork 的 `custom_engines` 并存。

## 相关

- 引擎清单 / 来源 / 下载 / 编译 / 实测 → [../engines/README.md](../engines/README.md)
- 应用打包与 Release 资产 → [packaging.md](packaging.md)
