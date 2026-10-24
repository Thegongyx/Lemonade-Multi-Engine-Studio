# 让一个模型可以自由选择引擎（跨 recipe 后端绑定）—— 设计稿

> 状态：**设计提案**（未实现）。目标读者：本仓库维护者。
> 起因：`gufo` 后端接入后，模型只能由 `gufo` 引擎运行；而 llama.cpp 系模型可以在
> `roc_official` / `vulkan_official` / `roc_strixllama` … 之间随意换。希望补齐"一个模型、
> 任选引擎"的体验。
>
> **结论（先看这里）**：因为 `gufo` 与 llama.cpp 系跑的都是 **GGUF**，最优解不是"跨 recipe 绑定"
> （方案 A/B），而是把 gufo 做成 **llamacpp recipe 内的一种引擎驱动**（**方案 C**，见 §5.5）——
> 不改 router、不改检查点解析、不改能力/驱逐，直接复用现有的引擎下拉与每模型选项。
> 方案 B 仅在"需要把 `.hgn` 之类非 GGUF 后端与 GGUF 引擎放进同一模型条目"时才需要，目前无此需求。

## 1. 现状：绑定关系来自 `recipe`

`recipe` 不只是"用哪个后端"，它是**模型的身份**：决定后端进程类、检查点解析规则、参数文法、
能力/模式、支持矩阵门禁、驱逐策略。因此目前**任何后端**都做不到跨引擎切换，`gufo`
只是"第 N 个后端"，与 `halowin` / `ds4` / `vllm` 表现一致。

耦合点清单（全部核对过）：

| 关注点 | 位置 | 说明 |
|---|---|---|
| 后端进程类 | `src/cpp/server/router.cpp:693` `backends::create_server(model_info.recipe, ctx)` | recipe → `WrappedServer` 子类，全仓库无 recipe 覆盖钩子 |
| 参数解析与 backend 选择 | `router.cpp:1417-1421`（`RecipeOptions(model_info.recipe, …)`、`<recipe>_backend`） | 每 recipe 一套配置段与 backend 选项 |
| 检查点解析 | `model_manager.cpp:1698` `ops_for(info.recipe)->resolve_checkpoint_path` | 分片目录/变体/侧车规则按 recipe 走（gufo 有自己的"目录→首片"修正，llamacpp 有 GGUF variant 解析） |
| 下载与就绪判定 | `model_manager.cpp:3034 / 3476 / 3663 / 4431`（`validate_checkpoint_file` / `is_downloaded` / `download_model`） | pull/续传/校验都归属 recipe 的 ops |
| 能力与模式 | `backend_descriptor_registry.cpp:17`、`test/cpp` 的 mode-contract 测试 | `descriptor.supported_modes` ↔ 后端实现的能力接口必须一致 |
| 设备与门禁 | `model_manager.cpp:4004`（`check_recipe_supported`）、`4014`（尺寸/流式过滤） | 如 gufo 只声明 `windows + gfx1151` |
| 标签合法性 | `model_manager.cpp:3633` + `backend_descriptor_registry.cpp:94` | 部署标签（chat/vision/…）要落在 recipe 的 `supported_modes` 内 |
| 设备类型/驱逐策略 | `model_manager.cpp:439/3643`、`router.cpp:246`、`WrappedServer::effective_*` | `SlotPolicy`/`DeviceType` 按 recipe 描述符 |
| `/engines` 与 UI 过滤 | `server.cpp` `handle_engines`、`webui/src/components/ModelConfigModal.tsx:26-31` | 引擎条目带 `recipe` 字段；弹窗按 `engineRecipe(e) === effectiveRecipe` 置灰 |
| 引擎参数目录 | `server.cpp` `handle_engine_params`（只读 `llamacpp` 段） | `llama-server --help` 目录仅对 llamacpp 有效 |
| 引擎默认环境变量 | `webui/src/engineDefaultEnv.ts` | 每个 llama.cpp 构建一套 env（如 strixllama 的 `LLAMA_*`/`STRIX_*`） |

