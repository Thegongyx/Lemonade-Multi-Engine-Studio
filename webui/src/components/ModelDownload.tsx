import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, DownloadCloud, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../api";
import DownloadProgress from "./DownloadProgress";

type Source = "huggingface" | "modelscope";

type SearchResult = {
  repository_id: string;
  description?: string;
  has_gguf?: boolean;
  downloads?: number;
};

type Variant = { name: string; primary_file?: string; files?: string[]; size_bytes?: number };
type VariantsResponse = { suggested_name?: string; recipe?: string; variants?: Variant[]; error?: string };

const gb = (n?: number) => (n && n > 0 ? `${(n / 1e9).toFixed(2)} GB` : "—");

export default function ModelDownload({ onPulled }: { onPulled?: () => void }) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>("huggingface");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantsResponse | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const doSearch = () => {
    setLoading(true);
    setError("");
    setExpanded(null);
    setVariants(null);
    api
      .registrySearch(source, query, 20)
      .then((r) => setResults((r.results || []) as SearchResult[]))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  const toggleVariants = (repo: string) => {
    if (expanded === repo) {
      setExpanded(null);
      return;
    }
    setExpanded(repo);
    setVariants(null);
    setVariantsLoading(true);
    api
      .pullVariants(repo, source)
      .then((r) => setVariants(r as VariantsResponse))
      .catch((e) => setVariants({ error: String(e) }))
      .finally(() => setVariantsLoading(false));
  };

  const doPull = async (repo: string, variantName: string) => {
    const name = variants?.suggested_name || repo.split("/").pop() || repo;
    setPulling(`${repo}:${variantName}`);
    try {
      await api.pull({ model: name, checkpoint: `${repo}:${variantName}`, source, recipe: variants?.recipe || "llamacpp" });
      notify(t("download.pulled"));
    } catch (e) {
      setError(String(e));
    } finally {
      setPulling(null);
    }
  };

  return (
    <div>
      <DownloadProgress type="model" onFinished={onPulled} />
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={source} onChange={(e) => setSource(e.target.value as Source)} style={{ width: 200 }}>
          <option value="huggingface">HuggingFace（hf-mirror）</option>
          <option value="modelscope">ModelScope</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && query.trim().length >= 3 && doSearch()}
          placeholder={t("download.query")}
        />
        <button className="btn primary" onClick={doSearch} disabled={loading || query.trim().length < 3}>
          <Search size={15} /> {t("download.searchBtn")}
        </button>
      </div>
      {error && <div className="tag err">{error}</div>}
      {loading && <div className="hint">{t("common.loading")}</div>}
      {!loading && results.length === 0 && <div className="hint">{t("download.hint")}</div>}
      {results.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th>{t("download.repo")}</th>
              <th>GGUF</th>
              <th>{t("download.size")}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const repo = r.repository_id;
              const open = expanded === repo;
              return (
                <Fragment key={repo}>
                  <tr className="param-row" onClick={() => toggleVariants(repo)}>
                    <td>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td><strong>{repo}</strong></td>
                    <td>{r.has_gguf ? <span className="tag ok">gguf</span> : <span className="tag">—</span>}</td>
                    <td className="mono">{r.downloads ?? "—"}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td />
                      <td colSpan={3}>
                        {variantsLoading && <div className="hint">{t("common.loading")}</div>}
                        {variants?.error && <div className="tag err">{variants.error}</div>}
                        {variants && !variants.error && (variants.variants?.length ?? 0) > 0 && (
                          <table>
                            <thead>
                              <tr>
                                <th>{t("download.variant")}</th>
                                <th>File</th>
                                <th>{t("download.size")}</th>
                                <th style={{ width: 110 }} />
                              </tr>
                            </thead>
                            <tbody>
                              {variants.variants!.map((v) => (
                                <tr key={v.name}>
                                  <td><strong>{v.name}</strong></td>
                                  <td className="mono">{v.primary_file || (v.files || []).join(", ")}</td>
                                  <td className="mono">{gb(v.size_bytes)}</td>
                                  <td>
                                    <button
                                      className="btn sm primary"
                                      disabled={pulling === `${repo}:${v.name}`}
                                      onClick={() => doPull(repo, v.name)}
                                    >
                                      <DownloadCloud size={14} /> {t("download.pull")}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
