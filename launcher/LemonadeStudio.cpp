// Lemonade Studio launcher: starts the patched lemond backend (hidden) and
// opens the hosted webui in the browser. Lives in the system tray.
//
// Build (from a VS developer prompt):
//   cl /O2 /EHsc /DUNICODE /D_UNICODE /SUBSYSTEM:WINDOWS LemonadeStudio.cpp ^
//      /link /OUT:LemonadeMultiEngineStudio.exe user32.lib shell32.lib

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <objbase.h>
#include <string>

#define WM_TRAY (WM_APP + 1)
#define ID_OPEN 1001
#define ID_QUIT 1002
#define ID_ICON 1

static const int DEFAULT_PORT = 13310;

// The listening port comes from config/config.json so the value set in the WebUI
// ("Runtime settings") is honoured. Only when the file or key is missing do we
// fall back to the default. Parsed with a tiny scanner to keep the launcher
// dependency-free.
static int ReadConfigPort(const std::wstring& dir) {
    const std::wstring path = dir + L"\\config\\config.json";
    HANDLE f = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                           nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) return DEFAULT_PORT;

    std::string buf;
    char chunk[4096];
    DWORD read = 0;
    while (buf.size() < 256 * 1024 && ReadFile(f, chunk, sizeof(chunk), &read, nullptr) && read > 0) {
        buf.append(chunk, read);
    }
    CloseHandle(f);

    // "\"port\"" cannot match "websocket_port" because of the leading quote.
    const size_t key = buf.find("\"port\"");
    if (key == std::string::npos) return DEFAULT_PORT;
    size_t i = buf.find(':', key);
    if (i == std::string::npos) return DEFAULT_PORT;
    ++i;
    while (i < buf.size() && (buf[i] == ' ' || buf[i] == '\t' || buf[i] == '\r' || buf[i] == '\n')) ++i;
    int value = 0;
    bool any = false;
    while (i < buf.size() && buf[i] >= '0' && buf[i] <= '9') {
        value = value * 10 + (buf[i] - '0');
        any = true;
        ++i;
    }
    return (any && value > 0 && value < 65536) ? value : DEFAULT_PORT;
}

static PROCESS_INFORMATION g_pi{};
static NOTIFYICONDATAW g_nid{};
static HANDLE g_job = nullptr;

static std::wstring ExeDir() {
    wchar_t buf[MAX_PATH];
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    std::wstring p(buf);
    const auto pos = p.find_last_of(L"\\/");
    return pos == std::wstring::npos ? p : p.substr(0, pos);
}

static std::wstring WebUrl(const std::wstring& dir) {
    return L"http://localhost:" + std::to_wstring(ReadConfigPort(dir)) + L"/app/";
}

// The repo root is where build/Release/lemond.exe lives. The launcher may sit
// at the root or one level below (launcher/), so probe both.
static std::wstring FindRoot() {
    const std::wstring rel = L"\\build\\Release\\lemond.exe";
    const std::wstring dir = ExeDir();
    if (GetFileAttributesW((dir + rel).c_str()) != INVALID_FILE_ATTRIBUTES) return dir;
    const std::wstring up = dir + L"\\..";
    if (GetFileAttributesW((up + rel).c_str()) != INVALID_FILE_ATTRIBUTES) return up;
    return dir;
}

// --- First-run install: create Desktop + Start Menu shortcuts if missing ---

static std::wstring KnownFolder(int csidl) {
    wchar_t buf[MAX_PATH] = {};
    return SUCCEEDED(SHGetFolderPathW(nullptr, csidl, nullptr, 0, buf)) ? std::wstring(buf) : std::wstring();
}

static void CreateShortcut(const std::wstring& lnkPath, const std::wstring& target,
                           const std::wstring& workdir, const std::wstring& desc) {
    IShellLinkW* link = nullptr;
    if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                IID_IShellLinkW, reinterpret_cast<void**>(&link)))) {
        return;
    }
    link->SetPath(target.c_str());
    link->SetWorkingDirectory(workdir.c_str());
    link->SetDescription(desc.c_str());
    link->SetIconLocation(target.c_str(), 0);
    IPersistFile* file = nullptr;
    if (SUCCEEDED(link->QueryInterface(IID_IPersistFile, reinterpret_cast<void**>(&file)))) {
        file->Save(lnkPath.c_str(), TRUE);
        file->Release();
    }
    link->Release();
}

static void EnsureShortcuts() {
    wchar_t exe[MAX_PATH] = {};
    GetModuleFileNameW(nullptr, exe, MAX_PATH);
    const std::wstring exePath(exe);
    const std::wstring dir = FindRoot();
    const std::wstring name = L"Lemonade Multi-Engine Studio.lnk";
    for (int csidl : {CSIDL_DESKTOP, CSIDL_PROGRAMS}) {
        const std::wstring base = KnownFolder(csidl);
        if (base.empty()) continue;
        const std::wstring lnk = base + L"\\" + name;
        if (GetFileAttributesW(lnk.c_str()) == INVALID_FILE_ATTRIBUTES) {
            CreateShortcut(lnk, exePath, dir, L"Lemonade Multi-Engine Studio");
        }
    }
}

static void OpenWebUI() {
    const std::wstring url = WebUrl(FindRoot());
    ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}

