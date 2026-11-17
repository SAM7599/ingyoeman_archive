/* 미니게임: 제목 빈칸 채우기 · 영상 월드컵 */
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
    box.innerHTML = '<div class="pl-sheet" role="dialog" aria-modal="true" aria-label="미니게임"><button type="button" class="x pl-x" id="plX" aria-label="닫기">✕</button><div id="plBody"></div></div>';
    document.body.appendChild(box); body = $("plBody");
    $("plX").addEventListener("click", close);
    box.addEventListener("click", function (e) { if (e.target === box) close(); handle(e); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });
    document.addEventListener("ovback", function () { if (!box.hidden) close(); });
  }
  function open() { build(); var a = A(); if (!a || a.vids().length < 20) return; a.closeMenu(); box.hidden = false; document.body.style.overflow = "hidden"; home(); }
  function close() { if (!box) return; box.hidden = true; document.body.style.overflow = ""; st = null; }
  window.openPlay = open;

  function gate() {
    st = null;
    body.innerHTML = '<div class="pl-end pl-gate"><i>🔐</i><h2 class="pl-h">로그인하고 즐겨요</h2><p>미니게임은 구글 로그인을 한 올드팬만 할 수 있어요.<br>로그인하면 즐겨찾기 저장, 오늘의 퀴즈, 방문 도장도 함께 쓸 수 있어요.</p><div class="pl-act" style="justify-content:center"><div id="plG"></div></div></div>';
    A().loginBtn($("plG"));
  }
  document.addEventListener("dlogin", function () { if (box && !box.hidden && A().isIn() && $("plG")) home(); });
  function home() {
    if (!A().isIn()) return gate();
    st = null;
    body.innerHTML = '<h2 class="pl-h">🎮 미니게임</h2><p class="pl-sub">그 시절 영상 제목으로 올드팬의 실력을 뽐내 보세요!</p>' +
      '<button type="button" class="pl-card c1" data-g="blank"><i>✏️</i><b>제목 빈칸 채우기</b><span>빠진 글자를 맞혀 보세요 · 5문제</span></button>' +
      '<button type="button" class="pl-card c2" data-g="cup"><i>🏆</i><b>영상 월드컵</b><span>둘 중 끌리는 제목을 골라 우승 영상을 가려요 · 16강</span></button>';
  }

  /* ───── 제목 빈칸 채우기 ───── */
  function wordsOf(t) { return (String(t).replace(/\[[^\]]*\]|\([^)]*\)/g, " ").match(/[가-힣]{2,6}/g) || []).filter(function (w) { return !SKIP.test(w); }); }
  function makeQ(pool, bank) {
    for (var tries = 0; tries < 60; tries++) {
      var v = pool[rnd(pool.length)], ws = wordsOf(v.title).filter(function (w) { return w.length >= 3; });
      if (!ws.length) ws = wordsOf(v.title); if (!ws.length) continue;
      var ans = ws[rnd(ws.length)];
      var dis = shuffle(bank.filter(function (w) { return w !== ans && Math.abs(w.length - ans.length) <= 1 && v.title.indexOf(w) < 0; })).slice(0, 3);
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
    st = { g: "blank", qs: qs, i: 0, ok: 0, done: false }; blankShow();
  }
  function blankShow() {
    var q = st.qs[st.i];
    body.innerHTML = '<p class="pl-step">제목 빈칸 채우기 · ' + (st.i + 1) + ' / ' + st.qs.length + '</p><p class="pl-q">' + q.shown + '</p>' +
      '<div class="pl-opts">' + q.opts.map(function (o, k) { return '<button type="button" class="pl-o" data-o="' + k + '">' + A().esc(o) + '</button>'; }).join("") + '</div><div id="plRes"></div>';
  }
  function blankPick(k) {
    if (st.done) return; var q = st.qs[st.i], got = q.opts[k], ok = got === q.ans; st.done = true; if (ok) st.ok++;
    [].forEach.call(body.querySelectorAll(".pl-o"), function (b, j) { b.disabled = true; if (q.opts[j] === q.ans) b.classList.add("ok"); else if (j === k) b.classList.add("no"); });
    var last = st.i + 1 >= st.qs.length;
    $("plRes").innerHTML = '<p class="pl-r ' + (ok ? "ok" : "no") + '">' + (ok ? "정답이에요! 👏" : "아쉬워요. 정답은 「" + A().esc(q.ans) + "」") + '</p><p class="pl-full">' + A().esc(q.v.title) + '</p>' +
      '<div class="pl-act"><a class="btn" href="' + A().esc(A().url(q.v.url)) + '" target="_blank" rel="noopener noreferrer">이 영상 보러 가기</a><button type="button" class="btn primary" data-next>' + (last ? "결과 보기" : "다음 문제") + '</button></div>';
  }
  function blankNext() {
    if (!st.done) return; st.done = false; st.i++;
    if (st.i >= st.qs.length) {
      var s = st.ok, msg = s === st.qs.length ? "완벽해요! 진짜 잉여맨 팬이시네요 🏆" : s >= 3 ? "대단해요! 꽤 잘 아시네요 👍" : s >= 1 ? "괜찮아요, 다시 하면 더 잘할 거예요" : "다음엔 꼭 맞혀 봐요!";
      body.innerHTML = '<div class="pl-end"><i>🎉</i><b>' + s + ' / ' + st.qs.length + '</b><p>' + msg + '</p><div class="pl-act"><button type="button" class="btn primary" data-g="blank">다시 하기</button><button type="button" class="btn" data-home>다른 게임</button></div></div>';
    } else blankShow();
  }

  /* ───── 영상 월드컵 ───── */
  function cupStart() {
    var all = A().vids().slice().sort(function (a, b) { return ((b.views || 0) + (b.likes || 0) * 5) - ((a.views || 0) + (a.likes || 0) * 5); }).slice(0, 80);
    st = { g: "cup", cur: shuffle(all).slice(0, 16), next: [], i: 0 }; cupShow();
  }
  function cupCard(v, k) {
    var a = A();
    return '<button type="button" class="pl-v" data-v="' + k + '" style="--g:' + a.grad(v.category) + '">' + (v.thumb ? '<img src="' + a.esc(v.thumb) + '" alt="" loading="lazy">' : "") + '<span class="pl-vt">' + a.esc(v.title) + '</span><span class="pl-vm">' + a.esc(v.category || "기타") + "</span></button>";
  }
  function cupShow() {
    var n = st.cur.length, label = n === 2 ? "결승" : n + "강", m = n / 2, a = st.cur[st.i * 2], b = st.cur[st.i * 2 + 1];
    body.innerHTML = '<p class="pl-step">영상 월드컵 · ' + label + ' ' + (st.i + 1) + ' / ' + m + '</p><p class="pl-q small">끌리는 영상을 골라 주세요</p><div class="pl-vs">' + cupCard(a, 0) + '<i class="pl-vsb">VS</i>' + cupCard(b, 1) + "</div>";
  }
  function cupPick(k) {
    st.next.push(st.cur[st.i * 2 + k]); st.i++;
    if (st.i * 2 >= st.cur.length) {
      if (st.next.length === 1) return cupWin(st.next[0]);
      st.cur = st.next; st.next = []; st.i = 0;
    }
    cupShow();
  }
  function cupWin(v) {
    var a = A();
    body.innerHTML = '<div class="pl-end"><i>🏆</i><p class="pl-step">우승 영상</p><div class="pl-win" style="--g:' + a.grad(v.category) + '">' + (v.thumb ? '<img src="' + a.esc(v.thumb) + '" alt="">' : "") + '<b>' + a.esc(v.title) + '</b></div>' +
      '<div class="pl-act"><a class="btn primary" href="' + a.esc(a.url(v.url)) + '" target="_blank" rel="noopener noreferrer">다시보기</a><button type="button" class="btn" data-fav2="1">♡ 즐겨찾기</button></div>' +
      '<div class="pl-act"><button type="button" class="btn" data-g="cup">다시 하기</button><button type="button" class="btn" data-home>다른 게임</button></div></div>';
    st.win = v;
  }

  function handle(e) {
    if (!A().isIn()) return; var t = e.target.closest && e.target.closest("[data-g],[data-o],[data-next],[data-home],[data-v],[data-fav2]"); if (!t || !st && !t.dataset.g) { if (t && t.hasAttribute("data-home")) home(); return; }
    if (t.dataset.g === "blank") return blankStart();
    if (t.dataset.g === "cup") return cupStart();
    if (t.hasAttribute("data-home")) return home();
    if (t.dataset.o != null && st && st.g === "blank") return blankPick(+t.dataset.o);
    if (t.hasAttribute("data-next") && st && st.g === "blank") return blankNext();
    if (t.dataset.v != null && st && st.g === "cup") return cupPick(+t.dataset.v);
    if (t.hasAttribute("data-fav2") && st && st.win) { A().addFav(st.win); t.textContent = "♥ 담았어요"; }
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-play]")) { e.preventDefault(); open(); } });
})();