`llamacpp_engine` / `llamacpp_backend` / `llamacpp_bin` 是 **recipe 内部**的二进制选择器
（`config.json → llamacpp.custom_engines` 与 `engines_dir` 扫描），所以"随意换引擎"实际是
"在同一个 llama-server 后端类里换不同构建"。

### 为什么现在是这个形状（不是随手写死）

各后端之间不只差一个可执行文件：

- **进程模型**：llama-server 用 `-m/-ngl/-fa` 一套参数；gufo 是 `serve llm --model --speculative mtp --mmproj`；ds4 又有自己的 flag。
- **量化/格式支持**：gufo 的 kernel 是编译进去的，逐张量白名单（见 `docs/engines/gufo.md`），
  ROCmFP4/ROCMI4/GSQ-RCO 这类它根本加载不了；llama.cpp 系反之。
- **检查点语义**：分片、侧车（mmproj/draft）、变体（`:UD-Q4_K_XL`）的解释规则不同。
- **能力**：gufo 目前只有 chat；llama.cpp 覆盖 embedding/rerank/vision/tool-calling 等。

因此"自由换引擎"在语义上不是免费的，必须为每个绑定声明清楚。

## 2. 目标与非目标

**目标**

1. 一个模型（同一个名字、同一批文件）可以在多个后端之间切换，无需重复注册。
2. 引擎下拉列出该模型所有**可用绑定**，选中即持久化，重载后生效。
3. 切换不改变模型身份：`/v1/models`、别名、路由策略、提示缓存键、UI 列表项都不变。

**非目标**

- 不追求"任意模型 × 任意引擎"：不兼容的组合（gufo × ROCmFP4）应当**明确拒绝**并给出原因。
- 不改动单引擎内部的二进制选择器（`llamacpp_engine` 等保持原样）。

## 3. 方案 0：不写代码的替代（现状可用）

同一份文件**按 recipe 各注册一条**（如 `…-Gufo` 与 `…-GGUF`），列表里出现两个名字，各自
下拉里是自己的引擎家族。零改动、零风险，代价是模型列表出现重复项，且"切引擎"表现为
"换一个名字"。适合临时使用，不适合作为产品形态。

## 4. 方案 A：per-model recipe 覆盖（最小可跑）

模型 JSON 增加一个选项（例如 `engine_recipe`），路由与模型管理在解析时用它替代 `info.recipe`：

```
effective_recipe(info) = info.recipe_options["engine_recipe"] or info.recipe
```

改动点：

1. `router.cpp:693` → `create_server(effective_recipe(info), ctx)`。
2. `router.cpp:1417-1421` → 选项继承与 `<recipe>_backend` 用 `effective_recipe`。
3. `ops_for(effective_recipe)`：`resolve_checkpoint_path` / `is_downloaded` / `validate_checkpoint_file` / `download_model`（`model_manager.cpp` 五处）。
4. `descriptor_for(effective_recipe)`：支持门禁、尺寸过滤、模式/标签、能力上报（`model_manager.cpp:3633/4004/4014`、`prometheus_metrics.cpp:278`）。
5. 参数命名空间：加载时按 `effective_recipe` 取 `*_args`（llamacpp 取 `llamacpp_args`，gufo 取 `gufo_args`）。

**优点**：落在既有抽象上，改动集中（约 6 个文件、200 行内），能快速验证可行性。
**缺点**：模型身份会随覆盖漂移（标签合法性/能力以覆盖后的 recipe 判定），
UI 仍按 `info.recipe` 过滤引擎，需要额外约定；多绑定（>2）表达不了。

## 5. 方案 B：多绑定模型（备用）

把"模型"与"后端绑定"拆开：

