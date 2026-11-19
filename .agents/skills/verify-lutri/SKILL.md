---
name: verify-lutri
description: Verify requested Lutri desktop UI behavior on Windows through an isolated Tauri dev window. Use only when the user explicitly asks to verify the running desktop app.
---

# Verify Lutri

Use this workflow for explicit requests to exercise Lutri's Windows UI. A code change or a review of the skill alone does not authorize launching it. The Tauri build uses the identifier `app.lutri.studio.verify`, with its own window, application data, WebView profile, and provider keychain service.

## Launch

From the repository root:

```powershell
node .agents/skills/verify-lutri/harness.js launch
```

`launch` exits 0 only when the window is usable. Usable means the English Creation page is showing, the credential status has replaced the loading ellipsis, and no error banner is open. A listening port or a compiled binary is not ready.

Before the first launch in a checkout, install dependencies with `npm ci` if `node_modules/@tauri-apps/cli/tauri.js` is missing. Node 24 and a working Rust toolchain are required. The first launch compiles into `%LOCALAPPDATA%\LutriVerify\target` and can take many minutes. Later launches reuse that directory. The compile must not write `src-tauri\target`.

Launch removes and recreates only these two directories, and only when no verify instance is already recorded as running:

- `%APPDATA%\app.lutri.studio.verify`
- `%LOCALAPPDATA%\LutriVerify\webview`

The dev server is `http://localhost:14720/`. WebView2 remote debugging listens on `127.0.0.1:9333`. Launch selects English and requires the default model to show `API key required` beside `Configure`. A different credential status fails the baseline. The OS keychain persists independently of the disposable data directory.

The verify config serves the frontend on 14720 instead of Lutri's usual 1420. That keeps the run from attaching to another dev server already bound to 1420. Do not start `npm run dev` or `npm run app:dev` for verification. Those commands use the real identifier `app.lutri.studio` and the user's data in `%APPDATA%\app.lutri.studio`. Do not drive a Lutri window you did not launch. If port 14720 or 9333 is already taken, stop and leave the other process alone.

Leave the verify keychain empty. Never type, save, remove, or check a provider key during a recipe. Keep MCP, tray residency, and launch at login disabled.

## Doctor

```powershell
node .agents/skills/verify-lutri/harness.js doctor
```

Run doctor before driving whenever the UI looks wrong. It exits 0 only when all of these are true:

- The recorded launcher PID, creation time, executable, and config argument match this checkout
- port 9333 is listened on by that launch. The listener is the WebView2 process; its parent chain must include `%LOCALAPPDATA%\LutriVerify\target\debug\lutri.exe`
- the server on port 14720 belongs to the same launcher
- `%APPDATA%\app.lutri.studio.verify\lutri.sqlite3` exists
- the page title is `Lutri`, the document language is `en`, a navigation button is current, and the credential status is no longer loading

Each command that attaches to the WebView checks both listener process trees before connecting. Database reads also check the recorded run. If doctor fails, inspect `%LOCALAPPDATA%\LutriVerify\dev.log`.

## Drive

The feature map is `.agents/skills/verify-lutri/features/README.md`. Read it before choosing a journey. Every interaction goes through the harness. Selectors are accessible names from the English UI.

```powershell
node .agents/skills/verify-lutri/harness.js state --heading Creation
node .agents/skills/verify-lutri/harness.js click --role button --name "Settings"
node .agents/skills/verify-lutri/harness.js fill --role textbox --name "Prompt" --value "Verify lakeside pavilion"
node .agents/skills/verify-lutri/harness.js text --role textbox --name "Prompt" --equals "Verify lakeside pavilion"
```

`state` reports the page and waits up to 10 seconds for the supplied `--heading`, `--palette`, `--category`, and `--provider` values. The provider is the visible name of an expanded provider in the active settings panel. Use `--path` to save these observations without collecting input values. `click` and `fill` target one accessible node. `text` reads the control back. Use `--equals=` to assert an empty value in PowerShell.

`snapshot` accepts repeatable `--contains "<text>"` flags. Each needle must appear in the captured tree, exactly as it appears in a snapshot line such as `button "Batch" pressed=true`; a missing needle fails the command after the file is written. Prefer these assertions over grepping evidence afterwards.

Each command spawns a fresh process, verifies the listener process trees, and opens a new CDP socket, so a single call can take tens of seconds. Long `&&` chains hit shell timeouts. For multi-step recipes, write the commands to a text file — one harness command per line, without the `node ... harness.js` prefix, `#` for comments — and execute them together:

```powershell
node .agents/skills/verify-lutri/harness.js run --path .agents/skills/verify-lutri/recipes/creation.txt
```

`run` performs the process-tree check once, then executes the driving commands (`state`, `click`, `fill`, `text`, `snapshot`, `screenshot`, `read-record`) in order and stops at the first failing line, reporting its number. Inside a recipe, single quotes quote arguments containing double quotes.

Icon buttons in the left navigation expose their names through the `title` attribute: `Creation`, `Upscale`, `Resources`, `Tasks`, and `Settings`. The `--heading` observation reads the name of the current navigation button.

Do not click `Reset`, `Import`, `Choose images`, `Start processing`, `Configure` followed by typing, or any control that calls a provider. `Reset` opens a native confirmation dialog. Import and image picking open native file dialogs. The harness cannot close those dialogs.

## Evidence

Write proof under `.agents/skills/verify-lutri/evidence/<feature>/`. Use artifacts captured during the current run and identify the action that produced them. Existing screenshots and records are historical. In particular, the original `Configured` snapshots predate credential isolation.

```powershell
node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/settings-appearance/theme.aria.txt
node .agents/skills/verify-lutri/harness.js screenshot --path .agents/skills/verify-lutri/evidence/settings-appearance/theme.png
node .agents/skills/verify-lutri/harness.js read-record --collection preferences --id preferences --field palette --equals neutral --path .agents/skills/verify-lutri/evidence/settings-appearance/preferences.json
```

`snapshot` writes the page identity and the accessible tree, including `pressed` on toggle buttons. `screenshot` writes the webview PNG. `read-record` reads one row from the verify database and, when `--field` is set, waits up to 10 seconds for that field. It never opens `%APPDATA%\app.lutri.studio`. Every `--path` creates its parent directories. The `evidence/` directory is git-ignored: artifacts are proof for the current run, not repository content.

Exercise the path a person uses. Do not set React state or call Tauri commands directly. For a saved setting or draft, record both the visible control and the database row. Provider calls, MCP, and upscale jobs stay out of verification: the safe observation is the control state before those actions, not a mocked success. Do not treat `API key required` as a failure.

## Cleanup

```powershell
node .agents/skills/verify-lutri/harness.js cleanup
```

Cleanup checks the recorded launcher's identity and the ancestry of any listeners before stopping its process tree. A reused PID is left alone. Both ports and the verify app must be inactive before cleanup removes the verify profiles and run record. Evidence, `dev.log`, and the Cargo target remain available.

Run cleanup after a failed launch too, so the next attempt does not inherit a window or a port. After cleanup, the evidence files must still be on disk.

## Helpers

The harness is `.agents/skills/verify-lutri/harness.js`. Run it with `node` from the repository root. The commands are `launch`, `doctor`, `state`, `click`, `fill`, `text`, `snapshot`, `screenshot`, `read-record`, and `cleanup`. Flags are listed in the header of the script and in the sections above. Paths passed to `--path` may be relative to the current directory.
