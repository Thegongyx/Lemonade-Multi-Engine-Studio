# HaloWin 后端（gfx1151-engine）

`halowin` 是 Lemonade 多引擎工作台的一个正式后端，包装
[gfx1151-engine](https://github.com/IIIIIllllIIIIIlllll/gfx1151-engine)：
一个面向 **AMD Strix Halo（gfx1151）** 的大 MoE 本地推理引擎。
目标模型是 **Qwen3.8-Flash-Next（qwen4exp 架构）** 及同结构微调。

引擎本体是两个进程（**v0.0.7 起上游把 `gdec` 改名为 `qwenox`，v0.0.8 项目统一改名 Qwenox**；v0.0.9 起发行资产改名为 `qwenox-<version>-win64.zip`）：

- `qwenox-engine-win.exe` —— 引擎，权重按 4-bit 存放于内存、GPU kernel 直读；
- `qwenox-win.exe` —— OpenAI 兼容 HTTP 前端（GUI 程序；Lemonade 以 `--console` + 管道输出无窗口运行），Lemonade 只与它通信。

Lemonade 负责拉起两者、探活、按模型路由与清理。

## 环境要求

- **Windows + gfx1151**（Radeon 8060S / Strix Halo）；Linux 需要自行编译，当前后端只发布 Windows 版。
- **可用内存 ≥ 100 GiB**（68 GiB 权重锁页 + KV），需要足够大显存（BIOS 划分）。
- 已安装 AMD 显卡驱动。发行版**自带 HIP/ROCm 运行环境**，无需另装 ROCm。

## 安装

**WebUI**：引擎管理 → 引擎下载 → 展开 `halowin` → 安装。

**CLI**：

```powershell
lemonade backends install halowin:win
```

默认从 GitHub Release `v0.0.9` 下载 `qwenox-0.0.9-win64.zip`（解压得到顶层 `qwenox\` 目录），解压到
`<cache>\bin\halowin\win\`。自编译引擎可改为在 `config.json` 里指定目录：

```jsonc
"halowin": {
  "halowin_bin_dir": "…\\gfx1151-engine\\build"   // 含 qwenox-engine-win.exe / qwenox-win.exe
}
```

## 模型目录

HaloWin 有两种权重：**`.hgn` 包**（本节）或**纯 GGUF**（下一节）。`halowin` 配方的默认发现只扫
`.hgn` 目录；GGUF 走 `llamacpp` 配方里的 `halowin` 驱动。`.hgn` 权重默认扫描
`<models_dir>\halowin\`（可用 `halowin.halowin_models_dir` 改），每个子目录为一个模型：

```text
<models_dir>\halowin\Qwen3.8-Flash-Next\
├── qwen38-flash-next-v2.hgn           # 必需（main）
├── qwen38-flash-next-ngram.hgn        # v2 必需：独立 PLE n-gram 表
├── qwen38-flash-next-mtp.hgn          # 可选（MTP 投机草稿）
├── qwen38-flash-next-vision.hgn       # 可选（视觉）
├── qwen38-flash-next-w4b.overlay.hgn  # 可选（仅 v1；v2 会整体跳过）
└── tokenizer\tokenizer.json           # 必需
```

文件名按后缀自动归位（`*ngram*` / `*vision*` / `*overlay*` / `*mtp*`，其余视为 main），
目录名即模型名（后缀 `-HaloWin`）。服务启动时会自动发现，出现在 `/v1/models` 与 WebUI 模型列表里。
**hgn v2** 把 PLE n-gram 表拆成独立文件，引擎按张量类型自动识别 v1/v2；后端会把
`main → overlay → ngram → mtp` 按启动器顺序作为位置参数传给 `qwenox-engine`。权重用引擎自带的
`tools/flashnext2hgn.py` 从 HF safetensors 转换。

> **模型参数设置里的引擎**：`/api/v1/engines` 现在会列出**所有已安装引擎/后端**（含
> `halowin`，`recipe: "halowin"`）。模型配置弹窗按模型的 recipe 过滤：与当前模型不匹配的
> 引擎会置灰，halowin 模型会自动选中 `HaloWin`。

## GGUF 权重（llamacpp 驱动）

引擎 G3.3 起可直接加载**纯 GGUF**（与 llama.cpp / gufo 用同一批文件），不再需要 `.hgn`。
LMES 把它接成 `llamacpp` 配方里的一个**引擎驱动**：模型条目保持 `recipe: "llamacpp"`，在"引擎"下拉里
选 `halowin_gfx1151` 即可 —— 和在 gufo / llama.cpp 之间切换是同一个动作，不需要为它单独建模型条目。

**注册引擎**（`config.json`；`path` 指向 OpenAI 前端，引擎可执行文件与它同目录）：

```jsonc
"llamacpp": {
  "custom_engines": {
    "halowin_gfx1151": {
      "path": "…\\data\\cache\\bin\\halowin\\win\\qwenox-win.exe",
      "backend": "rocm",
      "driver": "halowin"
    }
  }
}
```

> 引擎 id 用 `halowin_gfx1151` 而不是 `halowin`：`/engines` 里已经有一个配方级 `halowin`，同名会撞。

模型侧需要的文件（检查点名与 llama.cpp 通用，驱动会做别名）：

| 用途 | llama.cpp 检查点 | 也接受 | 说明 |
|---|---|---|---|
| 权重 | `main` | — | GGUF **第 1 个分片**，其余分片必须同目录 |
| MTP 草稿 | `draft` | `mtp` | `mtp-…-shared-Q8_0.gguf`；留空 = 不投机 |
| 视觉 | `mmproj` | `vision` | 引擎要求 **BF16** |
| 分词器 | `tokenizer`（目录） | — | **必需**；未显式给时自动向上 3 层找 `<目录>/tokenizer/tokenizer.json` |

`tokenizer/tokenizer.json` 不在 GGUF 仓库里，需从原模型仓库（如 `unsloth/Qwen3.8-Flash-Next`）补一份放到权重目录旁。

**Windows 量化选择**：上游文档对 Windows 推荐 `UD-IQ4_XS`（3 分片，约 87 GiB）；本机实测
`UD-Q4_K_XL`（4 分片，103.7 GiB）也能跑。

**驱动参数**（模型配置 → 参数框；此驱动下参数框映射到 `halowin_engine_args`）：
`halowin_engine_args` / `halowin_args` / `halowin_parallel` / `halowin_prefill_chunk` / `halowin_mtp_gamma` / `halowin_moe_a4`，
语义见下面"配置项"表。

**本机实测**（Flash-Next UD-Q4_K_XL，`ctx 32768`，Windows / gfx1151 / 55W 功耗墙）：

| 项 | 结果 |
|---|---|
| 加载 | 25–29 s；双进程 `qwenox-engine-win.exe`（约 32 GB 驻留）+ `qwenox-win.exe` |
| 对话 | 38.2 tok/s（MTP 44 提议 / 26 接受）；流式 36 chunk 正常 |
| 卸载 | 双进程均清理干净，无残留 |
| 同一模型条目切回 gufo | 36.7 tok/s，无回归 |

## 使用

```powershell
lemonade load Qwen3.8-Flash-Next-HaloWin
curl -X POST http://localhost:13305/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"Qwen3.8-Flash-Next-HaloWin\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"
```

## 配置项

| 键 | 默认 | 说明 |
|---|---|---|
| `halowin_bin_dir` | `""` | 引擎可执行文件所在目录（自编译时用） |
| `halowin_models_dir` | `""`（= `<models_dir>\halowin`） | 扫描 `.hgn` 模型的目录 |
| `halowin_args` | `""` | 追加给 `qwenox-win`（API 前端）的参数 |
| `halowin_engine_args` | `""` | 追加给 `qwenox-engine` 的参数 |
| `halowin_prefill_chunk` | `""` | prefill 分段（token），透传为引擎环境变量 `QWENOX_PREFILL_CHUNK`；Windows 设 `4096` 可省约 3.5 GiB 显存（PP 约慢 2%），留空则用引擎默认 6144 |
| `halowin_moe_a4` | `3` | prefill 4-bit MoE 激活（W4A4 iu4），透传为 `QWENOX_MOE_A4`（上游发行 `service.conf` 的默认也是 3）。`3` = gate/up + down 全开，`0` = 关闭。只对 hgn v2 4-bit 权重生效，只影响 prefill（decode 不变）；精度代价为 prompt KLD +0.015~0.035 |
| `halowin_mtp_gamma` | `""` | MTP 投机草拟长度 1–8，透传为 `QWENOX_SPEC_GAMMA`；**留空 = 上游默认（auto）**：greedy 用 4、采样自适应 3–7 |
| `halowin_parallel` | `""` | 并发槽位 1–8，透传为 `QWENOX_PARALLEL`；留空/`1` = 单路。槽位共享分页 KV 池（默认共 256K），每多一路约多占 0.12 GiB 显存 |
| `win_bin` | `"builtin"` | 标准二进制覆盖钩子（`LEMONADE_HALOWIN_WIN_BIN`） |

## 已知限制

- **batch-1**：引擎单槽串行，忙时前端返回 503。
- **视觉**只接受 base64 图片，不支持 `http(s)` 图片 URL。
- **冷加载分钟级**（68 GiB 权重读盘），加载期间端口就绪但生成不可用。
- **内存占用极高**，与其它 GPU 模型基本无法共存；`SlotPolicy` 为 `Standard`，不会主动驱逐
  其它 GPU 模型，请自行先 `unload`。
- 引擎许可为 **AGPL-3.0**：本项目仅在运行时从上游 Release 下载、不 redistribut 该二进制。