```jsonc
// user_models.json
"Qwen3.8-Flash-Next-Q4-K-XL": {
  "checkpoints": { "main": ".../UD-Q4_K_XL/....gguf" },   // 模型身份与文件
  "labels": ["chat", "reasoning", "vision", "mtp"],
  "bindings": [
    { "id": "gufo",   "recipe": "gufo",
      "options": { "ctx_size": 32768, "gufo_args": "--mtp-policy survival" } },
    { "id": "roc",    "recipe": "llamacpp",
      "options": { "ctx_size": 32768, "llamacpp_engine": "roc_official",
                   "llamacpp_args": "-ngl 99 -fa on" } }
  ],
  "active_binding": "gufo"
}
```

- **模型身份**（名字、检查点、标签、大小、别名、路由策略）与绑定解耦，切换只改
  `active_binding`。
- 检查点解析、下载、校验用**该绑定的 recipe ops**；能力/模式/门禁/驱逐用该绑定描述符。
- `/engines` 只为"被当前模型引用的绑定"返回匹配项；UI 一条模型、一个引擎下拉。
- 每个绑定自带 `options`（参数命名空间不再打架）；`recipe_options.json` 按绑定分区，
  避免把 `gufo_args` 写给 llama-server。
- 没写 `bindings` 的老模型 = 单绑定（`{recipe: info.recipe}`），**完全后向兼容**。

**代价**：注册/校验/`/system-info`/UI 都要认识 `bindings`；比 A 大一圈，但模型语义干净，
且天然支持"同一文件多种后端"的教学与诊断。

## 5.5 方案 C：GGUF 引擎驱动（推荐）

**出发点**：`halowin` 跑 `.hgn`，与 GGUF 无关，独立 recipe 合理；但 **`gufo` 跑的就是 GGUF**，
`ds4` 也是。对"本地 GGUF → 常驻 OpenAI 兼容服务"这一类引擎，没有必要另开 recipe ——
把它们做成 **llamacpp recipe 内的一种驱动（driver）** 即可，于是"换引擎"就回到用户已经习惯的
那个下拉框里。

**为什么这条最省**：fork 的 `llamacpp.custom_engines` 里，引擎**本来就是结构化记录**：

```cpp
// llamacpp_server.cpp:194-201
struct CustomEngine {
    std::string name;
    std::string path;
    std::string backend;
    std::string device;
    std::vector<std::pair<std::string, std::string>> env;   // 已支持每引擎 env
    bool valid = false;
};
```

配置里也是 `{"roc_official": {"path": "...", "backend": "rocm", "device": "ROCm0"}}`。
因此加一个 `driver`（+ 可选 `capabilities`）是**一处字段扩展**，而不是新抽象。

**可以原样复用的东西（这是关键）**

| 能力 | 现有实现 | 是否需要改 |
|---|---|---|
| 引擎列表 / 下拉 / 灰显 | `handle_engines` + `ModelConfigModal` 按 recipe 过滤 | 只需把 `recipe` 判据换成"driver 兼容性" |
| 引擎二进制解析 | `resolve_custom_engine()`：config 映射 / `<bin>/llamacpp/<name>` / `engines_dir` 扫描 | 不改（新增 driver 字段读取） |
| **检查点解析** | llamacpp 的 `resolve_gguf_path`：变体目录（`UD-Q4_K_XL/` → 首片）、量化 token 回退、分片排序 | **不改，而且比 gufo 现有 ops 更强**（连 `:UD-Q4_K_XL` 这种仓库变体都不用再靠 `local_path` 绝对路径） |
| 下载 / 校验 / 就绪判定 | `ops_for("llamacpp")` 全流程 | 不改 |
| 每模型选项存储 | `recipe_options`（llamacpp 段） | 需把驱动自有键（`gufo_args` 等）声明进 llamacpp 描述符，否则会被 `get_keys_for_recipe()` 过滤掉 |
| 别名 / 路由策略 / 内存与尺寸过滤 / 驱逐 | 全部基于模型身份，与 recipe 无关 | 不改 |
| 能力与模式契约 | llamacpp 声明 `chat/embeddings/reranking/...` | 不改（实际能力由驱动决定，见下） |

**需要新建的一层（驱动接口）**，只围绕"如何把这台服务器拉起来并驱动"：

