#include "lemon/backends/halowin/halowin_server.h"
#include "lemon/backends/halowin/halowin.h"
#include "lemon/backends/backend_ops.h"
#include "lemon/backends/backend_registry.h"
#include "lemon/backends/backend_utils.h"
#include "lemon/backends/install_staging.h"
#include "lemon/error_types.h"
#include "lemon/model_manager.h"
#include "lemon/runtime_config.h"
#include "lemon/utils/http_client.h"
#include "lemon/utils/path_utils.h"
#include "lemon/utils/process_manager.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <filesystem>
#include <stdexcept>
#include <thread>
#include <utility>
#include <vector>

#include <lemon/utils/aixlog.hpp>

namespace fs = std::filesystem;

namespace lemon {
namespace backends {

namespace {

#ifdef _WIN32
constexpr const char* kEngineExe = "gdec-win.exe";
constexpr const char* kApiExe = "gdec-api-win.exe";
#else
constexpr const char* kEngineExe = "gdec";
constexpr const char* kApiExe = "gdec-api";
#endif

std::string lower_ascii(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return value;
}

// Whitespace splitter that keeps quoted spans intact, so an argument like
// --chat-template-kwargs "{\"x\":1}" survives.
std::vector<std::string> split_args(const std::string& text) {
    std::vector<std::string> out;
    std::string current;
    bool in_quotes = false;
    char quote = 0;
    for (char c : text) {
        if (in_quotes) {
            if (c == quote) in_quotes = false;
            else current += c;
        } else if (c == '"' || c == '\'') {
            in_quotes = true;
            quote = c;
        } else if (std::isspace(static_cast<unsigned char>(c))) {
            if (!current.empty()) {
                out.push_back(current);
                current.clear();
            }
        } else {
            current += c;
        }
    }
    if (!current.empty()) out.push_back(current);
    return out;
}

std::string option_string(const RecipeOptions& options, const std::string& key) {
    if (options.has_option(key)) {
        const json value = options.get_option(key);
        if (value.is_string()) return value.get<std::string>();
        if (!value.is_null()) return value.dump();
    }
    if (auto* cfg = RuntimeConfig::global()) {
        return cfg->backend_string("halowin", key);
    }
    return "";
}

// A `.hgn` bundle: one main weights file plus the optional overlay/MTP/vision
// sidecars and a tokenizer directory, all inside one model folder.
std::vector<ModelInfo> halowin_discover_models() {
    std::vector<ModelInfo> models;

    std::string root;
    if (auto* cfg = RuntimeConfig::global()) {
        root = cfg->backend_string("halowin", "halowin_models_dir");
    }
    if (root.empty()) {
        root = (fs::path(utils::get_hf_cache_dir()) / "halowin").string();
    }

    std::error_code ec;
    const fs::path root_path = utils::path_from_utf8(root);
    if (!fs::is_directory(root_path, ec)) {
        return models;
    }

    for (const auto& entry : fs::directory_iterator(root_path, ec)) {
        if (!entry.is_directory(ec)) continue;
        const fs::path dir = entry.path();

        std::string main;
        std::string overlay;
        std::string mtp;
        std::string vision;
        for (const auto& file : fs::directory_iterator(dir, ec)) {
            if (!file.is_regular_file(ec)) continue;
            const fs::path path = file.path();
            if (lower_ascii(path.extension().string()) != ".hgn") continue;
            const std::string name = lower_ascii(path.filename().string());
            if (name.find("vision") != std::string::npos) {
                if (vision.empty()) vision = utils::path_to_utf8(path);
            } else if (name.find("mtp") != std::string::npos) {
                if (mtp.empty()) mtp = utils::path_to_utf8(path);
            } else if (name.find("overlay") != std::string::npos) {
                if (overlay.empty()) overlay = utils::path_to_utf8(path);
            } else if (main.empty()) {
                main = utils::path_to_utf8(path);
            }
        }
        if (main.empty()) continue;

        const fs::path tokenizer = dir / "tokenizer";
        if (!fs::exists(tokenizer / "tokenizer.json", ec)) continue;

        ModelInfo info;
        info.model_name = dir.filename().string() + "-HaloWin";
        info.recipe = "halowin";
        info.source = "local_path";
        info.suggested = true;
        info.downloaded = true;
        info.type = ModelType::LLM;
        info.device = DEVICE_GPU;
        info.labels.push_back("chat");
        if (!vision.empty()) info.labels.push_back("vision");

        info.checkpoints["main"] = main;
        info.resolved_paths["main"] = main;
        if (!overlay.empty()) {
            info.checkpoints["overlay"] = overlay;
            info.resolved_paths["overlay"] = overlay;
        }
        if (!mtp.empty()) {
            info.checkpoints["mtp"] = mtp;
            info.resolved_paths["mtp"] = mtp;
        }
        if (!vision.empty()) {
            info.checkpoints["vision"] = vision;
            info.resolved_paths["vision"] = vision;
        }
        const std::string tokenizer_dir = utils::path_to_utf8(tokenizer);
        info.checkpoints["tokenizer"] = tokenizer_dir;
        info.resolved_paths["tokenizer"] = tokenizer_dir;

        std::uintmax_t total_bytes = 0;
        for (const auto& [type, path] : info.resolved_paths) {
            std::error_code size_ec;
            const fs::path file = utils::path_from_utf8(path);
            if (fs::is_regular_file(file, size_ec)) {
                total_bytes += fs::file_size(file, size_ec);
            }
        }
        info.size = static_cast<double>(total_bytes) / 1e9;

        models.push_back(std::move(info));
    }

    return models;
}

}  // namespace

InstallParams HalowinServer::get_install_params(const std::string& /*backend*/,
                                                const std::string& /*version*/) {
    InstallParams params;
    params.repo = "IIIIIllllIIIIIlllll/gfx1151-engine";
    params.filename = "release-windows.zip";
    return params;
}

HalowinServer::HalowinServer(const std::string& log_level, ModelManager* model_manager,
                             BackendManager* backend_manager)
    : WrappedServer("HaloWin", log_level, model_manager, backend_manager) {
}

HalowinServer::~HalowinServer() {
    unload();
}

std::string HalowinServer::resolve_binary(bool engine) const {
    const std::string exe = engine ? kEngineExe : kApiExe;

    if (auto* cfg = RuntimeConfig::global()) {
        const std::string bin_dir = cfg->backend_string("halowin", "halowin_bin_dir");
        if (!bin_dir.empty()) {
            std::error_code ec;
            const fs::path candidate = utils::path_from_utf8(bin_dir) / exe;
            if (fs::exists(candidate, ec)) return utils::path_to_utf8(candidate);
        }
    }

    // The standard "*_bin" hook resolves the front-end. The engine lives in the
    // same directory, so reuse that directory when the hook points at a path.
    const std::string external = BackendUtils::find_external_backend_binary("halowin", "win");
    if (!external.empty()) {
        std::error_code ec;
        if (!engine) return external;
        const fs::path candidate = utils::path_from_utf8(external).parent_path() / exe;
        if (fs::exists(candidate, ec)) return utils::path_to_utf8(candidate);
    }

    const std::string install_dir = BackendUtils::get_install_directory("halowin", "win");
    return find_executable_in_dir(install_dir, exe);
}

bool HalowinServer::is_backend_alive() const {
    if (was_watchdog_triggered()) return false;

    const ProcessHandle api_handle = get_process_handle_snapshot();
    if (!has_process_handle(api_handle) || !utils::ProcessManager::is_running(api_handle)) {
        return false;
    }

    std::lock_guard<std::mutex> lock(engine_mutex_);
    return has_process_handle(engine_handle_) &&
           utils::ProcessManager::is_running(engine_handle_);
}

bool HalowinServer::wait_for_halowin_ready(long timeout_seconds) {
    // /health answers as soon as gdec-api is up; /cache only answers 200 once
    // the engine has finished loading the weights (it probes engine state).
    const std::string health_url = get_base_url() + "/health";
    const std::string cache_url = get_base_url() + "/cache";
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(timeout_seconds);

    std::cout << "Waiting for HaloWin engine to load (timeout: " << timeout_seconds << "s)..."
              << std::endl;

    bool api_up = false;
    while (std::chrono::steady_clock::now() < deadline) {
        if (load_cancel_ && load_cancel_->load()) {
            LOG(WARNING, "HaloWin") << "Load cancelled while waiting for readiness" << std::endl;
            return false;
        }

        const ProcessHandle api_handle = get_process_handle_snapshot();
        if (!has_process_handle(api_handle) || !utils::ProcessManager::is_running(api_handle)) {
            LOG(ERROR, "HaloWin") << "gdec-api exited during startup" << std::endl;
            return false;
        }
        {
            std::lock_guard<std::mutex> lock(engine_mutex_);
            if (!has_process_handle(engine_handle_) ||
                !utils::ProcessManager::is_running(engine_handle_)) {
                LOG(ERROR, "HaloWin") << "gdec engine exited during startup" << std::endl;
                return false;
            }
        }

        if (!api_up) {
            api_up = utils::HttpClient::is_reachable(
                health_url, 1, utils::HttpSecurityPolicy::TrustedLoopback);
        }
        if (api_up && utils::HttpClient::is_reachable(
                          cache_url, 1, utils::HttpSecurityPolicy::TrustedLoopback)) {
            LOG(INFO, "HaloWin") << "Engine is ready" << std::endl;
            start_backend_watchdog("/health");
            return true;
        }

        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    LOG(ERROR, "HaloWin") << "Engine did not become ready within " << timeout_seconds
                          << "s (large weights cold-load from disk)" << std::endl;
    return false;
}

void HalowinServer::load(const std::string& model_name,
                         const ModelInfo& model_info,
                         const RecipeOptions& options,
                         bool /*do_not_upgrade*/) {
    LOG(INFO, "HaloWin") << "Loading model: " << model_name << std::endl;

    int ctx_size = options.has_option("ctx_size") ? options.get_option("ctx_size").get<int>() : 0;
    if (ctx_size <= 0) {
        ctx_size = 32768;
        LOG(INFO, "HaloWin") << "No ctx_size given; defaulting to " << ctx_size << std::endl;
    }

    auto model_file = [&](const char* type) -> std::string {
        std::string path = model_info.resolved_path(type);
        if (path.empty()) path = model_info.checkpoint(type);
        std::error_code ec;
        if (!path.empty() && fs::exists(utils::path_from_utf8(path), ec)) return path;
        return "";
    };

    const std::string main_path = model_file("main");
    if (main_path.empty()) {
        throw std::runtime_error(
            "HaloWin model '" + model_name + "' is missing its main .hgn checkpoint");
    }

    std::string tokenizer_dir = model_info.resolved_path("tokenizer");
    if (tokenizer_dir.empty()) tokenizer_dir = model_info.checkpoint("tokenizer");
    if (tokenizer_dir.empty() ||
        !fs::exists(utils::path_from_utf8(tokenizer_dir) / "tokenizer.json")) {
        throw std::runtime_error(
            "HaloWin model '" + model_name +
            "' is missing tokenizer/tokenizer.json (resolved: '" + tokenizer_dir + "')");
    }

    const std::string overlay = model_file("overlay");
    const std::string mtp = model_file("mtp");
    const std::string vision = model_file("vision");

    std::string api_path = resolve_binary(/*engine=*/false);
    std::string engine_path = resolve_binary(/*engine=*/true);
    if (api_path.empty() || engine_path.empty()) {
        try {
            backend_manager_->install_backend("halowin", "win");
        } catch (const std::exception& e) {
            LOG(WARNING, "HaloWin") << "Engine install failed: " << e.what() << std::endl;
        }
        if (api_path.empty()) api_path = resolve_binary(/*engine=*/false);
        if (engine_path.empty()) engine_path = resolve_binary(/*engine=*/true);
    }
    if (api_path.empty()) {
        throw std::runtime_error(
            "HaloWin gdec-api not found. Install the halowin engine or set halowin_bin_dir.");
    }
    if (engine_path.empty()) {
        throw std::runtime_error(
            "HaloWin gdec not found. Install the halowin engine or set halowin_bin_dir.");
    }

    port_ = choose_port();
    engine_port_ = utils::ProcessManager::find_free_port(port_ + 1);
    if (engine_port_ <= 0 || engine_port_ == port_) {
        engine_port_ = utils::ProcessManager::find_free_port(port_ + 2);
    }
    if (engine_port_ <= 0) {
        throw std::runtime_error("Failed to find a free port for the HaloWin engine");
    }

    const std::string workdir =
        utils::path_to_utf8(utils::path_from_utf8(api_path).parent_path());

    const std::vector<std::pair<std::string, std::string>> env = {
        {"GDEC_QSA_KV_BF16", "1"}, {"GDEC_QSA_WMMA", "1"}, {"GDEC_QSA_WMMA_BTV", "1"},
        {"GDEC_MOE_LT", "1"}, {"GDEC_MOE_LT_BF16", "1"}, {"GDEC_GR_BF16", "1"},
        {"GDEC_GDN_STREAM", "1"}, {"GDEC_GDN_WAVE", "1"}, {"GDEC_NOWARMUP", "1"},
        {"GDEC_INDEX_FUSED2", "1"}, {"GDEC_PP_MOE_OUT", "1"},
        {"GDEC_INDEX_STREAM_SELECT", "1"}, {"GDEC_KVSNAP", "1"},
        {"GDEC_KVSNAP_MAX_GB", "20"}, {"GDEC_SPEC_GAMMA", "3"},
    };

    std::vector<std::string> engine_args;
    engine_args.push_back(main_path);
    if (!overlay.empty()) engine_args.push_back(overlay);
    if (!mtp.empty()) engine_args.push_back(mtp);
    engine_args.push_back("--serve");
    engine_args.push_back("--port");
    engine_args.push_back(std::to_string(engine_port_));
    engine_args.push_back("--maxctx");
    engine_args.push_back(std::to_string(ctx_size));
    if (!vision.empty()) {
        engine_args.push_back("--vision-tower");
        engine_args.push_back(vision);
    }
    for (const auto& arg : split_args(option_string(options, "halowin_engine_args"))) {
        engine_args.push_back(arg);
    }

    LOG(INFO, "HaloWin") << "Starting gdec: " << engine_path << std::endl;
    {
        std::lock_guard<std::mutex> lock(engine_mutex_);
        engine_handle_ = utils::ProcessManager::start_process(
            engine_path, engine_args, workdir, is_debug(), false, env);
        if (!has_process_handle(engine_handle_) ||
            !utils::ProcessManager::is_running(engine_handle_)) {
            engine_handle_ = {nullptr, 0};
            throw std::runtime_error("Failed to start the HaloWin gdec engine");
        }
    }

    std::vector<std::string> api_args = {
        "--tokenizer", tokenizer_dir,
        "--engine", "127.0.0.1:" + std::to_string(engine_port_),
        "--host", "127.0.0.1",
        "--port", std::to_string(port_),
        "--context", std::to_string(ctx_size),
    };
    for (const auto& arg : split_args(option_string(options, "halowin_args"))) {
        api_args.push_back(arg);
    }

    LOG(INFO, "HaloWin") << "Starting gdec-api: " << api_path << std::endl;
    const ProcessHandle api_handle = utils::ProcessManager::start_process(
        api_path, api_args, workdir, is_debug(), true, env);
    set_process_handle(api_handle, api_path, api_args);
    if (!has_process_handle(api_handle) || !utils::ProcessManager::is_running(api_handle)) {
        const ProcessHandle dead = consume_process_handle_for_cleanup();
        if (has_process_handle(dead)) utils::ProcessManager::stop_process(dead);
        stop_engine();
        throw std::runtime_error("Failed to start the HaloWin gdec-api front-end");
    }

    if (!wait_for_halowin_ready(1800)) {
        unload();
        throw std::runtime_error("HaloWin engine failed to become ready");
    }

    is_loaded_ = true;
    LOG(INFO, "HaloWin") << "Model loaded; OpenAI front-end on port " << port_ << std::endl;
}

void HalowinServer::stop_engine() {
    std::lock_guard<std::mutex> lock(engine_mutex_);
    if (has_process_handle(engine_handle_)) {
        utils::ProcessManager::stop_process(engine_handle_);
        engine_handle_ = {nullptr, 0};
    }
    engine_port_ = 0;
}

void HalowinServer::unload() {
    stop_backend_watchdog();
    LOG(INFO, "HaloWin") << "Unloading model..." << std::endl;

    // Stop the front-end first so nothing new reaches the engine as it goes down.
    const ProcessHandle api_handle = consume_process_handle_for_cleanup();
    if (has_process_handle(api_handle)) {
        utils::ProcessManager::stop_process(api_handle);
    }

    stop_engine();
    is_loaded_ = false;
}

json HalowinServer::chat_completion(const json& request) {
    if (!is_loaded_) {
        throw ModelNotLoadedException(server_name_);
    }
    return forward_request("/v1/chat/completions", request);
}

json HalowinServer::completion(const json& request) {
    if (!is_loaded_) {
        throw ModelNotLoadedException(server_name_);
    }
    return forward_request("/v1/completions", request);
}

json HalowinServer::responses(const json& request) {
    if (!is_loaded_) {
        throw ModelNotLoadedException(server_name_);
    }
    return forward_request("/v1/responses", request);
}

namespace halowin {

std::unique_ptr<WrappedServer> create(const BackendContext& ctx) {
    return make_server<HalowinServer>(ctx);
}

namespace {

// HaloWin model-management behavior: models come from scanning the local
// models directory for .hgn bundles, so discovery is the whole policy.
class HalowinOps : public BackendOps {
public:
    std::vector<ModelInfo> discover_models(const BackendOpsContext&) const override {
        return halowin_discover_models();
    }

    bool is_downloaded(const ModelInfo& info, const BackendOpsContext&) const override {
        std::string main = info.resolved_path("main");
        if (main.empty()) main = info.checkpoint("main");
        std::error_code ec;
        return !main.empty() && fs::exists(utils::path_from_utf8(main), ec);
    }
};

}  // namespace

const BackendSpec* spec() { return make_spec<HalowinServer>(descriptor); }
const BackendOps* ops() { return single_ops<HalowinOps>(); }

}  // namespace halowin

}  // namespace backends
}  // namespace lemon
