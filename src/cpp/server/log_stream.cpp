#include "lemon/log_stream.h"

#include <string>
#include <utility>

namespace lemon {

namespace {

// llama-server / ROCm emit localized (e.g. GBK) text on Chinese Windows, which is
// not valid UTF-8. nlohmann::json::dump() throws on such bytes, so an
// unsanitized log line used to turn every log read (and any error response
// carrying that text) into a bodiless 500. Replace invalid sequences with '?'.
std::string sanitize_utf8(const std::string& in) {
    std::string out;
    out.reserve(in.size());
    size_t i = 0;
    while (i < in.size()) {
        const unsigned char c = static_cast<unsigned char>(in[i]);
        size_t len = 0;
        if (c < 0x80) {
            len = 1;
        } else if ((c & 0xE0) == 0xC0) {
            len = 2;
        } else if ((c & 0xF0) == 0xE0) {
            len = 3;
        } else if ((c & 0xF8) == 0xF0) {
            len = 4;
        } else {
            out += '?';
            ++i;
            continue;
        }
        if (i + len > in.size()) {
            out += '?';
            ++i;
            continue;
        }
        bool valid = true;
        for (size_t k = 1; k < len; ++k) {
            if ((static_cast<unsigned char>(in[i + k]) & 0xC0) != 0x80) {
                valid = false;
                break;
            }
        }
        if (!valid) {
            out += '?';
            ++i;
            continue;
        }
        out.append(in, i, len);
        i += len;
    }
    return out;
}

}  // namespace

json LogStreamEntry::to_json() const {
    return {
        {"seq", seq},
        {"timestamp", timestamp},
        {"severity", severity},
        {"tag", tag},
        {"line", line},
    };
}

LogStreamHub& LogStreamHub::instance() {
    static LogStreamHub hub;
    return hub;
}

std::string LogStreamHub::subscribe_with_snapshot(
    SubscriberCallback callback,
    std::optional<uint64_t> after_seq,
    std::vector<LogStreamEntry>& out_snapshot) {
    std::lock_guard<std::mutex> lock(mutex_);

    out_snapshot.clear();
    out_snapshot.reserve(entries_.size());
    for (const auto& entry : entries_) {
        if (!after_seq.has_value() || entry.seq > *after_seq) {
            out_snapshot.push_back(entry);
        }
    }

    std::string subscriber_id = next_subscriber_id();
    subscribers_.emplace(subscriber_id, std::move(callback));
    return subscriber_id;
}

void LogStreamHub::remove_subscriber(const std::string& subscriber_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    subscribers_.erase(subscriber_id);
}

void LogStreamHub::publish(const AixLog::Metadata& metadata, const std::string& formatted_line) {
    LogStreamEntry entry;
    entry.timestamp = resolve_timestamp(metadata);
    entry.severity = AixLog::to_string(metadata.severity);
    entry.tag = sanitize_utf8(resolve_tag(metadata));
    entry.line = sanitize_utf8(formatted_line);

    std::vector<SubscriberCallback> callbacks;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        entry.seq = next_seq_++;
        entries_.push_back(entry);
        while (entries_.size() > kMaxRetainedEntries) {
            entries_.pop_front();
        }

        callbacks.reserve(subscribers_.size());
        for (const auto& [_, callback] : subscribers_) {
            callbacks.push_back(callback);
        }
    }

    // Invoke callbacks outside the lock to avoid deadlocking if a callback
    // ends up logging (which would re-enter publish via the HubPublishingSink).
    for (const auto& callback : callbacks) {
        callback(entry);
    }
}

std::string LogStreamHub::next_subscriber_id() {
    return "log-sub-" + std::to_string(next_subscriber_++);
}

std::string LogStreamHub::resolve_tag(const AixLog::Metadata& metadata) {
    if (metadata.tag) {
        return metadata.tag.text;
    }
    if (metadata.function) {
        return metadata.function.name;
    }
    return "log";
}

std::string LogStreamHub::resolve_timestamp(const AixLog::Metadata& metadata) {
    if (metadata.timestamp) {
        return metadata.timestamp.to_string("%Y-%m-%d %H:%M:%S.#ms");
    }
    return "";
}

} // namespace lemon
