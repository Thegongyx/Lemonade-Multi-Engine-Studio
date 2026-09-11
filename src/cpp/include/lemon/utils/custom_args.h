#pragma once

#include <algorithm>
#include <functional>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace lemon {
namespace utils {

inline std::vector<std::string> parse_custom_args(const std::string& custom_args_str, bool keep_quotes = false) {
    std::vector<std::string> result;
    if (custom_args_str.empty()) {
        return result;
    }

    std::string current_arg;
    bool in_quotes = false;
    char quote_char = '\0';

    // Quotes inside a JSON value ({"a":"b"} / --flag={"a":"b"}) are part of the
    // value, not shell grouping, so they must survive. Grouping quotes around a
    // whole token (e.g. a path with spaces) are still stripped.
    auto json_like = [&]() -> bool {
        if (current_arg.empty()) return false;
        if (current_arg[0] == '{' || current_arg[0] == '[') return true;
        return current_arg.find("={") != std::string::npos ||
               current_arg.find("=[") != std::string::npos;
    };

    for (char c : custom_args_str) {
        if (!in_quotes && (c == '"' || c == '\'')) {
            in_quotes = true;
            quote_char = c;
            if (json_like()) {
                current_arg += c;
            }
        } else if (in_quotes && c == quote_char) {
            in_quotes = false;
            if (keep_quotes || json_like()) {
                current_arg += c;
            }
            quote_char = '\0';
        } else if (!in_quotes && c == ' ') {
            if (!current_arg.empty()) {
                result.push_back(current_arg);
                current_arg.clear();
            }
        } else {
            current_arg += c;
        }
    }

    if (!current_arg.empty()) {
        result.push_back(current_arg);
    }

    return result;
}

using CustomArgsMap = std::map<std::string, std::vector<std::vector<std::string>>>;

// Canonical llama.cpp flag for alias dedup. Known aliases (short flags and
// underscore spellings) map to one canonical long flag, so a hand-written
// --temperature collapses with a default --temp during the precedence merge
// (the higher-precedence layer wins). Unknown flags pass through unchanged.
inline std::string canonicalize_llamacpp_flag(const std::string& flag) {
    static const std::map<std::string, std::string> aliases = {
        {"-m", "--model"}, {"-c", "--ctx-size"},
        {"-t", "--threads"}, {"-tb", "--threads-batch"},
        {"-b", "--batch-size"}, {"-ub", "--ubatch-size"},
        {"-ngl", "--n-gpu-layers"}, {"--gpu-layers", "--n-gpu-layers"},
        {"-fa", "--flash-attn"}, {"--flash_attn", "--flash-attn"},
        {"-np", "--parallel"}, {"-n", "--n-predict"},
        {"-dev", "--device"}, {"-md", "--model-draft"},
        {"--spec-draft-model", "--model-draft"}, {"-mm", "--mmproj"},
        {"-ctk", "--cache-type-k"}, {"-ctv", "--cache-type-v"},
        {"--temp", "--temperature"},
        {"--top_p", "--top-p"}, {"--top_k", "--top-k"},
        {"--min_p", "--min-p"},
        {"--repeat_penalty", "--repeat-penalty"},
        {"--presence_penalty", "--presence-penalty"},
        {"--frequency_penalty", "--frequency-penalty"},
        {"--tfs_z", "--tfs-z"}, {"--typical_p", "--typical-p"},
    };
    const auto it = aliases.find(flag);
    return it == aliases.end() ? flag : it->second;
}

using FlagCanonicalizer = std::function<std::string(const std::string&)>;

inline CustomArgsMap build_custom_args_map(const std::vector<std::string>& tokens,
                                           const FlagCanonicalizer& canonicalize = nullptr) {
    CustomArgsMap result;
    std::string last_flag;  // Track the most recently seen flag independently of map ordering

    // Detect a complete negative number so it's treated as a value, not a flag.
    auto is_negative_number = [](const std::string& token) -> bool {
        if (token.size() < 2 || token[0] != '-') {
            return false;
        }
        size_t i = 1;
        bool has_digits = false;
        while (i < token.size() && token[i] >= '0' && token[i] <= '9') {
            has_digits = true;
            ++i;
        }
        if (i < token.size() && token[i] == '.') {
            ++i;
            while (i < token.size() && token[i] >= '0' && token[i] <= '9') {
                has_digits = true;
                ++i;
            }
        }
        if (!has_digits) {
            return false;
        }
        if (i < token.size() && (token[i] == 'e' || token[i] == 'E')) {
            ++i;
            if (i < token.size() && (token[i] == '-' || token[i] == '+')) {
                ++i;
            }
            bool has_exp_digits = false;
            while (i < token.size() && token[i] >= '0' && token[i] <= '9') {
                has_exp_digits = true;
                ++i;
            }
            if (!has_exp_digits) {
                return false;
            }
        }
        return i == token.size();
    };

    for (const auto& token : tokens) {
        if (!token.empty() && token[0] == '-' && !is_negative_number(token)) {
            // This is a flag; start a new entry. Normalize --flag=value so it
            // has the same precedence key as --flag value, then canonicalize
            // aliases so they collapse to one key.
            std::string key = token;
            std::string inline_value;
            bool has_inline = false;
            size_t eq_pos = token.find('=');
            if (eq_pos != std::string::npos) {
                key = token.substr(0, eq_pos);
                inline_value = token.substr(eq_pos + 1);
                has_inline = true;
            }
            if (canonicalize) {
                key = canonicalize(key);
            }
            last_flag = key;
            if (has_inline) {
                result[key].push_back({inline_value});
            } else {
                result[key].push_back({});
            }
        } else if (!last_flag.empty()) {
            // Append to the most recently seen flag
            result[last_flag].back().push_back(token);
        }
    }

    return result;
}

inline std::string validate_custom_args(const std::string& custom_args_str, const std::set<std::string>& reserved_flags) {
    std::vector<std::string> custom_args = parse_custom_args(custom_args_str);

    for (const auto& arg : custom_args) {
        std::string flag = arg;
        size_t eq_pos = flag.find('=');
        if (eq_pos != std::string::npos) {
            flag = flag.substr(0, eq_pos);
        }

        if (!flag.empty() && flag[0] == '-' && reserved_flags.find(flag) != reserved_flags.end()) {
            std::string reserved_list;
            for (const auto& reserved_flag : reserved_flags) {
                if (!reserved_list.empty()) {
                    reserved_list += ", ";
                }
                reserved_list += reserved_flag;
            }

            return "Argument '" + flag + "' is managed by Lemonade and cannot be overridden.\n"
                   "Reserved arguments: " + reserved_list;
        }
    }

    return "";
}

inline bool custom_args_has_flag(const std::vector<std::string>& tokens,
                                 const std::string& flag) {
    for (const auto& arg : tokens) {
        std::string token = arg;
        size_t eq_pos = token.find('=');
        if (eq_pos != std::string::npos) {
            token = token.substr(0, eq_pos);
        }
        if (token == flag) {
            return true;
        }
    }
    return false;
}

inline std::string map_to_args_string(const CustomArgsMap& m) {
    std::string result;
    bool first = true;
    for (const auto& [flag, occurrences] : m) {
        for (const auto& values : occurrences) {
            if (!first) result += " ";
            first = false;
            result += flag;
            for (const auto& v : values) {
                result += " " + v;
            }
        }
    }
    return result;
}

// Given a flag like "--flag" or "--no-flag", return the negation key.
// "--no-<name>" ↔ "--<name>". Returns empty string if no negation exists.
inline std::string negate_flag(const std::string& flag) {
    if (flag.size() >= 5 && flag.compare(0, 5, "--no-") == 0) {
        return "--" + flag.substr(5);
    }
    if (flag.size() >= 3 && flag.compare(0, 2, "--") == 0) {
        return "--no-" + flag.substr(2);
    }
    return "";
}

inline CustomArgsMap merge_args_maps(
    const CustomArgsMap& target,
    const CustomArgsMap& incoming) {
    CustomArgsMap merged = target;

    // Remove binary-flag negations from incoming that conflict with target.
    // Only flags without arguments are considered binary flags.
    for (const auto& [flag, occurrences] : incoming) {
        bool is_binary = std::all_of(
            occurrences.begin(), occurrences.end(),
            [](const std::vector<std::string>& values) {
                return values.empty();
            });
        if (is_binary) {
            std::string neg = negate_flag(flag);
            if (!neg.empty() && merged.count(neg)) {
                // Target has the opposite binary flag — skip this incoming flag
                continue;
            }
        }
        if (!merged.count(flag)) {
            merged[flag] = occurrences;
        }
    }
    return merged;
}

} // namespace utils
} // namespace lemon
