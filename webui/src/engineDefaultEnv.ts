// Default environment variables for engines that need them.
//
// Shown (prefilled) in the model config "environment variables" box when that engine is
// selected. A user edit is sticky: once the box has been changed or saved, these defaults
// are no longer forced. One KEY=VALUE per line; '#'/blank lines are ignored by the server.

const STRIXLLAMA_ENV = [
  // MMB / hyper-connection gates (HIP). LLAMA_MMB_HC16=0 must stay 0.
  "LLAMA_MMB=1",
  "LLAMA_MMB_MIN_T=512",
  "LLAMA_MMB_BF16W=1",
  "LLAMA_MMB_GLU=1",
  "LLAMA_MMB_TALL=2",
  "LLAMA_MMB_CACHE=4",
  "LLAMA_MMB_F32SPLIT=2",
  "LLAMA_MMB_HC16=0",
  "LLAMA_MMB_SHADOW=2",
  "LLAMA_MMB_DOWN16=1",
  "LLAMA_HC_CN_SHAPE=1",
  "LLAMA_HC_GATEMIX=1",
  "LLAMA_HC_MIX_FUSE=1",
  "LLAMA_HC_BLK16=1",
  "LLAMA_HC_RES16=1",
  "LLAMA_HC_PACK_DI=1",
  "LLAMA_NORM_GATED=1",
  "LLAMA_NORM_ROWS=1",
  "LLAMA_IDX_RELU_SUM=1",
  "LLAMA_PLE_CONV=1",
  "LLAMA_GDN_CONV=1",
  // MTP draft batch cap (must be below the target ubatch or the draft load OOMs).
  "STRIX_SPEC_DRAFT_UBATCH=2048",
  "LLAMA_MTP_QSA=1",
  // Sparse attention (QSA) gates.
  "LLAMA_QSA_SPARSE=1",
  "LLAMA_QSA_BLOCK_SELECTION=1",
  "LLAMA_QSA_COMPACT_METADATA=1",
  "LLAMA_QSA_DENSE_SHORTCUT=1",
  "LLAMA_QSA_DIRECT_INDICES=1",
  "LLAMA_QSA_FA_V3=1",
  "LLAMA_QSA_FUSE_EXPAND=1",
  "LLAMA_QSA_NO_DENSE_MASK=1",
  "LLAMA_QSA_PACK_KEYS=1",
  "LLAMA_QSA_PACK_VALUES=1",
  "LLAMA_QSA_SCORE_BOUNDS=1",
  "LLAMA_QSA_WHOLE_ATTN=1",
  "LLAMA_QSA_DECODE_GATHER=1",
  "LLAMA_QSA_BLOCK_KEY_CACHE=1",
  "LLAMA_QSA_QUERY_STRIP=512",
].join("\n");

export const ENGINE_DEFAULT_ENV: Record<string, string> = {
  // ROCmFPX official Vulkan build ships the Charlie ROCmFP4 plugin; point the loader at it
  // so the ROCmFPXVulkan0 device appears (then pick device ROCmFPXVulkan0).
  vulkan_official: "ROCMFPX_PLUGIN_PATH=rocmfpx-vulkan-plugin.dll",
  // CM1 variant: cooperative-matrix path on the normal Vulkan0 device. Do NOT also set
  // ROCMFPX_PLUGIN_PATH here - the two fast paths are mutually exclusive.
  vulkan_official_cm1: "GGML_VK_ROCMFP4_COOPMAT=1",
  // strixllama (qwen4exp) HIP build: the measured gate set.
  roc_strixllama: STRIXLLAMA_ENV,
};

export function defaultEnvFor(engineId: string): string {
  return ENGINE_DEFAULT_ENV[engineId] ?? "";
}
