# Lemonade Multi-Engine Studio

> **An optimized Windows / AMD fork of Lemonade** (Chinese name: **Lemonade 多引擎工作台**).
> It keeps everything Lemonade offers (OpenAI / Anthropic / Ollama-compatible APIs, model
> downloads, multiple backends) and focuses on removing the
> **"one llama.cpp binary per backend type"** limitation, plus a richer bilingual WebUI and a
> one-click launcher.

---

## ✨ Key improvements over upstream Lemonade

### 1. Multi-engine: register / run several llama.cpp builds under the same backend type

In upstream Lemonade, `config.json`'s `llamacpp.rocm_bin` / `vulkan_bin` are **one global binary
per backend**, so two differently-compiled llama.cpp builds can never coexist under the same
`rocm` (HIP) backend.

This fork adds a **custom engine registry** (`llamacpp.custom_engines`):

```jsonc
"llamacpp": {
  "engines_dir": "…\\engines",              // auto-scanned engine directory
  "custom_engines": {
    "roc_official":  { "path": "…\\roc_official\\llama-server.exe",  "backend": "rocm",   "device": "ROCm0" },
    "rocm_ciru":     { "path": "…\\rocm_ciru\\llama-server.exe",     "backend": "rocm",   "device": "ROCm0" },
    "vulkan_cm1":    { "path": "…\\vulkan_official_cm1\\llama-server.exe", "backend": "vulkan", "device": "Vulkan0",
                       "env": { "GGML_VK_ROCMFP4_COOPMAT": "1" } }
  }
}
```

Each model picks any engine build via `llamacpp_engine`:

```jsonc
// recipe_options.json
"extra.MyModel": { "llamacpp_engine": "roc_official", "llamacpp_args": "-ngl 99 -fa on" }
```

**Result**: on one machine, different models can run on **different llama.cpp builds**
(e.g. `roc_official`, `rocm_ciru`, `vulkan_official`, `vulkan_official_cm1`, …) **simultaneously**,
all exposed behind **a single OpenAI-compatible port** (default `http://localhost:13310/v1`)
and routed by model name.

> Upstream: one backend type = one binary.
> This fork: one backend type = any number of binaries, chosen per model.

### 2. WebUI: a more complete console than upstream (bilingual, Chinese by default)

Left navigation order: **Models → Chat → Engines → Runtime**.

- **Models** (two tabs)
  - **Model list** (default)
    - **Multi-path local scan**: add any number of local folders; models are discovered
      automatically, including the HF cache layout `models--org--repo/snapshots/<commit>/`
      (named by repository).
    - **Per-model config**: pick an **engine build**, configure **dual-mode arguments**
      (raw string / argument builder + one-click "expose all engine params"), set the context size.
    - **Start / Stop / live logs** per row; a failed load opens the log panel automatically.
  - **Download**: search HuggingFace (hf-mirror supported) / ModelScope and pull a model after
    expanding its variants.
- **Chat**
  - Pick a model and test a **streaming** conversation.
  - A **collapsible live log panel** on the right: click "Show logs" to expand, click again to
    hide; the chat area and the log panel stay top/bottom aligned.
- **Engines** (two tabs)
  - **Engine list** (default)
    - **Add custom engine**: point at a self-built llama.cpp folder; rocm / vulkan / cpu is
      detected automatically.
    - Lists registered + auto-discovered engines; custom engines can be removed.
    - **Expose all engine params**: parses the engine's `llama-server --help` into a structured,
      searchable, multi-select parameter table.
  - **Download**: grouped and **collapsed by recipe** (`llamacpp` / `flm` / `whispercpp` /
    `sd-cpp` / `ryzenai-llm` …); expand a group to see its backends and install with one click.
    Backends the machine reports as `unsupported` are hidden.
- **Runtime**: only shows the **OpenAI-compatible endpoint** and the **port of each running model**.
- **i18n**: Chinese / English toggle (Chinese by default).

### 3. Argument precedence & compatibility fixes

- **Hand-written wins**: `hand-written > model defaults > global defaults`. Auto-injected defaults
  (`--spec-type draft-mtp`, `--parallel`) are only added when the user did not specify them.
- **Alias merging**: `--temp`/`--temperature`, `--top_p`/`--top-p`, `-ngl`/`--n-gpu-layers`, … are
  normalized to one key, so a hand-written value overrides the default without duplicate flags.