static void StartBackend() {
    const std::wstring dir = FindRoot();
    std::wstring lemond = dir + L"\\build\\Release\\lemond.exe";
    if (GetFileAttributesW(lemond.c_str()) == INVALID_FILE_ATTRIBUTES) {
        lemond = dir + L"\\lemond.exe";
    }
    if (GetFileAttributesW(lemond.c_str()) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(nullptr, L"lemond.exe not found. Build the server first.",
                    L"Lemonade Multi-Engine Studio", MB_ICONERROR);
        return;
    }

    CreateDirectoryW((dir + L"\\data").c_str(), nullptr);
    CreateDirectoryW((dir + L"\\data\\cache").c_str(), nullptr);

    std::wstring cmd = L"\"" + lemond + L"\" \"" + dir + L"\\data\\cache\" \"" +
                       dir + L"\\config\" --port " + std::to_wstring(ReadConfigPort(dir));

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    if (!CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE,
                        CREATE_NO_WINDOW, nullptr, dir.c_str(), &si, &g_pi)) {
        MessageBoxW(nullptr, L"Failed to start lemond.exe", L"Lemonade Multi-Engine Studio", MB_ICONERROR);
        return;
    }

    // Bind lemond and every llama-server it spawns to a job object that is
    // killed when this launcher exits, so no orphaned inference servers remain.
    g_job = CreateJobObjectW(nullptr, nullptr);
    if (g_job) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(g_job, JobObjectExtendedLimitInformation, &limits, sizeof(limits));
        if (!AssignProcessToJobObject(g_job, g_pi.hProcess)) {
            CloseHandle(g_job);
            g_job = nullptr;
        }
    }
}

// Stop the backend tree: closing the job kills lemond and its llama-server
// children; the fallback also terminates the tree by PID.
static void StopBackend() {
    if (g_job) {
        CloseHandle(g_job);  // KILL_ON_JOB_CLOSE terminates every process in it
        g_job = nullptr;
    }
    if (g_pi.hProcess) {
        TerminateProcess(g_pi.hProcess, 0);
        CloseHandle(g_pi.hProcess);
        g_pi.hProcess = nullptr;
    }
    if (g_pi.dwProcessId) {
        wchar_t kill_cmd[128];
        wsprintfW(kill_cmd, L"taskkill /T /F /PID %lu", g_pi.dwProcessId);
        STARTUPINFOW si2{};
        si2.cb = sizeof(si2);
        si2.dwFlags = STARTF_USESHOWWINDOW;
        si2.wShowWindow = SW_HIDE;
        PROCESS_INFORMATION pi2{};
        if (CreateProcessW(nullptr, kill_cmd, nullptr, nullptr, FALSE,
                           CREATE_NO_WINDOW, nullptr, nullptr, &si2, &pi2)) {
            WaitForSingleObject(pi2.hProcess, 5000);
            CloseHandle(pi2.hProcess);
            CloseHandle(pi2.hThread);
        }
        g_pi.dwProcessId = 0;
    }
}

static void AddTray(HWND hwnd) {
    g_nid.cbSize = sizeof(g_nid);
    g_nid.hWnd = hwnd;
    g_nid.uID = ID_ICON;
    g_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    g_nid.uCallbackMessage = WM_TRAY;
    g_nid.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    lstrcpynW(g_nid.szTip, L"Lemonade Multi-Engine Studio", 128);
    Shell_NotifyIconW(NIM_ADD, &g_nid);
}

static void ShowMenu(HWND hwnd) {
    POINT pt;
    GetCursorPos(&pt);
    HMENU menu = CreatePopupMenu();
    AppendMenuW(menu, MF_STRING, ID_OPEN, L"\u6253\u5f00 WebUI");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, ID_QUIT, L"\u9000\u51fa");
    SetForegroundWindow(hwnd);
    TrackPopupMenu(menu, TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd, nullptr);
    DestroyMenu(menu);
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
        case WM_TRAY:
            if (LOWORD(lp) == WM_LBUTTONUP || LOWORD(lp) == WM_RBUTTONUP) {
                ShowMenu(hwnd);
            }
            return 0;
        case WM_COMMAND:
            if (LOWORD(wp) == ID_OPEN) {
                OpenWebUI();
            } else if (LOWORD(wp) == ID_QUIT) {
                Shell_NotifyIconW(NIM_DELETE, &g_nid);
                StopBackend();
                DestroyWindow(hwnd);
            }
            return 0;
        case WM_DESTROY:
            Shell_NotifyIconW(NIM_DELETE, &g_nid);
            StopBackend();
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(hwnd, msg, wp, lp);
    }
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int) {
    // Single instance: a second launch only reopens the existing webui instead
    // of spawning another tray icon and another backend.
    HANDLE instance_mutex = CreateMutexW(nullptr, TRUE, L"Global\\LemonadeStudioInstance");
    if (instance_mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS) {
        OpenWebUI();
        if (instance_mutex) CloseHandle(instance_mutex);
        return 0;
    }

    // First run: register Desktop + Start Menu shortcuts so the app can be
    // launched from the Start Menu afterwards.
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    EnsureShortcuts();

    StartBackend();

    WNDCLASSW wc{};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = L"LemonadeStudioWnd";
    RegisterClassW(&wc);

    HWND hwnd = CreateWindowW(L"LemonadeStudioWnd", L"Lemonade Multi-Engine Studio",
                              WS_OVERLAPPED, 0, 0, 0, 0, nullptr, nullptr, hInst, nullptr);
    AddTray(hwnd);

    Sleep(6000);
    OpenWebUI();

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
