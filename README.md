# `codex-web-mobile`

A mobile-first local workbench for [Codex](https://github.com/openai/codex). It runs on top of the Codex `app-server` and adds configuration, provider, runtime, skill, plugin, MCP and local file management.

## Prerequisites

- [Codex CLI](https://github.com/openai/codex) installed and available in your `PATH`

## Installation

```bash
# Install the local build globally
npm install -g "$HOME/codex-web-mobile"
```

## Usage

```
Usage: codex-web-mobile [options]

Mobile-first web interface for Codex app-server

Options:
  -p, --port <port>    port to listen on (default: "3000")
  --host <host>        host to listen on (default: "127.0.0.1")
  --password <pass>    set a specific password
  --no-password        disable password protection
  -h, --help           display help for command
```

## Examples

```bash
# Start with auto-generated password on default port 3000
codex-web-mobile

# Start on a custom port
codex-web-mobile --port 8080

# Allow another device on the same network to connect
codex-web-mobile --host 0.0.0.0 --port 8080

# Start with a specific password
codex-web-mobile --password my-secret

# Start without password protection (use only on trusted networks)
codex-web-mobile --no-password
```

When started with password protection (default), the server prints the password to the console. Open the URL in your browser, enter the password, and you're in.

The Settings page edits `~/.codex/config.toml`, creates a backup before writes, validates TOML, and can restart the Codex app-server. API keys are hidden in the UI by default but are written to the config file when explicitly saved.

The Skills page reads `~/.codex/skills`, supports local paths, GitHub repositories, npm packages, and archives, and injects selected `SKILL.md` files into new threads. Package scripts are not executed during installation.

The interface supports English and Simplified Chinese. The language selector is in the top bar. Desktop uses a persistent session sidebar and session inspector; mobile uses a navigation drawer. Chat messages render sanitized Markdown, and the inspector reports token/context values received from local app-server events plus locally accumulated work time.

While a turn is running, the composer stays editable. Press Enter or choose **Add guidance** to send `turn/steer` input into the active turn; choose **Stop & send** to interrupt it, wait for `turn/completed`, then start the new request in the same thread. Typing `/` in the composer opens inline command completion; click a command or use the arrow keys and Enter.

Active turns show a live `(h m s elapsed)` clock beside their status. This clock measures the current turn from its start; the separate working-time total remains based on local activity events. The composer accepts multiple lines: Enter sends and Shift+Enter inserts a line break.

Use `Files` in the composer to browse the Termux host directory, attach a file reference, or upload a file from the phone. Uploads are stored on the local host (20 MB maximum) and attached by local path. Image understanding depends on the configured model/provider.

Run `npm run ui:check` to capture Chromium CDP screenshots at 360×740, 390×844 and 1280×900, switch locales, and smoke-test settings, skills, integrations, commands, the file picker and conversations. It simulates a turn to verify that the elapsed clock advances, stops on completion, and leaves the composer usable while active. Screenshots are saved under `~/.codex/web-mobile/screenshots/`.

## Contributing

Issues and pull requests are welcome! If you have ideas, suggestions, or found a bug, please open an issue on the [GitHub repository](https://github.com/ghhhhughg638/codex-web-mobile/issues).

## License

[MIT](./LICENSE)
