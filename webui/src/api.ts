// Typed client for the local service. All calls go through /api (Vite proxies
// to the service; production serves the built assets from the same origin).
//
// Endpoint surface:
//   GET  /api/v1/engines                  -> list registered + discovered engines
//   GET  /api/v1/engines/{id}/params      -> structured llama-server --help catalog
//   GET  /api/v1/models                   -> OpenAI-style model list
//   GET  /api/v1/models/{id}/options      -> per-model recipe options
//   POST /api/v1/models/{id}/options      -> save per-model recipe options
//   POST /api/v1/load | /api/v1/unload    -> start / stop a model
//   POST /api/v1/pull                     -> download a model
//   GET  /api/v1/system-info              -> recipes/backends + host info

export type EngineInfo = {
  id: string;
  name: string;
  path: string;
  backend: string;
  device?: string;
  source: "registered" | "discovered" | "downloaded";
  variant?: string;
  version?: string;
  exists: boolean;
};

export type EngineParam = {
  flag: string;
  name: string;
  type: "string" | "int" | "float" | "bool" | "enum" | "unknown";
  default?: string | null;
  choices?: string[];
  help?: string;
};

export type ModelInfo = {
  id: string;
  engine?: string;
  backend?: string;
  status?: string;
  port?: number;
  size?: number;
  recipe_options?: Record<string, unknown>;
};

// Server-owned download job (GET /downloads). Lives in the server, so a page
// reload re-reads the same in-flight state instead of showing "not downloaded".
export type DownloadJob = {
  id: string;
  type: string;
  model_name: string;
  status: "downloading" | "paused" | "completed" | "cancelled" | "error" | string;
  running: boolean;
  file?: string;
  file_index?: number;
  total_files?: number;
  bytes_downloaded?: number;
  bytes_total?: number;
  total_download_size?: number;
  bytes_previously_downloaded?: number;
  completed_files_bytes?: number;
  cumulative_bytes_downloaded?: number;
  overall_bytes_downloaded?: number;
  percent?: number;
  complete?: boolean;
  error?: string;
};

// API key for the local service. Defaults to "lemonade" (the default in
// config.json); override in the browser console with:
//   localStorage.setItem("apiKey", "...")
function apiKey(): string {
  return localStorage.getItem("apiKey") || "lemonade";
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    throw new Error(
      `无法连接后端（${location.origin}）。请确认服务已启动：用桌面“Lemonade Studio”图标启动，` +
        `或打开 http://localhost:13310/app/ 。原始错误：${String(e)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listEngines: () => req<{ engines: EngineInfo[] }>("/engines"),
  engineParams: (id: string) =>
    req<{ engine: string; params: EngineParam[] }>(`/engines/${encodeURIComponent(id)}/params`),
  listModels: () => req<{ data: ModelInfo[] }>("/models"),
  modelOptions: (id: string) => req<Record<string, unknown>>(`/models/${encodeURIComponent(id)}/options`),
  saveModelOptions: (id: string, options: Record<string, unknown>) =>
    req<{ status: string }>(`/models/${encodeURIComponent(id)}/options`, {
      method: "POST",
      body: JSON.stringify(options),
    }),
  loadModel: (id: string, options?: Record<string, unknown>) =>
    req<{ status: string }>("/load", {
      method: "POST",
      body: JSON.stringify({ model: id, model_name: id, ...options }),
    }),
  unloadModel: (id?: string) =>
    req<{ status: string }>("/unload", { method: "POST", body: JSON.stringify({ model: id ?? "" }) }),
  // Server-owned mode (stream + subscribe:false): the call returns as soon as
  // the background job is registered, so the download keeps running server-side
  // and progress survives a page reload (read it back from GET /downloads).
  pull: (body: Record<string, unknown>) =>
    req<Record<string, unknown>>("/pull", {
      method: "POST",
      body: JSON.stringify({ ...body, stream: true, subscribe: false }),
    }),
  registrySearch: (source: string, query: string, limit = 20) =>
    req<{ results: unknown[] }>(
      `/registry/search?source=${encodeURIComponent(source)}&query=${encodeURIComponent(query)}&limit=${limit}&format=gguf`,
    ),
  pullVariants: (checkpoint: string, source: string) =>
    req<Record<string, unknown>>(
      `/pull/variants?checkpoint=${encodeURIComponent(checkpoint)}&source=${encodeURIComponent(source)}`,
    ),
  modelPaths: () => req<{ paths: string[] }>("/model-paths"),
  setModelPaths: (paths: string[]) =>
    req<{ status: string; paths: string[] }>("/model-paths", {
      method: "POST",
      body: JSON.stringify({ paths }),
    }),
  addEngine: (path: string) =>
    req<{ status: string; id: string; backend: string }>("/engines", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  removeEngine: (id: string) =>
    req<{ status: string }>(`/engines/${encodeURIComponent(id)}`, { method: "DELETE" }),
  systemInfo: () =>
    req<{ recipes?: Record<string, { backends?: Record<string, { state?: string }> }> }>("/system-info"),
  installBackend: (recipe: string, backend: string) =>
    req<Record<string, unknown>>("/install", {
      method: "POST",
      body: JSON.stringify({ recipe, backend, stream: true, subscribe: false }),
    }),
  uninstallBackend: (recipe: string, backend: string) =>
    req<Record<string, unknown>>("/uninstall", {
      method: "POST",
      body: JSON.stringify({ recipe, backend }),
    }),
  downloads: () => req<DownloadJob[]>("/downloads"),
  controlDownload: (id: string, action: "pause" | "cancel" | "remove") =>
    req<Record<string, unknown>>("/downloads/control", {
      method: "POST",
      body: JSON.stringify({ id, action }),
    }),
  health: () =>
    req<{
      all_models_loaded?:
        | { model_name?: string; loaded?: boolean; status?: string }[]
        | { model_name?: string; loaded?: boolean; status?: string }
        | null;
      model_loaded?: string | null;
    }>("/health"),
  logs: (tail = 200, q = "") =>
    req<{ lines: { timestamp: string; severity: string; tag: string; line: string }[] }>(
      `/logs?tail=${tail}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
};
