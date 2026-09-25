# Lemonade Multi-Engine Studio

> **An optimized Windows / AMD fork of Lemonade** (Chinese name: **Lemonade 多引擎工作台**).
> It keeps everything Lemonade offers (OpenAI / Anthropic / Ollama-compatible APIs, model
> downloads, multiple backends) and removes the **"one llama.cpp binary per backend type"**
> limitation, with a richer bilingual WebUI and a one-click launcher.

[中文](README.md) · [Docs map](#-documentation-map) · [Releases](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases)

---

## ✨ Four core improvements

1. **Multi-engine**: register and run **any number** of llama.cpp builds under the same backend
   type, **chosen per model**, all served behind one OpenAI-compatible port and routed by model
   name. → [Details](docs/studio/differences-from-upstream.md)
2. **WebUI console** (bilingual, Chinese by default): multi-path model scanning, per-model
   engine / arguments / environment, one-click engine downloads, one-click "expose all engine
   params"; the chat page shows **latest / session-average / engine-average** throughput and
   draft acceptance. → [Details](docs/studio/differences-from-upstream.md)
3. **Argument precedence & compatibility fixes**: hand-written wins, alias merging, JSON kwargs
   quotes preserved. → [Details](docs/studio/differences-from-upstream.md)
4. **One-click launcher (Windows)**: single instance; on exit a Job Object closes `lemond` and all
   of its `llama-server` children. → [Details](docs/studio/differences-from-upstream.md)

---

## 🚀 Quick start

```powershell
.\scripts\start.ps1              # or just double-click LemonadeMultiEngineStudio.exe
```

Open `http://localhost:13310/app/`.

**OpenAI-compatible endpoint**: `http://localhost:13310/v1`, API key `lemonade`
(if `LEMONADE_API_KEY` is set).

First run (download engines, register engines, add models) → [Quick start](docs/studio/quick-start.md)

---

## 📚 Documentation map

| I want to… | Read |
|---|---|
| Get started: launch, download engines, register them, add models | [docs/studio/quick-start.md](docs/studio/quick-start.md) |
| See what this fork changes vs upstream | [docs/studio/differences-from-upstream.md](docs/studio/differences-from-upstream.md) |
| Configure the engine registry (`custom_engines`) and layout | [docs/studio/engine-registry.md](docs/studio/engine-registry.md) |
| Package, build an installer, hand it to someone | [docs/studio/packaging.md](docs/studio/packaging.md) |
| Engine inventory, sources, downloads, measurements | [docs/engines/README.md](docs/engines/README.md) |
| Engine build guides (HIP / Vulkan / ciru / strixllama) | [docs/engines/build/](docs/engines/build/) |
| Benchmark methodology | [docs/engines/benchmark-methodology.md](docs/engines/benchmark-methodology.md) |
| Use these engines from NovaMax | [docs/engines/novamax-llamacpp-skill/SKILL.md](docs/engines/novamax-llamacpp-skill/SKILL.md) |
| Upstream Lemonade docs (CLI / API / config / integrations) | [docs/README.md](docs/README.md) |
| Design notes for this fork | [DESIGN.md](DESIGN.md) |

---

## 📦 Releases & distribution

[Releases](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases) ship:

- `LemonadeMultiEngineStudio-Setup.exe` — installer (no admin, installs to `%LOCALAPPDATA%\Programs\…`)
- `LemonadeMultiEngineStudio-portable.zip` — portable build
- `engine-<name>_gfx1151_win.zip` — one zip per engine; extract into `engines\` and it is scanned

Packaging commands and the release asset convention → [Packaging](docs/studio/packaging.md)

---

## 🙏 Credits

This fork is built on [lemonade-sdk/lemonade](https://github.com/lemonade-sdk/lemonade) (MIT).
The engines come from [ROCmFPX/ROCmFPX](https://github.com/ROCmFPX/ROCmFPX) and community forks,
built locally. The Strix engines come from
[rulith-dev/strixllama](https://github.com/rulith-dev/strixllama) (MIT), a patch set on top of
[pwilkin/llama.cpp](https://github.com/pwilkin/llama.cpp). Thanks to
[ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) and the AMD ROCm community.
**Per-engine sources, versions and credits** are in [docs/engines/README.md](docs/engines/README.md).

## 📄 License

Inherits Lemonade's MIT License (see [LICENSE](LICENSE)).
