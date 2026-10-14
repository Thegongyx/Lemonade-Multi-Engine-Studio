// Engine-driver contract: the process-and-command-line layer that lets a
// llamacpp-recipe model run on an engine other than llama-server (see
// engine_driver.h). Covers the gufo command line, its reserved flags, and the
// GGUF pre-flight that refuses a model the engine cannot load.

#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

#include "lemon/backends/llamacpp/engine_driver.h"

namespace fs = std::filesystem;
using namespace lemon::backends::llamacpp::engine_driver;

namespace {

int failures = 0;

void expect(bool condition, const std::string& label) {
    if (condition) {
        std::cout << "PASS: " << label << std::endl;
    } else {
        std::cout << "FAIL: " << label << std::endl;
        ++failures;
    }
}

bool contains(const std::vector<std::string>& args, const std::string& flag) {
    return std::find(args.begin(), args.end(), flag) != args.end();
}

std::string value_after(const std::vector<std::string>& args, const std::string& flag) {
    for (size_t i = 0; i + 1 < args.size(); ++i) {
        if (args[i] == flag) return args[i + 1];
    }
    return "";
}

void put_u32(std::string& out, std::uint32_t value) {
    for (int i = 0; i < 4; ++i) out.push_back(static_cast<char>((value >> (8 * i)) & 0xFF));
}

void put_u64(std::string& out, std::uint64_t value) {
    for (int i = 0; i < 8; ++i) out.push_back(static_cast<char>((value >> (8 * i)) & 0xFF));
}

void put_string(std::string& out, const std::string& value) {
    put_u64(out, value.size());
    out += value;
}

// A GGUF v3 header with one string KV (general.architecture) and a tensor table.
std::string make_gguf(const std::string& architecture,
                      const std::vector<std::pair<std::string, std::uint32_t>>& tensors) {
    std::string out = "GGUF";
    put_u32(out, 3);
    put_u64(out, tensors.size());
    put_u64(out, 1);
    put_string(out, "general.architecture");
    put_u32(out, 8);  // string
    put_string(out, architecture);
    for (const auto& [name, type] : tensors) {
        put_string(out, name);
        put_u32(out, 2);          // n_dims
        put_u64(out, 256);        // dim 0
        put_u64(out, 256);        // dim 1
        put_u32(out, type);       // ggml type
        put_u64(out, 0);          // payload offset
    }
    return out;
}

void write_file(const fs::path& path, const std::string& bytes) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    out.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
}

std::string throws_message(const std::function<void()>& fn) {
    try {
        fn();
    } catch (const std::exception& e) {
        return e.what();
    }
    return "";
}

}  // namespace

