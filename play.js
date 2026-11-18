/* 미니게임: 제목 빈칸 채우기 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var A = function () { return window.PLAYAPI; };
  var box, body, st = null;
  var rnd = function (n) { return Math.floor(Math.random() * n); };
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var SKIP = /^(다시보기|방송|영상|하이라이트|모음|생방송|편집본)$/;

  function build() {
    if ($("play")) return;
    box = document.createElement("div"); box.id = "play"; box.className = "play"; box.hidden = true;
    box.innerHTML = '<div class="pl-page" role="dialog" aria-modal="true" aria-label="미니게임"><header class="pl-top"><button type="button" class="pl-back" id="plX">← 사이트로</button><b>🎮 잉여맨 오락실</b></header><main class="pl-main"><div id="plBody"></div></main><footer class="pl-ai">🤖 미니게임의 문제·낱말·뜻풀이는 AI가 만들어서 어색하거나 틀린 부분이 있을 수 있어요. 양해 부탁드려요!</footer></div>';
    document.body.appendChild(box); body = $("plBody");
    $("plX").addEventListener("click", function () { if (st) home(); else close(); });   // 게임 중이면 목록으로, 목록이면 사이트로
    box.addEventListener("click", function (e) { if (e.target === box) close(); handle(e); });
    box.addEventListener("submit", function (e) { if (e.target && e.target.id === "cwForm") { e.preventDefault(); cwSubmit(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });
    document.addEventListener("ovback", function () { if (!box.hidden) close(); });
  }
  function setBack() { var b = $("plX"); if (b) b.textContent = st ? "← 게임 목록" : "← 사이트로"; if (box) { box.classList.add("pl-arcade"); box.classList.toggle("pl-game", !!st); box.setAttribute("data-hue", st ? st.g : ""); } }   // 목록(게임 선택) 화면일 때만 오락실 모양으로 전체를 꾸며요
  function open() { build(); var a = A(); if (!a || a.vids().length < 20) return; a.closeMenu(); box.hidden = false; document.body.style.overflow = "hidden"; home(); }
  function close() { if (!box) return; box.hidden = true; document.body.style.overflow = ""; st = null; }
  window.openPlay = open;

  function gate() {
    st = null; setBack();
    body.innerHTML = '<div class="pl-end pl-gate"><i>🔐</i><h2 class="pl-h">로그인하고 즐겨요</h2><p>미니게임은 구글 로그인을 한 올드팬만 할 수 있어요.<br>로그인하면 즐겨찾기 저장, 오늘의 퀴즈도 함께 쓸 수 있어요.</p><div class="pl-act" style="justify-content:center"><div id="plG"></div></div></div>';
    A().loginBtn($("plG"));
  }
  document.addEventListener("dlogin", function () { if (box && !box.hidden && A().isIn() && $("plG")) home(); });
  function home() {
    if (!A().isIn()) return gate();
    st = null;
    setBack();
    var tile = function (g, ico, grad, title, desc, chips) {
      return '<button type="button" class="pl-tile" data-g="' + g + '" style="--g:' + grad + '"><span class="pl-ico" aria-hidden="true">' + ico + '</span><span class="pl-tt"><b>' + title + '</b><span>' + desc + '</span><span class="pl-chips">' + chips.map(function (c) { return '<i class="pl-chip">' + c + '</i>'; }).join("") + '</span></span><span class="pl-go"><em>START</em> ▶</span></button>';
    };
    body.innerHTML = '<section class="pl-hub" aria-label="미니게임 목록"><p class="pl-kick">ARCADE</p><h2 class="pl-ttl">잉여맨 오락실</h2><p class="pl-sel">올드팬을 위한 미니게임 · 하고 싶은 게임을 골라 주세요</p>' +
      tile("blank", "✏️", "linear-gradient(135deg,#4f8bff,#7a5cff)", "제목 빈칸 채우기", "빠진 글자를 맞혀 보세요. 보기가 비슷비슷해서 헷갈려요.", ["5문제", "약 1분", "난이도 ★★☆"]) +
      tile("cw", "🧩", "linear-gradient(135deg,#ff8a5c,#ff5d7a)", "낱말퍼즐", "옛 방송 제목에서 뽑은 낱말을 가로세로 열쇠로 풀어요.", ["낱말 11개 안팎", "약 5분", "난이도 ★★★"]) +
      '<p class="pl-more">새 게임이 생기면 여기에 모여요</p></section>';
  }

  /* ───── 제목 빈칸 채우기 ───── */
  function wordsOf(t) { return (String(t).replace(/\[[^\]]*\]|\([^)]*\)/g, " ").match(/[가-힣]{2,6}/g) || []).filter(function (w) { return !SKIP.test(w); }); }
  /* 정답과 글자 수·글자·앞뒤 글자가 비슷한 낱말을 점수로 골라요 */
  function simScore(a, b) {
    var sc = 0, i, used = {};
    if (a.length === b.length) sc += 3; else if (Math.abs(a.length - b.length) === 1) sc += 1;
    if (a.charAt(0) === b.charAt(0)) sc += 3;
    if (a.charAt(a.length - 1) === b.charAt(b.length - 1)) sc += 3;
    for (i = 0; i < b.length; i++) if (a.indexOf(b.charAt(i)) >= 0 && !used[b.charAt(i)]) { used[b.charAt(i)] = 1; sc += 2; }
    return sc + Math.random();
  }
  function similar(ans, bank, title) {
    var c = bank.filter(function (w) { return w !== ans && w.indexOf(ans) < 0 && ans.indexOf(w) < 0 && Math.abs(w.length - ans.length) <= 1 && title.indexOf(w) < 0; });
    c = c.map(function (w) { return [simScore(ans, w), w]; }).sort(function (x, y) { return y[0] - x[0]; }).slice(0, 8).map(function (x) { return x[1]; });
    return shuffle(c).slice(0, 3);
  }
  function makeQ(pool, bank) {
    for (var tries = 0; tries < 60; tries++) {
      var v = pool[rnd(pool.length)], ws = wordsOf(v.title).filter(function (w) { return w.length >= 3; });
      if (!ws.length) ws = wordsOf(v.title); if (!ws.length) continue;
      var ans = ws[rnd(ws.length)];
      var dis = similar(ans, bank, v.title);   // 정답과 비슷하게 생긴 낱말로 헷갈리게 만들어요
      if (dis.length < 3) continue;
      var shown = A().esc(v.title).replace(ans, '<mark class="pl-bl">' + new Array(ans.length + 1).join("＿") + "</mark>");
      return { v: v, ans: ans, shown: shown, opts: shuffle([ans].concat(dis)) };
    }
    return null;
  }
  function blankStart() {
    var all = A().vids(), bank = []; all.forEach(function (v) { wordsOf(v.title).forEach(function (w) { bank.push(w); }); });
    bank = Array.from(new Set(bank));
    var qs = [], seen = {}; for (var i = 0; i < 40 && qs.length < 5; i++) { var q = makeQ(all, bank); if (q && !seen[A().key(q.v)]) { seen[A().key(q.v)] = 1; qs.push(q); } }
    st = { g: "blank", qs: qs, i: 0, ok: 0, done: false }; setBack(); blankShow();
  }
  function confetti() {
    var w = document.createElement("div"); w.className = "pl-conf"; var cols = ["#ffd166", "#ff5d7a", "#7b8cff", "#2fe39b", "#fff"], h = "";
    for (var i = 0; i < 46; i++) h += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + cols[i % 5] + ';--x:' + Math.round(Math.random() * 160 - 80) + 'px;--r:' + Math.round(Math.random() * 720 - 360) + 'deg;animation-delay:' + (Math.random() * .35).toFixed(2) + 's;animation-duration:' + (1.4 + Math.random() * 1.2).toFixed(2) + 's"></i>';
    w.innerHTML = h; box.appendChild(w); setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 3200);
  }
  function floatTxt(t, cls) { var f = document.createElement("div"); f.className = "pl-fl " + (cls || ""); f.textContent = t; box.appendChild(f); setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1200); }
  function countUp(el, to) { if (!el) return; var n = 0, step = Math.max(1, Math.ceil(to / 14)), t = setInterval(function () { n = Math.min(to, n + step); el.textContent = n; if (n >= to) clearInterval(t); }, 60); }
  function blankShow() {
    var q = st.qs[st.i], n = st.qs.length;
    body.innerHTML = '<div class="pl-hud"><span class="pl-lv">STAGE ' + (st.i + 1) + ' / ' + n + '</span><span class="pl-combo" id="plCombo">' + (st.combo > 1 ? "🔥 " + st.combo + "연속!" : "") + '</span><span class="pl-sc">SCORE <b>' + st.ok * 100 + '</b></span></div>' +
      '<div class="pl-prog"><i style="width:' + Math.round(st.i / n * 100) + '%"></i></div>' +
      '<div class="pl-card pl-in"><p class="pl-ask">영상 제목의 빈칸을 채워라!</p><p class="pl-q">' + q.shown + '</p></div>' +
      '<div class="pl-opts">' + q.opts.map(function (o, k) { return '<button type="button" class="pl-o pl-in" style="animation-delay:' + (.12 + k * .06) + 's" data-o="' + k + '"><em>' + "ABCDEF".charAt(k) + '</em>' + A().esc(o) + '</button>'; }).join("") + '</div><div id="plRes"></div>';
  }
  function blankPick(k) {
    if (st.done) return; var q = st.qs[st.i], got = q.opts[k], ok = got === q.ans; st.done = true; if (ok) { st.ok++; st.combo = (st.combo || 0) + 1; } else st.combo = 0;
    [].forEach.call(body.querySelectorAll(".pl-o"), function (b, j) { b.disabled = true; if (q.opts[j] === q.ans) b.classList.add("ok"); else if (j === k) b.classList.add("no"); });
    var last = st.i + 1 >= st.qs.length, card = body.querySelector(".pl-card"); if (card) card.classList.add(ok ? "pl-hit" : "pl-miss");
    if (ok) { floatTxt("+100", "ok"); if (st.combo > 1) floatTxt("🔥 " + st.combo + "연속!", "cb"); var sc = body.querySelector(".pl-sc b"); if (sc) sc.textContent = st.ok * 100; } else floatTxt("MISS", "no");
    $("plRes").innerHTML = '<p class="pl-r ' + (ok ? "ok" : "no") + '">' + (ok ? "정답이에요! 👏" : "아쉬워요. 정답은 「" + A().esc(q.ans) + "」") + '</p><p class="pl-full">' + A().esc(q.v.title) + '</p>' +
      '<div class="pl-act"><a class="btn" href="' + A().esc(A().url(q.v.url)) + '" target="_blank" rel="noopener noreferrer">이 영상 보러 가기</a><button type="button" class="btn primary" data-next>' + (last ? "결과 보기" : "다음 문제") + '</button></div>';
  }
  function blankNext() {
    if (!st.done) return; st.done = false; st.i++;
    if (st.i >= st.qs.length) {
      var s = st.ok, tot = st.qs.length, msg = s === tot ? "완벽해요! 진짜 잉여맨 팬이시네요 🏆" : s >= 3 ? "대단해요! 꽤 잘 아시네요 👍" : s >= 1 ? "괜찮아요, 다시 하면 더 잘할 거예요" : "다음엔 꼭 맞혀 봐요!", gr = s === tot ? "S" : s >= tot - 1 ? "A" : s >= 3 ? "B" : "C";
      body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">STAGE CLEAR</p><i class="pl-trophy">' + (s >= 3 ? "🏆" : "🎮") + '</i><div class="pl-grade g' + gr + '">' + gr + '</div><b><span id="plCnt">0</span> / ' + tot + '</b><p>' + msg + '</p><div class="pl-act"><button type="button" class="btn primary" data-g="blank">다시 하기</button><button type="button" class="btn" data-home>다른 게임</button></div></div>';
      countUp($("plCnt"), s); if (s >= 3) confetti();
    } else blankShow();
  }

  /* ───── 낱말퍼즐 (2017년 이전 옛 자료로만 만든 낱말·뜻풀이) ───── */
  var CW = null;
  function cwLayout(words) {   // 낱말을 서로 걸치게 놓아 퍼즐 판을 만들어요
    var cells = {}, list = [];
    function get(r, c) { return cells[r + "," + c]; }
    function fits(w, r, c, dir) {
      var dr = dir ? 1 : 0, dc = dir ? 0 : 1, i, cross = 0;
      if (get(r - dr, c - dc) || get(r + dr * w.length, c + dc * w.length)) return -1;
      for (i = 0; i < w.length; i++) {
        var rr = r + dr * i, cc = c + dc * i, ex = get(rr, cc);
        if (ex) { if (ex !== w.charAt(i)) return -1; cross++; }
        else if (get(rr + dc, cc + dr) || get(rr - dc, cc - dr)) return -1;   // 옆 칸이 붙으면 안 돼요
      }
      return cross;
    }
    function put(w, r, c, dir) { for (var i = 0; i < w.w.length; i++) cells[(r + (dir ? i : 0)) + "," + (c + (dir ? 0 : i))] = w.w.charAt(i); list.push({ w: w.w, c: w.c, r: r, col: c, dir: dir }); }
    var pool = words.slice(), first = pool.splice(rnd(pool.length), 1)[0], limit = 24;
    put(first, 0, 0, 0);
    while (list.length < limit && pool.length) {   // 지금 판에 걸쳐 놓을 수 있는 낱말을 하나씩 더해요
      var opts = [];
      pool.forEach(function (w, wi) {
        var bestW = null;
        list.forEach(function (p) {
          for (var i = 0; i < w.w.length; i++) for (var j = 0; j < p.w.length; j++) {
            if (w.w.charAt(i) !== p.w.charAt(j)) continue;
            var dir = p.dir ? 0 : 1, r = dir ? p.r - i : p.r + j, c = dir ? p.col + j : p.col - i;
            var x = fits(w.w, r, c, dir); if (x < 1) continue;
            var h0 = 0; for (var q = 0; q < list.length; q++) { h0 = Math.max(h0, Math.abs(list[q].r - r), Math.abs(list[q].col - c)); }
            var score = x * 10 - h0 + Math.random() * 4; if (!bestW || score > bestW.score) bestW = { score: score, wi: wi, r: r, c: c, dir: dir };
          }
        });
        if (bestW) opts.push(bestW);
      });
      if (!opts.length) break;
      opts.sort(function (x, y) { return y.score - x.score; });
      var o = opts[0]; put(pool[o.wi], o.r, o.c, o.dir); pool.splice(o.wi, 1);
    }
    var minR = 1e9, minC = 1e9, maxR = -1e9, maxC = -1e9;
    list.forEach(function (p) { var er = p.r + (p.dir ? p.w.length - 1 : 0), ec = p.col + (p.dir ? 0 : p.w.length - 1); minR = Math.min(minR, p.r); minC = Math.min(minC, p.col); maxR = Math.max(maxR, er); maxC = Math.max(maxC, ec); });
    list.forEach(function (p) { p.r -= minR; p.col -= minC; });
    var starts = {}; list.forEach(function (p) { starts[p.r + "," + p.col] = 1; });
    var order = Object.keys(starts).map(function (s) { var a = s.split(","); return [+a[0], +a[1]]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), num = {};
    order.forEach(function (o, i) { num[o[0] + "," + o[1]] = i + 1; });
    list.forEach(function (p) { p.n = num[p.r + "," + p.col]; });
    return { list: list, rows: maxR - minR + 1, cols: maxC - minC + 1, num: num };
  }
  function cwMake() {
    var best = null;
    for (var t = 0; t < 40; t++) {
      var p = cwLayout(CW), size = Math.max(p.rows, p.cols);
      if (p.list.length >= 8 && size <= 16 && (!best || p.list.length > best.list.length || (p.list.length === best.list.length && size < Math.max(best.rows, best.cols)))) best = p;
      if (best && best.list.length >= 20) break;
    }
    return best;
  }
  function cwStart() {
    st = { g: "cw" }; setBack();
    if (!CW) { body.innerHTML = '<p class="pl-sub">퍼즐을 만드는 중이에요…</p>'; fetch("crossword.json").then(function (r) { return r.json(); }).then(function (d) { CW = d; cwStart(); }).catch(function () { body.innerHTML = '<p class="pl-sub">퍼즐을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.</p>'; }); return; }
    var pz = cwMake(); if (!pz) { body.innerHTML = '<p class="pl-sub">퍼즐을 만들지 못했어요. 다시 눌러 주세요.</p>'; return; }
    var ans = {}; pz.list.forEach(function (p) { for (var i = 0; i < p.w.length; i++) ans[(p.r + (p.dir ? i : 0)) + "," + (p.col + (p.dir ? 0 : i))] = p.w.charAt(i); });
    st = { g: "cw", pz: pz, ans: ans, fill: {}, sel: 0, checked: false, done: false }; setBack(); cwShow();
  }
  function cwCellsOf(p) { var a = []; for (var i = 0; i < p.w.length; i++) a.push((p.r + (p.dir ? i : 0)) + "," + (p.col + (p.dir ? 0 : i))); return a; }
  function cwShow() {
    var pz = st.pz, sel = pz.list[st.sel], selCells = cwCellsOf(sel), esc = A().esc, h = "", r, c;
    var cs = Math.max(17, Math.min(40, Math.floor((Math.min(innerWidth - 32, 600) - 22 - 2 * (pz.cols - 1)) / pz.cols)));
    var doneW = pz.list.filter(function (p) { return cwCellsOf(p).every(function (k) { return st.fill[k] === st.ans[k]; }); }).length, tw = pz.list.length;
    h += '<div class="pl-hud"><span class="pl-lv">낱말퍼즐</span><span class="pl-sc">CLEAR <b>' + (st.done ? tw : doneW) + '</b> / ' + tw + '</span></div><div class="pl-prog"><i style="width:' + Math.round((st.done ? tw : doneW) / tw * 100) + '%"></i></div><div class="cw-grid' + (st.shown ? "" : " pl-in") + '" style="grid-template-columns:repeat(' + pz.cols + ',' + cs + 'px);font-size:' + Math.round(cs * .56) + 'px">';
    for (r = 0; r < pz.rows; r++) for (c = 0; c < pz.cols; c++) {
      var k = r + "," + c, a = st.ans[k];
      if (!a) { h += '<i class="cw-e" style="width:' + cs + 'px;height:' + cs + 'px"></i>'; continue; }
      var f = st.fill[k] || "", pi = st.pop ? st.pop.indexOf(k) : -1, cls = "cw-c" + (pi >= 0 ? (st.popOk ? " wow" : " pop") : "") + (st.done && st.fin ? " fin" : "") + (selCells.indexOf(k) >= 0 ? " sel" : "") + (st.checked && f ? (f === a ? " ok" : " no") : "") + (st.done ? " ok" : "");
      h += '<button type="button" class="' + cls + '" data-cw="' + k + '" style="width:' + cs + 'px;height:' + cs + 'px' + (pi >= 0 ? ';animation-delay:' + (pi * .06).toFixed(2) + 's' : '') + '">' + (pz.num[k] ? '<sup>' + pz.num[k] + '</sup>' : "") + esc(st.done ? a : f) + '</button>';
    }
    h += '</div>';
    if (!st.done) h += '<div class="cw-ask"><p class="cw-now"><b>' + sel.n + (sel.dir ? "↓ 세로" : "→ 가로") + '</b> ' + esc(sel.c) + ' <span>(' + sel.w.length + '글자)</span></p><form class="cw-form" id="cwForm"><input id="cwIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="' + sel.w.length + '" placeholder="' + sel.w.length + '글자로 적고 입력"><button type="submit" class="btn primary">입력</button></form></div>';
    var cl = function (dir) { return pz.list.map(function (p, i) { return [p, i]; }).filter(function (x) { return x[0].dir === dir; }).sort(function (x, y) { return x[0].n - y[0].n; }).map(function (x) { var done = cwCellsOf(x[0]).every(function (k) { return st.fill[k] === st.ans[k]; }); return '<li><button type="button" class="cw-cl' + (x[1] === st.sel ? " on" : "") + (done ? " dn" : "") + '" data-cwi="' + x[1] + '"><b>' + x[0].n + '</b> ' + esc(x[0].c) + ' <span>(' + x[0].w.length + ')</span></button></li>'; }).join(""); };
    h += '<div class="cw-cls"><div><h3>→ 가로 열쇠</h3><ul>' + cl(0) + '</ul></div><div><h3>↓ 세로 열쇠</h3><ul>' + cl(1) + '</ul></div></div>';
    if (st.done) h += '<div class="pl-end pl-in"><p class="pl-kick2">ALL CLEAR</p><i class="pl-trophy">🏆</i><b>퍼즐 완성!</b><p>옛 방송 제목에서 뽑은 낱말을 모두 맞혔어요.</p></div>';
    h += '<div class="pl-act"><button type="button" class="btn" data-cwchk="1">정답 확인</button><button type="button" class="btn" data-cwshow="1">모두 보기</button><button type="button" class="btn primary" data-cwnew="1">새 퍼즐</button></div>';
    body.innerHTML = h;
    st.shown = true; st.pop = null; st.popOk = false; if (st.done && st.fin) { confetti(); st.fin = false; }
    var inp = $("cwIn"); if (inp && st.focus) { inp.focus(); st.focus = false; }
  }
  function cwFilled() { return Object.keys(st.ans).every(function (k) { return st.fill[k] === st.ans[k]; }); }
  function cwSubmit() {
    var inp = $("cwIn"); if (!inp) return; var w = inp.value.replace(/\s+/g, ""), p = st.pz.list[st.sel], cells = cwCellsOf(p);
    if (!w) return; for (var i = 0; i < cells.length; i++) st.fill[cells[i]] = w.charAt(i) || "";
    st.pop = cells; st.popOk = cells.every(function (k) { return st.fill[k] === st.ans[k]; }); if (st.popOk) floatTxt("정답! ✨", "ok");
    st.checked = false; if (cwFilled()) { st.done = true; st.fin = true; } else { for (var j = 1; j <= st.pz.list.length; j++) { var n = (st.sel + j) % st.pz.list.length, q = st.pz.list[n]; if (!cwCellsOf(q).every(function (k) { return st.fill[k] === st.ans[k]; })) { st.sel = n; break; } } }
    st.focus = !st.done; cwShow();
  }
  function cwPickCell(k) {
    var cand = []; st.pz.list.forEach(function (p, i) { if (cwCellsOf(p).indexOf(k) >= 0) cand.push(i); });
    if (!cand.length) return; var at = cand.indexOf(st.sel); st.sel = cand[(at + 1) % cand.length] === st.sel || at < 0 ? cand[0] : cand[(at + 1) % cand.length]; st.focus = true; cwShow();
  }

  function handle(e) {
    if (!A().isIn()) return; var t = e.target.closest && e.target.closest("[data-g],[data-o],[data-next],[data-home],[data-cw],[data-cwi],[data-cwchk],[data-cwshow],[data-cwnew]"); if (!t || !st && !t.dataset.g) { if (t && t.hasAttribute("data-home")) home(); return; }
    if (t.dataset.g === "blank") return blankStart();
    if (t.dataset.g === "cw") return cwStart();
    if (t.dataset.cw) return cwPickCell(t.dataset.cw);
    if (t.dataset.cwi != null) { st.sel = +t.dataset.cwi; st.focus = true; return cwShow(); }
    if (t.hasAttribute("data-cwchk")) { st.checked = true; return cwShow(); }
    if (t.hasAttribute("data-cwshow")) { st.done = true; return cwShow(); }
    if (t.hasAttribute("data-cwnew")) return cwStart();
    if (t.hasAttribute("data-home")) return home();
    if (t.dataset.o != null && st && st.g === "blank") return blankPick(+t.dataset.o);
    if (t.hasAttribute("data-next") && st && st.g === "blank") return blankNext();
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-play]")) { e.preventDefault(); open(); } });
})();
