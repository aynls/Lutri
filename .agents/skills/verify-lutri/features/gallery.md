# Resources

Resources is the library of favorites and boards. A fresh profile opens on Favorites and shows that none have been saved.

## Sub-features

- `resources-open` opens the library from the left navigation.
- `resources-empty` shows the empty Favorites state.
- `resources-search` exposes the asset search box without requiring a match.

## How to get to it (user POV)

- Choose the `Resources` button in the left navigation.

## Driving it with verify-lutri

Preconditions:

- Doctor reports the verify instance and English UI.
- The verify profile has no favorites and no boards. A fresh launch satisfies this.

- **Open resources.** Choose `Resources`. Run `node .agents/skills/verify-lutri/harness.js click --role button --name "Resources"` and `node .agents/skills/verify-lutri/harness.js state --heading Resources`. The heading is `Resources`.
- **Read the empty library.** Run `node .agents/skills/verify-lutri/harness.js snapshot --path .agents/skills/verify-lutri/evidence/gallery/empty.aria.txt --contains "No favorites" --contains 'textbox "Search asset ID"'` and `node .agents/skills/verify-lutri/harness.js screenshot --path .agents/skills/verify-lutri/evidence/gallery/empty.png`. The snapshot contains `No favorites` and a textbox named `Search asset ID`.
- **Read the resting search box.** Run `node .agents/skills/verify-lutri/harness.js text --role textbox --name "Search asset ID" --equals=`. The box contains exactly the empty string.

## Gotchas

- The navigation name and the heading are `Resources`, not Gallery.
- Favorites is the initial filter. An empty board is a different message and is not this proof.
- `Import` and the URL action open dialogs or accept an address. Do not use them in this recipe. There is no fixture image to import.
- Search matches asset IDs. An empty box is the resting state, not a failed search.
