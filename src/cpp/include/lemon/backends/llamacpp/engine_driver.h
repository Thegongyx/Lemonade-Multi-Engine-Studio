#pragma once

#include <string>
#include <utility>
#include <vector>

namespace lemon {
namespace backends {
namespace llamacpp {
namespace engine_driver {

// Engines registered in config.json's llamacpp.custom_engines are llama-server
// builds unless their record names another driver. A driver owns four things
// llama-server and gufo disagree on: the command line, the readiness endpoint,
// whether forwarded requests must carry the loaded model's name, and which
// models it can actually load.
inline constexpr const char* kLlamacpp = "llamacpp";
inline constexpr const char* kGufo = "gufo";
// HaloWin keeps a two-process topology (qwenox engine + OpenAI front-end) and its
// own tuning options, so the llamacpp backend delegates to the halowin backend
// instead of building a command line here.
inline constexpr const char* kHalowin = "halowin";

// The HTTP endpoint that returns 200 only once the model is loaded.
std::string readiness_endpoint(const std::string& driver);

// gufo answers 404 for a request whose `model` is not the name it was started
// with; llama-server ignores the field.
bool rewrites_request_model(const std::string& driver);

// Refuse a load the engine cannot serve, before its process is started. Uses the
// engine record's optional "architectures" / "tensor_types" allowlists: the
// GGUF's general.architecture and the union of tensor types across its shard
// group must be listed (an empty allowlist means "no restriction"). Reads GGUF
// headers only — never tensor payloads.
void validate_model(const std::string& engine_name,
                    const std::vector<std::string>& architectures,
                    const std::vector<std::string>& tensor_types,
                    const std::string& gguf_path,
                    const std::string& model_name);

// `gufo serve llm` command line for one engine process. Empty optional fields
// are omitted, and a non-positive ctx_size keeps the model's native context.
struct GufoLaunchSpec {
    std::string model_path;
    std::string served_model_name;
    std::string mmproj_path;
    std::string draft_path;
    std::string speculative_mode;  // "mtp", "dflash2", "dspark", or empty
    int ctx_size = 0;
    std::string sessions;
    std::string think;
    std::string extra_args;
    int port = 0;
};

std::vector<std::string> build_gufo_args(const GufoLaunchSpec& spec);

}  // namespace engine_driver
}  // namespace llamacpp
}  // namespace backends
}  // namespace lemon
