# Lemonade Multi-Engine Studio（本 fork）

> **Lemonade 的 Windows / AMD 优化版 fork**（中文名：**Lemonade 多引擎工作台**）。
> 在保留 lemonade 全部能力（OpenAI / Anthropic / Ollama 兼容 API、模型下载、多后端）的基础上，
> 重点解决了 **"同一种后端类型只能用一个 llama.cpp 二进制"** 的限制，并配了一套功能更全的
> 中英双语 WebUI 与一键启动器。

## 文档

| 文档 | 内容 |
|---|---|
| [differences-from-upstream.md](differences-from-upstream.md) | 相对 lemonade 原版的优化点，以及与上游的差异对照表 |
| [quick-start.md](quick-start.md) | 快速开始、首次运行、获取并注册引擎、从源码构建 |
| [engine-registry.md](engine-registry.md) | 引擎注册表（`custom_engines` / `engines_dir`）、按模型选引擎、目录结构 |
| [packaging.md](packaging.md) | 打包与分发（应用 zip、单引擎 zip、安装程序） |

## 相关文档

- **引擎清单 / 下载 / 编译方法 / 实测数据** → [../engines/README.md](../engines/README.md)
- **上游 lemonade 文档**（CLI、API、多模型、云卸载、嵌入集成…）→ [../README.md](../README.md)
- **本 fork 的设计笔记** → [DESIGN.md](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/blob/main/DESIGN.md)（仓库根目录）

> 英文版见仓库根目录的 [README_EN.md](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/blob/main/README_EN.md)；本目录的文档目前只有中文。