1. **argv 拼装**：`llama-server -m … -c … -ngl …` ↔ `gufo serve … llm --model … --context … [--speculative mtp --mtp-model …] [--mmproj …]`。
2. **就绪与看门狗端点**：llama.cpp 用 `/health`；gufo 用 `/ready`（加载完成前 503）→ 由驱动声明。
3. **请求改写**：gufo 对 model 名做校验（不匹配 404），需要 `--served-model-name <LM 模型名>`
   并把转发的请求 `model` 字段改写；llama.cpp 忽略该字段 → 由驱动声明"是否需要改写"。
4. **参数命名空间**：`llamacpp_args`（llama.cpp 文法）与 `gufo_args`（gufo 文法）互不相通；
   弹窗的 args 框应按**当前引擎的驱动**切换键名（现有代码已有 `argsKey = <recipe>_args` 的位置，
   改成按引擎驱动取键即可）。
5. **参数目录**：`/engines/{id}/params` 现在跑 `<exe> --help` 并按 llama-server 的格式解析；
   gufo 的 help 不是这个形状 → 驱动声明"无目录"，UI 关闭 builder 模式。
6. **兼容性预检**：这是本方案唯一必须认真做的一件事 —— 引擎下拉不能对每个模型都无脑列出 Gufo
   （gufo 只认它编译进去的架构与逐张量类型白名单）。建议：
   - 静态：驱动声明 `{formats: [gguf], architectures: [qwen4exp, qwen35moe, …]}`；
   - 动态：复用 llamacpp 已有的 GGUF 读取器，只读首片头部（`general.architecture` + 张量类型清单，
     不需要读权重），与驱动的白名单比对 → UI 灰显并给出原因（"Gufo 不支持 Q4_0_ROCMFP4 的张量类型"）。
   - 不进白名单的模型，选择该引擎时**加载前就报错**，而不是等 gufo 起来再崩。

**迁移与共存**：现有 `gufo` recipe 可以保留（已注册的条目照旧工作），新注册的模型走
`recipe: llamacpp` + `engine: <gufo 引擎 id>`；也可以把 `server_models.json` 里那两条 gufo
模型改成 llamacpp recipe + 指定驱动，UI 上就彻底只有一个"引擎"概念了。

**代价与限制**

- 只有"GGUF + 常驻 OpenAI 服务"的引擎能当驱动：**llama.cpp 系、gufo、ds4 可以；halowin(`.hgn`)、
  vllm(safetensors)、whisper/sd(专用权重) 都不行**（它们与 GGUF 引擎没有共享的模型实体）。
- llamacpp 描述符要接纳驱动自有选项键 → 生成的 `defaults.json` / 文档区会多出这些键（可接受，
  但要在文档里说明"仅当引擎驱动为 X 时生效"）。
- 兼容性预检要做对，否则用户体验退化成"选错引擎 → 加载失败"。

## 6. 方案对比

| | 改动面 | 风险 | UX | 适用 |
|---|---|---|---|---|
| **0 双条目** | 无 | 无 | 同一文件两个模型名 | 临时 |
| **A recipe 覆盖** | router + model_manager ~6 文件 | 中（模型身份随覆盖漂移；UI 仍需约定） | 一个模型，下拉仍按原 recipe 过滤 | 只想快速验证 |
| **B 多绑定** | 注册/校验/上报/UI 全面 | 中高（跨切面） | 最通用（连非 GGUF 后端也能进同一模型） | 只有当**非 GGUF** 后端要与 GGUF 引擎共享同一模型时才需要 |
| **C 引擎驱动** | llamacpp 后端 + 描述符选项 + UI 取键 + 兼容预检 | **低**（不动 router/能力/驱逐/检查点解析） | **与现有"换引擎"完全一致** | GGUF 引擎：llama.cpp 系、gufo、ds4 |

**结论：优先做 C。** B 的唯一优势是能容纳 `.hgn` 之类的非 GGUF 后端，而那些后端的模型文件本来就
不同，"共享一个模型"没有实际意义 —— 所以按当前需求，B 可以先不做（保留在设计稿里备查）。

