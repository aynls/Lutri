# Creation

Creation is the workspace where a person writes a prompt, switches between a single configuration and a batch, and opens Prompt Writer. Verification stops before a provider request.

## Sub-features

- `creation-open` shows the creation workspace from the left navigation.
- `prompt-save` keeps typed prompt text in the editor and in the saved draft.
- `batch-mode` switches the workspace to the batch list and back.
- `writer-open` opens Prompt Writer and returns without running a writer.

## How to get to it (user POV)

- Choose the `Creation` button in the left navigation. Launch already lands here.
- Choose `Back` inside Prompt Writer to return to the same draft.

## Driving it with verify-lutri

Preconditions:

- Doctor reports the verify instance and English UI.
- The heading is `Creation`.
- Prompt Writer is closed. The `Write` button is visible and only one `Prompt` textbox exists.
- The prompt editor is empty.

- **Record the opening model.** Run `node .agents/skills/verify-lutri/harness.js state --heading Creation` and `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/creation/open.aria.txt --contains "FLUX 3 Image" --contains 'button "Model'`. The heading is `Creation`, the credential line names `Configure`, the model button name starts with `Model`, and the page contains `FLUX 3 Image`.
- **Enter a prompt.** Click the prompt editor and type. Run `node .agents/skills/verify-lutri/harness.js fill --role textbox --name "Prompt" --value "Verify lakeside pavilion"` and `node .agents/skills/verify-lutri/harness.js text --role textbox --name "Prompt" --equals "Verify lakeside pavilion"`. The editor shows that sentence.
- **Leave and return.** Choose `Tasks`, then `Creation`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Tasks"`, `node .agents/skills/verify-lutri/harness.js state --heading Tasks`, `node .agents/skills/verify-lutri/harness.js click --role button --name "Creation"`, and `node .agents/skills/verify-lutri/harness.js state --heading Creation`. The prompt textbox still reads `Verify lakeside pavilion`.
- **Confirm the draft.** Read the saved draft. Run `node .agents/skills/verify-lutri/harness.js read-record --collection draft --id current --field prompt --equals "Verify lakeside pavilion" --path .agents/skills/verify-lutri/evidence/creation/draft.json`. The file contains that prompt.
- **Open batch.** Choose `Batch`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Batch"` and `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/creation/batch.aria.txt --contains 'button "Batch" pressed=true' --contains "Build your batch"`. The `Batch` button is pressed and the page contains `Build your batch`.
- **Return to regular.** Choose `Regular`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Regular"` and `node .agents/skills/verify-lutri/harness.js text --role textbox --name "Prompt" --equals "Verify lakeside pavilion"`. The same prompt is still in the editor.
- **Open Prompt Writer.** Choose `Write`, then `Back`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Write"` and `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/creation/writer.aria.txt --contains 'heading "Write"' --contains 'button "← Back"'`. The snapshot contains a heading `Write` and a button `← Back`. Then run `node .agents/skills/verify-lutri/harness.js click --role button --name "← Back"` and `node .agents/skills/verify-lutri/harness.js state --heading Creation`. The creation heading returns and the prompt is unchanged.
- **Proof.** Capture the restored editor. Run `node .agents/skills/verify-lutri/harness.js screenshot --path .agents/skills/verify-lutri/evidence/creation/prompt.png`. The image shows Lutri, the Creation heading, and `Verify lakeside pavilion`.

## Gotchas

- The prompt editor is a textbox named `Prompt`, not an input with a value attribute. Use `fill` and `text`.
- While Prompt Writer is open, two `Prompt` textboxes exist. `fill` then fails because the name is ambiguous. Close Writer first.
- `Reset` opens a native confirmation dialog. Do not click it.
- Do not click the primary generate control. This profile has no private provider setup, and a click would attempt a paid request.
- `Configure` leaves Creation for provider settings. Do not type there.
- Switching to Batch and back is part of the draft, not a second saved prompt.
