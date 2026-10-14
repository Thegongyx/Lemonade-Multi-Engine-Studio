#include "lemon/backends/llamacpp/engine_driver.h"

#include "lemon/gguf_shard_utils.h"
#include "lemon/utils/custom_args.h"
#include "lemon/utils/path_utils.h"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <set>
#include <stdexcept>

namespace fs = std::filesystem;

namespace lemon {
namespace backends {
namespace llamacpp {
namespace engine_driver {

namespace {

std::string lower_ascii(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return value;
}

bool listed(const std::vector<std::string>& allowlist, const std::string& value) {
    const std::string needle = lower_ascii(value);
    return std::any_of(allowlist.begin(), allowlist.end(), [&](const std::string& item) {
        return lower_ascii(item) == needle;
    });
}

std::string join_list(const std::vector<std::string>& items) {
    std::string out;
    for (const auto& item : items) {
        if (!out.empty()) out += ", ";
        out += item;
    }
    return out;
}

// ggml_type ids these engines use, for readable messages. Unknown ids are
// reported numerically so a newer quant still names itself.
const char* ggml_type_name(std::uint32_t type) {
    switch (type) {
        case 0: return "F32";
        case 1: return "F16";
        case 2: return "Q4_0";
        case 3: return "Q4_1";
        case 6: return "Q5_0";
        case 7: return "Q5_1";
        case 8: return "Q8_0";
        case 9: return "Q8_1";
        case 10: return "Q2_K";
        case 11: return "Q3_K";
        case 12: return "Q4_K";
        case 13: return "Q5_K";
        case 14: return "Q6_K";
        case 15: return "Q8_K";
        case 16: return "IQ2_XXS";
        case 17: return "IQ2_XS";
        case 18: return "IQ3_XXS";
        case 19: return "IQ1_S";
        case 20: return "IQ4_NL";
        case 21: return "IQ3_S";
        case 22: return "IQ2_S";
        case 23: return "IQ4_XS";
        case 24: return "I8";
        case 25: return "I16";
        case 26: return "I32";
        case 27: return "I64";
        case 28: return "F64";
        case 29: return "IQ1_M";
        case 30: return "BF16";
        case 34: return "TQ1_0";
        case 35: return "TQ2_0";
        default: return nullptr;
    }
}

std::string type_label(std::uint32_t type) {
    const char* name = ggml_type_name(type);
    return name != nullptr ? std::string(name) : ("ggml_type_" + std::to_string(type));
}

struct GgufHeaderScan {
    bool ok = false;
    std::string error;
    std::string architecture;
    std::set<std::string> tensor_types;
};

std::uint64_t read_le(std::istream& in, int bytes, bool* ok) {
    std::uint64_t value = 0;
    unsigned char buffer[8] = {};
    if (bytes <= 0 || bytes > 8 || !in.read(reinterpret_cast<char*>(buffer), bytes)) {
        *ok = false;
        return 0;
    }
    for (int i = 0; i < bytes; ++i) {
        value |= static_cast<std::uint64_t>(buffer[i]) << (8 * i);
    }
    return value;
}

int scalar_size(std::uint32_t type) {
    switch (type) {
        case 0: case 1: case 7: return 1;   // u8, i8, bool
        case 2: case 3: return 2;           // u16, i16
        case 4: case 5: case 6: return 4;   // u32, i32, f32
        case 10: case 11: case 12: return 8; // u64, i64, f64
        default: return 0;                   // string (8) / array (9) handled apart
    }
}

bool skip_value(std::istream& in, std::uint32_t type) {
    bool ok = true;
    const int size = scalar_size(type);
    if (size > 0) {
        in.seekg(size, std::ios::cur);
        return static_cast<bool>(in);
    }
    if (type == 8) {
        const std::uint64_t length = read_le(in, 8, &ok);
        if (!ok) return false;
        in.seekg(static_cast<std::streamoff>(length), std::ios::cur);
        return static_cast<bool>(in);
    }
    if (type == 9) {
        const std::uint32_t element_type = static_cast<std::uint32_t>(read_le(in, 4, &ok));
        const std::uint64_t count = read_le(in, 8, &ok);
        if (!ok) return false;
        if (element_type == 8) {
            for (std::uint64_t i = 0; i < count; ++i) {
                const std::uint64_t length = read_le(in, 8, &ok);
                if (!ok) return false;
                in.seekg(static_cast<std::streamoff>(length), std::ios::cur);
                if (!in) return false;
            }
            return true;
        }
        const int element_size = scalar_size(element_type);
        if (element_size == 0) return false;
        // Guard the multiplication before seeking: a malformed count must not
        // wrap into a negative stream offset.
        if (count > (std::uint64_t{1} << 40) / static_cast<std::uint64_t>(element_size)) {
            return false;
        }
        in.seekg(static_cast<std::streamoff>(count * static_cast<std::uint64_t>(element_size)),
                 std::ios::cur);
        return static_cast<bool>(in);
    }
    return false;
}

GgufHeaderScan scan_gguf_header(const std::string& path) {
    GgufHeaderScan scan;
    std::ifstream in(lemon::utils::path_from_utf8(path), std::ios::binary);
    if (!in) {
        scan.error = "cannot open " + path;
        return scan;
    }

    char magic[4] = {};
    if (!in.read(magic, 4) || std::memcmp(magic, "GGUF", 4) != 0) {
        scan.error = "not a GGUF file: " + path;
        return scan;
    }

    bool ok = true;
    const std::uint32_t version = static_cast<std::uint32_t>(read_le(in, 4, &ok));
    const std::uint64_t tensor_count = read_le(in, 8, &ok);
    const std::uint64_t kv_count = read_le(in, 8, &ok);
    if (!ok || (version != 2 && version != 3)) {
        scan.error = "unsupported GGUF version in " + path;
        return scan;
    }
    if (tensor_count > (std::uint64_t{1} << 32) || kv_count > (std::uint64_t{1} << 32)) {
        scan.error = "implausible GGUF header in " + path;
        return scan;
    }

    for (std::uint64_t i = 0; i < kv_count; ++i) {
        const std::uint64_t key_length = read_le(in, 8, &ok);
        if (!ok || key_length > 4096) {
            scan.error = "malformed key in " + path;
            return scan;
        }
        std::string key(static_cast<std::size_t>(key_length), '\0');
        if (key_length > 0 && !in.read(&key[0], static_cast<std::streamsize>(key_length))) {
            scan.error = "truncated KV header in " + path;
            return scan;
        }
        const std::uint32_t value_type = static_cast<std::uint32_t>(read_le(in, 4, &ok));
        if (!ok) {
            scan.error = "truncated KV header in " + path;
            return scan;
        }

        if (key == "general.architecture" && value_type == 8) {
            const std::uint64_t length = read_le(in, 8, &ok);
            if (ok && length > 0 && length < 256) {
                std::string value(static_cast<std::size_t>(length), '\0');
                if (in.read(&value[0], static_cast<std::streamsize>(length))) {
                    while (!value.empty() &&
                           (value.back() == '\0' || value.back() == '\n' || value.back() == '\r')) {
                        value.pop_back();
                    }
                    scan.architecture = lower_ascii(value);
                }
            }
            continue;
        }
        if (!skip_value(in, value_type)) {
            scan.error = "malformed value for '" + key + "' in " + path;
            return scan;
        }
    }

    for (std::uint64_t i = 0; i < tensor_count; ++i) {
        const std::uint64_t name_length = read_le(in, 8, &ok);
        if (!ok || name_length > 4096) {
            scan.error = "malformed tensor name in " + path;
            return scan;
        }
        in.seekg(static_cast<std::streamoff>(name_length), std::ios::cur);
        const std::uint32_t dims = static_cast<std::uint32_t>(read_le(in, 4, &ok));
        if (!ok || dims > 4) {
            scan.error = "malformed tensor shape in " + path;
            return scan;
        }
        in.seekg(static_cast<std::streamoff>(dims) * 8, std::ios::cur);
        const std::uint32_t type = static_cast<std::uint32_t>(read_le(in, 4, &ok));
        read_le(in, 8, &ok);  // payload offset
        if (!ok) {
            scan.error = "truncated tensor table in " + path;
            return scan;
        }
        scan.tensor_types.insert(type_label(type));
    }

    scan.ok = true;
    return scan;
}

// The model's GGUF files: the shard family of `gguf_path` when it is sharded, so
// a header-only shard (some releases put every tensor in the later shards) still
// contributes its tensors to the check.
std::vector<std::string> shard_family_files(const std::string& gguf_path) {
    std::vector<std::string> files{gguf_path};
    const fs::path path = lemon::utils::path_from_utf8(gguf_path);
    const std::string filename = path.filename().string();

    std::string base;
    int total = 0;
    if (!lemon::is_gguf_shard_filename(filename, &base, &total)) {
        return files;
    }

    std::error_code ec;
    for (const auto& entry : fs::directory_iterator(path.parent_path(), ec)) {
        if (ec || !entry.is_regular_file(ec)) continue;
        const std::string sibling = entry.path().filename().string();
        if (sibling == filename) continue;
        if (!lemon::same_shard_family(sibling, base, total)) continue;
        files.push_back(lemon::utils::path_to_utf8(entry.path()));
    }
    return files;
}

}  // namespace

std::string readiness_endpoint(const std::string& driver) {
    // gufo binds its port immediately and reports 503 on /ready until the model
    // is resident; llama-server answers /health only after loading.
    return driver == kGufo ? "/ready" : "/health";
}

bool rewrites_request_model(const std::string& driver) {
    return driver == kGufo;
}

void validate_model(const std::string& engine_name,
                    const std::vector<std::string>& architectures,
                    const std::vector<std::string>& tensor_types,
                    const std::string& gguf_path,
                    const std::string& model_name) {
    if (architectures.empty() && tensor_types.empty()) {
        return;
    }

    std::set<std::string> observed_types;
    std::string architecture;
    bool have_headers = false;

    for (const auto& file : shard_family_files(gguf_path)) {
        const GgufHeaderScan scan = scan_gguf_header(file);
        if (!scan.ok) {
            std::error_code ec;
            if (!fs::exists(lemon::utils::path_from_utf8(file), ec)) {
                continue;  // a missing sibling shard is reported as not-downloaded elsewhere
            }
            throw std::invalid_argument("Engine '" + engine_name + "' cannot check model '" +
                                        model_name + "': " + scan.error);
        }
        have_headers = true;
        if (architecture.empty()) architecture = scan.architecture;
        observed_types.insert(scan.tensor_types.begin(), scan.tensor_types.end());
    }

    if (!have_headers) {
        return;
    }

    if (!architectures.empty() && !architecture.empty() && !listed(architectures, architecture)) {
        throw std::invalid_argument(
            "Engine '" + engine_name + "' does not run models of architecture '" + architecture +
            "' (model: " + model_name + "; supported: " + join_list(architectures) +
            "). Pick another engine for this model, or register this engine with a matching "
            "'architectures' list in config.json.");
    }

    if (!tensor_types.empty()) {
        std::vector<std::string> unsupported;
        for (const auto& type : observed_types) {
            if (!listed(tensor_types, type)) unsupported.push_back(type);
        }
        if (!unsupported.empty()) {
            throw std::invalid_argument(
                "Engine '" + engine_name + "' does not support the quantization of model '" +
                model_name + "' (unsupported tensor types: " + join_list(unsupported) +
                "; supported: " + join_list(tensor_types) +
                "). Pick a llama.cpp engine for this model.");
        }
    }
}

std::vector<std::string> build_gufo_args(const GufoLaunchSpec& spec) {
    // Flags the driver owns; gufo parses left to right, so a later value would
    // silently redirect the server away from the port Lemonade proxies.
    static const std::set<std::string> reserved = {
        "-m", "--model", "-i", "--host", "-p", "--port", "--served-model-name",
        "--api-key", "-c", "--context", "-j", "--sessions",
    };

    const std::string validation_error = lemon::utils::validate_custom_args(spec.extra_args, reserved);
    if (!validation_error.empty()) {
        throw std::invalid_argument("Invalid custom gufo arguments:\n" + validation_error);
    }

    std::vector<std::string> args = {
        "serve",
        "--host", "127.0.0.1",
        "--port", std::to_string(spec.port),
        // gufo defaults to an 8 MiB request body; conversations carrying base64
        // images need more (its own Flash-Next recipe uses 32 MiB). A later
        // --max-request-bytes in gufo_args overrides this.
        "--max-request-bytes", "33554432",
    };
    if (!spec.sessions.empty()) {
        args.insert(args.end(), {"--sessions", spec.sessions});
    }

    args.push_back("llm");
    args.insert(args.end(), {"--model", spec.model_path});
    args.insert(args.end(), {"--served-model-name", spec.served_model_name});
    if (spec.ctx_size > 0) {
        args.insert(args.end(), {"--context", std::to_string(spec.ctx_size)});
    }
    if (!spec.mmproj_path.empty()) {
        args.insert(args.end(), {"--mmproj", spec.mmproj_path});
    }
    if (!spec.speculative_mode.empty()) {
        args.insert(args.end(), {"--speculative", spec.speculative_mode});
        if (!spec.draft_path.empty()) {
            const char* flag = spec.speculative_mode == "dflash2" ? "--dflash-model"
                              : spec.speculative_mode == "dspark"  ? "--dspark-model"
                                                                  : "--mtp-model";
            args.insert(args.end(), {flag, spec.draft_path});
        }
    }
    if (!spec.think.empty()) {
        args.insert(args.end(), {"--think", spec.think});
    }

    const std::vector<std::string> extra = lemon::utils::parse_custom_args(spec.extra_args);
    args.insert(args.end(), extra.begin(), extra.end());
    return args;
}

}  // namespace engine_driver
}  // namespace llamacpp
}  // namespace backends
}  // namespace lemon
