# Ultra-wide layout — investigation notes (issue #1033)

Findings only. **No approach here was accepted**; every option below was tried and
rejected. Recorded so the next attempt starts from the measurements rather than
re-deriving them.

Method: client_v2 dev server against a throwaway backend seeded with 156 spools
across 8 vendors and 7 locations, rendered with Playwright at 3440 / 2560 / 1920 /
1440 px, spool #2 selected.

## What is actually wrong at 3440 px

| Symptom                                                                           | Measured         |
| --------------------------------------------------------------------------------- | ---------------- |
| Nav tabs at one end of the top bar, Add spools at the other                       | ~3,390 px apart  |
| Footer repeats the same shape (version string hard left, Ko-fi button hard right) | ~3,390 px apart  |
| List pane never grows past its `LIST_DEFAULT`                                     | 470 px of 3440   |
| Inspector fields occupy the top of a pane that is mostly blank                    | ~2,550 px unused |
| "used 123.4 g" readout sits far from the "626.6 g" figure it annotates            | ~2,890 px apart  |
| Spool progress bar spans the display and reads as a divider, not a measure        | 2,900 px wide    |

1920 px and below render correctly. The defects are specific to ultra-wide.

Not ultra-wide-specific, but found on the way and worth its own issue: remaining-weight
values in the list wrap onto two lines ("626.6 / g") at _every_ width including 1920.
That is a row-template density problem.

## Approaches tried and rejected

### Capping the page content

Capping `.library` at 1800 px and centring it reproduces the 1920 rendering (list 470 +
inspector 1330) inside the cap. It composes with the resizable list from #1034 for free,
because `+page.svelte` already measures `.library` via `bind:clientWidth` and
`clampListWidth` derives the splitter ceiling from it.

Rejected: the Library does not need it. The resizable list already lets anyone on an
ultra-wide give the list the room it wants, and a cap overrides that choice. It also
leaves ~820 px of dead ground per side at 3440, which is the inverse of the complaint in
issue #1026.

### Capping every route the same way

Rejected on evidence: the Dashboard at 3440 lays out **seven** location columns, all
legible, no horizontal scrolling. An 1800 px cap cuts it to four and forces scrolling —
a straight regression on the one route that earns the extra width. Labels (1040 px) and
Settings (680 px) already cap and centre their own content.

Making the cap per-route requires stamping the route onto the app shell
(`data-route={page.route.id}`) so the chrome, which lives outside the page in the DOM,
can follow whichever route is showing. Workable, but only worth the machinery if the
pages are being capped at all — and they are not.

### Widening the list instead of capping

Leave the Library full-bleed and let the extra pixels go to the list. Does not work:
forcing the list to 760 px does not densify the rows, because the row template pins
location to the right edge, so the extra width lands as a gap in the middle of every row
and the weights still wrap. The list would need a genuinely responsive row template —
more columns, or a real table — before extra width buys anything.

### Header bar: four ways to close the gap

All four keep the bar's surface full-bleed and change only where the controls inside it
may go.

- **Capped and centred.** With the Library staying full-bleed there is no content column
  for a centred bar to agree with, so the logo detaches from the left edge and floats
  above the inspector, aligned with nothing.
- **All controls clustered right.** Puts the tabs next to Add spools, but drags the nav
  ~2,500 px away from the list it navigates and orphans the logo at the far left.
- **Capping the flexible spacer** rather than the row. Changes the layout at 1920, where
  the spacer is already ~985 px and nothing is wrong. Rejected for that alone.
- **Capping the row, left-anchored** (`.row.primary { max-width: 1920px }`, no
  `margin-inline: auto`). Closes the gap to ~1,450 px at 3440 and is byte-identical at
  1920 and 1440 — screenshot hashes match exactly with and without the rule. This was the
  recommendation; still rejected.

## Open

No accepted direction yet. The measurements above hold regardless of which one is
eventually taken.
