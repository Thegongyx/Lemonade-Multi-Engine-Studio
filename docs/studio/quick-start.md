# 快速开始

> 从根 README 移出的上手内容。返回 [studio 文档索引](README.md)。

## 启动

**方式一：一键启动器（推荐）**

1. 双击 `LemonadeMultiEngineStudio.exe`（或先跑一次 `scripts\install.ps1` 创建桌面快捷方式）。
2. 浏览器打开 `http://localhost:13310/app/`。

**方式二：脚本**

```powershell
.\scripts\start.ps1            # 默认端口 13310
```

**OpenAI 兼容端点**

```
base_url = http://localhost:13310/v1
api_key  = lemonade            # 若设置了 LEMONADE_API_KEY
```

## 首次使用：获取并注册引擎

> 仓库**不包含** `config/config.json` 与 `config/recipe_options.json` —— 它们是**本机私有配置**，
> 应用**第一次保存设置时自动生成**。因此新克隆的仓库里**引擎列表是空的**，需要你自己放引擎。

1. **下载引擎**：到 [Releases](https://github.com/Thegongyx/Lemonade-Multi-Engine-Studio/releases)
   下载 `engine-*_gfx1151_win.zip`（如 `engine-roc_official_gfx1151_win.zip`），解压到 `engines\`，
   使结构为 `engines\<引擎名>\llama-server.exe`。
2. **注册引擎**：启动 `LemonadeMultiEngineStudio.exe` → WebUI「引擎管理 → 引擎列表 → 添加自编引擎」，
   填入引擎目录（如 `engines\roc_official`）；程序会自动识别 rocm / vulkan / cpu 并写入你的 `config.json`。
   - 也可以照着 `config/config.example.json` 手写 `config/config.json`（**格式示例，请替换成你自己的引擎**）。
3. **添加模型**：在「模型管理 → 本地路径」添加你的模型目录（兼容 HF 缓存布局
   `models--org--repo/snapshots/<commit>/`），或在「模型下载」里在线拉取。
4. **按模型选引擎**：在模型行的「配置」里选择引擎构建、填写参数 —— 写入本机的 `recipe_options.json`。

引擎清单、来源、下载与编译方法见 [../engines/README.md](../engines/README.md)；
注册表字段与扫描规则见 [engine-registry.md](engine-registry.md)。

## 从源码构建

```powershell
# 1) 配置（首次会下载依赖，走 GitHub 镜像更快）
cmake --preset vs18 -DBUILD_WEB_APP=OFF

# 2) 编译服务器
cmake --build build --config Release --target lemond

# 3) 构建前端并 staging 到 lemond 的 resources/web-app（供 /app 访问）
.\scripts\build-webui.ps1
```

> Windows 构建提示：libwebsockets 的 `-Werror` 在 MSVC 下需关掉；建议构建时注入
> `CL=/utf-8 /WX-`，并用 `-DDISABLE_WERROR=ON`、`-DCMAKE_DISABLE_FIND_PACKAGE_nlohmann_json=ON`
> 避免用到 ROCm/conda 自带的不兼容 nlohmann_json。

上游 lemonade 的构建/测试/贡献文档见 [../dev/README.md](../dev/README.md)。