- **JSON kwargs quotes preserved**: `--chat-template-kwargs {"reasoning_effort":"low"}` keeps its
  inner quotes instead of being stripped as grouping quotes.
- **Context size**: set via `ctx_size` (`/v1/models/<id>/options` or the WebUI) instead of writing
  a duplicate `--ctx-size`.

### 4. One-click launcher (Windows)

- `LemonadeMultiEngineStudio.exe`: icon, **single instance** (repeated clicks do not spawn extra
  tray icons), starts the backend and opens the WebUI.
- **Clean exit**: a Windows Job Object closes `lemond` and **all of its `llama-server` children**,
  leaving no orphan processes.

---

## 📁 Project layout

```
├── CMakeLists.txt / src/ / cmake/ / tools/ / test/ …   # Lemonade source (this fork's server)
├── webui/          # React + TS + Vite frontend (bilingual)
├── engines/        # Prebuilt llama.cpp engines (auto-scanned; binaries are git-ignored)
├── config/         # Runtime config: config.example.json (sample, tracked);
│                   #   config.json / recipe_options.json (machine-local, auto-generated, git-ignored)
├── launcher/       # Launcher source and icon
├── scripts/        # start.ps1 / install.ps1 / build-webui.ps1 / package.ps1 / build-installer.ps1
├── docs/           # Lemonade docs; docs/engines/ holds engine build guides
├── build/          # Build output (build/Release/lemond.exe)
└── LemonadeMultiEngineStudio.exe
```

---

## 📦 Packaging & distribution

```powershell
.\scripts\package.ps1                 # without engines (~4 MB zip)
.\scripts\package.ps1 -WithEngines    # include engines/ (~1.1 GB zip)
```

Outputs: `dist\LemonadeMultiEngineStudio\` (folder) and `dist\LemonadeMultiEngineStudio.zip`.

**Package engines separately** (one zip per engine, for Release distribution):

```powershell
.\scripts\package-engines.ps1                       # all engines under engines/
.\scripts\package-engines.ps1 -Only roc_official    # a single engine
```

Output: `dist\engines\engine-<name>_gfx1151_win.zip`.
**Each archive already contains a top-level `<name>/` folder**, so extracting it into
`engines\` yields `engines\<name>\llama-server.exe` — the layout the engine scanner expects.

**Build a real installer** (requires Inno Setup 6:
`winget install --exact --id JRSoftware.InnoSetup`):

```powershell
.\scripts\build-installer.ps1                 # without engines
.\scripts\build-installer.ps1 -WithEngines    # include engines/
```

Output: `dist\LemonadeMultiEngineStudio-Setup.exe` — a wizard that installs per-user (no admin)
to `%LOCALAPPDATA%\Programs\Lemonade Multi-Engine Studio`. After install:

- **Start Menu** gets an app entry + an uninstaller; **desktop icon** is optional (on by default).
- **Autostart with Windows** is optional (off by default).
- A **uninstall entry** is written to the registry (Settings → Apps).
- **Uninstall** first stops `LemonadeMultiEngineStudio` / `lemond` / `llama-server`, then removes
  files and `data\`.

**Giving it to someone else**: unzip and double-click `LemonadeMultiEngineStudio.exe` — **no source
and no extra runtime needed** (`lemond.exe` is statically linked; third-party deps are bundled).

- Only **Windows x64**; ROCm/HIP engines additionally need the **AMD driver** (engine folders ship
  `amdhip64_7.dll` etc.).
- **Models are not bundled** — download them in "Models → Download".
- Packaging rewrites engine paths in `config.json` to **relative** paths
  (`engines\<name>\llama-server.exe`), so the package is portable; when engines are not bundled the
  entries show as not installed, and the user can add their own under "Engines".
- `config.json` / `recipe_options.json` are **not in the repo** (machine-local, auto-generated).
  Building from a fresh clone? See [First run: fetch and register engines](#-first-run-fetch-and-register-engines).

---

## 🚀 Quick start

**Option 1 — one-click launcher (recommended)**
1. Double-click `LemonadeMultiEngineStudio.exe` (or run `scripts\install.ps1` once to create a
   desktop shortcut).
2. Open `http://localhost:13310/app/` in your browser.

**Option 2 — script**
```powershell
.\scripts\start.ps1            # default port 13310
```

