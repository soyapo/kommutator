/* ============================================================================
   Kommutator — web version
   A 3x3 board with tiles 1..9. Moves: cyclic shift of a row to the right (R_i)
   or of a column downwards (C_j), plus their inverses. Words are written in the
   function-composition convention: the rightmost factor is executed first.
   ============================================================================ */
'use strict';

const CONFIG = {
  author: '',   // shown in the footer when set, e.g. 'نام شما'
  repoUrl: '',  // shown in the footer when set, e.g. 'https://github.com/user/kommutator'
};

/* ----------------------------------------------------------------------------
   Engine
   --------------------------------------------------------------------------*/
const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// A move is a permutation `perm` of the 9 cells: the tile in cell i travels to
// cell perm[i]. kind 'R' = row (dir +1 right / -1 left), 'C' = column (dir +1
// down / -1 up). id examples: "R2", "R2'", "C3", "C3'" (prime = inverse).
const MOVES = [];
for (const kind of ['R', 'C']) {
  for (let line = 0; line < 3; line++) {
    for (const inv of [false, true]) {
      const dir = inv ? -1 : 1;
      const perm = new Array(9);
      for (let i = 0; i < 9; i++) {
        const r = Math.floor(i / 3), c = i % 3;
        if (kind === 'R' && r === line) perm[i] = r * 3 + ((c + dir + 3) % 3);
        else if (kind === 'C' && c === line) perm[i] = ((r + dir + 3) % 3) * 3 + c;
        else perm[i] = i;
      }
      MOVES.push({ id: kind + (line + 1) + (inv ? "'" : ''), kind, line, inv, dir, perm });
    }
  }
}
const MOVE_BY_ID = Object.fromEntries(MOVES.map(m => [m.id, m]));
const inverseOf = m => MOVE_BY_ID[m.kind + (m.line + 1) + (m.inv ? '' : "'")];

function applyMove(board, m) {
  const out = new Array(9);
  for (let i = 0; i < 9; i++) out[m.perm[i]] = board[i];
  return out;
}
const applySeq = (board, ids) => ids.reduce((b, id) => applyMove(b, MOVE_BY_ID[id]), board);
const same = (a, b) => a.every((v, i) => v === b[i]);

// Lehmer-code index of a board (tiles 1..9) in 0..362879
const POP = new Uint8Array(512);
for (let i = 1; i < 512; i++) POP[i] = POP[i >> 1] + (i & 1);
function permIndex(board) {
  let idx = 0, used = 0;
  for (let i = 0; i < 9; i++) {
    const v = board[i] - 1;
    idx = idx * (9 - i) + (v - POP[used & ((1 << v) - 1)]);
    used |= 1 << v;
  }
  return idx;
}

// Self-contained BFS over the whole group (run in a worker when possible).
function buildDistTable() {
  const perms = [];
  for (const kind of ['R', 'C']) for (let line = 0; line < 3; line++) for (const dir of [1, -1]) {
    const p = new Array(9);
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      if (kind === 'R' && r === line) p[i] = r * 3 + ((c + dir + 3) % 3);
      else if (kind === 'C' && c === line) p[i] = ((r + dir + 3) % 3) * 3 + c;
      else p[i] = i;
    }
    perms.push(p);
  }
  const POP = new Uint8Array(512);
  for (let i = 1; i < 512; i++) POP[i] = POP[i >> 1] + (i & 1);
  const index = (b, o) => {
    let idx = 0, used = 0;
    for (let i = 0; i < 9; i++) { const v = b[o + i]; idx = idx * (9 - i) + (v - POP[used & ((1 << v) - 1)]); used |= 1 << v; }
    return idx;
  };
  const N = 181440;
  const dist = new Uint8Array(362880).fill(255);
  const q = new Uint8Array(N * 9);
  for (let i = 0; i < 9; i++) q[i] = i;
  dist[index(q, 0)] = 0;
  let head = 0, tail = 1;
  const tmp = new Uint8Array(9);
  while (head < tail) {
    const o = head * 9, d = dist[index(q, o)];
    for (const p of perms) {
      for (let i = 0; i < 9; i++) tmp[p[i]] = q[o + i];
      const k = index(tmp, 0);
      if (dist[k] === 255) { dist[k] = d + 1; q.set(tmp, tail * 9); tail++; }
    }
    head++;
  }
  return dist;
}

let DIST = null;            // Uint8Array once ready
const distReady = new Promise(resolve => {
  const finish = t => { DIST = t; resolve(t); };
  try {
    const src = `self.onmessage=function(){var t=(${buildDistTable.toString()})();self.postMessage(t,[t.buffer]);};`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = e => { finish(e.data); w.terminate(); };
    w.onerror = () => { setTimeout(() => finish(buildDistTable()), 0); };
    w.postMessage(0);
  } catch (_) {
    setTimeout(() => finish(buildDistTable()), 0);
  }
});

function parity(board) {          // 0 even, 1 odd
  const seen = new Array(9).fill(false); let cycles = 0;
  for (let i = 0; i < 9; i++) if (!seen[i]) { cycles++; let j = i; while (!seen[j]) { seen[j] = true; j = board[j] - 1; } }
  return (9 - cycles) % 2;
}
function cyclesOf(board) {        // cycles of the map cell -> home cell of its tile (1-based), length>1 only
  const seen = new Array(9).fill(false), out = [];
  for (let i = 0; i < 9; i++) if (!seen[i]) {
    const cyc = []; let j = i;
    while (!seen[j]) { seen[j] = true; cyc.push(j + 1); j = board[j] - 1; }
    if (cyc.length > 1) out.push(cyc);
  }
  return out;
}
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const lcm = (a, b) => a / gcd(a, b) * b;
const orderOf = board => cyclesOf(board).reduce((o, c) => lcm(o, c.length), 1);

