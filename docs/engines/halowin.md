# HaloWin 引擎（gfx1151-engine）

HaloWin 是 [gfx1151-engine](https://github.com/IIIIIllllIIIIIlllll/gfx1151-engine) 的接入层：一个面向
**AMD Strix Halo（gfx1151）** 的大 MoE 本地推理引擎，目标模型是 **Qwen3.8-Flash-Next（qwen4exp 架构）**
及同结构微调。

它**不是独立配方（recipe）**，而是 `llamacpp` 配方下的一个引擎驱动（`driver: "halowin"`）——和 gufo 一样，
同一个 GGUF 模型条目可以在 `llama.cpp / gufo / halowin` 之间切换。

引擎本体是两个进程（v0.0.7 起上游把 `gdec` 改名为 `qwenox`，v0.0.9 起发行资产改名为
`qwenox-<version>-win64.zip`）：

- `qwenox-engine-win.exe` —— 引擎，权重常驻内存、GPU kernel 直读；
- `qwenox-win.exe` —— OpenAI 兼容 HTTP 前端（GUI 程序；本后端用 `--console` + 管道输出无窗口运行），
  Lemonade 只与它通信。

Lemonade 负责拉起两者、探活、按模型路由与清理（数据流：`lemond → API:8001 → engine:8002`）。

## 环境要求

- **Windows + gfx1151**（Radeon 8060S / Strix Halo）；Linux 需自行编译，本项目只发 Windows 版。
- **可用内存 ≥ 100 GiB**（68 GiB 权重锁页 + KV），需要足够大的显存划分（BIOS）。
- 已安装 AMD 显卡驱动。引擎发行版**自带 HIP/ROCm 运行环境**，无需另装 ROCm。

## 安装

由于 recipe 已移除，引擎不再由 `lemonade backends install` 自动下载，需要手工放置并注册：

1. **拿到引擎**（二选一）
   - **自编译**：`gfx1151-engine` 仓库编出的 `build\` 目录（含 `qwenox-engine-win.exe` / `qwenox-win.exe`
     与运行库 DLL）；
   - **上游发行**：GitHub Release 的 `qwenox-<version>-win64.zip`，解压到任意目录
     （例如 `<cache>\bin\halowin\win\`）。
2. **注册到 `config.json`**（`path` 指向 **API 前端** `qwenox-win.exe`；`qwenox-engine-win.exe`
   必须与它同目录）：

```jsonc
"llamacpp": {
  "custom_engines": {
    "halowin": {
      "path": "C:\\xiangmu\\lemonade\\gfx1151-engine\\build\\qwenox-win.exe",
      "backend": "rocm",
      "driver": "halowin"
    }
  }
}
```

重启后模型配置的"引擎"下拉里即可选到 `halowin`。

## 模型权重（两种格式）

两种权重都通过**模型条目显式登记**（没有目录自动发现）：

| 格式 | 检查点 | 说明 |
|---|---|---|
| `.hgn` 包 | `main` / `ngram` / `mtp` / `vision` / `tokenizer` | hgn v2 把 PLE n-gram 表拆成独立文件；`main → overlay → ngram → mtp` 按启动器顺序作为位置参数传给引擎 |
| GGUF | `main` / `draft`（或 `mtp`）/ `mmproj`（或 `vision`）/ `tokenizer` | 与 llama.cpp / gufo 共用同一批文件 |

`tokenizer` 必须是**目录**，里面要有 `tokenizer.json`；未显式给时会从权重目录向上找 3 层的
`<目录>/tokenizer/tokenizer.json`。

`.hgn` 权重用引擎自带的 `tools/flashnext2hgn.py` 从 HF safetensors 转换。

一个 hgn 条目的例子（`user_models.json`）：

```json
"Qwen3.8-Flash-Next-GDEC-v2-HaloWin": {
  "checkpoints": {
    "main":      "…\\Qwen3.8-Flash-Next-GDEC-v2\\qwen38-flash-next-v2.hgn",
    "ngram":     "…\\Qwen3.8-Flash-Next-GDEC-v2\\qwen38-flash-next-ngram.hgn",
    "mtp":       "…\\Qwen3.8-Flash-Next-GDEC-v2\\qwen38-flash-next-mtp.hgn",
    "vision":    "…\\Qwen3.8-Flash-Next-GDEC-v2\\qwen38-flash-next-vision.hgn",
    "tokenizer": "…\\Qwen3.8-Flash-Next-GDEC-v2\\tokenizer"
  },
  "labels": ["chat", "reasoning", "vision", "mtp"],
  "recipe": "llamacpp",
  "recipe_options": {
    "ctx_size": 393216,
    "llamacpp_engine": "halowin",
    "halowin_parallel": "2",
    "halowin_prefill_chunk": "4096"
  },
  "size": 112.1,
  "source": "local_path"
}
```

GGUF 条目沿用 llama.cpp 的检查点名即可（`main` / `draft` / `mmproj`），驱动会做别名，另需补
`tokenizer`（GGUF 仓库不含它，从原模型仓库如 `unsloth/Qwen3.8-Flash-Next` 取 `tokenizer.json`）。

**Windows 量化选择**：上游文档对 Windows 推荐 `UD-IQ4_XS`（3 分片，约 87 GiB）；本机实测
`UD-Q4_K_XL`（4 分片，103.7 GiB）也能跑。

## 参数（per-model）

都在模型配置的参数框里（驱动为 halowin 时参数框映射到 `halowin_engine_args`）：

| 键 | 默认 | 说明 |
|---|---|---|
| `halowin_engine_args` | `""` | 追加给 `qwenox-engine` 的参数 |
| `halowin_args` | `""` | 追加给 `qwenox-win`（API 前端）的参数 |
| `halowin_prefill_chunk` | `""` | prefill 分段（token）→ `QWENOX_PREFILL_CHUNK`；Windows 设 `4096` 可省约 3.5 GiB 显存（PP 约慢 2%），留空用引擎默认 |
| `halowin_moe_a4` | `""`（=3） | prefill 4-bit MoE 激活 → `QWENOX_MOE_A4`；`3` = gate/up + down 全开，`0` = 关闭。只影响 prefill（decode 不变），精度代价 prompt KLD +0.015~0.035 |
| `halowin_mtp_gamma` | `""` | MTP 草拟长度 1–8 → `QWENOX_SPEC_GAMMA`；**留空 = 上游默认 auto**（greedy 4、采样 3–7） |
| `halowin_parallel` | `""` | 并发槽位 1–8 → `QWENOX_PARALLEL`；留空/`1` = 单路，每多一路约 +0.12 GiB |
| `ctx_size` | — | → `--maxctx`（上下文），引擎按此预留会话状态 |

## 使用

```powershell
# 引擎在模型配置里选 halowin 后：
lemonade load <模型名>
curl -X POST http://localhost:13305/v1/chat/completions -H "Content-Type: application/json" `
  -d "{\"model\":\"<模型名>\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"
```

## 实测（Windows / gfx1151 / 55W 功耗墙）

| 场景 | 结果 |
|---|---|
| GGUF（UD-Q4_K_XL，`ctx 32768`，发布版引擎） | 加载 25–29 s；对话 38.2 tok/s（MTP 44 提议/26 接受）；流式 36 chunk |
| GGUF（同上，自编译引擎） | 加载 28.8 s；36.7 tok/s —— 双进程均来自 `gfx1151-engine\build` |
| hgn（GDEC-v2，`ctx 32768`） | 加载 16.6 s；engine 位置参数（main/ngram/mtp）+ `--vision-tower` 均正确 |
| 卸载 | 双进程均退出，无残留 |
| 同一模型条目切回 gufo | 36.7 tok/s，无回归 |

## 已知限制

- **batch-1**：引擎单槽串行（`halowin_parallel` 可开多槽），忙时前端返回 503。
- **视觉**只接受 base64 图片，不支持 `http(s)` 图片 URL。
- **冷加载分钟级**（68 GiB 权重读盘），加载期间端口就绪但生成不可用。
- **内存占用极高**，与其它 GPU 模型基本无法共存；`SlotPolicy` 为 `Standard`，不会主动驱逐其它 GPU
  模型，请先 `unload`。
- 引擎许可为 **AGPL-3.0**；本项目**不下载、不分发**该二进制，需要用户自行编译或从上游获取。
