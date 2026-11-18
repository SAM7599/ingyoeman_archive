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
    box.addEventListener("submit", function (e) { if (e.target && e.target.id === "pvForm") { e.preventDefault(); pvJoin($("pvIn").value); return; } if (e.target && e.target.id === "cwForm") { e.preventDefault(); cwSubmit(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });
    document.addEventListener("ovback", function () { if (!box.hidden) close(); });
  }
  function setBack() { var b = $("plX"); if (b) b.textContent = st ? "← 게임 목록" : "← 사이트로"; if (box) { box.classList.add("pl-arcade"); box.classList.toggle("pl-game", !!st); box.setAttribute("data-hue", st ? st.g : ""); } }   // 목록(게임 선택) 화면일 때만 오락실 모양으로 전체를 꾸며요
  function open() { build(); var a = A(); if (!a || a.vids().length < 20) return; a.closeMenu(); box.hidden = false; document.body.style.overflow = "hidden"; home(); }
  function close() { pvClose(); if (!box) return; box.hidden = true; document.body.style.overflow = ""; st = null; }
  window.openPlay = open;

  function gate() {
    st = null; setBack();
    body.innerHTML = '<div class="pl-end pl-gate"><i>🔐</i><h2 class="pl-h">로그인하고 즐겨요</h2><p>미니게임은 구글 로그인을 한 올드팬만 할 수 있어요.<br>로그인하면 즐겨찾기 저장, 오늘의 퀴즈도 함께 쓸 수 있어요.</p><div class="pl-act" style="justify-content:center"><div id="plG"></div></div></div>';
    A().loginBtn($("plG"));
  }
  document.addEventListener("dlogin", function () { if (box && !box.hidden && A().isIn() && $("plG")) home(); });
  function home() {
    if (!A().isIn()) return gate();
    pvClose(); st = null;
    setBack();
    var tile = function (g, ico, grad, title, desc, chips) {
      return '<button type="button" class="pl-tile" data-g="' + g + '" style="--g:' + grad + '"><span class="pl-ico" aria-hidden="true">' + ico + '</span><span class="pl-tt"><b>' + title + '</b><span>' + desc + '</span><span class="pl-chips">' + chips.map(function (c) { return '<i class="pl-chip">' + c + '</i>'; }).join("") + '</span></span><span class="pl-go"><em>START</em> ▶</span></button>';
    };
    body.innerHTML = '<section class="pl-hub" aria-label="미니게임 목록"><p class="pl-kick">ARCADE</p><h2 class="pl-ttl">잉여맨 오락실</h2><p class="pl-sel">올드팬을 위한 미니게임 · 하고 싶은 게임을 골라 주세요</p>' +
      tile("blank", "✏️", "linear-gradient(135deg,#4f8bff,#7a5cff)", "제목 빈칸 채우기", "빠진 낱말을 맞혀 보세요. 쉬움·보통·어려움 중에 골라요.", ["난이도 3단계", "5~10문제", "약 1~3분"]) +
      tile("cw", "🧩", "linear-gradient(135deg,#ff8a5c,#ff5d7a)", "낱말퍼즐", "쉬움·보통·어려움 중에 골라 가로세로 열쇠로 풀어요.", ["난이도 3단계", "낱말 300개", "약 3~12분"]) +
      tile("pvp", "⚔️", "linear-gradient(135deg,#ef4444,#f59e0b)", "퀴즈 대결 (1:1)", "방 코드로 친구를 불러 빈칸 퀴즈를 먼저 맞히는 대결이에요.", ["친구와 1:1", "7문제", "약 3분"]) +
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
  function similar(ans, bank, title, k, mode) {
    var c = bank.filter(function (w) { return w !== ans && w.indexOf(ans) < 0 && ans.indexOf(w) < 0 && title.indexOf(w) < 0 && (mode === "same" ? w.length === ans.length : Math.abs(w.length - ans.length) <= (mode === "rand" ? 2 : 1)); });
    if (mode === "rand") return shuffle(c).slice(0, k);   // 쉬움: 정답과 별로 안 닮은 낱말
    c = c.map(function (w) { return [simScore(ans, w), w]; }).sort(function (x, y) { return y[0] - x[0]; }).slice(0, k + 5).map(function (x) { return x[1]; });
    return shuffle(c).slice(0, k);
  }
  function makeQ(pool, bank, cf) {
    for (var tries = 0; tries < 60; tries++) {
      var v = pool[rnd(pool.length)], ws = wordsOf(v.title).filter(function (w) { return w.length >= 3; });
      if (!ws.length) ws = wordsOf(v.title); if (!ws.length) continue;
      var ans = ws[rnd(ws.length)];
      var dis = similar(ans, bank, v.title, cf.opts - 1, cf.mode);   // 정답과 비슷하게 생긴 낱말로 헷갈리게 만들어요
      if (dis.length < cf.opts - 1) continue;
      var shown = A().esc(v.title).replace(ans, '<mark class="pl-bl">' + new Array(ans.length + 1).join("＿") + "</mark>");
      return { v: v, ans: ans, shown: shown, opts: shuffle([ans].concat(dis)) };
    }
    return null;
  }
  var BLV = { 1: { n: "쉬움", ico: "🌱", d: "보기가 3개예요. 오답이 정답과 안 닮아서 고르기 쉬워요.", q: 5, opts: 3, mode: "rand", chips: ["5문제", "보기 3개", "약 1분"], g: "linear-gradient(135deg,#46d39a,#2a9d8f)" },
    2: { n: "보통", ico: "🔥", d: "보기 4개가 정답과 비슷하게 생겨서 헷갈려요.", q: 5, opts: 4, mode: "sim", chips: ["5문제", "보기 4개", "약 1분"], g: "linear-gradient(135deg,#ffb35c,#ff7a8a)" },
    3: { n: "어려움", ico: "💀", d: "10문제! 보기 5개가 글자 수까지 똑같아서 진짜 아는 사람만 맞혀요.", q: 10, opts: 5, mode: "same", chips: ["10문제", "보기 5개", "약 3분"], g: "linear-gradient(135deg,#a855f7,#ef4444)" } };
  function blankMenu() {
    st = { g: "blank", menu: 1 }; setBack();
    body.innerHTML = '<div class="pl-hub"><p class="pl-kick">FILL THE BLANK</p><h2 class="pl-ttl">난이도 선택</h2><p class="pl-sel">제목 빈칸 채우기 · 도전할 단계를 골라 주세요</p>' +
      [1, 2, 3].map(function (k) { var c = BLV[k]; return '<button type="button" class="pl-tile pl-in" style="--g:' + c.g + ';animation-delay:' + (k * .08) + 's" data-blv="' + k + '"><span class="pl-ico">' + c.ico + '</span><span class="pl-tt"><b>' + c.n + '</b><span>' + c.d + '</span><span class="pl-chips">' + c.chips.map(function (x) { return '<span class="pl-chip">' + x + '</span>'; }).join("") + '</span></span><span class="pl-go">START ▶</span></button>'; }).join("") + '</div>';
  }
  function blankStart(lv) {
    if (!lv) return blankMenu();
    var cf = BLV[lv], all = A().vids(), bank = []; all.forEach(function (v) { wordsOf(v.title).forEach(function (w) { bank.push(w); }); });
    bank = Array.from(new Set(bank));
    var qs = [], seen = {}; for (var i = 0; i < 120 && qs.length < cf.q; i++) { var q = makeQ(all, bank, cf); if (q && !seen[A().key(q.v)]) { seen[A().key(q.v)] = 1; qs.push(q); } }
    st = { g: "blank", lv: lv, qs: qs, i: 0, ok: 0, done: false }; setBack(); blankShow();
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
      '<div class="pl-card pl-in"><p class="pl-ask">' + BLV[st.lv].ico + ' ' + BLV[st.lv].n + ' · 영상 제목의 빈칸을 채워라!</p><p class="pl-q">' + q.shown + '</p></div>' +
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
      body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">STAGE CLEAR</p><i class="pl-trophy">' + (s >= 3 ? "🏆" : "🎮") + '</i><div class="pl-grade g' + gr + '">' + gr + '</div><b><span id="plCnt">0</span> / ' + tot + '</b><p>' + msg + '</p><div class="pl-act"><button type="button" class="btn primary" data-blv="' + st.lv + '">다시 하기</button><button type="button" class="btn" data-g="blank">난이도 변경</button><button type="button" class="btn" data-home>다른 게임</button></div></div>';
      countUp($("plCnt"), s); if (s >= 3) confetti();
    } else blankShow();
  }

  /* ───── 낱말퍼즐 (2017년 이전 옛 자료로만 만든 낱말·뜻풀이) ───── */
  var CW = null;
  function cwLayout(words, limit) {   // 낱말을 서로 걸치게 놓아 퍼즐 판을 만들어요
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
    var pool = words.slice(), first = pool.splice(rnd(pool.length), 1)[0];
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
  var CWLV = { 1: { n: "쉬움", ico: "🌱", d: "쉬운 낱말만 나와요. 낱말마다 첫 글자를 알려 줘요.", lim: 12, size: 11, lv: [1], hint: true, chips: ["낱말 12개 안팎", "약 3분"] },
    2: { n: "보통", ico: "🔥", d: "옛 방송 이야기와 일반 낱말이 섞여 나와요.", lim: 18, size: 14, lv: [1, 2, 3], chips: ["낱말 18개 안팎", "약 6분"] },
    3: { n: "어려움", ico: "💀", d: "옛 방송·멤버·콘텐츠를 아는 사람만 풀 수 있어요. 힌트 없음!", lim: 26, size: 17, lv: [2, 3], chips: ["낱말 26개 안팎", "약 12분"] } };
  function cwMake(lv) {
    var cf = CWLV[lv], pool = CW.filter(function (w) { return cf.lv.indexOf(w.l || 2) >= 0; }), best = null;
    for (var t = 0; t < 150; t++) {
      var p = cwLayout(pool, cf.lim), size = Math.max(p.rows, p.cols);
      if (p.list.length >= 8 && size <= cf.size && (!best || p.list.length > best.list.length || (p.list.length === best.list.length && size < Math.max(best.rows, best.cols)))) best = p;
      if (best && best.list.length >= cf.lim - 1) break;
    }
    return best;
  }
  function cwMenu() {
    st = { g: "cw", menu: 1 }; setBack();
    body.innerHTML = '<div class="pl-hub"><p class="pl-kick">PUZZLE</p><h2 class="pl-ttl">난이도 선택</h2><p class="pl-sel">낱말퍼즐 · 도전할 단계를 골라 주세요</p>' +
      [1, 2, 3].map(function (k) { var c = CWLV[k]; return '<button type="button" class="pl-tile pl-in" style="--g:' + (k === 1 ? "linear-gradient(135deg,#46d39a,#2a9d8f)" : k === 2 ? "linear-gradient(135deg,#ffb35c,#ff7a8a)" : "linear-gradient(135deg,#a855f7,#ef4444)") + ';animation-delay:' + (k * .08) + 's" data-cwlv="' + k + '"><span class="pl-ico">' + c.ico + '</span><span class="pl-tt"><b>' + c.n + '</b><span>' + c.d + '</span><span class="pl-chips">' + c.chips.map(function (x) { return '<span class="pl-chip">' + x + '</span>'; }).join("") + '</span></span><span class="pl-go">START ▶</span></button>'; }).join("") + '</div>';
  }
  function cwStart(lv) {
    if (!CW) { st = { g: "cw", menu: 1 }; setBack(); body.innerHTML = '<p class="pl-sub">퍼즐을 만드는 중이에요…</p>'; fetch("crossword.json").then(function (r) { return r.json(); }).then(function (d) { CW = d; lv ? cwStart(lv) : cwMenu(); }).catch(function () { body.innerHTML = '<p class="pl-sub">퍼즐을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.</p>'; }); return; }
    if (!lv) return cwMenu();
    st = { g: "cw" }; setBack();
    var pz = cwMake(lv); if (!pz) { body.innerHTML = '<p class="pl-sub">퍼즐을 만들지 못했어요. 다시 눌러 주세요.</p>'; return; }
    var ans = {}; pz.list.forEach(function (p) { for (var i = 0; i < p.w.length; i++) ans[(p.r + (p.dir ? i : 0)) + "," + (p.col + (p.dir ? 0 : i))] = p.w.charAt(i); });
    var fill = {}; if (CWLV[lv].hint) pz.list.forEach(function (p) { fill[p.r + "," + p.col] = p.w.charAt(0); });
    st = { g: "cw", lv: lv, pz: pz, ans: ans, fill: fill, sel: 0, checked: false, done: false }; setBack(); cwShow();
  }
  function cwCellsOf(p) { var a = []; for (var i = 0; i < p.w.length; i++) a.push((p.r + (p.dir ? i : 0)) + "," + (p.col + (p.dir ? 0 : i))); return a; }
  function cwShow() {
    var pz = st.pz, sel = pz.list[st.sel], selCells = cwCellsOf(sel), esc = A().esc, h = "", r, c;
    var cs = Math.max(17, Math.min(40, Math.floor((Math.min(innerWidth - 32, 600) - 22 - 2 * (pz.cols - 1)) / pz.cols)));
    var doneW = pz.list.filter(function (p) { return cwCellsOf(p).every(function (k) { return st.fill[k] === st.ans[k]; }); }).length, tw = pz.list.length;
    h += '<div class="pl-hud"><span class="pl-lv">🧩 ' + CWLV[st.lv].n + '</span><span class="pl-sc">CLEAR <b>' + (st.done ? tw : doneW) + '</b> / ' + tw + '</span></div><div class="pl-prog"><i style="width:' + Math.round((st.done ? tw : doneW) / tw * 100) + '%"></i></div><div class="cw-grid' + (st.shown ? "" : " pl-in") + '" style="grid-template-columns:repeat(' + pz.cols + ',' + cs + 'px);font-size:' + Math.round(cs * .56) + 'px">';
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
    h += '<div class="pl-act"><button type="button" class="btn" data-cwchk="1">정답 확인</button><button type="button" class="btn" data-cwlv0="1">난이도 변경</button><button type="button" class="btn primary" data-cwnew="1">새 퍼즐</button></div>';
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

  /* ───── 퀴즈 대결 (리슨서버형 1:1) ─────
     방장의 브라우저가 심판(서버) 역할을 하고, 친구는 방 코드로 들어와요. 연결만 사이트 서버가 잠깐 이어 주고
     그 뒤 문제·정답은 두 브라우저끼리 직접 주고받아요(WebRTC). 정답은 문제가 끝날 때까지 친구에게 보내지 않아요. */
  var pv = null, PVN = 7, PVT = 12;
  var ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] };
  function pvApi(path, body) { return A().rapi(path, body ? { method: "POST", body: JSON.stringify(body) } : {}).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); }); }
  function pvClose() {
    if (!pv) return; var p = pv; pv = null;
    try { clearInterval(p.poll); clearTimeout(p.tm); clearTimeout(p.rt); clearInterval(p.tick); if (p.dc && p.dc.readyState === "open") { try { p.dc.send('{"t":"bye"}'); } catch (e) {} } if (p.dc) p.dc.close(); if (p.pc) p.pc.close(); } catch (e) {}
    if (p.code && p.role === "host" && !p.conn) pvApi("/room/close", { code: p.code }).catch(function () {});
  }
  function pvGather(pc) { return new Promise(function (res) { if (pc.iceGatheringState === "complete") return res(); var t = setTimeout(res, 4500); pc.addEventListener("icegatheringstatechange", function () { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } }); }); }
  function pvFail(msg) {
    pvClose(); st = { g: "pvp", menu: 1 }; setBack();
    body.innerHTML = '<div class="pl-end pl-in"><i>😢</i><h2 class="pl-h">연결하지 못했어요</h2><p>' + A().esc(msg) + '</p><div class="pl-act"><button type="button" class="btn primary" data-g="pvp">다시 해 보기</button><button type="button" class="btn" data-home>다른 게임</button></div></div>';
  }
  function pvMenu() {
    pvClose(); st = { g: "pvp", menu: 1 }; setBack();
    body.innerHTML = '<div class="pl-hub"><p class="pl-kick">VERSUS</p><h2 class="pl-ttl">퀴즈 대결</h2><p class="pl-sel">친구와 1:1 · 빈칸 퀴즈를 먼저 맞혀요</p>' +
      '<button type="button" class="pl-tile pl-in" style="--g:linear-gradient(135deg,#ef4444,#f59e0b)" data-pvhost><span class="pl-ico">🏠</span><span class="pl-tt"><b>방 만들기</b><span>내가 방장이 돼요. 방 코드를 친구에게 알려 주세요.</span></span><span class="pl-go">만들기 ▶</span></button>' +
      '<form id="pvForm" class="pv-join pl-in" style="animation-delay:.1s"><b>🚪 방 코드로 들어가기</b><div class="cw-form"><input id="pvIn" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="방 코드 4자리"><button type="submit" class="btn primary">입장</button></div></form>' +
      '<p class="pl-more">방장이 나가면 대결이 끝나요 · 두 사람 모두 구글 로그인이 필요해요<br>공유기·통신사에 따라 연결이 안 될 수도 있어요<br>직접 연결이라 상대에게 내 접속 주소(IP)가 보일 수 있어요. 아는 사람과만 하세요!</p></div>';
  }
  function pvHost() {
    pvClose(); if (!window.RTCPeerConnection) return pvFail("이 브라우저는 대결을 지원하지 않아요.");
    var me = { role: "host", name: A().name(), sh: 0, sg: 0 }; pv = me; st = { g: "pvp", wait: 1 }; setBack();
    body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">ROOM</p><div class="pv-code">····</div><p>방을 만드는 중이에요…</p></div>';
    var pc = new RTCPeerConnection(ICE); me.pc = pc; me.dc = pc.createDataChannel("g"); pvBind(me.dc, me);
    pc.onconnectionstatechange = function () { if (pv === me && pc.connectionState === "failed" && !me.conn) pvFail("친구와 직접 연결하지 못했어요. 와이파이·통신사 환경 때문일 수 있어요."); };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return pvGather(pc); })
      .then(function () { return pvApi("/room/create", { offer: JSON.stringify(pc.localDescription) }); })
      .then(function (r) {
        if (pv !== me) return;
        if (r.s === 401) return pvFail("로그인이 풀렸어요. 다시 로그인해 주세요.");
        if (r.s !== 200 || !r.j.code) return pvFail(r.s === 429 ? "너무 자주 눌렀어요. 잠시 뒤에 다시 해 주세요." : "방을 만들지 못했어요. 잠시 뒤에 다시 해 주세요.");
        me.code = r.j.code;
        body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">ROOM CODE</p><div class="pv-code">' + me.code + '</div><p>이 코드를 친구에게 알려 주세요.<br>친구가 들어오면 바로 시작해요!</p><p class="pv-wait"><i></i><i></i><i></i></p><div class="pl-act"><button type="button" class="btn" data-g="pvp">방 닫기</button></div></div>';
        me.poll = setInterval(function () { pvApi("/room/poll?code=" + me.code).then(function (r2) { if (pv !== me || !r2.j.answer) return; clearInterval(me.poll); pc.setRemoteDescription(JSON.parse(r2.j.answer)).catch(function () { pvFail("연결 정보를 읽지 못했어요."); }); }).catch(function () {}); }, 2500);
        me.tm = setTimeout(function () { if (pv === me && !me.conn) pvFail("5분이 지나서 방이 닫혔어요. 다시 만들어 주세요."); }, 300000);
      }).catch(function () { if (pv === me) pvFail("방을 만들지 못했어요. 인터넷 연결을 확인해 주세요."); });
  }
  function pvJoin(code) {
    code = String(code || "").replace(/\D/g, ""); if (code.length !== 4) { var f = $("pvIn"); if (f) f.focus(); return; }
    pvClose(); if (!window.RTCPeerConnection) return pvFail("이 브라우저는 대결을 지원하지 않아요.");
    var me = { role: "guest", name: A().name(), sh: 0, sg: 0 }; pv = me; st = { g: "pvp", wait: 1 }; setBack();
    body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">JOIN</p><div class="pv-code">' + code + '</div><p>방에 들어가는 중이에요…</p><p class="pv-wait"><i></i><i></i><i></i></p></div>';
    var pc = new RTCPeerConnection(ICE); me.pc = pc; pc.ondatachannel = function (e) { me.dc = e.channel; pvBind(e.channel, me); };
    pc.onconnectionstatechange = function () { if (pv === me && pc.connectionState === "failed" && !me.conn) pvFail("방장과 직접 연결하지 못했어요. 와이파이·통신사 환경 때문일 수 있어요."); };
    pvApi("/room/join", { code: code }).then(function (r) {
      if (pv !== me) return;
      if (r.s === 401) return pvFail("로그인이 풀렸어요. 다시 로그인해 주세요.");
      if (r.s !== 200 || !r.j.offer) return pvFail(r.s === 429 ? "너무 자주 눌렀어요. 잠시 뒤에 다시 해 주세요." : "그 코드의 방을 찾지 못했어요. 코드를 다시 확인해 주세요.");
      return pc.setRemoteDescription(JSON.parse(r.j.offer)).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return pvGather(pc); })
        .then(function () { return pvApi("/room/answer", { code: code, answer: JSON.stringify(pc.localDescription) }); })
        .then(function (r2) { if (pv !== me) return; if (r2.s !== 200) return pvFail("이미 다른 사람이 들어갔거나 방이 닫혔어요."); me.rt = setTimeout(function () { if (pv === me && !me.conn) pvFail("방장과 연결되지 않았어요. 방장이 화면을 켜 둔 채 기다리고 있는지 확인해 주세요."); }, 20000); });
    }).catch(function () { if (pv === me) pvFail("방에 들어가지 못했어요. 인터넷 연결을 확인해 주세요."); });
  }
  function pvSend(o) { if (pv && pv.dc && pv.dc.readyState === "open") { try { pv.dc.send(JSON.stringify(o)); } catch (e) {} } }
  function pvBind(dc, me) {
    dc.onopen = function () { if (pv !== me) return; me.conn = true; clearTimeout(me.tm); clearTimeout(me.rt); clearInterval(me.poll); pvSend({ t: "hi", n: me.name }); };
    dc.onmessage = function (e) { if (pv !== me) return; var m; try { m = JSON.parse(e.data); } catch (x) { return; } pvMsg(m); };
    dc.onclose = function () { if (pv === me && !me.over) pvLost(); };
  }
  function pvLost() {
    var p = pv; if (!p) return; clearTimeout(p.hostTm); clearTimeout(p.nextTm); clearInterval(p.tick); p.over = true;
    body.innerHTML = '<div class="pl-end pl-in"><i>🔌</i><h2 class="pl-h">상대와 연결이 끊겼어요</h2><p>상대가 나갔거나 인터넷이 끊겼어요.</p><div class="pl-act"><button type="button" class="btn primary" data-g="pvp">다시 하기</button><button type="button" class="btn" data-home>다른 게임</button></div></div>';
  }
  function pvMsg(m) {
    var p = pv;
    if (m.t === "hi") {   // 들어온 사람(또는 방장)의 닉네임을 잠깐 보여 주고 시작해요
      p.opp = String(m.n || "상대").slice(0, 12); pvVs();
      if (p.role === "host") { clearTimeout(p.nextTm); p.nextTm = setTimeout(pvAgain, 2600); }
      return;
    }
    if (m.t === "bye") return pvLost();
    if (p.role === "host") { if (m.t === "a" && m.i === p.i) pvHostAnswer("g", +m.k); return; }
    if (m.t === "q") pvShowQ(m);
    else if (m.t === "o" && p.v && m.i === p.v.i) { p.v.oppDone = true; pvMarkOpp(); }
    else if (m.t === "r") pvShowR(m);
    else if (m.t === "end") pvEnd(m);
  }
  function pvVs() {
    var p = pv, e = A().esc; st = { g: "pvp", wait: 1 }; setBack();
    body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">' + (p.role === "host" ? "PLAYER JOINED" : "ROOM FOUND") + '</p><div class="pv-vsbox"><div class="pv-p me"><i>🙂</i><b>' + e(p.name) + '</b><small>' + (p.role === "host" ? "방장" : "나") + '</small></div><div class="pv-x">VS</div><div class="pv-p opp"><i>😎</i><b>' + e(p.opp) + '</b><small>' + (p.role === "host" ? "입장!" : "방장") + '</small></div></div><p>' + (p.role === "host" ? "<b>" + e(p.opp) + "</b>님이 입장했어요!" : "<b>" + e(p.opp) + "</b>님의 방에 들어왔어요!") + '<br>곧 대결이 시작돼요…</p></div>';
  }
  /* 방장(심판): 문제를 내고, 두 사람의 답을 모아 점수를 정해요 */
  function pvAgain() {
    var p = pv; if (!p || p.role !== "host" || !p.conn) return;
    var all = A().vids(), bank = []; all.forEach(function (v) { wordsOf(v.title).forEach(function (w) { bank.push(w); }); }); bank = Array.from(new Set(bank));
    var qs = [], seen = {}, cf = BLV[2]; for (var i = 0; i < 120 && qs.length < PVN; i++) { var q = makeQ(all, bank, cf); if (q && !seen[A().key(q.v)]) { seen[A().key(q.v)] = 1; qs.push(q); } }
    p.qs = qs; p.i = -1; p.sh = 0; p.sg = 0; p.over = false; pvNext();
  }
  function pvNext() {
    var p = pv; if (!p) return; p.i++;
    if (p.i >= p.qs.length) { p.over = true; var m = { t: "end", sh: p.sh, sg: p.sg }; pvSend(m); pvEnd(m); return; }
    var q = p.qs[p.i]; p.ans = { h: null, g: null }; p.t0 = Date.now();
    var m2 = { t: "q", i: p.i, n: p.qs.length, shown: q.shown, opts: q.opts, dur: PVT, sh: p.sh, sg: p.sg, on: p.name }; pvSend(m2); pvShowQ(m2);
    clearTimeout(p.hostTm); p.hostTm = setTimeout(pvHostEnd, PVT * 1000 + 1200);
  }
  function pvHostAnswer(who, k) {
    var p = pv; if (!p || p.ans[who] || p.over) return; var q = p.qs[p.i]; if (!(k >= 0 && k < q.opts.length)) return;
    p.ans[who] = { k: k, ms: Date.now() - p.t0 };
    if (who === "g") { p.v.oppDone = true; pvMarkOpp(); } else pvSend({ t: "o", i: p.i, w: "h" });
    if (p.ans.h && p.ans.g) pvHostEnd();
  }
  function pvHostEnd() {
    var p = pv; if (!p || p.over || p.ending === p.i) return; p.ending = p.i; clearTimeout(p.hostTm);
    var q = p.qs[p.i], pts = function (a) { return a && q.opts[a.k] === q.ans ? 100 + Math.max(0, Math.round((PVT * 1000 - a.ms) / 1000)) * 5 : 0; };
    var ph = pts(p.ans.h), pg = pts(p.ans.g); p.sh += ph; p.sg += pg;
    var m = { t: "r", i: p.i, ans: q.ans, title: q.v.title, h: { k: p.ans.h ? p.ans.h.k : -1, p: ph }, g: { k: p.ans.g ? p.ans.g.k : -1, p: pg }, sh: p.sh, sg: p.sg };
    pvSend(m); pvShowR(m); p.nextTm = setTimeout(pvNext, 4200);
  }
  /* 두 사람 화면 (내 입장에서 "나 : 상대"로 보여줘요) */
  function pvScore(p, sh, sg) { return p.role === "host" ? [sh, sg] : [sg, sh]; }
  function pvShowQ(m) {
    var p = pv, sc = pvScore(p, m.sh || 0, m.sg || 0); if (m.on && p.role === "guest") p.opp = String(m.on).slice(0, 12);
    p.v = { i: m.i, opts: m.opts, mine: null, oppDone: false, t0: Date.now(), dur: m.dur };
    body.innerHTML = '<div class="pl-hud"><span class="pl-lv">ROUND ' + (m.i + 1) + ' / ' + m.n + '</span><span class="pl-sc pv-vs">나 <b>' + sc[0] + '</b> : <b>' + sc[1] + '</b> ' + A().esc(p.opp || "상대") + '</span></div>' +
      '<div class="pl-prog pv-timer"><i id="pvBar" style="width:100%"></i></div>' +
      '<div class="pl-card pl-in"><p class="pl-ask">⚔️ 영상 제목의 빈칸을 먼저 맞혀라! <span id="pvSec" class="pv-sec">' + m.dur + '</span></p><p class="pl-q">' + m.shown + '</p></div>' +
      '<div class="pl-opts">' + m.opts.map(function (o, k) { return '<button type="button" class="pl-o pl-in" style="animation-delay:' + (.1 + k * .05) + 's" data-pva="' + k + '"><em>' + "ABCDEF".charAt(k) + '</em>' + A().esc(o) + '</button>'; }).join("") + '</div><p id="pvNote" class="pv-note"></p><div id="plRes"></div>';
    requestAnimationFrame(function () { var b = $("pvBar"); if (b) { b.style.transition = "width " + m.dur + "s linear"; b.style.width = "0%"; } });
    clearInterval(p.tick); p.tick = setInterval(function () { var s = $("pvSec"); if (!s || !pv || !pv.v) return; var left = Math.max(0, Math.ceil(pv.v.dur - (Date.now() - pv.v.t0) / 1000)); s.textContent = left; }, 250);
  }
  function pvMarkOpp() { var n = $("pvNote"); if (n && pv && pv.v && pv.v.oppDone && pv.v.mine == null) n.textContent = "⚡ " + (pv.opp || "상대") + "님이 먼저 골랐어요!"; }
  function pvPick(k) {
    var p = pv; if (!p || !p.v || p.v.mine != null) return; p.v.mine = k;
    [].forEach.call(body.querySelectorAll(".pl-o"), function (b, j) { b.disabled = true; if (j === k) b.classList.add("pv-mine"); });
    var n = $("pvNote"); if (n) n.textContent = "답을 보냈어요. 상대를 기다리는 중…";
    if (p.role === "host") pvHostAnswer("h", k); else pvSend({ t: "a", i: p.v.i, k: k });
  }
  function pvShowR(m) {
    var p = pv; if (!p || !p.v) return; clearInterval(p.tick);
    var mine = p.role === "host" ? m.h : m.g, opp = p.role === "host" ? m.g : m.h, sc = pvScore(p, m.sh, m.sg), ok = false;
    [].forEach.call(body.querySelectorAll(".pl-o"), function (b, j) {
      b.disabled = true; var o = p.v.opts[j];
      if (o === m.ans) b.classList.add("ok"); else if (j === mine.k) b.classList.add("no");
      if (j === opp.k && o !== m.ans) b.classList.add("pv-opp");
    });
    ok = mine.p > 0; var bar = $("pvBar"); if (bar) { bar.style.transition = "none"; }
    var sv = body.querySelector(".pv-vs"); if (sv) sv.innerHTML = '나 <b>' + sc[0] + '</b> : <b>' + sc[1] + '</b> ' + A().esc(p.opp || "상대");
    var n = $("pvNote"); if (n) n.textContent = "";
    if (mine.p) floatTxt("+" + mine.p, "ok"); else floatTxt(mine.k < 0 ? "TIME" : "MISS", "no");
    $("plRes").innerHTML = '<p class="pl-r ' + (ok ? "ok" : "no") + '">' + (ok ? "정답! +" + mine.p : mine.k < 0 ? "시간 초과" : "아쉬워요. 정답은 「" + A().esc(m.ans) + "」") + '</p><p class="pv-oppr">' + A().esc(p.opp || "상대") + ' : ' + (opp.p ? "정답 +" + opp.p : opp.k < 0 ? "답 못 함" : "오답") + '</p><p class="pl-full">' + A().esc(m.title) + '</p><p class="pv-note">잠시 뒤 다음 문제가 나와요…</p>';
    p.v.done = true;
  }
  function pvEnd(m) {
    var p = pv; if (!p) return; clearInterval(p.tick); p.over = true; var sc = pvScore(p, m.sh, m.sg), r = sc[0] > sc[1] ? "win" : sc[0] < sc[1] ? "lose" : "draw";
    body.innerHTML = '<div class="pl-end pl-in"><p class="pl-kick2">RESULT</p><i class="pl-trophy">' + (r === "win" ? "🏆" : r === "lose" ? "😵" : "🤝") + '</i><div class="pv-res ' + r + '">' + (r === "win" ? "WIN!" : r === "lose" ? "LOSE" : "DRAW") + '</div><b>' + sc[0] + ' : ' + sc[1] + '</b><p>나 vs ' + A().esc(p.opp || "상대") + '</p><div class="pl-act">' +
      (p.role === "host" ? '<button type="button" class="btn primary" data-pvagain="1">한 판 더</button>' : '<button type="button" class="btn" disabled>방장이 다시 시작하면 이어져요</button>') + '<button type="button" class="btn" data-home>나가기</button></div></div>';
    if (r === "win") confetti();
  }

  function handle(e) {
    if (!A().isIn()) return; var t = e.target.closest && e.target.closest("[data-g],[data-o],[data-next],[data-home],[data-cw],[data-cwi],[data-cwchk],[data-cwnew],[data-cwlv],[data-cwlv0],[data-blv],[data-pvhost],[data-pva],[data-pvagain]"); if (!t || !st && !t.dataset.g) { if (t && t.hasAttribute("data-home")) home(); return; }
    if (t.dataset.g === "blank") return blankStart();
    if (t.dataset.blv) return blankStart(+t.dataset.blv);
    if (t.dataset.g === "pvp") return pvMenu();
    if (t.hasAttribute("data-pvhost")) return pvHost();
    if (t.dataset.pva != null) return pvPick(+t.dataset.pva);
    if (t.hasAttribute("data-pvagain")) return pvAgain();
    if (t.dataset.g === "cw") return cwStart();
    if (t.dataset.cw) return cwPickCell(t.dataset.cw);
    if (t.dataset.cwi != null) { st.sel = +t.dataset.cwi; st.focus = true; return cwShow(); }
    if (t.hasAttribute("data-cwchk")) { st.checked = true; return cwShow(); }
    if (t.hasAttribute("data-cwnew")) return cwStart(st.lv);
    if (t.dataset.cwlv) return cwStart(+t.dataset.cwlv);
    if (t.hasAttribute("data-cwlv0")) return cwMenu();
    if (t.hasAttribute("data-home")) return home();
    if (t.dataset.o != null && st && st.g === "blank") return blankPick(+t.dataset.o);
    if (t.hasAttribute("data-next") && st && st.g === "blank") return blankNext();
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-play]")) { e.preventDefault(); open(); } });
})();