// relabel tiles so that `target` becomes the ordered board; moves act on cells,
// so a solution for the relabelled board is a solution from `board` to `target`.
function relabel(board, target) {
  const pos = new Array(10);
  target.forEach((t, i) => { pos[t] = i + 1; });
  return board.map(t => pos[t]);
}
function distToState(board, target) {
  if (!DIST) return null;
  const d = DIST[permIndex(relabel(board, target))];
  return d === 255 ? Infinity : d;
}
function solveToState(board, target) {   // greedy descent on the distance table
  if (!DIST) return null;
  let rel = relabel(board, target);
  let d = DIST[permIndex(rel)];
  if (d === 255) return null;
  const path = [];
  while (d > 0) {
    let next = null;
    for (const m of MOVES) { const nb = applyMove(rel, m); if (DIST[permIndex(nb)] === d - 1) { next = [m, nb]; break; } }
    path.push(next[0].id); rel = next[1]; d--;
  }
  return path;
}
function solveToPred(board, pred) {      // BFS from the current board to the nearest board satisfying pred
  if (pred(board)) return [];
  const parent = new Int32Array(362880).fill(-1), via = new Int8Array(362880);
  const startIdx = permIndex(board); parent[startIdx] = startIdx;
  const queue = [board];
  for (let h = 0; h < queue.length; h++) {
    const b = queue[h], bi = permIndex(b);
    for (let k = 0; k < MOVES.length; k++) {
      const nb = applyMove(b, MOVES[k]), ni = permIndex(nb);
      if (parent[ni] !== -1) continue;
      parent[ni] = bi; via[ni] = k;
      if (pred(nb)) {
        const path = []; let cur = ni;
        while (cur !== startIdx) { path.push(MOVES[via[cur]].id); cur = parent[cur]; }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return null;
}

// Word reduction modulo X·X⁻¹ = e and X³ = e (adjacent letters on the same line merge).
function reduceWord(ids) {
  const out = [];
  for (const id of ids) {
    const m = MOVE_BY_ID[id];
    const e = m.inv ? -1 : 1;
    const top = out[out.length - 1];
    if (top && top.kind === m.kind && top.line === m.line) {
      let s = ((top.exp + e) % 3 + 3) % 3; if (s === 2) s = -1;
      if (s === 0) out.pop(); else top.exp = s;
    } else out.push({ kind: m.kind, line: m.line, exp: e });
  }
  return out.map(x => x.kind + (x.line + 1) + (x.exp < 0 ? "'" : ''));
}

/* ----------------------------------------------------------------------------
   Puzzles
   --------------------------------------------------------------------------*/
const PREDS = {
  magic: b => {
    const s = (...i) => i.reduce((a, k) => a + b[k], 0);
    return [s(0, 1, 2), s(3, 4, 5), s(6, 7, 8), s(0, 3, 6), s(1, 4, 7), s(2, 5, 8), s(0, 4, 8), s(2, 4, 6)].every(v => v === 15);
  },
  evencorners: b => [0, 2, 6, 8].every(i => b[i] % 2 === 0),
  evendiag: b => [0, 4, 8].every(i => b[i] % 2 === 0),
  col123: b => [0, 1, 2].some(c => { const s = new Set([b[c], b[c + 3], b[c + 6]]); return s.has(1) && s.has(2) && s.has(3); }),
};
const PUZZLES = [
  { id: 'p1', start: [1, 8, 3, 6, 2, 5, 7, 4, 9], goal: { type: 'solved' } },
  { id: 'p2', start: [1, 2, 3, 4, 8, 5, 7, 6, 9], goal: { type: 'solved' }, tag: 'homework' },
  { id: 'magic', start: SOLVED, goal: { type: 'pred', id: 'magic' } },
  { id: 'rot90', start: SOLVED, goal: { type: 'state', target: [7, 4, 1, 8, 5, 2, 9, 6, 3] } },
  { id: 'rot180', start: SOLVED, goal: { type: 'state', target: [9, 8, 7, 6, 5, 4, 3, 2, 1] } },
  { id: 'evencorners', start: SOLVED, goal: { type: 'pred', id: 'evencorners' } },
  { id: 'evendiag', start: SOLVED, goal: { type: 'pred', id: 'evendiag' } },
  { id: 'col123', start: SOLVED, goal: { type: 'pred', id: 'col123' } },
  { id: 'mirror', start: SOLVED, goal: { type: 'state', target: [3, 2, 1, 6, 5, 4, 9, 8, 7] }, trap: true },
];

function goalMet(board, goal) {
  switch (goal.type) {
    case 'solved': return same(board, SOLVED);
    case 'state': return same(board, goal.target);
    case 'pred': return PREDS[goal.id](board);
    default: return false;
  }
}
function solveGoal(board, goal) {   // -> array of move ids, [] if met, null if unreachable / table missing
  switch (goal.type) {
    case 'solved': return solveToState(board, SOLVED);
    case 'state': return solveToState(board, goal.target);
    case 'pred': return solveToPred(board, PREDS[goal.id]);
    default: return null;
  }
}
function goalDistance(board, goal) {
  switch (goal.type) {
    case 'solved': return distToState(board, SOLVED);
    case 'state': return distToState(board, goal.target);
    case 'pred': { const p = solveToPred(board, PREDS[goal.id]); return p ? p.length : Infinity; }
    default: return null;
  }
}

/* ----------------------------------------------------------------------------
   i18n
   --------------------------------------------------------------------------*/
const I18N = {
  fa: {
    title: 'کموتاتور', tagline: 'یادگیری جبر مجرد از طریق تعامل', help: 'راهنما', sound: 'صدا',
    currentGoal: 'هدف فعلی', moves: 'حرکت‌ها', par: 'کمینهٔ ممکن', misplaced: 'مهره‌های نابجا',
    word: 'کلمهٔ حرکت‌ها', wordHint: '(عامل سمت راست زودتر اجرا می‌شود)', order: 'ترتیب اجرا', noMoves: 'هنوز حرکتی انجام نشده',
    boardTip: 'برای حرکت، فلش‌ها را بزنید یا روی صفحه انگشت بکشید.',
    undo: 'واگرد', reset: 'از نو', hint: 'راهنمایی', solve: 'حل خودکار', showPaths: 'مسیر مهره‌ها', share: 'اشتراک‌گذاری',
    tabPuzzles: 'معماها', tabLab: 'آزمایشگاه', tabComm: 'جابجاگر',
    scrambleTitle: 'درهم‌ریزی تصادفی', scrambleDesc: 'صفحه‌ای تصادفی که دقیقاً به همین تعداد حرکت تا چیدمان مرتب فاصله دارد.',
    difficulty: 'سختی', scramble: 'درهم بریز', daily: 'چالش امروز',
    labTitle: 'تحلیل وضعیت فعلی', cycleNotation: 'جایگشت خانه‌ها (نماد دوری)', elementOrder: 'مرتبهٔ این عنصر', parity: 'زوجیت',
    distance: 'فاصله تا چیدمان مرتب', reducedWord: 'کلمهٔ ساده‌شده', sandbox: 'صفحهٔ آزاد (از چیدمان مرتب)', applyInverse: 'اجرای معکوس کل کلمه',
    labNote: 'هر حرکت یک ۳‑دور (جایگشت زوج) است؛ پس تنها جایگشت‌های زوج صفحه ــ گروه متناوب A₉ با ۱۸۱٬۴۴۰ عضو ــ دست‌یافتنی‌اند و دورترین وضعیت‌ها ۸ حرکت فاصله دارند.',
    customTitle: 'وضعیت دلخواه', customDesc: 'نُه رقم ۱ تا ۹ را به ترتیب سطرها (از بالا، از چپ به راست) وارد کنید تا به‌عنوان معما بارگذاری شود.', load: 'بارگذاری',
    commTitle: 'آزمایشگاه جابجاگر', commDesc: 'دو حرکت g و h را انتخاب کنید. جابجاگر [g, h] = g h g⁻¹ h⁻¹ نشان می‌دهد این دو چقدر «جابه‌جا نمی‌شوند».',
    applyOnBoard: 'اجرا روی صفحه', applyInverseComm: 'اجرای معکوس [h, g]',
    commNote: 'اگر دو خط موازی باشند، حرکت‌ها جابه‌جا می‌شوند و جابجاگر همانی است. اگر یک سطر و یک ستون باشند، جابجاگر یک ۳‑دور روی خانهٔ مشترک و دو همسایهٔ آن است: ابزار اصلی حل معماها.',
    credit: 'بر اساس طرح بازی «کموتاتور» (بهزاد نجفی) · نسخهٔ وب برای درس جبر مجرد',
    winTitle: 'حل شد!', nextPuzzle: 'معمای بعدی', again: 'دوباره', keepPlaying: 'ادامه', helpTitle: 'بازی «کموتاتور» چیست؟', gotIt: 'فهمیدم',
    even: 'زوج (مثل همهٔ وضعیت‌های دست‌یافتنی)', odd: 'فرد — دست‌نیافتنی!', identity: 'e (همانی)',
    unreachable: 'این هدف دست‌نیافتنی است: جایگشت لازم فرد است، در حالی که هر حرکت یک ۳‑دور زوج است و حاصل‌ضرب جایگشت‌های زوج همیشه زوج می‌ماند.',
    hintMsg: (mv, d) => `حرکت پیشنهادی: ${mv} — ${num(d)} حرکت تا هدف`,
    alreadyThere: 'هدف همین حالا برآورده است.',
    solvedIn: (n, par) => par == null ? `با ${num(n)} حرکت.` : n <= par ? `با ${num(n)} حرکت — کمینهٔ ممکن! ✦` : `با ${num(n)} حرکت (کمینهٔ ممکن: ${num(par)}).`,
    copied: 'لینک این وضعیت کپی شد.', copyFail: u => `این لینک را کپی کنید: ${u}`,
    invalidState: 'نُه رقم متمایز از ۱ تا ۹ وارد کنید.', oddState: 'این وضعیت با حرکت‌های بازی به چیدمان مرتب نمی‌رسد (جایگشت فرد)، اما می‌توانید آن را بررسی کنید.',
    preparing: 'جدول فاصله‌ها در حال محاسبه است…', ready: 'آماده.',
    commIdentity: 'همانی: g و h با هم جابه‌جا می‌شوند.', commSame: 'همانی: هر دو حرکت روی یک خط‌اند.', commParallel: 'همانی: دو خط موازی هیچ خانهٔ مشترکی ندارند.',
    comm3: cells => `یک ۳‑دور روی خانه‌های ${cells.map(num).join('، ')}: <bdi dir="ltr" class="nowrap">(${cells.join(' ')})</bdi>`,
    execOrder: ids => 'ترتیب اجرا: <bdi dir="ltr" class="nowrap">' + ids.join(' → ') + '</bdi>',
    goalSolved: 'صفحه را به چیدمان مرتب ۱ تا ۹ بازگردانید.', goalState: 'صفحه را به این چیدمان برسانید:',
    best: 'بهترین', parLabel: 'کمینه', unknownPar: '؟',
    trapTag: 'تله؟', homeworkTag: 'تمرین تحویلی',
    scrambleName: d => `درهم‌ریزی با سختی ${num(d)}`, scrambleDesc2: 'صفحه را به چیدمان مرتب بازگردانید.',
    dailyName: 'چالش امروز', dailyDesc: 'هر روز یک درهم‌ریزی تازه (سختی ۶)، یکسان برای همه.',
    customName: 'وضعیت دلخواه', freeName: 'صفحهٔ آزاد', freeDesc: 'آزادانه حرکت کنید و در تب «آزمایشگاه» جایگشت حاصل را ببینید.',
    autoSolving: 'حل خودکار در حال اجرا…', solvedNotice: 'تمام شد.',
    pzNames: { p1: 'بازگشت در دو حرکت', p2: 'سه مهرهٔ سرگردان', magic: 'مربع جادویی', rot90: 'چرخش ربع‌دور', rot180: 'چرخش نیم‌دور', evencorners: 'زوج‌ها در گوشه‌ها', evendiag: 'سه زوج روی قطر', col123: '۱، ۲، ۳ در یک ستون', mirror: 'آینه' },
    pzDescs: {
      p1: 'معمای اول طرح بازی. صفحه را با کمترین حرکت مرتب کنید.',
      p2: 'معمای پایانی. با حداکثر چهار حرکت صفحه را مرتب کنید؛ آیا با کمتر هم می‌شود؟',
      magic: 'از چیدمان مرتب، صفحه را طوری بچینید که مجموع هر سطر، هر ستون و هر دو قطر ۱۵ شود.',
      rot90: 'کل صفحه را ۹۰ درجه در جهت عقربه‌های ساعت بچرخانید.',
      rot180: 'کل صفحه را ۱۸۰ درجه بچرخانید؛ دورترین وضعیت ممکن!',
      evencorners: 'چهار مهرهٔ زوج را به چهار گوشه ببرید (به هر ترتیبی).',
      evendiag: 'قطر اصلی (بالا‑چپ تا پایین‑راست) را با سه مهرهٔ زوج پر کنید.',
      col123: 'مهره‌های ۱، ۲ و ۳ را در یک ستون (به هر ترتیبی) کنار هم بگذارید.',
      mirror: 'تصویر آینه‌ای صفحه را بسازید (هر سطر وارونه شود). آیا اصلاً ممکن است؟',
    },
    helpHtml: `
      <p>صفحه‌ای ۳×۳ با مهره‌های ۱ تا ۹ دارید. دو نوع حرکت مجاز است:</p>
      <ul>
        <li><span class="m">R<sub>i</sub></span>: سطر <span class="m">i</span> یک خانه به <b>راست</b> می‌چرخد و مهرهٔ لبهٔ راست به خانهٔ چپ بازمی‌گردد.</li>
        <li><span class="m">C<sub>j</sub></span>: ستون <span class="m">j</span> یک خانه به <b>پایین</b> می‌چرخد و مهرهٔ پایین به خانهٔ بالا بازمی‌گردد.</li>
        <li>معکوس هر حرکت (چپ / بالا) هم مجاز است. سه بار اجرای یک حرکت، صفحه را به حال اول برمی‌گرداند: <span class="m">R<sub>i</sub><sup>3</sup> = C<sub>j</sub><sup>3</sup> = e</span>.</li>
      </ul>
      <h4>کنترل‌ها</h4>
      <p>دکمه‌های اطراف صفحه همان حرکت‌ها هستند و جهت فلش، جهت حرکت مهره‌هاست: فلش‌های سمت چپ (→) حرکت <span class="m">R<sub>i</sub></span>، فلش‌های سمت راست (←) معکوس آن، فلش‌های بالا (↓) حرکت <span class="m">C<sub>j</sub></span> و فلش‌های پایین (↑) معکوس آن را اجرا می‌کنند. سطرها از بالا و ستون‌ها از چپ شماره‌گذاری می‌شوند. روی خود صفحه هم می‌توانید انگشت بکشید: کشیدن افقی روی یک سطر همان <span class="m">R<sub>i</sub></span> و کشیدن عمودی روی یک ستون همان <span class="m">C<sub>j</sub></span> است (در جهت کشیدن؛ جهت مخالف، معکوس حرکت را اجرا می‌کند).</p>
      <h4>نمادگذاری</h4>
      <p>کلمهٔ حرکت‌ها مانند ترکیب توابع نوشته می‌شود: <b>عامل سمت راست زودتر اجرا می‌شود</b>. مثلاً <span class="m">R<sub>2</sub><sup>−1</sup> C<sub>2</sub><sup>−1</sup></span> یعنی اول <span class="m">C<sub>2</sub><sup>−1</sup></span> و سپس <span class="m">R<sub>2</sub><sup>−1</sup></span>. «ترتیب اجرا» همین توالی را از اول به آخر نشان می‌دهد.</p>
      <h4>جابجاگر</h4>
      <p><span class="m">[g, h] = g h g<sup>−1</sup> h<sup>−1</sup></span>. اگر <span class="m">g</span> و <span class="m">h</span> با هم جابه‌جا شوند، جابجاگر همانی است. یک سطر و یک ستون جابه‌جا نمی‌شوند و جابجاگرشان یک ۳‑دور روی خانهٔ مشترک و دو همسایهٔ آن است؛ با همین ابزار می‌توان سه مهرهٔ دلخواهِ «گوشه‌ای» را چرخاند.</p>
      <h4>چند واقعیت</h4>
      <ul>
        <li>هر حرکت یک ۳‑دور، یعنی جایگشتی زوج است؛ پس فقط نیمی از ۹! چیدمان (۱۸۱٬۴۴۰ تا، گروه <span class="m">A<sub>9</sub></span>) دست‌یافتنی‌اند.</li>
        <li>هیچ وضعیتی بیش از ۸ حرکت با چیدمان مرتب فاصله ندارد. «راهنمایی» و «حل خودکار» همیشه کوتاه‌ترین راه را نشان می‌دهند.</li>
      </ul>`,
  },
  en: {
    title: 'Kommutator', tagline: 'Learning abstract algebra by touch', help: 'Help', sound: 'Sound',
    currentGoal: 'Current goal', moves: 'Moves', par: 'Optimal', misplaced: 'Misplaced tiles',
    word: 'Word of moves', wordHint: '(rightmost factor is applied first)', order: 'Execution order', noMoves: 'No moves yet',
    boardTip: 'Tap the arrows or swipe on the board to move.',
    undo: 'Undo', reset: 'Reset', hint: 'Hint', solve: 'Auto-solve', showPaths: 'Tile paths', share: 'Share',
    tabPuzzles: 'Puzzles', tabLab: 'Lab', tabComm: 'Commutator',
    scrambleTitle: 'Random scramble', scrambleDesc: 'A random board that is exactly this many moves away from the ordered board.',
    difficulty: 'Difficulty', scramble: 'Scramble', daily: "Today's challenge",
    labTitle: 'Current position', cycleNotation: 'Cell permutation (cycle notation)', elementOrder: 'Order of this element', parity: 'Parity',
    distance: 'Distance to the ordered board', reducedWord: 'Reduced word', sandbox: 'Free board (from the ordered board)', applyInverse: 'Apply the inverse of the whole word',
    labNote: 'Every move is a 3-cycle (an even permutation), so only even arrangements are reachable: the alternating group A₉ with 181,440 elements. No position is more than 8 moves away.',
    customTitle: 'Custom position', customDesc: 'Enter the nine digits 1–9 row by row (top row first, left to right) to load them as a puzzle.', load: 'Load',
    commTitle: 'Commutator lab', commDesc: 'Pick two moves g and h. The commutator [g, h] = g h g⁻¹ h⁻¹ measures how much they fail to commute.',
    applyOnBoard: 'Apply on the board', applyInverseComm: 'Apply the inverse [h, g]',
    commNote: 'Parallel lines commute, so their commutator is the identity. A row and a column do not: their commutator is a 3-cycle on the shared cell and its two neighbours — the main tool for solving puzzles.',
    credit: 'Based on the game design “Kommutator” (Behzad Najafi) · web version for an abstract algebra course',
    winTitle: 'Solved!', nextPuzzle: 'Next puzzle', again: 'Again', keepPlaying: 'Keep playing', helpTitle: 'What is Kommutator?', gotIt: 'Got it',
    even: 'even (like every reachable position)', odd: 'odd — unreachable!', identity: 'e (identity)',
    unreachable: 'This goal is unreachable: it needs an odd permutation, but every move is an even 3-cycle and products of even permutations stay even.',
    hintMsg: (mv, d) => `Suggested move: ${mv} — ${d} move${d === 1 ? '' : 's'} to the goal`,
    alreadyThere: 'The goal is already met.',
    solvedIn: (n, par) => par == null ? `in ${n} moves.` : n <= par ? `in ${n} moves — optimal! ✦` : `in ${n} moves (optimal: ${par}).`,
    copied: 'Link to this position copied.', copyFail: u => `Copy this link: ${u}`,
    invalidState: 'Enter nine distinct digits from 1 to 9.', oddState: 'This position cannot reach the ordered board (odd permutation), but you can still explore it.',
    preparing: 'Computing the distance table…', ready: 'Ready.',
    commIdentity: 'Identity: g and h commute.', commSame: 'Identity: both moves act on the same line.', commParallel: 'Identity: parallel lines share no cell.',
    comm3: cells => `A 3-cycle on cells ${cells.join(', ')}: <bdi dir="ltr" class="nowrap">(${cells.join(' ')})</bdi>`,
    execOrder: ids => 'Execution order: <bdi dir="ltr" class="nowrap">' + ids.join(' → ') + '</bdi>',
    goalSolved: 'Restore the ordered board 1–9.', goalState: 'Reach this arrangement:',
    best: 'best', parLabel: 'optimal', unknownPar: '?',
    trapTag: 'trap?', homeworkTag: 'homework',
    scrambleName: d => `Scramble, difficulty ${d}`, scrambleDesc2: 'Restore the ordered board.',
    dailyName: "Today's challenge", dailyDesc: 'A fresh scramble every day (difficulty 6), the same for everyone.',
    customName: 'Custom position', freeName: 'Free board', freeDesc: 'Move freely and inspect the resulting permutation in the Lab tab.',
    autoSolving: 'Auto-solving…', solvedNotice: 'Done.',
    pzNames: { p1: 'Back in two moves', p2: 'Three wandering tiles', magic: 'Magic square', rot90: 'Quarter turn', rot180: 'Half turn', evencorners: 'Evens in the corners', evendiag: 'Three evens on the diagonal', col123: '1, 2, 3 in one column', mirror: 'Mirror' },
    pzDescs: {
      p1: 'Puzzle 1 from the proposal. Restore the board in as few moves as possible.',
      p2: 'The final puzzle. Restore the board in at most four moves — can it be done in fewer?',
      magic: 'From the ordered board, arrange the tiles so every row, column and both diagonals sum to 15.',
      rot90: 'Rotate the whole board 90° clockwise.',
      rot180: 'Rotate the whole board by 180° — the farthest position there is!',
      evencorners: 'Bring the four even tiles to the four corners (in any order).',
      evendiag: 'Fill the main diagonal (top-left to bottom-right) with three even tiles.',
      col123: 'Gather tiles 1, 2 and 3 in a single column (any order).',
      mirror: 'Build the mirror image of the board (every row reversed). Is it even possible?',
    },
    helpHtml: `
      <p>You have a 3×3 board with tiles 1–9. Two kinds of move are allowed:</p>
      <ul>
        <li><span class="m">R<sub>i</sub></span>: row <span class="m">i</span> rotates one cell to the <b>right</b>; the tile on the right edge wraps around to the left.</li>
        <li><span class="m">C<sub>j</sub></span>: column <span class="m">j</span> rotates one cell <b>down</b>; the bottom tile wraps around to the top.</li>
        <li>Inverses (left / up) are allowed too. Three applications of a move restore the board: <span class="m">R<sub>i</sub><sup>3</sup> = C<sub>j</sub><sup>3</sup> = e</span>.</li>
      </ul>
      <h4>Controls</h4>
      <p>The buttons around the board are the moves, and each arrow points the way the tiles travel: left-hand arrows (→) apply <span class="m">R<sub>i</sub></span>, right-hand arrows (←) its inverse, top arrows (↓) apply <span class="m">C<sub>j</sub></span> and bottom arrows (↑) its inverse. Rows are numbered from the top, columns from the left. You can also swipe on the board itself: a horizontal swipe on a row applies <span class="m">R<sub>i</sub></span> and a vertical swipe on a column applies <span class="m">C<sub>j</sub></span>, in the direction you swipe (the opposite direction applies the inverse).</p>
      <h4>Notation</h4>
      <p>Words are written like compositions of functions: <b>the rightmost factor is applied first</b>. For example <span class="m">R<sub>2</sub><sup>−1</sup> C<sub>2</sub><sup>−1</sup></span> means first <span class="m">C<sub>2</sub><sup>−1</sup></span>, then <span class="m">R<sub>2</sub><sup>−1</sup></span>. “Execution order” shows the same sequence first to last.</p>
      <h4>Commutators</h4>
      <p><span class="m">[g, h] = g h g<sup>−1</sup> h<sup>−1</sup></span>. If <span class="m">g</span> and <span class="m">h</span> commute, the commutator is the identity. A row and a column do not commute: their commutator is a 3-cycle on the shared cell and its two neighbours, which lets you rotate any three “L-shaped” tiles.</p>
      <h4>Some facts</h4>
      <ul>
        <li>Every move is a 3-cycle, hence even; so only half of the 9! arrangements (181,440 of them, the group <span class="m">A<sub>9</sub></span>) are reachable.</li>
        <li>No position is more than 8 moves from the ordered board. “Hint” and “Auto-solve” always show a shortest route.</li>
      </ul>`,
  },
};
let lang = (() => { try { return localStorage.getItem('kommutator.lang') || 'fa'; } catch (_) { return 'fa'; } })();
const T = key => I18N[lang][key];
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function num(n) { const s = String(n); return lang === 'fa' ? s.replace(/\d/g, d => FA_DIGITS[d]) : s; }

/* ----------------------------------------------------------------------------
   HTML helpers for math notation
   --------------------------------------------------------------------------*/
const sym = m => `<span class="g">${m.kind}<sub>${m.line + 1}</sub>${m.inv ? '<sup>−1</sup>' : ''}</span>`;
const symText = m => `${m.kind}${'₁₂₃'[m.line]}${m.inv ? '⁻¹' : ''}`;
function wordHTML(ids) {          // ids in execution order -> algebraic word (rightmost first)
  if (!ids.length) return '<span class="e">e</span>';
  return ids.slice().reverse().map(id => sym(MOVE_BY_ID[id])).join('');
}
function miniBoard(board, opts = {}) {
  const hl = new Set(opts.hl || []);
  const cells = board.map((t, i) => t == null
    ? `<span class="q">?</span>`
    : `<span style="--h:${hue(t)}" class="${hl.has(i) ? 'hl' : ''}">${t}</span>`).join('');
  return `<div class="mini ${opts.lg ? 'lg' : ''}">${cells}</div>`;
}
const hue = t => 262 - (t - 1) * 29;   // 1 → violet … 9 → orange

/* ----------------------------------------------------------------------------
   State
   --------------------------------------------------------------------------*/
let board = SOLVED.slice();
let moveLog = [];                 // move ids in execution order
let puzzle = null;                // {id, start, goal, name, desc, par, kind}
let celebrated = false;
let busy = false;                 // auto-solve in progress
let soundOn = (() => { try { return localStorage.getItem('kommutator.sound') !== 'off'; } catch (_) { return true; } })();
const best = (() => { try { return JSON.parse(localStorage.getItem('kommutator.best') || '{}'); } catch (_) { return {}; } })();
const saveBest = () => { try { localStorage.setItem('kommutator.best', JSON.stringify(best)); } catch (_) {} };

const $ = s => document.querySelector(s);
const el = {
  well: $('#well'), board: $('#board'), arrows: $('#arrows'),
  moves: $('#stat-moves'), par: $('#stat-par'), misplaced: $('#stat-misplaced'), word: $('#word'), chips: $('#chips'),
  notice: $('#notice'), goalName: $('#goal-name'), goalDesc: $('#goal-desc'), list: $('#puzzle-list'),
};
const tiles = {};

/* ----------------------------------------------------------------------------
   Board rendering & animation
   --------------------------------------------------------------------------*/
function metrics() {
  const gap = parseFloat(getComputedStyle(el.well).getPropertyValue('--gap')) || 10;
  const w = el.well.clientWidth;
  const cell = (w - 2 * gap) / 3;
  return { gap, cell, step: cell + gap };
}
const rc = i => [Math.floor(i / 3), i % 3];
const tf = (r, c, step) => `translate(${c * step}px, ${r * step}px)`;

function buildTiles() {
  el.well.innerHTML = '';
  for (let t = 1; t <= 9; t++) {
    const d = document.createElement('div');
    d.className = 'tile'; d.textContent = t; d.style.setProperty('--h', hue(t)); d.dataset.tile = t;
    el.well.appendChild(d); tiles[t] = d;
  }
}
function layout(b = board) {
  const { step } = metrics();
  b.forEach((t, i) => { const [r, c] = rc(i); tiles[t].style.transform = tf(r, c, step); });
  markHomes(b); drawArrows(b);
}
function markHomes(b) {
  b.forEach((t, i) => { tiles[t].classList.toggle('home', t === i + 1); tiles[t].classList.toggle('away', t !== i + 1); });
  el.board.classList.toggle('solved', same(b, SOLVED));
}
function drawArrows(b) {
  const { step, cell } = metrics();
  const center = i => { const [r, c] = rc(i); return [c * step + cell / 2, r * step + cell / 2]; };
  let svg = '';
  b.forEach((t, i) => {
    const j = t - 1; if (j === i) return;
    const [x1, y1] = center(i), [x2, y2] = center(j);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;          // unit + perpendicular
    const sx = x1 + ux * cell * 0.22, sy = y1 + uy * cell * 0.22;
    const ex = x2 - ux * cell * 0.34, ey = y2 - uy * cell * 0.34;
    const bend = L * 0.22;
    const mx = (sx + ex) / 2 + px * bend, my = (sy + ey) / 2 + py * bend;
    // tangent at the end of the quadratic curve: from control point to end
    const tx = ex - mx, ty = ey - my, tl = Math.hypot(tx, ty), ax = tx / tl, ay = ty / tl;
    const hw = cell * 0.09, hl = cell * 0.16;
    const head = `${ex},${ey} ${ex - ax * hl + ay * hw},${ey - ay * hl - ax * hw} ${ex - ax * hl - ay * hw},${ey - ay * hl + ax * hw}`;
    const col = `hsl(${hue(t)} 95% 75%)`;
    svg += `<path d="M${sx},${sy} Q${mx},${my} ${ex},${ey}" fill="none" stroke="${col}" stroke-width="${Math.max(2, cell * 0.045)}" stroke-linecap="round" opacity=".95" style="filter:drop-shadow(0 0 6px ${col})"/>` +
           `<polygon points="${head}" fill="${col}" style="filter:drop-shadow(0 0 6px ${col})"/>`;
  });
  el.arrows.innerHTML = svg;
}

const EASE = 'cubic-bezier(.22,.9,.24,1)';
let chain = Promise.resolve();
let pending = 0;
function enqueue(job) {
  pending++;
  chain = chain.then(job).catch(err => console.error(err)).then(() => { pending--; });
  return chain;
}
function duration() {
  const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur')) || 0;
  return Math.max(base > 0 ? 110 : 0, base - 22 * Math.max(0, pending - 1));
}

async function animateMove(before, m) {
  const dur = duration();
  const { step } = metrics();
  const waits = [];
  const dr = m.kind === 'C' ? m.dir : 0, dc = m.kind === 'R' ? m.dir : 0;
  for (let i = 0; i < 9; i++) {
    const j = m.perm[i]; if (j === i) continue;
    const t = before[i], node = tiles[t];
    const [r0, c0] = rc(i), [r1, c1] = rc(j);
    const wraps = (r0 + dr !== r1) || (c0 + dc !== c1);
    node.style.transform = tf(r1, c1, step);
    if (!wraps) {
      waits.push(node.animate([{ transform: tf(r0, c0, step) }, { transform: tf(r1, c1, step) }], { duration: dur, easing: EASE }).finished);
    } else {
      const a = node.animate([{ transform: tf(r0, c0, step) }, { transform: tf(r0 + dr, c0 + dc, step) }], { duration: dur, easing: EASE, fill: 'forwards' });
      const ghost = node.cloneNode(true); ghost.classList.add('ghost'); el.well.appendChild(ghost);
      const g = ghost.animate([{ transform: tf(r1 - dr, c1 - dc, step) }, { transform: tf(r1, c1, step) }], { duration: dur, easing: EASE, fill: 'forwards' });
      waits.push(Promise.all([a.finished, g.finished]).then(() => { a.cancel(); ghost.remove(); }));
    }
  }
  await Promise.all(waits);
}
async function animateReset(after) {
  const dur = duration();
  if (dur > 0) await el.well.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 160, easing: 'ease-in' }).finished;
  layout(after);
  if (dur > 0) await el.well.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, easing: EASE }).finished;
}