int main() {
    // --- driver properties -------------------------------------------------
    expect(readiness_endpoint("gufo") == "/ready", "gufo reports readiness on /ready");
    expect(readiness_endpoint("llamacpp") == "/health", "llama-server reports readiness on /health");
    expect(rewrites_request_model("gufo"), "gufo needs the request model field rewritten");
    expect(!rewrites_request_model("llamacpp"), "llama-server keeps the request model field");

    // --- gufo command line -------------------------------------------------
    GufoLaunchSpec spec;
    spec.model_path = "C:\\models\\target-00001-of-00004.gguf";
    spec.served_model_name = "user.MyModel";
    spec.mmproj_path = "C:\\models\\mmproj-BF16.gguf";
    spec.draft_path = "C:\\models\\mtp-shared-Q8_0.gguf";
    spec.speculative_mode = "mtp";
    spec.ctx_size = 32768;
    spec.sessions = "2";
    spec.think = "off";
    spec.port = 8123;
    spec.extra_args = "--mtp-policy survival --prompt-lookup";

    const std::vector<std::string> args = build_gufo_args(spec);
    expect(args.size() > 0 && args[0] == "serve", "argv starts with the serve subcommand");
    expect(contains(args, "llm"), "argv names the llm modality");
    expect(value_after(args, "--model") == spec.model_path, "--model carries the target");
    expect(value_after(args, "--served-model-name") == spec.served_model_name,
           "--served-model-name carries the Lemonade model name");
    expect(value_after(args, "--context") == "32768", "--context carries ctx_size");
    expect(value_after(args, "--mmproj") == spec.mmproj_path, "--mmproj carries the sidecar");
    expect(value_after(args, "--speculative") == "mtp", "--speculative carries the mode");
    expect(value_after(args, "--mtp-model") == spec.draft_path, "--mtp-model carries the draft");
    expect(value_after(args, "--think") == "off", "--think carries the reasoning default");
    expect(value_after(args, "--sessions") == "2", "--sessions carries the slot count");
    expect(contains(args, "--prompt-lookup"), "extra arguments are appended");
    expect(value_after(args, "--max-request-bytes") == "33554432",
           "the request body limit is raised for image payloads");

    // A trunk-resident MTP block (Qwen3.6-35B-A3B) has a mode but no sidecar.
    GufoLaunchSpec trunk_mtp = spec;
    trunk_mtp.draft_path.clear();
    trunk_mtp.speculative_mode = "mtp";
    const std::vector<std::string> trunk_args = build_gufo_args(trunk_mtp);
    expect(value_after(trunk_args, "--speculative") == "mtp" &&
               !contains(trunk_args, "--mtp-model"),
           "an in-GGUF MTP block is selected without --mtp-model");

    GufoLaunchSpec minimal;
    minimal.model_path = "/models/main.gguf";
    minimal.served_model_name = "m";
    minimal.port = 8001;
    const std::vector<std::string> minimal_args = build_gufo_args(minimal);
    expect(!contains(minimal_args, "--context"), "an auto ctx_size is omitted (native context)");
    expect(!contains(minimal_args, "--speculative"), "no label means autoregressive");

    // --- reserved flags ----------------------------------------------------
    for (const char* flag : {"--port", "--host", "--model", "--served-model-name",
                             "--api-key", "--context", "--sessions"}) {
        GufoLaunchSpec bad = minimal;
        bad.extra_args = std::string(flag) + " 1";
        expect(!throws_message([&] { build_gufo_args(bad); }).empty(),
               std::string("rejects driver-owned argument ") + flag);
    }

    // --- GGUF pre-flight ---------------------------------------------------
    const fs::path dir = fs::temp_directory_path() / "lemonade_engine_driver_test";
    std::error_code ec;
    fs::remove_all(dir, ec);
    fs::create_directories(dir, ec);

    const std::vector<std::string> gufo_arch = {"qwen4exp", "qwen35moe"};
    const std::vector<std::string> gufo_types = {"F32", "Q8_0", "Q4_K", "IQ3_S"};

    const fs::path ok_path = dir / "ok-00001-of-00001.gguf";
    write_file(ok_path, make_gguf("qwen4exp", {{"token_embd.weight", 8}, {"blk.0.attn_q.weight", 12}}));
    expect(throws_message([&] {
               validate_model("gufo", gufo_arch, gufo_types, ok_path.string(), "m");
           }).empty(),
           "accepts a model whose architecture and tensor types are listed");

    // Empty allowlists (an engine that declares no capabilities) skip the check
    // entirely, so an engine record without them never blocks a load.
    expect(throws_message([&] {
               validate_model("llamacpp", {}, {}, (dir / "missing.gguf").string(), "m");
           }).empty(),
           "no-op when the engine declares no capabilities");

    // Architecture the engine does not implement.
    const fs::path foreign_path = dir / "foreign-00001-of-00001.gguf";
    write_file(foreign_path, make_gguf("llama", {{"token_embd.weight", 8}}));
    const std::string arch_error = throws_message([&] {
        validate_model("gufo", gufo_arch, gufo_types, foreign_path.string(), "m");
    });
    expect(arch_error.find("architecture 'llama'") != std::string::npos,
           "refuses an architecture outside the engine's list");

    // A quantization the engine has no kernels for (e.g. a ROCmFP4 build).
    const fs::path quant_path = dir / "quant-00001-of-00001.gguf";
    write_file(quant_path, make_gguf("qwen4exp", {{"blk.0.attn_q.weight", 108}}));
    const std::string quant_error = throws_message([&] {
        validate_model("gufo", gufo_arch, gufo_types, quant_path.string(), "m");
    });
    expect(quant_error.find("ggml_type_108") != std::string::npos,
           "refuses a quantization the engine does not implement");

    // Sharded models spread their tensors across files: every shard counts.
    const fs::path shard1 = dir / "split-00001-of-00002.gguf";
    const fs::path shard2 = dir / "split-00002-of-00002.gguf";
    write_file(shard1, make_gguf("qwen4exp", {{"token_embd.weight", 8}}));
    write_file(shard2, make_gguf("qwen4exp", {{"per_layer_token_embd.weight", 22}}));
    const std::string shard_error = throws_message([&] {
        validate_model("gufo", gufo_arch, gufo_types, shard1.string(), "m");
    });
    expect(shard_error.find("IQ2_S") != std::string::npos,
           "checks every shard of the model, not only the file it was handed");

    const std::vector<std::string> with_iq2 = {"F32", "Q8_0", "Q4_K", "IQ3_S", "IQ2_S"};
    expect(throws_message([&] {
               validate_model("gufo", gufo_arch, with_iq2, shard1.string(), "m");
           }).empty(),
           "accepts the same shard family once its types are listed");

    fs::remove_all(dir, ec);

    if (failures == 0) {
        std::cout << "All engine-driver tests passed" << std::endl;
        return 0;
    }
    std::cout << failures << " test(s) failed" << std::endl;
    return 1;
}
