# engines/

本目录用于存放**预编译的 llama.cpp 引擎**（每个引擎一个子目录，目录内含 `llama-server.exe` 及其依赖 DLL）。

> 目录本身保留在仓库里，但**引擎二进制已被 `.gitignore` 忽略**（体积大，约 1 GB），请勿提交。

## 期望结构

```
engines/
├── roc_official/
│   ├── llama-server.exe
│   ├── ggml-hip.dll / amdhip64_7.dll / ...
│   └── .installed            # 可选：NovaMax 风格的引擎标记
├── vulkan_official/
│   ├── llama-server.exe
│   ├── ggml-vulkan.dll / ggml-rocmfpx-vulkan.dll / rocmfpx-vulkan-plugin.dll
│   └── ...
└── ...
```

## 如何让程序识别

- **自动扫描**：`config/config.json` 的 `llamacpp.engines_dir` 指向本目录（默认 `engines`），启动时会扫描其下每个含 `llama-server.exe` 的子目录。
- **手动登记**：在 WebUI「引擎管理 → 引擎列表 → 添加自编引擎」填入引擎目录路径即可。
- **下载官方引擎**：在 WebUI「引擎管理 → 引擎下载」里一键安装（llama.cpp 的 cpu/rocm/vulkan、flm:npu 等）。

## 本地编译

引擎的编译方法见 `docs/engines/`（含 ROCm/HIP 通用版、ciru-rocmfpx、官方 Vulkan 版等）。