/* ----------------------------------------------------------------------------
   Sound & confetti
   --------------------------------------------------------------------------*/
let audio = null;
function beep(freq, when = 0, dur = 0.09, gain = 0.07, type = 'sine') {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + when;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (_) {}
}
const tick = m => beep(m.kind === 'R' ? 520 : 660, 0, 0.09, 0.06, 'triangle');
const fanfare = () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(f, i * 0.09, 0.28, 0.08)); };

function confetti() {
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#89b4ff', '#ff7ad9', '#5ee6a8', '#ffc66d', '#ffffff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 5 + Math.random() * 6, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function frame(now) {
    const k = (now - t0) / 1000; ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.vx *= 0.99; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - k / 2.2); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
    }
    if (k < 2.3) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

/* ----------------------------------------------------------------------------
   Game actions
   --------------------------------------------------------------------------*/
function setNotice(msg, cls = '') { el.notice.textContent = msg || ''; el.notice.className = 'notice ' + cls; }
function clearHint() { document.querySelectorAll('.ctl.hint').forEach(b => b.classList.remove('hint')); }

function doMove(id, { record = true, sound = true } = {}) {
  const m = MOVE_BY_ID[id];
  const before = board;
  board = applyMove(board, m);
  if (record) moveLog.push(id);
  clearHint();
  if (sound) tick(m);
  const after = board, won = record && !celebrated && puzzle && goalMet(after, puzzle.goal);
  if (won) celebrated = true;
  const nMoves = moveLog.length;
  refreshStats();
  enqueue(async () => {
    await animateMove(before, m);
    markHomes(after); drawArrows(after);
    if (won) celebrate(nMoves);
  });
}
function undo() {
  if (!moveLog.length || busy) return;
  const last = moveLog.pop();
  doMove(inverseOf(MOVE_BY_ID[last]).id, { record: false });
  celebrated = false;
}
function resetBoard(toBoard = puzzle.start) {
  board = toBoard.slice(); moveLog = []; celebrated = false; clearHint(); setNotice('');
  refreshStats();
  const after = board;
  enqueue(() => animateReset(after));
}
function playSequence(ids) {
  if (!ids.length) return Promise.resolve();
  busy = true; setBusy(true); setNotice(T('autoSolving'), 'info');
  for (const id of ids) doMove(id);
  return enqueue(async () => {}).then(() => { busy = false; setBusy(false); if (el.notice.textContent === T('autoSolving')) setNotice(''); });
}
function setBusy(on) {
  document.querySelectorAll('.ctl, #btn-undo, #btn-reset, #btn-solve, #btn-hint, #btn-comm-apply, #btn-comm-inverse, #btn-invert').forEach(b => { b.disabled = on; });
}

