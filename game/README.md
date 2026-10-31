# Kommutator — کموتاتور

A web version of the **Kommutator** game (designed by Behzad Najafi for an
abstract-algebra course): a 3×3 board whose rows rotate right (`R₁ R₂ R₃`) and
whose columns rotate down (`C₁ C₂ C₃`), plus their inverses. Words follow the
function-composition convention: the rightmost factor is applied first.

Static site — no build step, no dependencies beyond Google Fonts.

## Features

- Animated row/column rotations with wrap-around, Persian (RTL) and English UI.
- The two puzzles of the proposal (the final one is tagged *homework*), plus
  challenge puzzles: the Lo Shu magic square, quarter and half turns, pattern
  goals, and a deliberately impossible "mirror" (an odd permutation).
- Exact-difficulty scrambles (2–8 moves) and a daily challenge, identical for
  everyone on the same date.
- Hint and auto-solve: a BFS over all 181 440 reachable positions (the group
  is A₉) runs once in a Web Worker, so every hint is a shortest route.
- Live word of moves, execution order, reduced word, cycle notation, element
  order, parity and distance, a tile-path overlay, and a commutator lab that
  shows `[g, h] = g h g⁻¹ h⁻¹` on a mini board.
- Shareable links: `#p=p2` (built-in puzzle), `#s=123485769` (any position),
  `#daily`.

## Deploy on GitHub Pages

1. Create a repository (for example `kommutator`) and push the three files
   `index.html`, `style.css`, `app.js` (and this README) to its root.
2. In the repository: **Settings → Pages → Build and deployment → Source:
   "Deploy from a branch"**, branch `main`, folder `/ (root)`. Save.
3. After a minute the game is live at `https://<user>.github.io/kommutator/`.

Optional: set `CONFIG.author` / `CONFIG.repoUrl` at the top of `app.js` to
show a credit line and a GitHub link in the footer.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | page structure |
| `style.css` | visual design (dark glass theme, responsive) |
| `app.js` | game engine, solver, puzzles, i18n, UI |

## Conventions (same as the proposal)

- Rows are numbered top to bottom, columns left to right.
- `R_i` moves every tile of row *i* one cell to the right; the rightmost tile
  wraps to the left. `C_j` moves every tile of column *j* one cell down; the
  bottom tile wraps to the top.
- `R_i³ = C_j³ = e`; `[g, h] = g h g⁻¹ h⁻¹`.