## 7. 必须明确的设计决策


| 决策 | 建议 |
|---|---|
| 谁能做绑定 | 只允许**都已安装**且**都支持该文件**的后端；不支持的绑定在 UI 置灰并写明原因（如"gufo 不支持 Q4_0_ROCMFP4"） |
| 兼容性预检 | 绑定声明时做一次轻量校验：gufo → GGUF 逐张量类型白名单（我们已有 `gguf_inventory` 思路）；llamacpp → GGUF magic/架构；不通过则拒绝注册该绑定 |
| 标签语义 | 标签是**模型级**的；各绑定自行映射（`mtp` 在 llamacpp → `--spec-type draft-mtp`；在 gufo → `--speculative mtp --mtp-model`） |
| 侧车 | `checkpoints.mmproj/draft` 是模型级的；不允许某个绑定专用侧车（要就再加一个模型） |
| 能力上报 | `/v1/models`、`/system-info`、`/metrics` 按**当前绑定**上报；`supported_modes` 取绑定的并集用于注册校验，实际运行取当前绑定 |
| 门禁 | 按绑定：gufo 仅 `windows + gfx1151`；llamacpp 依设备。绑定不可用时该模型整体仍可用（其他绑定） |
| 驱逐/槽位 | 按当前绑定（gufo `Standard` + 巨量显存；llamacpp 各自策略） |
| 参数与 env | 绑定级；切换绑定时 UI 同时切换参数框与 `engineDefaultEnv` |
| 提示缓存 | 状态属于后端进程，切换绑定 = 换后端 = 缓存失效（在响应里已有 `cache_miss_reason`），无需额外处理 |

## 8. 风险与回归面

- **模式契约测试**：`test/cpp` 的 backend-mode-contract 断言"描述符声明 ↔ 实现接口"一致；
  多绑定后要按绑定断言。
- **选项优先级**：`test_recipe_options_precedence`、`recipe_arg_resolution` 涉及 recipe 段合并，
  多绑定会引入"按绑定取段"的新层次。
- **模型注册/过滤**：`test_model_registry`、`model_download_state`、`gpu_memory_selection`、
  `streaming_memory_filter` 都依赖 `descriptor_for(recipe)` 结果。
- **UI 契约**：`webui/src/api.ts` 的 `/engines`、`/models/{id}/options` 字段扩展；
  `ModelConfigModal` 的 recipe 过滤要改为绑定过滤。
- **配置迁移**：`recipe_options.json` 已有按模型名的扁平结构，需要向后兼容的读取路径。
- **错误可解释性**：跨引擎加载失败必须是"该引擎不支持这个文件"的明确错误，而不是超时或崩溃。

## 9. 分阶段实施

**P0（推荐路径 = 方案 C，只打通 gufo 这一种驱动，仅 LLM/chat，仅本地 GGUF）**

1. `CustomEngine` 增加 `driver`（默认 `"llamacpp"`）与可选 `capabilities`；`resolve_custom_engine()`
   读取它（`llamacpp_server.cpp:194-260`）。
2. 把 `LlamaCppServer::load()` 的 argv 拼装、就绪/看门狗端点、是否需要"改写请求 model 字段"
   收敛成驱动接口；实现 `llamacpp` 与 `gufo` 两个驱动（gufo 侧的 argv = 我们已在
   `GufoServer` 里验证过的形态）。
3. llamacpp 描述符声明驱动自有选项键（`gufo_args` / `gufo_think` / `gufo_sessions`），
   否则 `get_keys_for_recipe()` 会把它们过滤掉；弹窗 args 框按**当前引擎的驱动**取键。
4. 兼容性预检（P0 只要"能给出明确结论"）：读首片头部拿 `general.architecture` + 张量类型清单，
   与驱动白名单比对；UI 灰显不可用引擎，后端在加载前拒绝并给出原因。
