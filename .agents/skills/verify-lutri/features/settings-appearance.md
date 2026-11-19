# Appearance

Appearance lets a person open Settings and choose a theme. The choice shows on the theme control and remains after the view is read back from storage.

## Sub-features

- `settings-open` opens General settings from the left navigation.
- `settings-from-configure` opens Settings on the provider page from the creation credential line.
- `theme-neutral` selects the Neutral theme and keeps that choice in the verify profile.

## How to get to it (user POV)

- Choose the `Settings` button at the bottom of the left navigation.
- On Creation, choose `Configure` beside the credential status. This opens Settings on the provider page rather than General.

## Driving it with verify-lutri

Preconditions:

- Doctor reports the verify instance, English UI, and verify data directory.
- The current page is `Creation`.
- The default model shows its provider, `Black Forest Labs`, and `API key required`.
- Neutral is not already the saved theme. A fresh launch satisfies this.

- **Open settings.** Choose `Settings`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Settings"` and `node .agents/skills/verify-lutri/harness.js state --heading Settings --category general`. General is the active settings category.
- **Choose Neutral.** Choose the `Neutral` theme. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Neutral"` and `node .agents/skills/verify-lutri/harness.js state --heading Settings --palette neutral`. The palette is `neutral` and no error banner is present.
- **Confirm the control.** Read the theme control back. Run `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/settings-appearance/theme.aria.txt --contains 'button "Neutral" pressed=true' --contains 'button "General"'` and `node .agents/skills/verify-lutri/harness.js screenshot --path .agents/skills/verify-lutri/evidence/settings-appearance/theme.png`. The snapshot shows `button "Neutral" pressed=true`, `button "General"`, the active Settings button, and the Lutri title.
- **Confirm storage.** Read the saved preferences. Run `node .agents/skills/verify-lutri/harness.js read-record --collection preferences --id preferences --field palette --equals neutral --path .agents/skills/verify-lutri/evidence/settings-appearance/preferences.json`. The written file has `"palette": "neutral"`.
- **Provider entry.** Return to Creation with `node .agents/skills/verify-lutri/harness.js click --role button --name "Creation"` and `node .agents/skills/verify-lutri/harness.js state --heading Creation`. Choose `Configure` with `node .agents/skills/verify-lutri/harness.js click --role button --name "Configure"`. Run `node .agents/skills/verify-lutri/harness.js state --heading Settings --category providers --provider "Black Forest Labs" --path .agents/skills/verify-lutri/evidence/settings-appearance/provider-entry.json`. The provider category is active and the Black Forest Labs section is expanded.

## Gotchas

- `Configure` focuses provider settings. Record the selected category and expanded provider only. Leave the fields untouched.
- Do not switch `Keep running in tray` or `Launch at login`.
- Do not change `Language`. Launch has already pinned English, and later recipes depend on those names.
- Theme names are `Sand`, `Neutral`, `Mist`, and `Celadon`. Match the whole name.
- A screenshot without the preferences record does not prove the theme was saved.
