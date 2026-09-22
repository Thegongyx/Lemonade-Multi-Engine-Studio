#pragma once

#include "lemon/backends/backend_descriptor.h"

namespace lemon {
namespace backends {
namespace halowin {

// The halowin backend descriptor (plain data). Header-only `inline const` so it
// links into both the lemonade CLI and lemond without a separate source file.
//
// Wraps gfx1151-engine (gdec + gdec-api), a gfx1151-specific MoE inference
// engine. Models are local .hgn bundles discovered from disk, so the recipe is
// dynamic_models: ModelManager asks HalowinOps::discover_models() instead of
// server_models.json.
inline const BackendDescriptor descriptor = {
    /*recipe*/          "halowin",
    /*display_name*/    "HaloWin (gfx1151)",
#ifdef _WIN32
    /*binary*/          "gdec-api-win.exe",
#else
    /*binary*/          "gdec-api",
#endif
    /*config_section*/  "halowin",
    /*default_device*/  DEVICE_GPU,
    /*slot_policy*/     SlotPolicy::Standard,
    /*selectable_backend*/ false,
    /*uses_ctx_size*/   true,
    /*dynamic_models*/  true,  // models come from scanning halowin_models_dir
    /*options*/ {
        {"halowin_args", "--halowin-args", "", "ARGS",
         "Extra arguments passed to the gdec-api OpenAI front-end", "HaloWin Options"},
        {"halowin_engine_args", "--halowin-engine-args", "", "ARGS",
         "Extra arguments passed to the gdec engine", "HaloWin Options"},
        {"halowin_bin_dir", "--halowin-bin-dir", "", "STRING",
         "Directory containing gdec and gdec-api; overrides the installed engine", "HaloWin Options"},
        {"halowin_models_dir", "--halowin-models-dir", "", "STRING",
         "Directory scanned for .hgn model sets", "HaloWin Options"},
    },
    /*support*/ {
        {"win", {"windows"}, {{"amd_gpu", {"gfx1151"}}}, "AMD Radeon 8060S / Strix Halo (gfx1151)"},
    },
    /*supported_modes*/ {"chat"},
    /*required_checkpoints*/ {"main"},
    /*default_capabilities*/ {},
    /*experimental*/    true,
    /*web_display_name*/ "HaloWin",
    /*rocm_channels*/   {},
    /*exposes_prometheus_metrics*/ false,
    /*rocm_requires_cwsr_fix*/ false,
    /*version_policy*/  VersionPolicy::Exact,
    /*self_manages_downloads*/ false,
    /*takes_args*/      false,
    /*arg_variants*/    {},
    /*bin_variants*/    {"win"},
    /*config_extra*/    {{"halowin_models_dir", ""}, {"halowin_bin_dir", ""},
                         {"halowin_args", ""}, {"halowin_engine_args", ""}},
};

}  // namespace halowin
}  // namespace backends
}  // namespace lemon
