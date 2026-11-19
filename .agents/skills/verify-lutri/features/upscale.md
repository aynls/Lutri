# Upscale

Upscale prepares a local enlargement. A fresh visit shows the model, scale, and an empty drop area. Verification stops before a job starts.

## Sub-features

- `upscale-open` opens the workspace from the left navigation.
- `upscale-model` shows the installed default model and the 4× scale.
- `upscale-empty` shows the drop area when no image is selected.
- `upscale-batch-toggle` switches between one image and a batch without starting work.

## How to get to it (user POV)

- Choose the `Upscale` button in the left navigation.

## Driving it with verify-lutri

Preconditions:

- Doctor reports the verify instance and English UI.
- No upscale job is running. A fresh launch satisfies this.

- **Open upscale.** Choose `Upscale`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Upscale"` and `node .agents/skills/verify-lutri/harness.js state --heading Upscale`. The current page is `Upscale`.
- **Wait for the model list.** Run `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/upscale/ready.aria.txt --contains "Real-ESRGAN General" --contains 'button "Single" pressed=true' --contains 'button "4×" pressed=true' --contains "Drop images to import"`. The snapshot contains `Real-ESRGAN General`, a pressed `Single` button, a pressed `4×` button, and `Drop images to import`. If the model name is still `—`, the model list did not load. Stop and report that failure.
- **Switch to batch.** Choose `Batch`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Batch"` and `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/upscale/batch.aria.txt --contains 'button "Batch" pressed=true' --contains "Drop images to import"`. The `Batch` button is pressed and the drop area remains empty.
- **Return to one image.** Choose `Single`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Single"` and `node .agents/skills/verify-lutri/harness.js screenshot --path .agents/skills/verify-lutri/evidence/upscale/single.png`. The image shows Lutri, the active Upscale button, and `Drop images to import`.

## Gotchas

- Do not click `Import`, `Resources` inside the drop area, or `Start processing`. Import opens a native file dialog, and starting a job runs a local model.
- The model button's accessible name joins the word `Model` with the model name. Read it from the snapshot rather than typing a provider key or a path.
- `4×` uses the multiplication sign. A button named `4x` is not the scale control.
- An error banner from device detection fails the run. Do not hide it by navigating away and calling the page verified.
- SVG files are rejected by upscale. This recipe does not supply an image, so that path stays unexercised.
