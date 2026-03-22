# Desktop App Deep Dive — Native Binaries & VM Infrastructure

## Binary Inventory

| Binary | Type | Size | Description |
|---|---|---|---|
| `smol-bin.arm64.img` | DOS/MBR disk image | 11MB | **Linux VM image for ARM64 (Apple Silicon)** |
| `smol-bin.x64.img` | DOS/MBR disk image | 11MB | **Linux VM image for x86_64** |
| `claude-ssh-darwin-arm64` | Mach-O executable | 5.8MB | SSH proxy binary (Go, stripped) |
| `claude-ssh-darwin-amd64` | Mach-O executable | 6.3MB | SSH proxy binary (Go, stripped) |
| `claude-ssh-linux-amd64` | ELF static binary | 6.0MB | SSH proxy for Linux VMs (Go, stripped) |
| `claude-ssh-linux-arm64` | ELF static binary | 5.7MB | SSH proxy for Linux VMs (Go, stripped) |
| `claude-native-binding.node` | Mach-O universal dylib | 2.8MB | Native Node addon (Rust, `@ant/claude-native`) |
| `swift_addon.node` | Mach-O universal dylib | 35MB | **Swift/SwiftUI addon** (`@ant/claude-swift`) — Markdown rendering, UI components |
| `chrome-native-host` | Mach-O universal binary | 2.0MB | Chrome extension native messaging host (Rust) |
| `disclaimer` | Mach-O universal binary | 132KB | Process spawner with disclaimed responsibility (`posix_spawn` with disclaim attr) |
| `default.clod` | ZIP archive | 96KB | Animated cursor/personality assets |

## smol-bin — The Cowork VM Image

The `smol-bin.*.img` files are **bootable disk images** containing a complete Go binary called `coworkd`. This is the init process that runs inside the local VM on the user's machine.

### Architecture
```
Claude Desktop (Electron, macOS host)
    ↓ launches via Apple Virtualization.framework
smol-bin.arm64.img (Linux VM guest)
    ├── coworkd (PID 1, Go binary)
    │   ├── FUSE filesystem (go-fuse/v2)
    │   ├── gVisor userspace networking (tcpip stack)
    │   ├── MITM HTTP proxy (goproxy)
    │   ├── vsock communication (mdlayher/vsock)
    │   ├── virtiofs shared mounts
    │   ├── cgroup process isolation
    │   ├── User management (useradd/userdel)
    │   └── SDK binary updater
    └── claude-ssh (SSH proxy)
```

### Go Dependencies (from `smol-bin`)
| Module | Purpose |
|---|---|
| `gvisor.dev/gvisor/pkg/tcpip` | **gVisor userspace TCP/IP stack** (network isolation) |
| `github.com/hanwen/go-fuse/v2` | FUSE filesystem for overlay mounts |
| `github.com/elazarl/goproxy` | **MITM HTTP proxy** (TLS interception with ephemeral CA) |
| `github.com/mdlayher/vsock` | VM socket communication with host |
| `github.com/songgao/water` | TAP/TUN virtual network interfaces |

### Key `coworkd` Capabilities
1. **MITM Proxy**: Generates ephemeral CA certs, intercepts HTTPS traffic, blocks disallowed beta features in headers
2. **Network Isolation**: gVisor userspace networking + configurable MTU + static IP + default route management
3. **Filesystem**: virtiofs mounts, FUSE overlays, skeleton home directories, session disk mounting
4. **Process Management**: cgroup-based isolation, OOM kill detection, per-process tracking
5. **User Management**: Dynamic user creation/recovery, UID/GID management
6. **SDK Updates**: Hot-updates Claude Code binary inside VM
7. **Reachability Checks**: HTTP-based connectivity verification
8. **Hyper-V Support**: Detects Hyper-V host for Windows compatibility

### MITM Proxy Details
```
[proxy] ephemeral CA generated
[proxy] MITM proxy started on ...
[proxy] allowing ...
[proxy] blocking request - disallowed beta feature in header: %s
[proxy] added approved OAuth token
```
The proxy generates a per-session CA certificate (in-memory only), intercepts all HTTPS traffic from the VM, and can block specific API beta headers. This is how Anthropic controls what features the sandboxed agent can access.

### Network Modes
- `auto` — Default, uses gVisor on macOS (Darwin)
- `gvisor` — Forced gVisor userspace networking
- `srt` — Full egress mode, bypasses network isolation

### Log Messages
```
[coworkd] root device is %s
[coworkd] formatting session disk ...
[coworkd] e2fsck cleaned ...
[coworkd] mounting session disk %s at %s
[coworkd] virtiofs mount ...
[coworkd] static IP configured
[coworkd] reachability check passed (status=%d)
[coworkd] installed SDK binary v%s to %s
[coworkd] user recovery complete: recovered=%d skipped=%d failed=%d
[coworkd] shutting down ...
```

## claude-ssh — SSH Proxy

Go binary from `github.com/anthropics/claude-ssh`. Internal packages:
- `internal/rpc` — RPC protocol (JSON over stdio)
- `internal/server` — SSH server implementation
- `internal/process` — Process execution
- `internal/handlers` — Request handlers

Functions as a bridge between the Desktop app and the VM, providing SSH-like access to the sandboxed environment.

## chrome-native-host — Chrome Extension Bridge

Rust binary implementing Chrome Native Messaging protocol. Acts as a bridge between the Chrome extension and the Desktop app via MCP:
```
Chrome Extension ←(native messaging)→ chrome-native-host ←(MCP)→ Claude Desktop
```

Handles:
- MCP client connections
- Tool request forwarding to Chrome
- Bidirectional message passing

## claude-native-binding.node — @ant/claude-native

Rust-based Node.js native addon. Exports via N-API (`napi_register_module_v1`).
Likely handles low-level system interactions that can't be done in JS (keyboard input simulation via `enigo` crate, etc.).

## swift_addon.node — @ant/claude-swift (35MB!)

The largest native addon. Contains:
- **Full MarkdownUI framework** — SwiftUI Markdown rendering
- **NetworkImage** — Async image loading
- Anthropic's custom fonts (AnthropicSans, AnthropicSerif)
- SwiftUI views rendered natively

This provides native macOS UI rendering for rich content display within the Electron shell.

## default.clod — Personality Assets

ZIP archive containing animated cursor assets:
```
cursor.png          — Custom cursor image
idling_0.png        — Idle state animation frame
working_0.png       — Working state frame 0
working_1.png       — Working state frame 1
working_2.png       — Working state frame 2
personality.txt     — Personality configuration
```

The `.clod` format appears to be Claude's custom personality/avatar package format.

## disclaimer — Process Launcher

Tiny binary that spawns child processes with macOS "disclaim" attribute (`posix_spawnattr_set_disclaim_responsibility`). This tells macOS that the spawned process is user-initiated content, not the app itself — used for sandboxing and security.

## Cowork Plugin System

The `cowork-plugin-shim.sh` reveals a sophisticated plugin permission system:
1. Plugins declare confirmation rules in `.claude-plugin/plugin.json`
2. Plugin CLI commands are wrapped by the shim
3. Dangerous operations trigger a confirmation card in the Desktop UI
4. Communication via filesystem-based permission bridge (request/response directories)
5. Deterministic nonces prevent replay attacks
6. 100-second timeout with retry support

This is how third-party tools (Google Workspace, etc.) are safely integrated into the sandboxed VM.