5. `POST /engines` 注册一个 gufo 引擎（`{path: …\gufo.exe, driver: "gufo", backend: "rocm"}`），
   手工验证矩阵：同一份 Q4_K_XL 分别用 `roc_official` 与 `gufo` 引擎加载、对话、卸载；
   模型条目、`downloaded`、`size`、别名、路由策略全程不变。
6. 迁移：把 `server_models.json` 里那两条 gufo 模型（27B / 35B-A3B）改成 llamacpp recipe +
   指定 gufo 引擎；原有 `gufo` recipe 保留但不再用于新注册（可后续删除）。

**P1 UI**：引擎下拉按驱动兼容性灰显（复用现有 `engineWrongRecipe` 位置换成"驱动不支持该模型"）；
切换引擎时联动参数键与 env 默认值；`/engines/{id}/params` 对无目录的驱动返回空并关闭 builder。

**P2 泛化**：`ds4` 也做成驱动；把"引擎"统一成 `{driver, binary, args, env, capabilities}`，
halowin 之类保持独立 recipe（`.hgn` 与 GGUF 无共享实体）。

**P3（可选）**：若确实需要"GGUF 引擎与非 GGUF 后端共享同一模型条目"，再回到方案 B。

## 10. 测试计划（P0 = 方案 C）

- 单元：`CustomEngine.driver` 解析与默认值；驱动 argv 拼装（llamacpp/gufo 各一组黄金样例）；
  `recipe_options` 对驱动自有键的接受/拒绝。
- 契约：单驱动（纯 llamacpp）模型行为与改动前逐字节一致（回归）；
  兼容性预检对 ROCmFP4/GSQ-RCO 类文件给出"不支持"（用带注释的真实 GGUF 做夹具）。
- 集成（真机）：同一份 Q4_K_XL 在 `roc_official` 与 `gufo` 两个引擎上各跑一次加载 + 对话 + 流式；
  切换引擎后模型身份字段（名字/`size`/别名/路由策略）不变；不兼容组合在加载前报错。

## 11. 开放问题

1. 引擎切换是否需要"热切换"（同一进程内换后端）？建议**不**：切换 = 卸载 + 重载，简单且可预期。
2. 驱动自有选项键放在 llamacpp 描述符里（简单，但默认值与文档会带上"仅驱动 X 生效"的键），
   还是做一个"按驱动分区的选项表"（干净，但改动面变大）？P0 建议前者。
3. 兼容性预检要花多少成本：只查 `general.architecture`（便宜、能挡掉 90% 错误），还是连
   逐张量类型白名单一起查（准确，但要扫头部张量表；对 1000+ 张量的文件仍是毫秒级、不读权重）？
4. ds4 纳入驱动的顺序（它的 `--ssd-streaming`、`min_resident_gb` 会牵动尺寸过滤，建议 P2 再做）。
5. 方案 B 是否彻底放弃？只在"需要把非 GGUF 后端与 GGUF 引擎放进同一模型条目"时才需要 ——
   目前看不到这种需求。

## 12. 实施记录（P0，2026-10-14）

**代码**（`driver` 只对"具名引擎"生效，llama.cpp 路径零改动）

| 位置 | 内容 |
|---|---|
| `include/lemon/backends/llamacpp/engine_driver.h` | 驱动接口：就绪端点、是否需要改写请求 model、兼容性预检、`GufoLaunchSpec` |
| `server/backends/llamacpp/engine_driver.cpp` | 预检（GGUF 头部扫描 + 分片族聚合 + 白名单）、`gufo serve llm` argv 拼装、保留参数校验 |
| `server/backends/llamacpp/llamacpp_server.cpp` | `CustomEngine` 增加 `driver` / `architectures` / `tensor_types`；`load()` 在解析完引擎/路径/端口/可执行文件后分流到驱动；请求 model 字段改写；`downsize()` 对非 llama.cpp 驱动直接返回；env 解析提取为公用函数（驱动不注入 llama.cpp 专属 env/TheRock staging） |
| `include/lemon/backends/llamacpp/llamacpp.h` | 新增驱动自有选项键 `gufo_args` / `gufo_think` / `gufo_sessions`（否则被 `get_keys_for_recipe()` 过滤） |
| `server/server.cpp` | `/engines` 暴露 `driver`（+能力清单）；`/engines/{id}/params` 对非 llama.cpp 驱动返回空目录 |
| `webui/src/{api.ts,components/ModelConfigModal.tsx}` | 引擎条目带 `driver`；参数框按驱动取键（gufo → `gufo_args`）；参数目录按钮仅对 llama.cpp 驱动可用 |

