#pragma once

#include "lemon/backends/backend_registry.h"

#include "lemon/wrapped_server.h"
#include "lemon/backends/backend_utils.h"
#include <string>

namespace lemon {
namespace backends {

// Wraps gfx1151-engine: a gdec engine process (line protocol on its own port)
// plus a gdec-api OpenAI front-end that Lemonade forwards requests to.
//
// WrappedServer tracks a single child process, so the base handle holds the
// gdec-api process (watchdog/eviction) while the engine handle is owned here and
// torn down alongside it.
class HalowinServer : public WrappedServer {
public:
    static InstallParams get_install_params(const std::string& backend, const std::string& version);

    // Locate the gdec engine (engine=true) or gdec-api front-end (engine=false):
    // the halowin_bin_dir override, then the standard *_bin hook, then the
    // installed release. Also used by the /engines listing.
    static std::string resolve_engine_binary(bool engine);

    HalowinServer(const std::string& log_level, ModelManager* model_manager = nullptr,
                  BackendManager* backend_manager = nullptr);

    ~HalowinServer() override;

    void load(const std::string& model_name,
              const ModelInfo& model_info,
              const RecipeOptions& options,
              bool do_not_upgrade = false) override;

    void unload() override;

    bool is_backend_alive() const override;

    json chat_completion(const json& request) override;
    json completion(const json& request) override;
    json responses(const json& request) override;

private:
    // Block until gdec-api answers and the gdec engine reports ready.
    bool wait_for_halowin_ready(long timeout_seconds);
    void stop_engine();

    ProcessHandle engine_handle_{nullptr, 0};
    mutable std::mutex engine_mutex_;
    int engine_port_ = 0;
    bool is_loaded_ = false;
};

namespace halowin {
// Factory for the halowin backend (constructs the server class — lemond only).
std::unique_ptr<WrappedServer> create(const BackendContext& ctx);
const BackendSpec* spec();
const BackendOps* ops();
constexpr uint32_t capabilities() { return capability_mask_of<HalowinServer>(); }
}  // namespace halowin

}  // namespace backends
}  // namespace lemon