async function hint() {
  if (busy || !puzzle || puzzle.goal.type === 'free') return;
  await ensureDist();
  if (goalMet(board, puzzle.goal)) { setNotice(T('alreadyThere'), 'ok'); return; }
  const path = solveGoal(board, puzzle.goal);
  if (!path) { setNotice(T('unreachable')); return; }
  const m = MOVE_BY_ID[path[0]];
  clearHint(); document.getElementById('ctl-' + m.id).classList.add('hint');
  setNotice(T('hintMsg')(symText(m), path.length), 'info');
}
async function autoSolve() {
  if (busy || !puzzle || puzzle.goal.type === 'free') return;
  await ensureDist();
  if (goalMet(board, puzzle.goal)) { setNotice(T('alreadyThere'), 'ok'); return; }
  const path = solveGoal(board, puzzle.goal);
  if (!path) { setNotice(T('unreachable')); return; }
  await playSequence(path);
}
async function ensureDist() {
  if (DIST) return DIST;
  setNotice(T('preparing'), 'info');
  await distReady;
  if (el.notice.textContent === T('preparing')) setNotice('');
  return DIST;
}

function celebrate(nMoves) {
  fanfare(); confetti();
  const par = puzzle.par;
  if (puzzle.bestKey && (best[puzzle.bestKey] == null || nMoves < best[puzzle.bestKey])) { best[puzzle.bestKey] = nMoves; saveBest(); renderPuzzleList(); }
  $('#win-title').textContent = T('winTitle');
  $('#win-sub').textContent = T('solvedIn')(nMoves, par == null || par === Infinity ? null : par);
  $('#win-word').innerHTML = wordHTML(moveLog) + (reduceWord(moveLog).length < moveLog.length ? `<span class="eq">=</span>${wordHTML(reduceWord(moveLog))}` : '');
  $('#btn-next').hidden = !nextPuzzleOf(puzzle);
  openModal('#modal-win');
}
function nextPuzzleOf(p) { const i = PUZZLES.findIndex(x => x.id === p.id); return i >= 0 && i + 1 < PUZZLES.length ? PUZZLES[i + 1] : null; }

