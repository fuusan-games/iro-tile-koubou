/* いろタイル工房 — ルールとCPU（ブラウザ・Node共通）
 * 色 0=藍 1=山吹 2=紅 3=墨 4=白磁。各20枚＝100枚。
 * 壁は固定模様：行 r・列 col の色 = (col - r + 5) % 5（各行・各列に全色が1回ずつ）。
 */
(function (root) {
  'use strict';
  var NC = 5, PER = 20, FACT = { 2: 5, 3: 7, 4: 9 }, FLOOR = [1, 1, 2, 2, 2, 3, 3], MARK = -1;
  function wallCol(r, c) { return (c + r) % NC; }
  function wallColor(r, col) { return (col - r + NC) % NC; }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function newPlayer() { var w = []; for (var r = 0; r < 5; r++) w.push([0, 0, 0, 0, 0]); return { lines: [0, 1, 2, 3, 4].map(function () { return { c: -1, n: 0 }; }), wall: w, floor: [], score: 0 }; }
  function newGame(n, rng, start) {
    rng = rng || Math.random;
    var bag = []; for (var c = 0; c < NC; c++) for (var i = 0; i < PER; i++) bag.push(c);
    var G = { n: n, bag: shuffle(bag, rng), lid: [], factories: [], center: [], marker: 'C', players: [], turn: 0, start: start == null ? Math.floor(rng() * n) : start, nextStart: null, round: 0, over: false, moves: 0 };
    for (var p = 0; p < n; p++) G.players.push(newPlayer());
    startRound(G, rng);
    return G;
  }
  function draw(G, rng) {
    if (!G.bag.length) { if (!G.lid.length) return null; G.bag = shuffle(G.lid, rng); G.lid = []; }
    return G.bag.pop();
  }
  function startRound(G, rng) {
    G.round++; G.factories = []; G.center = []; G.marker = 'C';
    for (var f = 0; f < FACT[G.n]; f++) { var fa = []; for (var k = 0; k < 4; k++) { var t = draw(G, rng); if (t == null) break; fa.push(t); } G.factories.push(fa); }
    G.turn = G.start; G.nextStart = null;
  }
  function canPlace(P, row, c) {
    if (row === -1) return true;
    var L = P.lines[row];
    if (L.n >= row + 1) return false;
    if (L.c !== -1 && L.c !== c) return false;
    return !P.wall[row][wallCol(row, c)];
  }
  function srcTiles(G, src) { return src === 'C' ? G.center : G.factories[src]; }
  function legalMoves(G, p) {
    var out = [], P = G.players[p], srcs = ['C'].concat(G.factories.map(function (_, i) { return i; }));
    srcs.forEach(function (s) {
      var tiles = srcTiles(G, s), seen = {};
      tiles.forEach(function (c) {
        if (seen[c]) return; seen[c] = 1;
        for (var r = 0; r < 5; r++) if (canPlace(P, r, c)) out.push({ src: s, c: c, row: r });
        out.push({ src: s, c: c, row: -1 });
      });
    });
    return out;
  }
  function addFloor(G, P, items) { items.forEach(function (t) { if (P.floor.length < 7) P.floor.push(t); else if (t !== MARK) G.lid.push(t); }); }
  function roundOver(G) { return G.center.length === 0 && G.factories.every(function (f) { return !f.length; }); }
  // 手を適用。戻り値：{ n, toLine, toFloor, marker, roundEnd, summary, over }
  function take(G, p, m, rng) {
    if (G.over || p !== G.turn) return { err: 'turn' };
    var tiles = srcTiles(G, m.src); if (!tiles) return { err: 'src' };
    var n = tiles.filter(function (c) { return c === m.c; }).length;
    if (!n) return { err: 'color' };
    var P = G.players[p];
    if (m.row !== -1 && (m.row < 0 || m.row > 4 || !canPlace(P, m.row, m.c))) return { err: 'row' };
    var rest = tiles.filter(function (c) { return c !== m.c; });
    var marker = false;
    if (m.src === 'C') { G.center = rest; if (G.marker === 'C') { marker = true; G.marker = p; G.nextStart = p; } }
    else { G.factories[m.src] = []; G.center = G.center.concat(rest); }
    var toLine = 0;
    if (m.row !== -1) { var L = P.lines[m.row]; toLine = Math.min(n, m.row + 1 - L.n); L.c = m.c; L.n += toLine; }
    var fl = []; if (marker) fl.push(MARK); for (var i = toLine; i < n; i++) fl.push(m.c);
    addFloor(G, P, fl);
    G.moves++;
    var res = { n: n, toLine: toLine, toFloor: n - toLine, marker: marker };
    if (roundOver(G)) {
      res.roundEnd = true; res.summary = endRound(G);
      if (G.players.some(function (q) { return q.wall.some(function (row) { return row.every(Boolean); }); })) { G.over = true; res.over = true; res.final = finalScoring(G); }
      else startRound(G, rng || Math.random);
    } else G.turn = (G.turn + 1) % G.n;
    return res;
  }
  function placeScore(wall, r, col) {
    var h = 1, v = 1, i;
    for (i = col - 1; i >= 0 && wall[r][i]; i--) h++;
    for (i = col + 1; i < 5 && wall[r][i]; i++) h++;
    for (i = r - 1; i >= 0 && wall[i][col]; i--) v++;
    for (i = r + 1; i < 5 && wall[i][col]; i++) v++;
    if (h > 1 && v > 1) return h + v;
    return h > 1 ? h : v > 1 ? v : 1;
  }
  function floorPenalty(k) { var s = 0; for (var i = 0; i < Math.min(k, 7); i++) s += FLOOR[i]; return s; }
  // ラウンド終了：そろった列を壁へ→得点、床の減点、次の先手
  function endRound(G) {
    var sum = G.players.map(function (P, p) {
      var placed = [], gain = 0;
      for (var r = 0; r < 5; r++) {
        var L = P.lines[r];
        if (L.n === r + 1) {
          var col = wallCol(r, L.c); P.wall[r][col] = 1;
          var pts = placeScore(P.wall, r, col); gain += pts; placed.push({ r: r, col: col, c: L.c, pts: pts });
          for (var k = 0; k < r; k++) G.lid.push(L.c);
          L.c = -1; L.n = 0;
        }
      }
      var pen = floorPenalty(P.floor.length), before = P.score;
      P.score = Math.max(0, P.score + gain - pen);
      P.floor.forEach(function (t) { if (t !== MARK) G.lid.push(t); });
      P.floor = [];
      return { placed: placed, gain: gain, pen: pen, delta: P.score - before };
    });
    if (G.nextStart != null) G.start = G.nextStart;
    G.marker = null;
    return { round: G.round, players: sum };
  }
  function bonuses(P) {
    var rows = 0, cols = 0, colors = 0, r, c;
    for (r = 0; r < 5; r++) if (P.wall[r].every(Boolean)) rows++;
    for (c = 0; c < 5; c++) { var all = true; for (r = 0; r < 5; r++) if (!P.wall[r][c]) all = false; if (all) cols++; }
    for (var col = 0; col < NC; col++) { var k = 0; for (r = 0; r < 5; r++) if (P.wall[r][wallCol(r, col)]) k++; if (k === 5) colors++; }
    return { rows: rows, cols: cols, colors: colors, pts: rows * 2 + cols * 7 + colors * 10 };
  }
  function finalScoring(G) {
    return G.players.map(function (P) { var b = bonuses(P); b.base = P.score; P.score += b.pts; b.total = P.score; return b; });
  }
  // 順位：得点 → 完成した横の列の数（それでも同じなら同順位）
  function ranking(G) {
    var arr = G.players.map(function (P, p) { return { p: p, score: P.score, rows: bonuses(P).rows }; });
    arr.sort(function (a, b) { return b.score - a.score || b.rows - a.rows; });
    var rank = 0; arr.forEach(function (x, i) { if (i === 0 || x.score !== arr[i - 1].score || x.rows !== arr[i - 1].rows) rank = i + 1; x.rank = rank; });
    return arr;
  }
  function tileCount(G) {
    var k = G.bag.length + G.lid.length + G.center.length;
    G.factories.forEach(function (f) { k += f.length; });
    G.players.forEach(function (P) { P.lines.forEach(function (L) { k += L.n; }); P.floor.forEach(function (t) { if (t !== MARK) k++; }); P.wall.forEach(function (row) { row.forEach(function (x) { k += x; }); }); });
    return k;
  }

  // ---------------- CPU（ふーさん） ----------------
  var LEVELS = ['weak', 'normal', 'strong'];
  function evalMove(G, p, m, lv) {
    var P = G.players[p], tiles = srcTiles(G, m.src), n = 0, i;
    for (i = 0; i < tiles.length; i++) if (tiles[i] === m.c) n++;
    var marker = m.src === 'C' && G.marker === 'C';
    var toLine = 0, completes = false, gain = 0, r = m.row;
    if (r !== -1) { var L = P.lines[r]; toLine = Math.min(n, r + 1 - L.n); completes = L.n + toLine === r + 1; }
    var over = n - toLine + (marker ? 1 : 0), fl = P.floor.length, pen = floorPenalty(fl + over) - floorPenalty(fl);
    if (completes) { var col = wallCol(r, m.c); P.wall[r][col] = 1; gain = placeScore(P.wall, r, col); P.wall[r][col] = 0; }
    if (lv === 'normal') return (completes ? 2 + gain : toLine * 0.8) - pen * 1.1 - (r === -1 ? 0.5 : 0) + (r !== -1 ? -r * 0.05 : 0);
    // strong
    var v = 0;
    if (completes) {
      v += gain * 1.25 + 1.5;
      var colN = 0, rowN = 0, colorN = 0, cc = wallCol(r, m.c);
      for (i = 0; i < 5; i++) { if (P.wall[i][cc]) colN++; if (P.wall[r][i]) rowN++; if (P.wall[i][wallCol(i, m.c)]) colorN++; }
      v += colN * 0.9 + colorN * 0.7 + rowN * 0.35;
    } else if (r !== -1) {
      // 残りの同色タイル（市場）で今ラウンドに完成できそうか
      var need = r + 1 - (P.lines[r].n + toLine), avail = -n;
      G.factories.forEach(function (f) { f.forEach(function (c) { if (c === m.c) avail++; }); }); G.center.forEach(function (c) { if (c === m.c) avail++; });
      v += toLine * 0.9 - (need > avail ? need * 0.45 : need * 0.15);
      if (G.round >= 4) v -= need * 0.25;
    } else v -= 1.2;
    v -= pen * 1.45;
    if (marker) { var left = 0; G.factories.forEach(function (f) { left += f.length; }); v += left > 8 ? 0.7 : 0.1; }
    // 床に流れる分が相手に渡る量（工場から取ると残りが中央へ）：中央が膨らむのは少し嫌う
    if (m.src !== 'C') v -= (tiles.length - n) * 0.08;
    return v;
  }
  function aiMove(G, p, lv, rng) {
    rng = rng || Math.random;
    var ms = legalMoves(G, p); if (!ms.length) return null;
    if (lv === 'weak') {
      if (rng() < 0.3) lv = 'normal';
      else { var good = ms.filter(function (m) { return m.row !== -1; }); var pool = good.length ? good : ms; return pool[Math.floor(rng() * pool.length)]; }
    }
    var best = null, bv = -1e9;
    if (lv === 'normal') {
      ms.forEach(function (m) { var v = evalMove(G, p, m, lv) + rng() * 0.6; if (v > bv) { bv = v; best = m; } });
      return best;
    }
    // 強い：ヒューリスティック上位の手を、ラウンド終わりまで先読み（簡易モンテカルロ）
    var sc = ms.map(function (m) { return { m: m, h: evalMove(G, p, m, 'strong') }; }).sort(function (a, b) { return b.h - a.h; });
    var K = Math.min(sc.length, 8), R = 6;
    for (var i = 0; i < K; i++) {
      var tot = 0;
      for (var k = 0; k < R; k++) {
        var H = clone(G); var res = take(H, p, sc[i].m, rng), guard = 0;
        while (!res.roundEnd && !H.over && guard++ < 80) { var q = H.turn, mm = null, mv = -1e9; legalMoves(H, q).forEach(function (x) { var v = evalMove(H, q, x, 'normal') + rng() * 0.8; if (v > mv) { mv = v; mm = x; } }); res = take(H, q, mm, rng); }
        tot += position(H, p);
      }
      var v = tot / R + sc[i].h * 0.15;
      if (v > bv) { bv = v; best = sc[i].m; }
    }
    return best;
  }
  function position(G, p) {
    function val(P) {
      var v = P.score, r, i;
      for (r = 0; r < 5; r++) { var L = P.lines[r]; if (L.n) v += 1.2 * L.n / (r + 1); }
      if (!G.over) { var b = bonuses(P); for (i = 0; i < 5; i++) { var cn = 0; for (r = 0; r < 5; r++) if (P.wall[r][i]) cn++; v += cn >= 3 ? (cn - 2) * 1.2 : 0; } v += b.pts * 0.5; }
      return v;
    }
    var me = val(G.players[p]), opp = 0;
    G.players.forEach(function (P, q) { if (q !== p) opp += val(P); });
    return me - opp / (G.n - 1) * 0.6;
  }
  function rngFrom(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function clone(G) { return JSON.parse(JSON.stringify(G)); }

  var api = { NC: NC, PER: PER, FACT: FACT, FLOOR: FLOOR, MARK: MARK, LEVELS: LEVELS, wallCol: wallCol, wallColor: wallColor, newGame: newGame, startRound: startRound, canPlace: canPlace, legalMoves: legalMoves, take: take,
    placeScore: placeScore, floorPenalty: floorPenalty, endRound: endRound, bonuses: bonuses, finalScoring: finalScoring, ranking: ranking, tileCount: tileCount, aiMove: aiMove, rngFrom: rngFrom, clone: clone, newPlayer: newPlayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AZ = api;
})(this);
