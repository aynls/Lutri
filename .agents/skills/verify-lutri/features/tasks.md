# Tasks

Tasks lists generation batches. A fresh profile has no batches, and the person can switch between the regular list and the batch list.

## Sub-features

- `tasks-open` opens the task page from the left navigation.
- `tasks-empty` shows the empty regular list.
- `tasks-batch-tab` switches to the empty batch list and back.

## How to get to it (user POV)

- Choose the `Tasks` button in the left navigation.

## Driving it with verify-lutri

Preconditions:

- Doctor reports the verify instance and English UI.
- The verify profile has no generation tasks. A fresh launch satisfies this.
- The related-image scope is not active.

- **Open tasks.** Choose `Tasks`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Tasks"` and `node .agents/skills/verify-lutri/harness.js state --heading Tasks`. The heading is `Tasks`.
- **Read the empty list.** Run `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/tasks/empty.aria.txt --contains 'button "Regular" pressed=true' --contains "No matching batches" --contains 'textbox "Search prompt or asset ID"'`. The `Regular` button is pressed and the page contains `No matching batches`. A textbox named `Search prompt or asset ID` is present.
- **Open the batch list.** Choose `Batch`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Batch"` and `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/tasks/batch.aria.txt --contains 'button "Batch" pressed=true' --contains "No batch tasks"`. The `Batch` button is pressed and the page contains `No batch tasks`.
- **Return.** Choose `Regular`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Regular"` and `node .agents/skills/verify-lutri/harness.js screenshot --path .agents/skills/verify-lutri/evidence/tasks/empty.png`. The image shows Lutri, the Tasks heading, and `No matching batches`.

## Gotchas

- The navigation name and heading are `Tasks`, not History.
- The regular empty copy is `No matching batches`. The batch tab's empty copy is `No batch tasks`. They are not interchangeable.
- Creation is hidden on this page, so the `Regular` and `Batch` buttons belong to Tasks. Confirm the heading before clicking either one.
- Do not delete, retry, or restore anything. A fresh profile has no rows to act on.