/* ----------------------------------------------------------------------------
   Puzzles: loading, scramble, daily, custom, free
   --------------------------------------------------------------------------*/
function puzzleName(p) {
  if (p.kind === 'scramble') return T('scrambleName')(p.par);
  if (p.kind === 'daily') return T('dailyName');
  if (p.kind === 'custom') return T('customName');
  if (p.kind === 'free') return T('freeName');
  return T('pzNames')[p.id];
}
function puzzleDesc(p) {
  if (p.kind === 'scramble') return T('scrambleDesc2');
  if (p.kind === 'daily') return T('dailyDesc');
  if (p.kind === 'custom') return T('goalSolved');
  if (p.kind === 'free') return T('freeDesc');
  return T('pzDescs')[p.id];
}
async function loadPuzzle(p, { pushHash = true } = {}) {
  if (busy) return;
  puzzle = Object.assign({ kind: 'builtin', bestKey: p.id }, p);
  resetBoard(puzzle.start);
  renderGoal(); renderPuzzleList(); refreshStats();
  if (pushHash) {
    const h = puzzle.kind === 'builtin' ? '#p=' + puzzle.id : puzzle.kind === 'custom' || puzzle.kind === 'scramble' ? '#s=' + puzzle.start.join('') : puzzle.kind === 'daily' ? '#daily' : '';
    history.replaceState(null, '', location.pathname + location.search + h);
  }
  if (puzzle.par === undefined) {
    if (puzzle.goal.type === 'free') puzzle.par = null;
    else { const me = puzzle; await distReady; if (puzzle === me) { me.par = goalDistance(me.start, me.goal); refreshStats(); renderPuzzleList(); } }
  }
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randomEvenBoard(rnd) {
  const b = SOLVED.slice();
  for (let i = 8; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  if (parity(b)) [b[0], b[1]] = [b[1], b[0]];
  return b;
}
function boardAtDistance(d, rnd = Math.random) {
  for (let k = 0; k < 200000; k++) { const b = randomEvenBoard(rnd); if (DIST[permIndex(b)] === d) return b; }
  return null;
}
async function scramble() {
  if (busy) return;
  await ensureDist();
  const d = +$('#diff').value;
  const b = boardAtDistance(d);
  loadPuzzle({ id: 'scramble', kind: 'scramble', bestKey: null, start: b, goal: { type: 'solved' }, par: d });
}
async function daily() {
  if (busy) return;
  await ensureDist();
  const now = new Date(), key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const b = boardAtDistance(6, mulberry32(key * 2654435761 % 4294967296));
  loadPuzzle({ id: 'daily', kind: 'daily', bestKey: 'daily-' + key, start: b, goal: { type: 'solved' }, par: 6 });
}
function loadCustom(digits, { pushHash = true } = {}) {
  const s = String(digits).replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/\D/g, '');
  if (s.length !== 9 || new Set(s).size !== 9 || /0/.test(s)) { setNotice(T('invalidState')); return false; }
  const b = s.split('').map(Number);
  loadPuzzle({ id: 'custom', kind: 'custom', bestKey: null, start: b, goal: { type: 'solved' } }, { pushHash });
  if (parity(b)) setNotice(T('oddState'));
  return true;
}
function freeBoard() { loadPuzzle({ id: 'free', kind: 'free', bestKey: null, start: SOLVED, goal: { type: 'free' }, par: null }); switchTab('lab'); }

/* ----------------------------------------------------------------------------
   Rendering: stats, goal strip, puzzle list, lab, commutator
   --------------------------------------------------------------------------*/
function refreshStats() {
  el.moves.textContent = num(moveLog.length);
  const par = puzzle ? puzzle.par : null;
  el.par.textContent = !puzzle || puzzle.goal.type === 'free' ? '—' : puzzle.trap ? T('unknownPar') : par === undefined ? '…' : par === Infinity ? '∞' : num(par);
  el.misplaced.textContent = num(board.filter((t, i) => t !== i + 1).length);
  el.word.innerHTML = wordHTML(moveLog);
  el.chips.innerHTML = moveLog.length
    ? moveLog.map((id, k) => { const m = MOVE_BY_ID[id]; return `<span class="chip ${m.kind === 'R' ? 'row' : 'col'} ${k === moveLog.length - 1 ? 'last' : ''}"><span class="n">${k + 1}</span>${sym(m)}</span>`; }).join('')
    : `<span class="muted">${T('noMoves')}</span>`;
  $('#btn-undo').disabled = busy || !moveLog.length;
  const noGoal = !puzzle || puzzle.goal.type === 'free';
  $('#btn-hint').disabled = busy || noGoal; $('#btn-solve').disabled = busy || noGoal;
  renderLab();
}
function renderGoal() {
  if (!puzzle) return;
  el.goalName.textContent = puzzleName(puzzle);
  let desc = puzzleDesc(puzzle);
  if (puzzle.goal.type === 'state') desc += ' ' + miniBoard(puzzle.goal.target);
  else if (puzzle.goal.type === 'solved' && puzzle.kind !== 'builtin') desc += ' ' + miniBoard(SOLVED);
  el.goalDesc.innerHTML = desc;
}
function renderPuzzleList() {
  el.list.innerHTML = PUZZLES.map(p => {
    const par = p.par === undefined ? '…' : p.par === Infinity ? '∞' : num(p.par);
    const b = best[p.id];
    const tags = (p.tag === 'homework' ? `<span class="tag">${T('homeworkTag')}</span>` : '') + (p.trap ? `<span class="tag">${T('trapTag')}</span>` : '');
    const goalMini = p.goal.type === 'state' ? miniBoard(p.goal.target) : p.goal.type === 'solved' ? miniBoard(SOLVED) : miniBoard(new Array(9).fill(null));
    return `<button class="pz ${puzzle && puzzle.id === p.id ? 'active' : ''}" type="button" data-id="${p.id}">
      <span class="pz-boards">${miniBoard(p.start)}<span style="opacity:.5;margin:0 4px">→</span>${goalMini}</span>
      <span><span class="pz-name">${T('pzNames')[p.id]} ${tags}</span><span class="pz-desc">${T('pzDescs')[p.id]}</span></span>
      <span class="pz-meta"><span class="badge">${T('parLabel')}: ${p.trap ? T('unknownPar') : par}</span>${b != null ? `<span class="badge ${p.par != null && b <= p.par ? 'star' : 'ok'}">${T('best')}: ${num(b)}</span>` : ''}</span>
    </button>`;
  }).join('');
}
function renderLab() {
  const cyc = cyclesOf(board);
  $('#lab-cycles').innerHTML = cyc.length ? cyc.map(c => `(${c.join(' ')})`).join(' ') : `<span class="muted">${T('identity')}</span>`;
  $('#lab-order').textContent = num(orderOf(board));
  const odd = parity(board);
  $('#lab-parity').textContent = odd ? T('odd') : T('even');
  const d = distToState(board, SOLVED);
  $('#lab-dist').textContent = d == null ? '…' : d === Infinity ? '∞' : num(d);
  $('#lab-reduced').innerHTML = wordHTML(reduceWord(moveLog));
  $('#btn-invert').disabled = busy || !reduceWord(moveLog).length;
}
function fillSelects() {
  const opts = MOVES.map(m => `<option value="${m.id}">${symText(m)}</option>`).join('');
  $('#sel-g').innerHTML = opts; $('#sel-h').innerHTML = opts;
  $('#sel-g').value = 'R2'; $('#sel-h').value = 'C2';
}
function commSequence(gId, hId) {       // execution order of [g,h] = g h g⁻¹ h⁻¹
  const g = MOVE_BY_ID[gId], h = MOVE_BY_ID[hId];
  return [inverseOf(h).id, inverseOf(g).id, h.id, g.id];
}
function renderComm() {
  const gId = $('#sel-g').value, hId = $('#sel-h').value, g = MOVE_BY_ID[gId], h = MOVE_BY_ID[hId];
  const seq = commSequence(gId, hId);
  $('#comm-word').innerHTML = `[${sym(g)}, ${sym(h)}] = ${wordHTML(seq)}`;
  const result = applySeq(SOLVED, seq);
  const support = result.map((t, i) => t !== i + 1 ? i : -1).filter(i => i >= 0);
  $('#comm-board').innerHTML = miniBoard(result, { lg: true, hl: support });
  let msg;
  if (!support.length) msg = g.kind === h.kind && g.line === h.line ? T('commSame') : g.kind === h.kind ? T('commParallel') : T('commIdentity');
  else msg = T('comm3')(cyclesOf(result)[0]);
  $('#comm-result').innerHTML = msg;
  $('#comm-exec').innerHTML = T('execOrder')(seq.map(id => symText(MOVE_BY_ID[id])));
}

/* ----------------------------------------------------------------------------
   Controls & wiring
   --------------------------------------------------------------------------*/
function buildControls() {
  const mk = (m, arrow) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ctl'; b.id = 'ctl-' + m.id; b.dataset.move = m.id;
    b.setAttribute('aria-label', symText(m)); b.title = symText(m);
    b.innerHTML = `<span class="arrow">${arrow}</span><span class="lbl">${m.kind}<sub>${m.line + 1}</sub>${m.inv ? '<sup>−1</sup>' : ''}</span>`;
    b.addEventListener('click', () => { if (!busy) doMove(m.id); });
    return b;
  };
  for (let l = 0; l < 3; l++) {
    $('#ctl-top').appendChild(mk(MOVE_BY_ID['C' + (l + 1)], '↓'));
    $('#ctl-bottom').appendChild(mk(MOVE_BY_ID['C' + (l + 1) + "'"], '↑'));
    $('#ctl-left').appendChild(mk(MOVE_BY_ID['R' + (l + 1)], '→'));
    $('#ctl-right').appendChild(mk(MOVE_BY_ID['R' + (l + 1) + "'"], '←'));
  }
}
// swipe / drag on the board: horizontal on a row -> R_i (right) or R_i^-1 (left); vertical on a column -> C_j (down) or C_j^-1 (up)
function initSwipe() {
  const well = el.well;
  let start = null;
  well.addEventListener('pointerdown', e => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = well.getBoundingClientRect();
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX - r.left, cy: e.clientY - r.top, fired: false };
    try { well.setPointerCapture(e.pointerId); } catch (_) {}
  });
  well.addEventListener('pointermove', e => {
    if (!start || start.fired || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const { step, cell } = metrics();
    const threshold = Math.max(16, cell * 0.25);
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    const col = Math.min(2, Math.max(0, Math.floor(start.cx / step)));
    const row = Math.min(2, Math.max(0, Math.floor(start.cy / step)));
    const id = Math.abs(dx) >= Math.abs(dy) ? 'R' + (row + 1) + (dx > 0 ? '' : "'") : 'C' + (col + 1) + (dy > 0 ? '' : "'");
    start.fired = true;
    if (!busy) doMove(id);
  });
  const end = e => { if (start && e.pointerId === start.id) { try { well.releasePointerCapture(e.pointerId); } catch (_) {} start = null; } };
  well.addEventListener('pointerup', end);
  well.addEventListener('pointercancel', end);
}
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  document.querySelectorAll('.tab-body').forEach(b => b.classList.toggle('active', b.id === 'tab-' + name));
}
function openModal(sel) { $(sel).hidden = false; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); }