**引擎注册**（`config.json`）：

```jsonc
"gufo": {
  "path": "…\\data\\cache\\bin\\gufo\\win\\gufo-windows-2026-10-03\\bin\\gufo.exe",
  "backend": "rocm", "driver": "gufo",
  "architectures": ["qwen4exp", "qwen35", "qwen35moe", "deepseek4"],
  "tensor_types": ["F32","F16","BF16","Q8_0","Q6_K","Q4_K","Q5_K","Q5_1","IQ3_S","IQ4_XS","IQ4_NL"]
}
```
（架构名实测：Flash-Next=`qwen4exp`、27B=`qwen35`、A3B=`qwen35moe`。）

**验证结果（真机，55W 功耗墙）**

| 测试 | 结果 |
|---|---|
| 同一模型条目（`recipe=llamacpp`）用 **gufo 驱动**加载 | 20.4 s 成功；子进程命令行 = 驱动拼装；`llamacpp_args` 被正确忽略；对话 43.6 tok/s（MTP 48 提议/39 接受），流式与视觉此前已验证 |
| 同一条目切到 `roc_official` | 选项变更生成为 200；llama.cpp 路径回归通过（另用 cafonez 27B Q4_0 验证：7.2 s 加载、对话 26.0 tok/s、子进程是 `engines\roc_official\llama-server.exe`） |
| 预检：GSQ-RCO（非均匀量化）+ gufo | **0.45 s 拒绝**，无子进程：`unsupported tensor types: IQ2_S, IQ3_XXS, ggml_type_42` |
| 预检：27B ROCmI4 + gufo | 0.44 s 拒绝：`unsupported tensor types: ggml_type_108` |
| `/engines/gufo/params` | 空目录（llama.cpp 的 202 条不受影响） |

**已知缺口**

1. ~~**同名引擎两条记录**~~ **已解决（2026-10-14）**：旧的 `recipe=gufo` 后端、CMake 登记、
   `backend_versions.json` 的版本 pin、`/engines` 里的重复条目与旧测试全部删除；
   `server_models.json` 里三条 gufo 模型（Flash-Next / 27B / 35B-A3B）已迁到
   `recipe: llamacpp` + `recipe_options.llamacpp_engine = "gufo"`。引擎的*安装*也随之改为
   用户自备二进制 + `config.json` 注册（不再有从 GitHub Release 自动下载的流程）。
2. **WebUI 的"添加自编引擎"只认 `llama-server.exe`**：gufo 引擎目前只能手写 `config.json`
   注册（`driver` 与能力清单也只有 JSON 支持）。P1 应让引擎表单支持选择驱动（或按可执行文件名
   自动探测），并在引擎列表里显示驱动与能力。
3. **预检粒度**：当前是"架构名单 + 张量类型并集"级别，能挡住 ROCmFP4/ROCmI4/GSQ-RCO/Q2_K 一类，
   但不做逐张量族的精确判定（那需要复刻 gufo 的每族白名单）。预检通过后仍由引擎自身报错。
4. **unsloth 分片布局**：`UD-Q4_K_XL` / `UD-IQ4_XS` 的首片是"0 张量、仅元数据"的分片，gufo 能加载，
   **llama.cpp 不能**（`tensor 'token_embd.weight' not found`，不做跨分片合并）。所以"同一文件两引擎"
   在这两个发布上仍不成立；本质上是模型文件的锅，不是驱动的。
