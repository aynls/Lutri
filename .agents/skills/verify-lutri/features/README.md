# Lutri verification map

This directory is the maintained source for verifying Lutri's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .agents/skills/verify-lutri/harness.js launch` and require exit 0.
- The instance is the verify build `app.lutri.studio.verify`, with data in `%APPDATA%\app.lutri.studio.verify` and WebView2 files in `%LOCALAPPDATA%\LutriVerify\webview`.
- Ports `14720` and `9333` belong to that launch. Refuse to drive any other Lutri window.
- The UI language is English. Creation shows `API key required` beside `Configure`.
- Run `node .agents/skills/verify-lutri/harness.js doctor` and require the verify executable, data directory, and English page.
- Leave the isolated verify keychain empty.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Use the accessible names in each recipe. Keep quoted names and flags unchanged.
- Run every browser action through `node .agents/skills/verify-lutri/harness.js`.
- `state --heading <name>` is the signal that navigation finished. Do not continue on a fixed delay.
- Restore nothing in the user's profile. The verify profile is disposable and is removed by cleanup.
- Leave files under `.agents/skills/verify-lutri/evidence/` in place during cleanup.
- To run a recipe in one pass, copy its `harness.js` command lines — without the `node ... harness.js` prefix — into a text file and execute `node .agents/skills/verify-lutri/harness.js run --path <file>`. The `--contains` assertions on `snapshot` steps make the file self-verifying.
- Expected strings come from the English UI. When an assertion fails on a label, check the current `en` value in `src/i18n/index.ts` before reporting a defect; the recipe may be the stale one.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Use the evidence specified for each entry point. On the provider settings page, save only the filtered `state` output.
- A saved draft or setting also needs `read-record` output from the verify database.
- Record the feature file and the entry point with the artifacts.
- Report an unreachable path with the command that failed and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- Name the exact behavior reached. Empty-state checks cover the empty library or task list. The upscale recipe observes the default model and scale and exercises mode switching. Populated lists, provider requests, and completed jobs require separate evidence.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-lutri` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Creation](./creation.md) covers the creation workspace, prompt entry, batch mode, and opening Prompt Writer.
- [Appearance](./settings-appearance.md) covers Settings and choosing a theme.
- [Resources](./gallery.md) covers the empty resource library.
- [Tasks](./tasks.md) covers the empty task list and its Regular and Batch views.
- [Upscale](./upscale.md) covers the local upscale workspace before a job starts.