function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.title = lang === 'fa' ? 'کموتاتور — بازی جبر مجرد' : 'Kommutator — an abstract algebra game';
  document.querySelectorAll('[data-i18n]').forEach(n => {
    const key = n.dataset.i18n, v = T(key);
    if (key === 'word') { n.innerHTML = `${v} <small data-i18n="wordHint">${T('wordHint')}</small>`; return; }
    if (typeof v === 'string') n.textContent = v;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = T(n.dataset.i18nTitle); });
  $('#btn-lang').textContent = lang === 'fa' ? 'EN' : 'فا';
  $('#help-body').innerHTML = T('helpHtml');
  $('#diff-out').textContent = num($('#diff').value);
  $('#foot-extra').innerHTML = [CONFIG.author, CONFIG.repoUrl ? `<a href="${CONFIG.repoUrl}" target="_blank" rel="noopener">GitHub</a>` : ''].filter(Boolean).join(' · ');
  renderGoal(); renderPuzzleList(); refreshStats(); renderComm();
}

function share() {
  const url = location.origin + location.pathname + '#s=' + board.join('');
  const done = () => setNotice(T('copied'), 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => setNotice(T('copyFail')(url), 'info'));
  else setNotice(T('copyFail')(url), 'info');
}

function init() {
  buildTiles(); buildControls(); fillSelects(); layout(); initSwipe();
  new ResizeObserver(() => layout()).observe(el.well);

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-reset').addEventListener('click', () => { if (!busy) resetBoard(); });
  $('#btn-hint').addEventListener('click', hint);
  $('#btn-solve').addEventListener('click', autoSolve);
  $('#btn-share').addEventListener('click', share);
  $('#btn-arrows').addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); el.board.classList.toggle('show-arrows', on); });
  $('#btn-scramble').addEventListener('click', scramble);
  $('#btn-daily').addEventListener('click', daily);
  $('#diff').addEventListener('input', e => { $('#diff-out').textContent = num(e.target.value); });
  $('#btn-sandbox').addEventListener('click', freeBoard);
  $('#btn-invert').addEventListener('click', () => { if (busy) return; const w = reduceWord(moveLog); playSequence(w.slice().reverse().map(id => inverseOf(MOVE_BY_ID[id]).id)); });
  $('#btn-custom').addEventListener('click', () => loadCustom($('#custom-input').value));
  $('#custom-input').addEventListener('keydown', e => { if (e.key === 'Enter') loadCustom(e.target.value); });
  $('#sel-g').addEventListener('change', renderComm); $('#sel-h').addEventListener('change', renderComm);
  $('#btn-swap').addEventListener('click', () => { const g = $('#sel-g').value; $('#sel-g').value = $('#sel-h').value; $('#sel-h').value = g; renderComm(); });
  $('#btn-comm-apply').addEventListener('click', () => { if (!busy) playSequence(commSequence($('#sel-g').value, $('#sel-h').value)); });
  $('#btn-comm-inverse').addEventListener('click', () => { if (!busy) playSequence(commSequence($('#sel-h').value, $('#sel-g').value)); });
  el.list.addEventListener('click', e => { const b = e.target.closest('.pz'); if (b) loadPuzzle(PUZZLES.find(p => p.id === b.dataset.id)); });
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $('#btn-help').addEventListener('click', () => openModal('#modal-help'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  $('#btn-next').addEventListener('click', () => { closeModals(); const n = nextPuzzleOf(puzzle); if (n) loadPuzzle(n); });
  $('#btn-again').addEventListener('click', () => { closeModals(); resetBoard(); });
  $('#btn-lang').addEventListener('click', () => { lang = lang === 'fa' ? 'en' : 'fa'; try { localStorage.setItem('kommutator.lang', lang); } catch (_) {} applyLang(); });
  const soundBtn = $('#btn-sound');
  soundBtn.setAttribute('aria-pressed', soundOn);
  soundBtn.addEventListener('click', () => { soundOn = !soundOn; soundBtn.setAttribute('aria-pressed', soundOn); try { localStorage.setItem('kommutator.sound', soundOn ? 'on' : 'off'); } catch (_) {} if (soundOn) beep(660, 0, 0.08); });

  // keyboard: Z undo, R reset, H hint
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'z' || e.key === 'Z') undo(); else if (e.key === 'r' || e.key === 'R') { if (!busy) resetBoard(); } else if (e.key === 'h' || e.key === 'H') hint();
  });

  applyLang();

  // pars for the built-in list
  distReady.then(() => { PUZZLES.forEach(p => { p.par = goalDistance(p.start, p.goal); }); if (puzzle && puzzle.kind === 'builtin') { puzzle.par = PUZZLES.find(p => p.id === puzzle.id).par; } renderPuzzleList(); refreshStats(); });

  // puzzle from the URL hash (on load and whenever the hash changes)
  const applyHash = () => {
    const h = location.hash;
    let m;
    if ((m = /^#p=([a-z0-9]+)$/i.exec(h)) && PUZZLES.find(p => p.id === m[1])) loadPuzzle(PUZZLES.find(p => p.id === m[1]), { pushHash: false });
    else if ((m = /^#s=(\d{9})$/.exec(h)) && loadCustom(m[1], { pushHash: false })) { /* loaded */ }
    else if (h === '#daily') daily();
    else if (!puzzle) loadPuzzle(PUZZLES[0], { pushHash: false });
  };
  applyHash();
  window.addEventListener('hashchange', () => { if (!busy) applyHash(); });
}
document.addEventListener('DOMContentLoaded', init);
