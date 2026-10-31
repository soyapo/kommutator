# game/ — the Kommutator web app

This folder is the static site that GitHub Pages serves (see the
[project README](../README.md) for rules, features and deployment).

| File | Purpose |
| --- | --- |
| `index.html` | page structure, fonts, modals |
| `style.css` | dark glass theme, responsive layout, touch rules |
| `app.js` | game engine, BFS solver (Web Worker), puzzles, i18n (fa/en), UI |

No build step. To run it locally:

```bash
python3 -m http.server 8000
```

## Configuration

`CONFIG` at the top of `app.js`:

- `author`: shown in the footer when set.
- `repoUrl`: adds a GitHub link to the footer when set.

## Conventions

- Rows are numbered from the top, columns from the left.
- `R_i` rotates row *i* one cell to the right (right-edge tile wraps to the
  left); `C_j` rotates column *j* one cell down (bottom tile wraps to the top).
- Words are written with the rightmost factor executed first; `[g, h] = g h g⁻¹ h⁻¹`.
- Move ids in the code: `R2`, `R2'` (inverse), `C3`, `C3'`.

## URL parameters

- `#p=<id>`: built-in puzzle (`p1`, `p2`, `magic`, `rot90`, `rot180`,
  `evencorners`, `evendiag`, `col123`, `mirror`).
- `#s=<nine digits>`: any position, row by row, loaded as a puzzle.
- `#daily`: today's challenge.