**OpenAI-compatible endpoint**
```
base_url = http://localhost:13310/v1
api_key  = lemonade            # if LEMONADE_API_KEY is set
```

---

## 🧩 First run: fetch and register engines

> This repo does **not** ship `config/config.json` or `config/recipe_options.json` — they are
> **machine-local** and are **auto-generated the first time you save a setting**. A fresh clone
> therefore shows an **empty engine list**; you add your own engines.

1. **Download engines**: grab `engine-*_gfx1151_win.zip` from
   [Releases](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases)
   (e.g. `engine-roc_official_gfx1151_win.zip`) and extract into `engines\`, so the layout is
   `engines\<engine-name>\llama-server.exe`.
2. **Register engines**: launch `LemonadeMultiEngineStudio.exe` → WebUI "Engines → Engine list →
   Add custom engine", point at the folder (e.g. `engines\roc_official`); rocm / vulkan / cpu is
   detected automatically and written to your `config.json`.
   - Or hand-write `config/config.json` following `config/config.example.json` (a **format sample —
     replace it with your own engines**).
3. **Add models**: use "Models → Local paths" (supports the HF cache layout
   `models--org--repo/snapshots/<commit>/`) or download them from "Models → Download".
4. **Pick an engine per model**: in the model row's config, choose the engine build and arguments —
   saved to your local `recipe_options.json`.

---

## 🔨 Build from source

```powershell
# 1) Configure (first run downloads dependencies)
cmake --preset vs18 -DBUILD_WEB_APP=OFF

# 2) Build the server
cmake --build build --config Release --target lemond

# 3) Build the frontend and stage it into lemond's resources/web-app (served at /app)
.\scripts\build-webui.ps1
```

> Windows build notes: libwebsockets' `-Werror` must be disabled under MSVC; inject
> `CL=/utf-8 /WX-` and use `-DDISABLE_WERROR=ON` and
> `-DCMAKE_DISABLE_FIND_PACKAGE_nlohmann_json=ON` to avoid picking up an incompatible
> nlohmann_json from ROCm/conda.

---

## 🆚 Differences vs upstream Lemonade

| Capability | Upstream Lemonade | This fork |
|---|---|---|
| Multiple builds under one backend type | ❌ one binary per backend | ✅ `custom_engines` + per-model `llamacpp_engine` |
| Many engines behind one OpenAI port | ❌ | ✅ |
| Engine download | ✅ (CLI/desktop) | ✅ + one-click in the WebUI |
| Add a custom engine | edit config by hand | ✅ WebUI: point at a folder |
| Expose all engine params | ❌ | ✅ (parses `--help`) |
| Local model path scanning | single `extra_models_dir` | ✅ multiple paths + HF-cache naming |
| Model download sources | HF / ModelScope | ✅ + hf-mirror |
| Per-model engine / dual-mode args / start-stop / logs | partial | ✅ full WebUI |
| Argument alias merging / JSON kwargs | ❌ | ✅ |
| One-click launcher + exit cleanup | desktop app | ✅ single instance + Job Object cleanup |
| Bilingual WebUI | partial | ✅ Chinese by default |

---

## 🙏 Credits

This fork is built on [lemonade-sdk/lemonade](https://github.com/lemonade-sdk/lemonade) (MIT).
The engines come from [ROCmFPX/ROCmFPX](https://github.com/ROCmFPX/ROCmFPX) and community forks,
built locally. Thanks to [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) and the AMD
ROCm community.

**The Strix engines** (`roc_strixllama` / `roc_strixllama_env`, see
`llamacpp-win-gfx1151-integration`) come from
[rulith-dev/strixllama](https://github.com/rulith-dev/strixllama) (MIT): a ~30-file patch set on top
of [pwilkin/llama.cpp](https://github.com/pwilkin/llama.cpp) (MIT, pinned at `f5daaa3`), covering
Qwen3.8-Flash-Next (qwen4exp) QSA sparse attention (decode gather, block-key cache),
IQ3_S/IQ4_XS matrix-core kernels, MTP speculation tuning and shape-keyed HIP graphs. This fork
builds both engines from it, and injects compile-time default environment variables into
`roc_strixllama_env` (the gate set, still overridable at runtime). Thanks to rulith-dev and pwilkin.

## 📄 License

Inherits Lemonade's MIT License (see `LICENSE`).
