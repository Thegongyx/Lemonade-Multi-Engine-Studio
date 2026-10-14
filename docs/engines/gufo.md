# Gufo 引擎（以 llama.cpp recipe 的"引擎驱动"接入）

`gufo` 是 [pixmaate/gufo](https://github.com/pixmaate/gufo)：面向 **AMD Strix Halo（gfx1151）**
的垂直本地推理引擎，单个可执行文件、自带 OpenAI 兼容 HTTP 服务。目标模型是
**Qwen3.8-Flash-Next（qwen4exp）**、**Qwen3.8-27B（qwen35）**、**Qwen3.6-35B-A3B（qwen35moe）**、
DeepSeek V4 Flash（deepseek4）及同架构微调。

> **它不是独立 recipe。** gufo 跑的就是 **GGUF**，与 llama.cpp 系共用"模型"这一个实体，所以它
> 以 **llamacpp recipe 内的一种引擎驱动（driver）** 接入：模型条目仍是 `recipe: "llamacpp"`，
> 只是在模型配置里把**引擎**选成 `gufo`。这样"换引擎"就是你已经熟悉的那个下拉框 —— 结果：

- 同一个模型条目可以在 `gufo` 与 `roc_official` / `vulkan_official` / `roc_strixllama` … 之间切换；
- 检查点解析、下载、别名、路由策略、尺寸过滤全部复用 llamacpp 的实现；
- llama.cpp 路径零改动（`driver` 只对"具名引擎"生效，默认 `llamacpp`）。

设计与实现细节见 [engine-switching.md](engine-switching.md)。

## 环境要求

- **Windows + gfx1151**（Radeon 8060S / Strix Halo）。发行版自带 TheRock ROCm 运行时
  （`bin\` 内有 ROCm kernel 库、vcpkg 依赖与 MSVC/OpenMP 运行库），**无需另装 ROCm**。
- 已安装 AMD 显卡驱动；建议在 AMD Software 里把专用显存划到 **96 GB**（Flash-Next 需要；
  27B / 35B-A3B 48–64 GB 够用）。
- 内存：Flash-Next（UD-Q4_K_XL）全量常驻约 104 GiB，机器需要 128 GB 统一内存。

## 安装引擎

上游按日期发布 Windows 预编译包（`gufo-windows-<日期>.zip`，解压后是
`gufo-windows-<日期>\bin\gufo.exe` + DLL）。把它放到任意稳定目录，然后**在
`config.json` 里注册为具名引擎**（`driver` 字段是关键）：

```jsonc
// <配置目录>\config.json
"llamacpp": {
  "custom_engines": {
    "gufo": {
      "path": "…\\gufo-windows-2026-10-03\\bin\\gufo.exe",
      "backend": "rocm",              // 仅用于设备/GPU 判定
      "device": "",
      "driver": "gufo",               // ← 交给 gufo 驱动，而不是 llama-server
      "architectures": ["qwen4exp", "qwen35", "qwen35moe", "deepseek4"],
      "tensor_types": ["F32","F16","BF16","Q8_0","Q6_K","Q4_K","Q5_K","Q5_1",
                       "IQ3_S","IQ4_XS","IQ4_NL"]
    }
  }
}
```

- `architectures` / `tensor_types` 是**可选的能力清单**：里边的条目是这个引擎**能加载**的
  架构与张量类型；留空则不做预检。预检只读 GGUF 头部（毫秒级、不读权重），命中不了的类型会
  **在启动引擎之前**给出明确错误，例如：
  `Engine 'gufo' does not support the quantization of model '…' (unsupported tensor types: IQ2_S, IQ3_XXS, ggml_type_42; supported: …)`。
  实测的架构名：Flash-Next=`qwen4exp`、27B=`qwen35`、35B-A3B=`qwen35moe`。
- 注册后 `GET /api/v1/engines` 会列出它（带 `"driver": "gufo"` 与能力清单），模型配置弹窗里
  与其它引擎并列出现（显示为 `gufo (rocm, gufo)`）。
- ⚠️ WebUI 的"添加自编引擎"目前只认目录里的 `llama-server.exe`，**gufo 引擎请按上面的 JSON 注册**
  （见 engine-switching.md 的遗留清单）。

## 选择引擎（按模型）

模型条目保持 `recipe: "llamacpp"`，为该模型选择引擎即可：

```powershell
# 记进该模型的 recipe_options（UI 里就是"引擎"下拉框；切换后重载生效）
curl -X POST http://localhost:1310/api/v1/models/<模型名>/options -H "Content-Type: application/json" `
     -d '{"llamacpp_engine":"gufo","ctx_size":32768}'
```

`ctx_size` → `gufo --context`（留 `-1`/auto 表示用模型原生上下文）。切换引擎 = 卸载 + 重载。

### 驱动自有参数

选中 gufo 引擎时，模型配置弹窗的参数框会自动切到这两个命名空间（弹窗按驱动取键）：

| 键 | 说明 |
|---|---|
| `gufo_args` | 追加到 `gufo serve` 命令行末尾（如 `--mtp-policy survival --prompt-lookup --cache-disk <目录>`）；**不允许**出现 `-m/--model`、`-i/--host`、`-p/--port`、`--served-model-name`、`--api-key`、`-c/--context`、`-j/--sessions`（会直接报错） |
| `gufo_think` | 思考默认值 `on`/`off`/`auto`（`--think`），留空 = 模板默认 |
| `gufo_sessions` | 预分配 GPU 会话数 1–8（`--sessions`），留空 = 1 |
| `llamacpp_env` | 通用环境变量框（KEY=VALUE 逐行），对 gufo 引擎同样生效 |

### 默认参数（对齐上游推荐）

`server_models.json` 里每个 gufo 模型的默认值取自上游 `docs/models/<模型>/README.md` 的启动命令：

| 模型 | `ctx_size` | `gufo_sessions` | 其它 |
|---|---|---|---|
| `Qwen3.8-Flash-Next-Gufo` | 32768 | 2 | MTP + `shared-Q8_0` 侧车（标签自动拼） |
| `Qwen3.8-27B-Gufo` | 32768 | 2 | DFlash2 + 侧车（标签自动拼） |
| `Qwen3.6-35B-A3B-Gufo` | 131072 | 1 | `gufo_think=on`；`--temperature 1.0 --top-p 0.95 --top-k 20 --draft-tokens 6` |

上游 Flash-Next README 的推荐命令行里还带三个 **opt-in** 的 MTP 开关（`--mtp-draft-vocab latin`、
`--mtp-policy survival`、`--prompt-lookup`），**本仓库默认不开**：在 gfx1151 + Windows 构建 + 55W 限功下实测为负优化
（同机同模型、`sessions 2` 固定、四组提示词平均 tok/s：全关 34.1 / `latin`+`lookup` 28.9 / 仅 `latin` 26.2 / 全开 26.2）。
主因是 `latin` 拉低草稿接受率（日志题 82%→68%）、`survival` 让草稿更激进（同题提议 128 vs 49 个 token），
限功下多做草稿验证是净亏。需要复现上游数字时显式打开：

```powershell
curl -X POST http://localhost:1310/api/v1/models/<模型名>/options -H "Content-Type: application/json" `
     -d '{"gufo_args":"--mtp-draft-vocab latin --mtp-policy survival --prompt-lookup"}'
```

## 模型与侧车

适配的模型（`server_models.json` 里已注册，默认引擎就是 `gufo`）与官方合格文件：

| 模型条目 | 文件 | 规格 |
|---|---|---|
| `Qwen3.8-Flash-Next-Gufo` | `unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL` + `MTP/mtp-Qwen3.8-Flash-Next-shared-Q8_0.gguf` + `mmproj-BF16.gguf` | ~104 GiB，MTP 投机 + 视觉 |
| `Qwen3.8-27B-Gufo` | `unsloth/Qwen3.8-27B-GGUF:Qwen3.8-27B-UD-Q4_K_XL.gguf` + `z-lab/Qwen3.8-27B-DFlash2-GGUF:Qwen3.8-27B-DFlash2-Q4_K_M.gguf` + `unsloth/Qwen3.8-27B-GGUF:mmproj-BF16.gguf` | ~18 GiB，DFlash2 投机 + 视觉 |
| `Qwen3.6-35B-A3B-Gufo` | `unsloth/Qwen3.6-35B-A3B-MTP-GGUF:Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf` | ~36 GiB，MTP 内嵌（无需外部草稿） |

- 侧车由**标签**驱动：`dflash` → `--speculative dflash2 --dflash-model`；`mtp` + 有草稿 →
  `--speculative mtp --mtp-model`；`mtp` + **无草稿** → `--speculative mtp`（用 GGUF 内嵌 MTP 块，如 A3B）；
  `dspark` → `--speculative dspark --dspark-model`。都没有则按自回归运行并打警告。
- 自定义/本地 GGUF：按 `user.*` 注册（`recipe: llamacpp`），再给该模型选 `gufo` 引擎。

## 量化能力的硬边界（重要）

gufo 的 kernel 是**编译进去**的，且它对每个张量做**逐张量类型白名单**校验；不匹配时
`Binder` 直接 `Fail("tensor <名字> has unsupported format <类型>")` 并放弃加载：

| 张量族 | 允许的类型 |
|---|---|
| 层内 dense（`attn_q/k/v/output`、`attn_qkv`、`ssm_out`、`indexer.*`、`ple_*`、`*_shexp`、HC mixer、MTP 块同用） | `Q8_0`、`BF16`、`F16`、`F32` |
| MoE 专家 `ffn_{gate,up,down}_exps` | `Q4_K`、`Q5_K`、`Q6_K`、`Q5_1`、`Q8_0`、`IQ3_S`、`IQ4_XS`、`IQ4_NL` |
| 顶层 `token_embd` / `output` | `Q8_0`、`Q6_K`、`BF16`、`F16`、`F32` |
| PLE n-gram 表 `per_layer_token_embd` | `IQ4_NL`、`BF16` |
| 视觉投影器（mmproj）的 110 个矩阵张量 | **仅 `BF16`** |

由此三条结论：

- **逐张量非均匀量化（如 ISTA-DASLab 的 GSQ-RCO 系列）在 gufo 上加载不了**：实测它的 `IQ3_S`
  首片里有 299 个 dense 张量是 `Q4_K/Q5_K/Q6_K/IQ4_NL/IQ4_XS`、83 个专家张量是
  `IQ3_XXS/IQ2_S/Q2_0`——都在白名单外。这类模型请用 llama.cpp 系引擎。
- **ROCmFP4 / ROCMI4 / ROCmFPX 等 fork 量化同样不行**（类型 id 不在表内，预检会报 `ggml_type_108` 之类）。
- **侧车也必须合格**：MTP 草稿要选 attn/HC 张量为 `Q8_0/BF16/F16/F32` 的那份（Flash-Next 用
  `…-shared-Q8_0.gguf`；`*-Q4_K_M*`、`*-head-iq4_xs.gguf` 会**导致整个加载失败**）；视觉侧车必须是
  `mmproj-BF16.gguf`（工具链产出的 `mmproj-F16.gguf` 会报 `invalid BF16 Qwen vision tensor`）。

预检（`architectures`/`tensor_types`）是"类型并集"级别：它能挡住上面这些大类，但不做逐张量族的
精确判定；预检通过后仍有极少数组合会在引擎侧报错（错误信息同样明确）。

## 一个文件布局的坑

`unsloth` 的 **UD-Q4_K_XL / UD-IQ4_XS 分片发布，首片是"0 张量、只带元数据"**的。gufo 能加载
（它自己合并分片），但 **llama.cpp 不能**（`tensor 'token_embd.weight' not found`）。所以这些
条目虽然技术上可以切到 llama.cpp 引擎，实际只应选 gufo；"同一份文件两引擎都能跑"在别的仓库
（单文件或首片带张量的发布）上才成立。

顺带一个发现列表的细节：LMES 的"额外模型扫描"会**无条件扫描 HF 缓存**，而
`models--<org>--<repo>/UD-Q4_K_XL/` 这类**变体目录**以前会被当成一个独立模型登记 —— 于是同一批
分片会出现两条（一条是注册表/`user.*` 的完整条目，另一条是自动扫描出来的、没有草稿与视觉侧车）。
现在扫描器只把**仓库层**（`models--<org>--<repo>/`，扁平下载）与 **`snapshots/<rev>/`** 当模型层，
更深的目录（变体、`mmproj/`、`blobs/`）交给注册表的 repo checkpoint 解析，不再重复登记。


## 性能（本机 55W 功耗墙实测，Flash-Next UD-Q4_K_XL + MTP + BF16 mmproj）

| 场景 | prefill | decode |
|---|---|---|
| 4.3K 提示 + 重复输出（MTP） | 827.7 t/s | **49.5 t/s**（草稿 86% 接受） |
| 短提示 greedy（MTP） | — | 39.8 t/s |
| 流式散文（MTP） | — | 31.9 t/s |
| 图像输入 | 88.6 t/s | 34.0 t/s |
| 提示缓存命中后的续轮 | 0（全命中） | 50.6 t/s |

对照上游文档（全功耗、pp2048）：pp 1421–1628、重复文本 MTP tg 47–59 —— **decode 基本追平**
（访存瓶颈，功耗影响小），prefill 的差距来自 55W 功耗墙（比例约 2.4×，与整机 132W 拉满时一致）。

## 已知限制

- **Windows + gfx1151 限定**（描述符能力清单 + 引擎本身只编译了 gfx1151 kernel）。
- **一个引擎进程 = 一个模型**：切换/加载要重载；Flash-Next 常驻约 104 GiB，基本无法与其它大模型共存。
- 加载期间 `/ready` 返回 503（进程已起但模型未就绪）；`/health` 与 `/ready` 由驱动分别用于
  存活与就绪判定。
- 不支持 embedding / rerank / 语音 / 图像生成：gufo 的其它模态是各自独立的进程
  （`gufo serve tts|asr|image`），驱动只接入文本 `llm`。
- 引擎许可为 **MIT**。