5. **UI 改动需重建 web-app**：本 fork 的界面是 `webui/`（Vite，`npm run build` → `webui/dist`），
   部署时把 `webui/dist/*` 覆盖到服务的 `resources/web-app/`。注意 **CMake 的 `web-app` 目标
   构建的是上游 renderer，不是 fork 界面** —— 用错会把这个界面换掉。

## 13. 第二个驱动：halowin（2026-10-24）

上游 gfx1151-engine 从 G3.3 起支持**纯 GGUF**（与 llama.cpp 同一批文件），所以 HaloWin 也能当作
`llamacpp` 配方里的引擎驱动，与 gufo 并列 —— 同一个 GGUF 模型条目在 llama.cpp / gufo / halowin
之间切换。

**与 gufo 的机制差异**：gufo 是单进程、OpenAI 直通，驱动层自己拼 argv；HaloWin 是**双进程**
（`qwenox-engine-win.exe` + `qwenox-win.exe`）、调参走 `QWENOX_*` 环境变量、前端与引擎端口分离，
这套生命周期已经在 `halowin` 后端里实现，所以驱动层**整单委托**给它，不重复实现。

| 位置 | 内容 |
|---|---|
| `include/lemon/backends/llamacpp/engine_driver.h` | 新增驱动名 `kHalowin` |
| `server/backends/llamacpp/llamacpp_server.cpp` | `load()` 在 `driver == "halowin"` 时构造 `HalowinServer`、按引擎记录的目录 `set_bin_dir()`，然后 `load()` 并返回；`unload` / `is_backend_alive` / `chat_completion` / `completion` / `responses` / `forward_streaming_request` 全部转发给委托对象 |
| `server/backends/halowin/halowin_server.cpp` | 新增 GGUF 分支（`main` 是 `.gguf` 时走 `QWENOX_GGUF` + `QWENOX_GGUF_DENSE=1`，MTP 改由 `QWENOX_GGUF_MTP` 传入，`overlay`/`ngram` 不参与）；接受 llamacpp 侧的 `draft`/`mmproj` 检查点名；缺 `tokenizer` 检查点时向上 3 层找 `<权重目录>/tokenizer/tokenizer.json`；`set_bin_dir()` 让引擎从注册记录的目录解析 |
| `include/lemon/backends/llamacpp/llamacpp.h` | 新增 `halowin_engine_args` / `halowin_args` / `halowin_parallel` / `halowin_prefill_chunk` / `halowin_mtp_gamma`（否则 `get_keys_for_recipe()` 会过滤掉） |
| `webui/src/components/ModelConfigModal.tsx` | 参数框按驱动取键：`halowin` → `halowin_engine_args` |
| `docs/engines/halowin.md` | 新增「GGUF 权重（llamacpp 驱动）」一节 |

**引擎注册**（`config.json`）：

```jsonc
"halowin": {
  "path": "…\\gfx1151-engine\\build\\qwenox-win.exe",
  "backend": "rocm", "driver": "halowin"
}
```

`halowin` 配方已随之删除（不再有同名冲突，故引擎 id 直接用 `halowin`）。

**实测（Streaming / 双进程 / 回归，同一模型条目 `Qwen3.8-Flash-Next-Q4-K-XL`，ctx 32768）**

| 项 | 结果 |
|---|---|
| halowin 驱动加载 | 25–29 s；`qwenox-engine-win.exe`（约 32 GB 驻留）+ `qwenox-win.exe`；`--tokenizer` 指到自动找到的 `<repo>\tokenizer` |
| 对话 / 流式 | 38.2 tok/s（MTP 44 提议 / 26 接受）；SSE 36 chunk 正常 |
| 卸载 | 双进程均退出，无残留 |
| 切回 gufo | 21.6 s 加载、36.7 tok/s，行为不变（无回归） |

**遗留**：WebUI 的"添加自编引擎"仍只认 `llama-server.exe`，halowin / gufo 引擎需手写 `config.json`；
`halowin` 配方删除后不再有引擎自动下载与 hgn 目录自动发现，模型必须显式登记 checkpoints。
