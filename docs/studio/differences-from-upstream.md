# 相对 lemonade 原版的优化

> 本页内容原在根 README，现作为详细说明归档。返回 [studio 文档索引](README.md)。

## 1. 多引擎兼容：同一后端类型下可注册/运行多个 llama.cpp 编译产物

原版 lemonade 的 `config.json` 里，`llamacpp.rocm_bin` / `vulkan_bin` 是**每个后端全局一个二进制**，
因此同一个 `rocm`（HIP）下**无法**同时挂载两个不同编译的 llama.cpp。

本 fork 新增了 **自定义引擎注册表**（`llamacpp.custom_engines`）：

```jsonc
"llamacpp": {
  "engines_dir": "…\\engines",              // 自动扫描的引擎目录
  "custom_engines": {
    "roc_official":  { "path": "…\\roc_official\\llama-server.exe",  "backend": "rocm",   "device": "ROCm0" },
    "rocm_ciru":     { "path": "…\\rocm_ciru\\llama-server.exe",     "backend": "rocm",   "device": "ROCm0" },
    "vulkan_cm1":    { "path": "…\\vulkan_official_cm1\\llama-server.exe", "backend": "vulkan", "device": "Vulkan0",
                       "env": { "GGML_VK_ROCMFP4_COOPMAT": "1" } }
  }
}
```

每个模型通过 `llamacpp_engine` **按模型选择任意引擎构建**：

```jsonc
// recipe_options.json
"extra.MyModel": { "llamacpp_engine": "roc_official", "llamacpp_args": "-ngl 99 -fa on" }
```

**效果**：同一台机器上，不同模型可以跑在**不同编译的 llama.cpp 引擎**上（例如 `roc_official`、
`rocm_ciru`、`vulkan_official`、`vulkan_official_cm1` …），并且**同时运行**，统一挂在
**一个 OpenAI 兼容端口**（默认 `http://localhost:13310/v1`）下按 model 名路由。

> 原版 lemonade：一个后端类型 = 一个二进制。
> 本 fork：一个后端类型 = 任意多个二进制，按模型选择。

细节（注册表字段、扫描规则、目录布局）见 [engine-registry.md](engine-registry.md)。

## 2. WebUI：比原版更完整的管理台（中英双语，默认中文）

左侧导航顺序：**模型管理 → 聊天测试 → 引擎管理 → 运行控制**。

- **模型管理**（两个 Tab）
  - **模型列表**（默认）
    - **多本地路径扫描**：添加任意多个本地目录，自动发现模型；兼容 HF 缓存布局
      `models--org--repo/snapshots/<commit>/`，按仓库名命名。
    - **每模型独立配置**：选择**引擎构建**、配置**双模式参数**（整串输入 / 参数构建器 +
      一键暴露全部参数）、设置上下文长度，以及**每模型环境变量**（`llamacpp_env`）。
    - **启动 / 停止 / 实时日志**：每行操作，加载失败自动弹出日志。
  - **模型下载**：内置 HuggingFace（可走 hf-mirror）/ ModelScope 搜索，展开变体后一键下载。
- **聊天测试**
  - 选择模型进行**流式对话**测试（逐字输出）。
  - 右侧**可折叠实时日志面板**；聊天区与日志面板上下对齐。
  - 每条回复显示**本次请求**的预填充/解码 t/s、首字延迟、草稿接受率、prompt/生成 token；
    页头显示**会话平均**（时间加权）与**引擎平均（自加载以来）**，以及累计 token 与会话草稿采纳率。
- **引擎管理**（两个 Tab）
  - **引擎列表**（默认）
    - **添加自编引擎**：填入自编 llama.cpp 的构建目录，自动识别 rocm / vulkan / cpu 并登记。
    - 列出已登记 + 自动扫描到的引擎，可删除自编引擎。
    - **一键暴露引擎全部参数**：解析所选引擎的 `llama-server --help` 为结构化参数表（可搜索、多选、批量加入）。
  - **引擎下载**：按 **recipe 大分类折叠**（`llamacpp` / `flm` / `whispercpp` / `sd-cpp` /
    `ryzenai-llm` …），点开才显示该分类的后端明细并一键安装；自动隐藏本机 `unsupported` 的后端。
- **运行控制**：仅展示 **OpenAI 兼容端点** 与**各运行模型所在端口**。
- **i18n**：中文 / English 一键切换（默认中文）。

## 3. 参数优先级与兼容性修复

- **手写优先**：`手写参数 > 模型默认参数 > 全局默认`；自动注入的默认值（`--spec-type draft-mtp`、`--parallel`）
  只在用户没写时才加。
- **别名自动归并**：`--temp`/`--temperature`、`--top_p`/`--top-p`、`-ngl`/`--n-gpu-layers` 等会归一到统一 key，
  手写的顶掉默认，不再出现重复 flag。
- **JSON kwargs 引号保留**：`--chat-template-kwargs {"reasoning_effort":"low"}` 的引号不再被误当分组引号剥除。
- **上下文**：用 `ctx_size` 设置（`/v1/models/<id>/options` 或 WebUI），避免手写重复 `--ctx-size`。

## 4. 一键启动器（Windows）

- `LemonadeMultiEngineStudio.exe`：带图标、**单实例**（重复点击不会多开托盘图标），启动后端并自动打开 WebUI。
- **退出即清理**：用 Windows Job Object 把 `lemond` 与其派生的**所有 `llama-server` 一起关闭**，不留孤儿进程。

## 差异对照表

| 能力 | lemonade 原版 | 本 fork |
|---|---|---|
| 同后端类型多编译产物 | ❌ 每后端一个二进制 | ✅ `custom_engines` + 按模型选 `llamacpp_engine` |
| 多引擎同时挂一个 OpenAI 端口 | ❌ | ✅ |
| 引擎下载 | ✅（CLI/桌面） | ✅ + WebUI 内一键下载 |
| 添加自编引擎 | 手改 config | ✅ WebUI 填目录自动登记 |
| 一键暴露引擎全部参数 | ❌ | ✅（解析 `--help`） |
| 模型本地路径扫描 | 单个 `extra_models_dir` | ✅ 多个路径 + HF 缓存命名兼容 |
| 模型下载源 | HF / ModelScope | ✅ + hf-mirror |
| 每模型选引擎 / 参数 / 启停 / 日志 / env | 部分 | ✅ 完整 WebUI |
| 参数别名归并 / JSON kwargs | ❌ | ✅ |
| 一键启动器 + 退出清理 | 桌面 App | ✅ 单实例 + Job Object 清理 |
| 中英双语 WebUI | 部分 | ✅ 默认中文 |
| 聊天页吞吐统计 | ❌ | ✅ 本次 / 会话平均 / 引擎平均 |
