# Lemonade Multi-Engine Studio

> **Lemonade 的 Windows / AMD 优化版 fork**（中文名：**Lemonade 多引擎工作台**）。
> 保留 lemonade 的全部能力（OpenAI / Anthropic / Ollama 兼容 API、模型下载、多后端），
> 重点解决 **"同一种后端类型只能用一个 llama.cpp 二进制"** 的限制，并配了中英双语 WebUI 与一键启动器。

[English](README_EN.md) · [文档地图](#-文档地图) · [发布下载](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases)

---

## ✨ 四个核心优化

1. **多引擎**：同一后端类型下可注册/运行**任意多个** llama.cpp 编译产物，**按模型选择**，
   全部统一挂在一个 OpenAI 兼容端口下按 model 名路由。
   → [详细说明](docs/studio/differences-from-upstream.md)
2. **WebUI 管理台**（中英双语，默认中文）：多路径模型扫描、每模型引擎/参数/环境变量、
   引擎一键下载、引擎参数一键暴露；聊天页显示**本次 / 会话平均 / 引擎平均**吞吐与草稿采纳率。
   → [详细说明](docs/studio/differences-from-upstream.md)
3. **参数优先级与兼容修复**：手写参数优先、别名自动归并、JSON kwargs 引号保留。
   → [详细说明](docs/studio/differences-from-upstream.md)
4. **一键启动器（Windows）**：单实例，退出时用 Job Object 关闭 `lemond` 与其全部 `llama-server` 子进程。
   → [详细说明](docs/studio/differences-from-upstream.md)

---

## 🚀 快速开始

```powershell
.\scripts\start.ps1              # 或直接双击 LemonadeMultiEngineStudio.exe
```

浏览器打开 `http://localhost:13310/app/`。

**OpenAI 兼容端点**：`http://localhost:13310/v1`，API key `lemonade`（若设置了 `LEMONADE_API_KEY`）。

首次使用（下载引擎、注册引擎、添加模型）→ [快速开始](docs/studio/quick-start.md)

---

## 📚 文档地图

| 我想… | 去看 |
|---|---|
| 上手：启动、下载引擎、注册引擎、加模型 | [docs/studio/quick-start.md](docs/studio/quick-start.md) |
| 了解本 fork 相对上游改了什么 | [docs/studio/differences-from-upstream.md](docs/studio/differences-from-upstream.md) |
| 配置引擎注册表（`custom_engines`）与目录结构 | [docs/studio/engine-registry.md](docs/studio/engine-registry.md) |
| 打包、做安装程序、分发给别人 | [docs/studio/packaging.md](docs/studio/packaging.md) |
| 引擎清单、来源、下载与实测数据 | [docs/engines/README.md](docs/engines/README.md) |
| 引擎编译手册（HIP / Vulkan / ciru / strixllama） | [docs/engines/build/](docs/engines/build/) |
| 基准测试方法 | [docs/engines/benchmark-methodology.md](docs/engines/benchmark-methodology.md) |
| 让 NovaMax 接入这些引擎 | [docs/engines/novamax-llamacpp-skill/SKILL.md](docs/engines/novamax-llamacpp-skill/SKILL.md) |
| 上游 lemonade 文档（CLI / API / 配置 / 集成） | [docs/README.md](docs/README.md) |
| 本 fork 的设计笔记 | [DESIGN.md](DESIGN.md) |

---

## 📦 发布与分发

[Releases](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases) 提供：

- `LemonadeMultiEngineStudio-Setup.exe` —— 安装版（免管理员，`%LOCALAPPDATA%\Programs\…`）
- `LemonadeMultiEngineStudio-portable.zip` —— 便携版
- `engine-<引擎名>_gfx1151_win.zip` —— 单引擎包，解压到 `engines\` 即可被扫描

打包命令与 Release 资产约定 → [打包与分发](docs/studio/packaging.md)

---

## 🙏 致谢

本 fork 基于 [lemonade-sdk/lemonade](https://github.com/lemonade-sdk/lemonade)（MIT）构建。
引擎来自 [ROCmFPX/ROCmFPX](https://github.com/ROCmFPX/ROCmFPX) 及各社区 fork 的本地编译产物；
Strix 系列引擎来自 [rulith-dev/strixllama](https://github.com/rulith-dev/strixllama)（MIT，
基于 [pwilkin/llama.cpp](https://github.com/pwilkin/llama.cpp) 的补丁集）。
感谢 [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) 与 AMD ROCm 社区。
**逐引擎来源、版本与致谢**见 [docs/engines/README.md](docs/engines/README.md)。

## 📄 License

继承 lemonade 的 MIT License（见 [LICENSE](LICENSE)）。
