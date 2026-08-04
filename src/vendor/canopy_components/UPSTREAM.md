# Upstream provenance

- Project: `dowdiness/canopy`
- Revision: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- License: Apache-2.0
- Modules:
  - `modules/rabbita-resizable/resizable`
  - `modules/rabbita-menu/menu`
  - `modules/rabbita-tabs/tabs`

Preserved source hashes:

- `resizable/types.mbt`: `2d5805eac53c8414ba6415bce689b76e611e41efc4c6ff475ff7aecf046e0843`
- `resizable/update.mbt`: `ac88ca22d332ea66853e7ad34f07492f97d150e11155ff66bd821b8413ae55cb`
- `resizable/attrs.mbt`: `44ce83321949c6c06a1f65ee71807b4e3400ffc6b405a50f0f5cfc9824f8387e`
- `menu/types.mbt`: `7bede48b39a87761c178edb304453198df6a8799342f2c489661260b97408e7d`
- `menu/update.mbt`: `69f08b6731211704f74bdc46d52dcd5c04797986f0eea4ea12864fc95c656acc`
- `menu/attrs.mbt`: `3ae9bcc5bd9e3af5b4a6abe025919140a092774c252cbeb8b5119a241a1bcf6c`
- `tabs/types.mbt`: `6f7c7f05398c969884067fb3bfb37d1abbda13cdf2e175ddd437e55145841f2a`
- `tabs/attrs.mbt`: `2d7232a40ce668b65fb31c588840c97d0b19cafb75644f1214a3a4f521ca8654`

## Adapter boundary

The three upstream component models use private state and expose browser-facing
attributes, focus commands, and pointer subscriptions. The adapter preserves the
pure update rules in one finite native/JavaScript package and replaces browser
events with typed messages. Menu activation is recorded only for valid indices;
tabs rebuild their derived behavior state after selection or count changes.

The pinned tabs and menu APIs do not model disabled entries, so a disabled-item
selection property is not applicable to these modules. CodeMirror integration,
context-menu nesting, and the Ideal editor application are intentionally split
into a later phase rather than approximated as pure component state.

## Finding boundary

The resizable module documents `NudgeBy(dw, dh)` as applying an arbitrary `Int`
delta before clamping. MoonBit `Int` arithmetic wraps at 32 bits. Starting from
width 120, `NudgeBy(dw=2147483647, dh=0)` wraps the raw width negative and clamps
to the minimum width 50. Normal keyboard handlers emit small deltas, so this is
a public-message/direct-dispatch boundary finding rather than a claim that an
ordinary arrow-key press reaches the extreme value.

No upstream issue, pull request, comment, or commit was created.
