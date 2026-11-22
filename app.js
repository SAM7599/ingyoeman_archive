/* 잉여맨 추억자료실 - 동작 */
(function () {
  "use strict";
  const PAGE = 36;            // 한 번에 보여 주는 영상 수 (스크롤하면 더 나와요)
  const RECENT_MAX = 60;      // 본 영상 기억 개수
  const HUES = [232, 12, 150, 38, 268, 328, 190, 96, 22, 214, 350, 286];

  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} if (window.__sd && (k === "favs" || k === "recent" || k === "sov1")) window.__sd(); }
  };
  const SITE = window.SITE || {};
  /* ── 처음 오신 분께 보여 드리는 인트로 ── */
  const introHTML = (document.getElementById("intro") || {}).outerHTML || "";
  let introT = 0;
  function introEnd(fast) {
    const el = document.getElementById("intro"); clearTimeout(introT);
    if (!el) return document.documentElement.classList.remove("intro-on");
    if (fast && !el.classList.contains("out")) { el.classList.add("out"); introT = setTimeout(() => introEnd(false), 380); return; }
    el.remove(); document.documentElement.classList.remove("intro-on");
  }
  function introStart() {
    introEnd(false); document.body.insertAdjacentHTML("afterbegin", introHTML);
    document.documentElement.classList.add("intro-on"); introT = setTimeout(() => introEnd(false), 4200);
  }
  if (document.documentElement.classList.contains("intro-on")) introT = setTimeout(() => introEnd(false), 4200);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-intro]")) { e.preventDefault(); return introStart(); }
    if (e.target.closest("#intro")) introEnd(true);
  });
  /* ── 입장 동의 (인트로 다음에 나와요. 동의해야 이용할 수 있어요) ── */
  (() => {
    const root = document.documentElement, box = document.getElementById("consent"); if (!box) return;
    const lock = on => [...document.body.children].forEach(el => { if (el === box || el.id === "intro" || el.tagName === "SCRIPT") return; on ? el.setAttribute("inert", "") : el.removeAttribute("inert"); });
    const age = document.getElementById("csAge"), ok = document.getElementById("csOk"), go = document.getElementById("csGo"), no = document.getElementById("csNo");
    const sync = () => { go.disabled = !(age.checked && ok.checked); };
    age.addEventListener("change", sync); ok.addEventListener("change", sync);
    go.addEventListener("click", () => {
      if (go.disabled) return;
      try { localStorage.setItem("consent1", JSON.stringify({ v: 4, t: Date.now(), adult: true })); } catch (e) {}
      root.classList.remove("consent-on"); lock(false);
    });
    const bye = document.getElementById("csBye"), sec = document.getElementById("csSec"), main = box.querySelector(".cs-box:not(.cs-bye)"); let byeT = 0;
    const leave = () => {   // 창 닫기를 먼저 시도하고, 안 닫히면 처음 오던 페이지(없으면 네이버)로 보내요
      try { window.close(); } catch (e) {}
      setTimeout(() => { let to = "https://www.naver.com/"; try { const r = document.referrer; if (r && new URL(r).origin !== location.origin) to = r; } catch (e) {} try { location.replace(to); } catch (e) {} }, 500);
    };
    no.addEventListener("click", () => {
      main.hidden = true; bye.hidden = false; let n = 3; sec.textContent = n; document.getElementById("csBack").focus({ preventScroll: true });
      clearInterval(byeT); byeT = setInterval(() => { n--; if (n <= 0) { clearInterval(byeT); sec.textContent = "0"; leave(); } else sec.textContent = n; }, 1000);
    });
    document.getElementById("csBack").addEventListener("click", () => { clearInterval(byeT); bye.hidden = true; main.hidden = false; age.focus({ preventScroll: true }); });
    if (root.classList.contains("consent-on")) { lock(true); setTimeout(() => { if (!document.getElementById("intro")) age.focus({ preventScroll: true }); }, 4300); }
  })();
  const CATS = SITE.categories || [];

  let anim = false, popKey = null;
  let all = [], SERIES = [], ser = "", tab = "all", cat = "", shown = PAGE, todayKey = null, menuFor = null, current = null;
  let favs = new Set(store.get("favs", []));
  let recent = store.get("recent", []);   // 열어본 영상 (자동)
  let view = store.get("view2", "grid") === "rows" ? "rows" : "grid";
  const savedSort = store.get("sort", "new");
  $("sort").value = ["new", "old", "title", "likes"].includes(savedSort) ? savedSort : "new";

  const key = v => (v.url || "") + "|" + (v.title || "");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "#";
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  function hue(c) { const i = CATS.indexOf(c); return HUES[(i < 0 ? hash(c || "") : i) % HUES.length]; }
  const dot = c => `hsl(${hue(c)} 70% 62%)`;
  const grad = c => `linear-gradient(135deg,hsl(${hue(c)} 52% 46%),hsl(${(hue(c) + 34) % 360} 50% 26%))`;
  const num = v => { const m = (v.url || "").match(/\/(\d+)(?:[?#].*)?$/); return m ? m[1] : null; };
  const vid = v => num(v) || "k" + hash(key(v)).toString(36);
  const order = v => num(v) ? +num(v) : v._i;   // 카페에 올라온 순서 (글 번호)
  function ytId(v) {
    const s = v.youtube || v.url || "";
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? m[1] : null;
  }
  const byKey = k => all.find(v => key(v) === k);
  function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }

  /* ── 구글 로그인 — 서버 주소는 config.js 의 rating ── */
  const RATE = /^(https:\/\/|http:\/\/localhost)/i.test(SITE.rating || "") ? SITE.rating.replace(/\/+$/, "") : "";
  let QZ = null, meI = null, isAdm = false, rtok = store.get("dtok", null);
  const GID = SITE.google || "";
  /* 구글 로그인: 버튼을 눌러 로그인하면 구글이 확인 정보를 주고, 서버가 그걸 검사해서 우리 사이트용 토큰을 줘요 */
  let gsiReady = false;
  async function onGoogle(resp) {
    try {
      const r = await fetch(RATE + "/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential, adult: (() => { try { return JSON.parse(localStorage.getItem("consent1")).adult === true; } catch (e) { return false; } })() }) });
      if (r.status === 403) { const j = await r.json().catch(() => ({})); if (j.error === "banned") return alert("운영자에 의해 정지된 계정이에요."); if (j.error === "abroad") return alert("해외에서는 로그인할 수 없어요. 한국에서 접속해 주세요.");  if (j.error === "cooldown") return toast("내 정보를 삭제한 뒤 24시간 동안은 다시 로그인할 수 없어요. 약 " + (j.hours || 24) + "시간 뒤에 해 주세요"); return toast("이용이 제한되어 로그인할 수 없어요"); }
      if (r.status === 400) { const j = await r.json().catch(() => ({})); if (j.error === "adult") return toast("만 19세 이상만 로그인할 수 있어요. 새로고침해서 동의 화면에서 확인해 주세요"); }
      if (!r.ok) return toast("로그인하지 못했어요. 잠시 후 다시 해 주세요");
      const d = await r.json(); rtok = { t: d.token, name: d.name || "" }; isAdm = !!d.admin; syncAdm(); store.set("dtok", rtok);
      toast("구글로 로그인했어요"); loadRatings();
    } catch (e) { toast("로그인하지 못했어요. 잠시 후 다시 해 주세요"); }
  }
  /* ── 상단 구글 로그인 버튼 ── */
  function syncQuiz() {
    const home = $("home"); if (!home || $("home").hidden) return;
    const el = $("qz"), html = quizHtml();
    if (el) { if (html) el.outerHTML = html; else el.remove(); } else if (html) home.insertAdjacentHTML("afterbegin", html);
  }
  function gLoad(cb) {
    if (window.google && google.accounts) return cb();
    if (document.getElementById("gsi")) { const w = setInterval(() => { if (window.google && google.accounts) { clearInterval(w); cb(); } }, 300); setTimeout(() => clearInterval(w), 8000); return; }
    const sc = document.createElement("script"); sc.id = "gsi"; sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = cb; document.head.appendChild(sc);
  }
  function gBtn(el, o) {
    gLoad(() => { try {
      if (!gsiReady) { google.accounts.id.initialize({ client_id: GID, callback: onGoogle, ux_mode: "popup" }); gsiReady = true; }
      google.accounts.id.renderButton(el, { theme: document.documentElement.getAttribute("data-theme") === "light" ? "outline" : "filled_black", size: "large", ...o });
    } catch (e) {} });
  }
  function drawPromoBtn() { const b = $("gBtnPromo"); if (b && !b.firstChild) gBtn(b, { text: "signin_with", shape: "pill", locale: "ko" }); }
  const tipDay = () => Math.floor((Date.now() + 9 * 36e5) / 864e5);
  let tipOn = store.get("tip_hide", 0) !== tipDay(), tipT = 0, qst = store.get("qzs1", null), pulled = false, pullBusy = false, pushT = 0, vmapC = null;
  function drawLogin() {
    try { syncQuiz(); } catch (e) {}
    document.body.classList.toggle("is-in", !!rtok); if (rtok) document.dispatchEvent(new Event("dlogin"));
    const box = $("gTop"); if (!box) return;
    if (!RATE || !GID) { box.hidden = true; return; }
    box.hidden = false;
    if (rtok) {
      const nm = (meI && meI.name) || rtok.name || "나";
      box.innerHTML = `<button type="button" class="round g-me" id="gMe" aria-haspopup="true" aria-expanded="false" title="${esc(nm)} (로그인됨)"><span>${esc(String(nm).slice(0, 1))}</span></button><div class="g-menu" id="gMenu" hidden><p><small>로그인됨</small><b>${esc(nm)}</b></p><button type="button" id="gOut">로그아웃</button><button type="button" id="gDel" class="g-del">내 정보 지우기</button></div>`;
      syncPull(); return;
    }
    box.innerHTML = '<div id="gBtnTop"></div>' + (tipOn ? '<div class="g-tip" id="gTip" role="note"><button type="button" class="g-x" id="gTipX" aria-label="닫기">✕</button><span class="lp-badge">무료 회원</span><b class="g-tt">로그인 혜택</b><ul class="lp-rows"><li><i class="lp-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></i><div><b>즐겨찾기·열어본 영상 저장</b><span>기기를 바꿔도 그대로예요</span></div></li><li><i class="lp-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/></svg></i><div><b>오늘의 한 줄 퀴즈</b><span>매일 새 문제, 연속 정답·정답률 기록</span></div></li><li><i class="lp-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="11" rx="5"/><path d="M8 11v5M5.5 13.5h5M15.5 12.5h.01M18 14.5h.01"/></svg></i><div><b>미니게임</b><span>제목 빈칸 채우기</span></div></li></ul><button type="button" class="g-tipoff" id="gTipOff">오늘 하루 보지 않기</button></div>' : "");
    const wide = window.innerWidth >= 861;
    gBtn($("gBtnTop"), wide ? { text: "signin", shape: "pill", locale: "ko" } : { type: "icon", shape: "circle" });
  }
  /* ── 로그인 혜택: 즐겨찾기·열어본 영상·시리즈 고침을 계정에 저장해요 ── */
  const vmap = () => { if (!vmapC || vmapC.n !== all.length) { vmapC = { n: all.length, m: {} }; all.forEach(v => { vmapC.m[vid(v)] = key(v); }); } return vmapC.m; };
  const k2v = k => { const v = byKey(k); return v ? vid(v) : null; };
  document.addEventListener("click", e => {   // 로그인 말풍선 닫기 / 오늘 하루 보지 않기
    const x = e.target.closest && e.target.closest("#gTipX, #gTipOff"); if (!x) return;
    tipOn = false; const t = $("gTip"); if (t) t.remove();
    if (x.id === "gTipOff") { store.set("tip_hide", tipDay()); toast("오늘은 다시 안 보여드릴게요"); }
  });
  function syncPush() {
    if (!rtok || !pulled || pullBusy) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => {   // 바뀐 뒤 4초 기다렸다가 한 번에 보내요 (서버 부담을 줄여요)
      const fav = [...favs].map(k2v).filter(Boolean).slice(0, 300), rec = recent.map(k2v).filter(Boolean).slice(0, 100), sov = store.get("sov1", {}) || {};
      rApi("/sync", { method: "POST", body: JSON.stringify({ fav, rec, sov }) }).catch(() => {});
    }, 4000);
  }
  window.__sd = syncPush;
  function setQst(q) { if (!q || typeof q.all !== "number") return; qst = q; store.set("qzs1", q); const el = $("qz"); if (el && rtok) el.outerHTML = quizHtml(); }
  async function syncPull() {
    if (!rtok || pulled || pullBusy || !all.length) return;
    pullBusy = true;
    try {
      const r = await rApi("/sync"); if (!r.ok) { pullBusy = false; return; }
      const d = await r.json(), m = vmap();
      let added = 0;
      (d.fav || []).forEach(i => { const k = m[i]; if (k && !favs.has(k)) { favs.add(k); added++; } });
      const have = new Set(recent), add = (d.rec || []).map(i => m[i]).filter(k => k && !have.has(k));
      recent = [...recent, ...add].slice(0, RECENT_MAX);
      const ov = { ...(d.sov || {}), ...(store.get("sov1", {}) || {}) };
      store.set("favs", [...favs]); store.set("recent", recent);
      if (Object.keys(ov).length) { store.set("sov1", ov); buildSeries(); }
      setQst(d.quiz);
      pulled = true; pullBusy = false;
      render(); if (added) toast("계정에 저장된 즐겨찾기 " + added + "개를 불러왔어요");
      syncPush();
    } catch (e) { pullBusy = false; }
  }
  function quizReport(ok) {
    if (!rtok) return;
    rApi("/quiz", { method: "POST", body: JSON.stringify({ d: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10), ok }) }).then(r => r.ok ? r.json() : null).then(setQst).catch(() => {});
  }
  document.addEventListener("click", e => {
    const me = e.target.closest && e.target.closest("#gMe"), menu = $("gMenu");
    if (me && menu) { menu.hidden = !menu.hidden; me.setAttribute("aria-expanded", String(!menu.hidden)); return; }
    if (e.target.closest && e.target.closest("#gOut")) { rLogout(); toast("로그아웃했어요"); return; }
    if (e.target.closest && e.target.closest("#gDel")) { deleteMine(); return; }
    if (menu && !menu.hidden && !(e.target.closest && e.target.closest("#gMenu"))) menu.hidden = true;
  });
  drawLogin();
  /* ── 방문자 수 (로그인 없이, 접속 주소를 하루짜리 코드로만 세요) ── */
  (function () {
    if (!RATE || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    const el = $("vis"); if (!el) return;
    const nf = n => Number(n).toLocaleString("ko-KR");
    let last = 0;
    async function ping() {
      if (document.visibilityState !== "visible" || Date.now() - last < 45000) return;
      last = Date.now();
      try {
        const r = await fetch(RATE + "/ping", { method: "POST" }); if (!r.ok) return;
        const d = await r.json(); if (typeof d.today !== "number") return;
        el.textContent = "지금 " + nf(Math.max(1, d.now || 0)) + "명 보는 중 · 오늘 방문 " + nf(Math.max(1, d.today || 0)) + "번";
        el.hidden = false;
      } catch (e) {}
    }
    ping(); setInterval(ping, 60000); document.addEventListener("visibilitychange", ping);
  })();

  const rApi = (path, opt) => fetch(RATE + path, { ...(opt || {}), headers: { ...(rtok ? { Authorization: "Bearer " + rtok.t } : {}), "Content-Type": "application/json" } });
  const refreshMe = () => { if (rtok) rApi("/me").then(r => r.ok ? r.json() : null).then(d => { if (d && d.name) { meI = { name: d.name, cnt: d.cnt || 0, title: d.title || "", next: d.next || null }; drawRate(); } }).catch(() => {}); };
  function rLogout() { pulled = false; pullBusy = false; qst = null; store.set("qzs1", null); meI = null; rtok = null; isAdm = false; syncAdm(); store.set("dtok", null); drawLogin(); }
  function loadRatings() {   // 로그인 상태만 확인해요
    if (!RATE || !rtok) return;
    rApi("/me").then(r => r.status === 401 ? Promise.reject("login") : r.json()).then(d => { rtok.name = d.name || ""; meI = { name: d.name || "", cnt: d.cnt || 0, title: d.title || "", next: d.next || null }; isAdm = !!d.admin; syncAdm(); drawLogin(); }).catch(e => { if (e === "login") rLogout(); });
  }
    function deleteMine() {   // 내 정보 지우기: 안내 문구를 똑같이 입력해야 지워져요
    if (!rtok || $("delAsk")) return;
    const DEL_WORD = ((meI && meI.name) || rtok.name || "").trim();
    if (!DEL_WORD) return toast("닉네임을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요");
    const m = document.createElement("div"); m.className = "modal del-ask"; m.id = "delAsk";
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="delT"><div class="m-body"><h2 id="delT">내 정보를 지울까요?</h2><p class="del-p">즐겨찾기·열어본 영상·퀴즈 기록과 접속 기록이 모두 지워져요. 되돌릴 수 없고, 지운 뒤에는 자동으로 로그아웃돼요. 서버 부담을 줄이기 위해 지운 뒤 24시간 동안은 다시 로그인할 수 없어요.</p><p class="del-p">계속하려면 아래 칸에 내 닉네임 <b>${esc(DEL_WORD)}</b> 을(를) 똑같이 입력한 뒤 지우기를 눌러 주세요.</p><input id="delIn" type="text" autocomplete="off" placeholder="내 닉네임 입력" maxlength="40"><div class="del-acts"><button type="button" class="btn" id="delNo">취소</button><button type="button" class="btn del-go" id="delGo" disabled>지우기</button></div></div></div>`;
    document.body.appendChild(m);
    const inp = $("delIn"), go = $("delGo"), close = () => m.remove();
    inp.addEventListener("input", () => { go.disabled = inp.value.trim() !== DEL_WORD; });
    $("delNo").addEventListener("click", close);
    m.addEventListener("click", e => { if (e.target === m) close(); });
    m.addEventListener("keydown", e => { if (e.key === "Escape") close(); if (e.key === "Enter" && !go.disabled) go.click(); });
    go.addEventListener("click", async () => {
      if (inp.value.trim() !== DEL_WORD) return; go.disabled = true;
      try {
        const r = await rApi("/account/delete", { method: "POST", body: "{}" });
        if (!r.ok) { go.disabled = false; return toast("지금은 지울 수 없어요. 잠시 후 다시 해 주세요"); }
        close(); rLogout(); toast("내 정보를 모두 지우고 로그아웃했어요");
      } catch (e) { go.disabled = false; toast("지금은 지울 수 없어요. 잠시 후 다시 해 주세요"); }
    });
    setTimeout(() => inp.focus(), 50);
  }
  const my0 = () => true;

  /* ── 운영진 대시보드 (지정한 구글 계정만) ── */
  /* 서버 상태 (운영진에게만 보여요) */
  let srv = null, srvTimer = null;
  async function srvCheck() {
    if (!RATE) return;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000), t0 = performance.now();
    let s = "down", ms = 0;
    try { const r = await fetch(RATE + "/me", { cache: "no-store", signal: ctl.signal }); ms = Math.round(performance.now() - t0); s = r.status < 500 ? (ms > 2000 ? "slow" : "ok") : "down"; } catch (e) { s = "down"; }
    clearTimeout(to); srv = { s, ms, t: Date.now() }; { const L = store.get("srvlog", []); L.push({ t: srv.t, ms, s }); store.set("srvlog", L.slice(-60)); } srvDraw(); if (!$("admModal").hidden && !$("admUl")) drawStatus();
  }
  function srvDraw() {
    if (!srv) return;
    $("admDot").dataset.s = srv.s;
    const msg = { ok: "정상", slow: "느려요", down: "연결 안 됨" }[srv.s];
    const d = new Date(srv.t), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
    $("admSrv").dataset.s = srv.s;
    $("admSrvT").textContent = `서버: ${msg}` + (srv.s === "down" ? "" : ` · 응답 ${srv.ms}ms`) + ` · ${hm} 확인`;
    $("admBtn").title = "운영진 대시보드 · 서버 " + msg;
  }
  function srvWatch(on) { clearInterval(srvTimer); srvTimer = null; if (on) { srvCheck(); srvTimer = setInterval(() => { if (!document.hidden) srvCheck(); }, 60000); } else srv = null; }
  function syncAdm() { $("admBtn").hidden = !isAdm; srvWatch(isAdm); }
  function openDash() { if (!isAdm) return; openStatus(); srvCheck(); }
  /* ── 운영진 서버 상태 (지정한 구글 계정만) ── */
  let tmap = null;
  const vTitle = id => { if (!tmap) { tmap = {}; all.forEach(v => { tmap[vid(v)] = v.title || ""; }); } return tmap[id] || "(목록에서 사라진 영상)"; };
  function openStatus() { $("admModal").hidden = false; $("admModal").scrollTop = 0; drawStatus(); }
  function lineChart(L) {
    if (L.length < 2) return `<p class="ch-empty">확인 기록이 쌓이면 그래프가 나와요. (1분마다 자동으로 확인해요)</p>`;
    const W = 600, H = 170, P = { l: 56, r: 14, t: 14, b: 26 }, ok = L.filter(x => x.s !== "down"), top = Math.max(500, ...ok.map(x => x.ms)) * 1.1;
    const X = i => P.l + (W - P.l - P.r) * i / (L.length - 1), Y = ms => P.t + (H - P.t - P.b) * (1 - Math.min(ms, top) / top);
    let d = "", pen = false; L.forEach((x, i) => { if (x.s === "down") { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(x.ms).toFixed(1); pen = true; });
    const dots = L.map((x, i) => x.s === "down" ? `<circle cx="${X(i).toFixed(1)}" cy="${P.t + 6}" r="4.5" class="ch-bad"/>` : "").join("");
    const hm = t => { const z = new Date(t); return String(z.getHours()).padStart(2, "0") + ":" + String(z.getMinutes()).padStart(2, "0"); };
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="서버 응답 속도 그래프"><line x1="${P.l}" x2="${W - P.r}" y1="${Y(2000)}" y2="${Y(2000)}" class="ch-warn"/><text x="${P.l - 6}" y="${Y(0) + 4}" class="ch-t" text-anchor="end">0</text><text x="${P.l - 6}" y="${P.t + 8}" class="ch-t" text-anchor="end">${Math.round(top)}ms</text><path d="${d}" class="ch-line"/>${dots}<text x="${P.l}" y="${H - 6}" class="ch-t">${hm(L[0].t)}</text><text x="${W - P.r}" y="${H - 6}" class="ch-t" text-anchor="end">${hm(L[L.length - 1].t)}</text></svg>`;
  }
  function drawStatus(note) {
    const L = store.get("srvlog", []), okN = L.filter(x => x.s !== "down"), avg = okN.length ? Math.round(okN.reduce((s, x) => s + x.ms, 0) / okN.length) : 0, bad = L.length - okN.length;
    $("admList").innerHTML = `<section class="st"><h3>서버 응답 속도</h3>${lineChart(L)}<p class="st-h">선이 <b>낮을수록 빨라요</b>. 점선(2초)을 넘으면 느린 거예요. 위쪽 <span class="st-red">빨간 점</span>은 연결이 안 됐던 때예요.${L.length ? ` 평균 ${avg}ms${bad ? ` · 안 된 적 ${bad}번` : ""} (이 기기에서 최근 ${L.length}번 확인 기준)` : ""}</p></section><section class="st" id="admUse"><h3>서버 사용량</h3><p class="st-h">불러오는 중…</p></section><section class="st" id="admUsers"><h3>의심 접속 기록</h3><p class="st-h">불러오는 중…</p></section><section class="st" id="admBn"><h3>정지된 계정</h3><p class="st-h">불러오는 중…</p></section><section class="st" id="admUl"><h3>로그인한 사람</h3><p class="st-h">불러오는 중…</p></section>`;
    loadAdmUsers();
  }
  /* ── 운영진: 유저 관리 · 서버에 부담을 준 것으로 의심되는 접속 ── */
  const KIND = { many_accounts: "한 접속 주소에서 하루에 계정 3개 이상 로그인", sync: "저장 요청을 너무 자주 보냄", login: "로그인 시도를 너무 자주 함", quiz: "퀴즈 기록 요청을 너무 자주 보냄" };
  const when = t => { const z = new Date(t); return `${z.getMonth() + 1}/${z.getDate()} ${String(z.getHours()).padStart(2, "0")}:${String(z.getMinutes()).padStart(2, "0")}`; };
  const bar = (pct, label) => { const c = pct >= 90 ? "#e5484d" : pct >= 70 ? "#f0a020" : "#2fb86b"; return `<div class="us-bar"><i style="width:${Math.min(100, Math.max(2, pct))}%;background:${c}"></i></div><p class="us-t">${label}</p>`; };
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
  async function loadUsage() {
    const box = $("admUse"); if (!box) return;
    try {
      const r = await rApi("/admin/usage"); if (!r.ok) throw 0; const u = await r.json(), reqP = u.reqToday / u.reqLimit * 100, dbP = u.dbBytes / u.dbLimit * 100, left = Math.max(0, u.resetAt - Date.now()), h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
      box.innerHTML = `<h3>서버 사용량 <small>(무료 한도 기준)</small></h3><p class="us-k">오늘 요청 수</p>` + bar(reqP, `약 <b>${u.reqToday.toLocaleString()}</b> / ${u.reqLimit.toLocaleString()}회 · 남은 한도 약 <b>${Math.max(0, 100 - reqP).toFixed(1)}%</b>`) +
        `<p class="us-k">저장 공간</p>` + bar(dbP, `<b>${mb(u.dbBytes)}</b> / ${mb(u.dbLimit)} · 로그인한 사람 ${u.users}명`) +
        `<p class="st-h">요청 수는 일부만 세어 계산한 <b>대략의 값</b>이에요(실제와 조금 다를 수 있어요). 하루 한도는 <b>한국 시간 오전 9시</b>에 새로 시작해요(${h}시간 ${m}분 남음). 정확한 값은 Cloudflare 사이트의 Workers 사용량에서 볼 수 있어요.</p>`;
    } catch (e) { box.innerHTML = `<h3>서버 사용량</h3><p class="st-h">불러오지 못했어요. 서버 파일을 새로 올린 뒤 다시 열어 주세요.</p>`; }
  }
  async function loadAdmUsers() {
    loadUsage();
    try {
      const [ra, ru] = await Promise.all([rApi("/admin/abuse"), rApi("/admin/users")]);
      if (!ra.ok || !ru.ok) throw 0;
      const ab = await ra.json(), us = await ru.json(), box = $("admUsers"), ul = $("admUl"), bn = $("admBn"); if (!box || !ul) return;
      if (bn) { const B = us.banned || []; bn.innerHTML = `<h3>정지된 계정 <small>(${B.length}명)</small></h3>` + (B.length ? `<ul class="au-l">${B.map(b => `<li class="flag"><b>${esc(b.name || "이름 없음")}</b><span>정지한 날 ${when(b.since)}</span><button type="button" class="au-del" data-uid="${esc(b.uid)}" data-ban="0">정지 풀기</button></li>`).join("")}</ul>` : `<p class="st-h">정지된 계정이 없어요.</p>`); }
      box.innerHTML = `<h3>의심 접속 기록</h3>` + (ab.rows.length ? `<ul class="au-l">${ab.rows.map(r => `<li><b>${esc(KIND[r.kind] || r.kind)}</b><span>접속 코드 <code>${esc(r.ip)}</code>${r.name ? " · " + esc(r.name) : ""} · ${r.n}번 · 마지막 ${when(r.last)}</span>${r.uid ? `<button type="button" class="au-del" data-uid="${esc(r.uid)}" data-ban="${r.banned ? 0 : 1}">${r.banned ? "정지 풀기" : "계정 정지"}</button>` : ""}</li>`).join("")}</ul>` : `<p class="st-h">아직 없어요. 👍</p>`) + `<p class="st-h">접속 주소는 되돌릴 수 없는 짧은 코드로만 남기고, ${ab.days}일 뒤 자동으로 지워요. 같은 코드는 같은 접속 주소예요.</p>`;
      ul.innerHTML = `<h3>로그인한 사람 <small>(${us.total}명)</small></h3><div class="au-body">` + (us.users.length ? `<ul class="au-l">${us.users.filter(u => !admHide.has(u.uid)).map(u => `<li${u.flag ? ' class="flag"' : ""}><button type="button" class="au-x" data-uid="${esc(u.uid)}" aria-label="닫기" title="닫기">✕</button><b>${esc(u.name || "이름 없음")}${u.flag ? " ⚠️" : ""}${u.banned ? " · 정지됨" : ""}</b><span>즐겨찾기 ${u.fav} · 본 영상 ${u.rec} · 퀴즈 ${u.qok}/${u.qall} · 마지막 ${when(u.ts)}</span><button type="button" class="au-del" data-uid="${esc(u.uid)}" data-ban="${u.banned ? 0 : 1}">${u.banned ? "정지 풀기" : "계정 정지"}</button></li>`).join("")}</ul>` : `<p class="st-h">아직 없어요.</p>`) + `</div>`;
    } catch (e) { const b = $("admUsers"); if (b) b.innerHTML = `<h3>의심 접속 기록</h3><p class="st-h">불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>`; const l = $("admUl"); if (l) l.innerHTML = ""; }
  }
  const admHide = new Set();   // ✕로 닫은 사람 (화면에서만 숨겨요. 기록은 그대로예요)
  document.addEventListener("click", e => {
    const x = e.target.closest(".au-x"); if (!x) return;
    admHide.add(x.dataset.uid); const li = x.closest("li"); if (li) li.remove();
  });
  document.addEventListener("click", async e => {
    const b = e.target.closest(".au-del"); if (!b) return;
    const ban = b.dataset.ban === "1";
    if (!confirm(ban ? "이 계정을 정지할까요?\n정지된 사람은 로그인할 수 없어요. 언제든 정지를 풀 수 있어요." : "이 계정의 정지를 풀까요?")) return;
    b.disabled = true;
    try { const r = await rApi("/admin/user/ban", { method: "POST", body: JSON.stringify({ uid: b.dataset.uid, ban }) }); if (r.ok) loadAdmUsers(); else { b.disabled = false; toast(r.status === 400 ? "내 계정은 정지할 수 없어요" : "처리하지 못했어요"); } } catch (x) { b.disabled = false; }
  });
  const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
  const OUT = `<svg class="out" viewBox="0 0 24 24"><path d="M9 6h9v9M18 6L7 17"/></svg>`;
  const CARD = `<svg class="ci" viewBox="0 0 24 24"><rect x="6.5" y="3.5" width="11" height="17" rx="2.2"/><path d="M12 9.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/></svg>`;
  const TROPHY = `<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/></svg>`;
  const DOTS = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;

  /* ── 목록 고르기 ── */
  function pool() {
    if (tab === "fav") return all.filter(v => favs.has(key(v)));
    if (tab === "recent") return recent.map(byKey).filter(Boolean);
    if (tab === "nothumb") return all.filter(v => !v.thumb);
    if (tab === "rank") return ranked(all);
    if (tab === "series") { const w = $("serQ").value.trim().toLowerCase().split(/\s+/).filter(Boolean); return ser ? all.filter(v => v._s.includes(ser) && hit(v, w)) : []; }
    return all;
  }
  const LIKE_W = 50;   // 인기 점수 = 조회수 + 좋아요 × 50
  const pop = v => Math.max(0, (v.views || 0) + LIKE_W * (v.likes || 0));
  const nf = n => Number(n || 0).toLocaleString("ko-KR");
  const ranked = list => list.filter(v => pop(v) > 0).sort((a, b) => pop(b) - pop(a) || order(a) - order(b));   // 카페 조회수와 좋아요를 합친 순
  const words = () => $("q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  /* 검색: 띄어쓰기가 달라도, 초성(ㅁㄱㅌㅊㅁ)만 써도 찾아요 */
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const chosung = s => { let o = ""; for (const c of s) { const n = c.charCodeAt(0); if (n >= 0xAC00 && n <= 0xD7A3) o += CHO[Math.floor((n - 0xAC00) / 588)]; else if (/[a-z0-9]/i.test(c)) o += c.toLowerCase(); } return o; };
  function hit(v, ws) {
    if (!ws.length) return true;
    if (!v._sh) { const h = ((v.title || "") + " " + (v.category || "")).toLowerCase(); v._sh = [h, h.replace(/[\s!-\/:-@\[-`{-~·~…“”‘’]+/g, ""), chosung(h)]; }
    return ws.every(x => v._sh[0].includes(x) || v._sh[1].includes(x) || (/^[ㄱ-ㅎ]+$/.test(x) && v._sh[2].includes(x)));
  }
  function filtered() {
    const w = words(), s = $("sort").value;
    const list = pool().filter(v => {
      if (cat && cat !== "*" && v.category !== cat) return false;
      return hit(v, w);
    });
    if (tab === "recent" && s === "new") return list;   // 본 순서 그대로
    if (tab === "rank") return list.slice(0, 100);        // 순위 그대로, 100위까지
    if (s === "likes") return list.sort((a, b) => pop(b) - pop(a) || order(b) - order(a));
    return list.sort((a, b) => s === "title" ? (a.title || "").localeCompare(b.title || "", "ko") : s === "old" ? order(a) - order(b) : order(b) - order(a));
  }
  const isInfo = () => tab === "guide" || tab === "about" || tab === "ach" || tab === "notes";
  const isHome = () => tab === "all" && !cat && !words().length;

  /* ── 그리기 ── */
  function mark(title) {   // 검색어에 색칠
    const w = words(), t = String(title || "");
    if (!w.length) return esc(t);
    const re = new RegExp("(" + w.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    return t.split(re).map((p, i) => i % 2 ? "<mark>" + esc(p) + "</mark>" : esc(p)).join("");
  }
  const picHtml = (v, hl) => v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : `<div class="ph"><b>${hl ? mark(v.title) : esc(v.title)}</b></div>`;   // 썸네일이 없으면 제목 카드
  let rankWas = false;
  const IMG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/></svg>`;
  const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>`;
  function cardHtml(v, shelf, rank) {
    const k = key(v), on = favs.has(k), seen = recent.includes(k) && tab !== "recent" && !shelf, rows = (view === "rows" || tab === "rank") && !shelf;
    const sn = v._s && v._s.find(n => n !== ser), showLikes = pop(v) > 0 && (rank || $("sort").value === "likes" && !shelf);
    const meta = `<div class="meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span>${showLikes ? `<span class="vw">조회 ${nf(v.views)}</span><span class="lk">♥ ${v.likes || 0}</span>` : ""}${repCount(v) ? `<span class="rp">썸네일 제보 ${repCount(v)}건</span>` : ""}${sn ? `<span class="ser" role="link" tabindex="0" data-ser="${esc(sn)}">${esc(sn)}</span>` : ""}</div>`;
    const info = `<div class="t"><h3>${shelf ? esc(v.title) : mark(v.title)}</h3>${meta}</div>`;
    const dots = `<button class="dots" type="button" aria-label="더 보기 메뉴" aria-haspopup="menu">${DOTS}</button>`;
    const heart = `<button class="heart ${on ? "on" : ""} ${k === popKey ? "pop" : ""}" type="button" aria-label="${on ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기"}" title="즐겨찾기">${HEART}</button>`;
    const thumb = `<div class="thumb" style="--g:${grad(v.category)}">${picHtml(v, !shelf)}${rank && !rows ? `<span class="rkb">${rank === 1 ? CROWN : ""}${rank}</span>` : seen ? `<span class="seen">열어봄</span>` : ""}${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ""}</div>`;
    const a = `href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer"`;
    const tier = rank && rank <= 3 ? " r" + rank : rank && rank <= 10 ? " rt10" : "";
    return `<article class="card ${v.thumb ? "" : "no-thumb"}${tier}" data-k="${esc(k)}" style="--i:${rank ? Math.min(rank, 24) - 1 : 0}">` + (rows
      ? `${rank ? `<span class="rk ${rank <= 3 ? "hot t" + rank : ""}">${rank === 1 ? CROWN : ""}${rank}</span>` : ""}<a ${a}>${thumb}<div class="info">${info}</div><span class="go">${ytId(v) ? "바로 보기" : "다시보기" + OUT}</span></a>${heart}${dots}`
      : `<a ${a}>${thumb}</a><div class="info">${info}${dots}</div>${heart}`) + `</article>`;
  }
  /* ── 시리즈: 자동 분류 + 이 기기에서 고친 내용 (localStorage "sov1") ── */
  let SDEFS = [], baseOk = new Set();
  const autoVis = v => v._a.filter(n => baseOk.has(n));
  function buildSeries() {
    const ov = store.get("sov1", {}), touched = new Set();
    all.forEach(v => { const o = ov && ov[vid(v)]; if (Array.isArray(o)) { v._s = o.filter(x => typeof x === "string"); v._s.forEach(n => touched.add(n)); } else v._s = v._a.slice(); });
    const cnt = {}; all.forEach(v => v._s.forEach(n => { cnt[n] = (cnt[n] || 0) + 1; }));
    SERIES = [...new Set([...SDEFS.map(x => x.name), ...touched])].map(n => ({ name: n, n: cnt[n] || 0 })).filter(x => x.n >= (touched.has(x.name) ? 1 : 3)).sort((a, b) => b.n - a.n);
    const ok = new Set(SERIES.map(x => x.name)); all.forEach(v => { v._s = v._s.filter(n => ok.has(n)); });
  }
  let seV = null;
  const seNames = () => { const ov = store.get("sov1", {}), x = new Set(SDEFS.map(d => d.name)); Object.values(ov || {}).forEach(a => (Array.isArray(a) ? a : []).forEach(n => x.add(n))); return [...x]; };
  function seDraw(sel) {
    const names = [...new Set([...seNames(), ...sel])], shown = new Set(SERIES.map(x => x.name));
    names.sort((a, b) => (sel.has(b) - sel.has(a)) || (shown.has(b) - shown.has(a)));
    $("seList").innerHTML = names.map(n => `<label class="se-r"><input type="checkbox" value="${esc(n)}"${sel.has(n) ? " checked" : ""}><span>${esc(n)}</span></label>`).join("") || `<p class="se-n">아직 시리즈가 없어요. 아래에서 새로 만들어 보세요.</p>`;
  }
  const seSel = () => new Set([...$("seList").querySelectorAll("input:checked")].map(i => i.value));
  let serOn = false, serQFor = "";
  $("serQ").addEventListener("input", () => render());
  $("serMode").addEventListener("click", () => { serOn = !serOn; render(); });
  $("serEnd").addEventListener("click", () => { serOn = false; render(); });
  $("grid").addEventListener("click", e => {
    if (!serOn) return;
    const c = e.target.closest(".card"); if (!c) return;
    const v = byKey(c.dataset.k); if (!v) return;
    e.preventDefault(); e.stopPropagation(); openSerEdit(v);
  }, true);
  function openSerEdit(v) { seV = v; $("seV").textContent = v.title || ""; $("seNew").value = ""; seDraw(new Set(v._s)); $("serEdit").hidden = false; document.body.style.overflow = "hidden"; }
  function closeSerEdit() { $("serEdit").hidden = true; seV = null; if ($("modal").hidden) document.body.style.overflow = ""; }
  function seApply(list) {
    const ov = store.get("sov1", {}) || {}, k = vid(seV), same = list.length === autoVis(seV).length && list.every(n => autoVis(seV).includes(n));
    if (same) delete ov[k]; else ov[k] = list;
    store.set("sov1", ov); buildSeries(); $("abS").textContent = SERIES.length;
    if (tab === "series" && ser && !SERIES.some(x => x.name === ser)) location.hash = "series"; else render();
  }
  function copyText(t, msg) {
    const done = () => toast(msg), fail = () => toast("복사하지 못했어요");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fail);
    else { const x = document.createElement("textarea"); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand("copy") ? done() : fail(); } catch (e) { fail(); } x.remove(); }
  }
  const seLine = (v, list) => `영상: ${v.title}\n주소: ${location.origin + location.pathname}#v=${vid(v)}\n지금 분류: ${autoVis(v).join(", ") || "없음"}\n바뀌었으면 하는 분류: ${list.join(", ") || "없음"}`;
  $("seAdd").addEventListener("click", () => { const n = $("seNew").value.replace(/[,\n]/g, " ").trim().slice(0, 20); if (!n || !seV) return; const sel = seSel(); sel.add(n); seDraw(sel); $("seNew").value = ""; });
  $("seNew").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("seAdd").click(); } });
  $("seSave").addEventListener("click", () => { if (!seV) return; seApply([...seSel()]); closeSerEdit(); toast("이 기기에 저장했어요"); });
  $("seReset").addEventListener("click", () => { if (!seV) return; seApply(autoVis(seV)); closeSerEdit(); toast("처음 분류로 되돌렸어요"); });
  $("seCopy").addEventListener("click", () => { if (seV) copyText("[시리즈 분류 제보]\n" + seLine(seV, [...seSel()]), "제보 문구를 복사했어요. 제보 게시판(카페)에 붙여 넣어 주세요"); });
  $("seCopyAll").addEventListener("click", () => {
    const ov = store.get("sov1", {}) || {}, out = [];
    all.forEach(v => { const o = ov[vid(v)]; if (Array.isArray(o)) out.push(seLine(v, v._s)); });
    if (!out.length) return toast("고친 시리즈가 아직 없어요");
    let t = "[시리즈 분류 제보 " + out.length + "건]", n = 0;
    for (const x of out) { if ((t + "\n\n" + x).length > 1800) break; t += "\n\n" + x; n++; }
    if (n < out.length) t += "\n\n…외 " + (out.length - n) + "건 (나눠서 올릴게요)";
    copyText(t, n < out.length ? "길어서 " + n + "건만 복사했어요. 나머지는 고친 뒤 다시 복사해 주세요" : "고친 " + n + "건을 복사했어요. 제보 게시판(카페)에 붙여 넣어 주세요");
  });
  $("serEdit").addEventListener("click", e => { if (e.target === $("serEdit")) closeSerEdit(); });
  $("seClose").addEventListener("click", closeSerEdit);
  window.closeSerEdit = closeSerEdit;
  function tilesHtml() {   // 시리즈 목록
    return SERIES.map(x => `<a class="tile" href="#series=${encodeURIComponent(x.name)}" style="--g:linear-gradient(135deg,hsl(${hash(x.name) % 360} 46% 40%),hsl(${(hash(x.name) + 40) % 360} 46% 24%))"><b>${esc(x.name)}</b><span>${x.n}편</span></a>`).join("");
  }
  function emptyHtml() {
    const q = $("q").value.trim();
    if (!all.length) return `<div class="empty"><b>아직 등록된 영상이 없어요</b>곧 채워질 예정이에요.</div>`;
    if (tab === "fav" && !favs.size) return `<div class="empty"><b>즐겨찾기가 비어 있어요</b>영상의 하트를 누르면 여기에 모여요.<br><a class="btn" href="#">다시보기 목록으로</a></div>`;
    if (tab === "recent" && !recent.length) return `<div class="empty"><b>아직 열어본 영상이 없어요</b>영상을 눌러 보면 여기에 차례로 쌓여요.<br><a class="btn" href="#">다시보기 목록으로</a></div>`;
    return `<div class="empty"><b>${q ? "‘" + esc(q) + "’ 검색 결과가 없어요" : "조건에 맞는 영상이 없어요"}</b>검색어를 줄이거나 분류를 바꿔 보세요.<br><button class="btn" type="button" data-reset>조건 모두 풀기</button></div>`;
  }
  function chipHint() {   // 휴대폰: 분류를 옆으로 밀 수 있다는 안내 (한 번 밀어 보면 사라져요)
    const hint = $("chipHint"), cb = $("chips"); if (!hint) return;
    hint.hidden = !!store.get("chipHint1", false) || cb.hidden || cb.scrollWidth <= cb.clientWidth + 4;
  }
  $("chips").addEventListener("scroll", () => { if ($("chips").scrollLeft > 24 && !store.get("chipHint1", false)) { store.set("chipHint1", true); $("chipHint").hidden = true; } }, { passive: true });
  function renderChips() {
    const p = pool(), n = {}, home = tab === "all";
    p.forEach(v => { n[v.category] = (n[v.category] || 0) + 1; });
    const extra = Object.keys(n).filter(c => c && c !== "undefined" && !CATS.includes(c)).sort();
    const chip = (c, label, cnt, zero) => `<button class="chip ${c === cat ? "on" : ""} ${zero ? "zero" : ""}" type="button" data-c="${esc(c)}">${c && c !== "*" ? `<i style="--c:${dot(c)}"></i>` : ""}${esc(label)}${cnt == null ? "" : `<em>${cnt}</em>`}</button>`;
    const cbox = $("chips"), sx = cbox.scrollLeft;
    $("chips").innerHTML = (all.length > 1 && tab !== "fav" && tab !== "recent" ? `` : "") + (home ? chip("", "홈") + chip("*", "전체 영상", p.length) : chip("", "전체", p.length)) + 
      [...CATS, ...extra].map(c => chip(c, c, n[c] || 0, !n[c] && c !== cat)).join("");
    cbox.scrollLeft = sx;   // 가로로 넘겨 둔 위치를 유지 (휴대폰)
    chipHint();
    const on = cbox.querySelector(".chip.on"); if (on && cbox.scrollWidth > cbox.clientWidth + 4) { const l = on.offsetLeft - cbox.offsetLeft, r = l + on.offsetWidth; if (l < cbox.scrollLeft + 8 || r > cbox.scrollLeft + cbox.clientWidth - 8) cbox.scrollLeft = Math.max(0, l - (cbox.clientWidth - on.offsetWidth) / 2); }
  }
  function renderToday() {
    const box = $("today");
    const v = isHome() && all.length ? (byKey(todayKey) || all[hash(new Date().toDateString()) % all.length]) : null;
    box.hidden = !v; if (!v) return;
    todayKey = key(v); box.dataset.k = todayKey;
    box.innerHTML = `<div class="hero-bg" style="--g:${grad(v.category)}">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ""}</div>
      <div class="hero-in"><span class="label">오늘의 다시보기</span><h2>${esc(v.title)}</h2>
      <p class="hero-meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span>${ytId(v) ? "<span>바로 재생돼요</span>" : ""}</p>
      <div class="acts"><a class="btn primary" data-go href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer">${ytId(v) ? "바로 보기" : "다시보기" + OUT}</a>
      <button class="btn glass" type="button" data-fav>${favs.has(todayKey) ? "♥ 담았어요" : "♡ 즐겨찾기"}</button>
      ${all.length > 1 ? `<button class="btn glass" type="button" data-play>🎮 미니게임</button>` : ""}</div></div>`;
    if (box.dataset.shown !== todayKey) { box.dataset.shown = todayKey; box.classList.remove("anim"); void box.offsetWidth; box.classList.add("anim"); }
  }
  const ARR = d => `<button class="arr ${d < 0 ? "l" : "r"}" type="button" data-dir="${d}" aria-label="${d < 0 ? "앞으로" : "뒤로"} 넘기기"><svg viewBox="0 0 24 24"><path d="${d < 0 ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"}"/></svg></button>`;
  function rowHtml(title, list, more, c) {
    if (!list.length) return "";
    return `<section class="row"><div class="row-h"><h2>${c ? `<i style="--c:${dot(c)}"></i>` : ""}${esc(title)}<em>${list.length}</em></h2>${more}</div>
      <div class="rail-wrap">${ARR(-1)}<div class="rail">${list.slice(0, 14).map(v => cardHtml(v, true)).join("")}</div>${ARR(1)}</div></section>`;
  }
  /* ── 오늘의 한 줄 퀴즈: 하루에 하나, quiz.json에서 날짜로 골라요 (정답 기록은 이 기기에만 저장) ── */
  const qzDay = () => Math.floor((Date.now() + 9 * 36e5) / 864e5);
  const qzStep = n => [7, 11, 13, 17, 19, 1].find(s => { let a = s, b = n; while (b) [a, b] = [b, a % b]; return a === 1; });
  let lpHide = false; try { localStorage.removeItem("lp1"); } catch (e) {}
  function loginPromoHtml() {
    return ""; if (!RATE || !GID || lpHide) return "";   // 「나중에」를 누르면 이번 방문 동안만 숨기고, 새로고침하면 다시 보여요
    setTimeout(drawPromoBtn, 0);
    return `<section class="qz lp" id="qz" aria-label="로그인 혜택"><div class="lp-top"><span class="lp-badge">무료 회원</span><b>로그인 혜택</b><span class="lp-sub">구글 계정으로 1초 만에 시작해요</span></div><ul class="lp-rows"><li><i class="lp-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></i><div><b>즐겨찾기·열어본 영상 저장</b><span>기기를 바꿔도 그대로 이어서 봐요</span></div></li><li><i class="lp-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/></svg></i><div><b>오늘의 한 줄 퀴즈</b><span>매일 새 문제, 연속 정답 기록까지</span></div></li></ul><div class="lp-a"><div id="gBtnPromo"></div><button type="button" class="btn" id="lpLater">나중에</button></div><p class="qz-n">이름 대신 랜덤 별명만 보여요</p></section>`;
  }
  function quizHtml() {
    if (!rtok) return loginPromoHtml();   // 로그인한 사람에게만 퀴즈를 보여주고, 아니면 혜택 안내를 보여요
    if (!QZ || !QZ.length) return "";
    const d = qzDay(), n = QZ.length, q = QZ[(d * qzStep(n)) % n], st = store.get("qz1", null), got = st && st.d === d ? st.p : -1;
    if (got >= 0) {   // 풀고 나면 한 줄로 접어 둬요 (눌러서 해설 보기)
      const ok = got === q.a;
      return `<details class="qz qz-done ${ok ? "ok" : "no"}" id="qz"><summary><span class="qz-t">🧠 오늘의 퀴즈</span><b>${ok ? "정답! 🎉" : "아쉬워요"}</b><em>내일 또 만나요</em></summary><p class="qz-q">${esc(q.q)}</p><p class="qz-r ${ok ? "ok" : "no"}"><b>${ok ? "정답이에요!" : "정답은 \"" + esc(q.o[q.a]) + "\""}</b><span>${esc(q.e)}</span></p>${qst && qst.all ? `<p class="qz-s">연속 정답 <b>${qst.streak}번</b> · 정답률 <b>${Math.round(qst.ok / qst.all * 100)}%</b> (${qst.all}문제 중 ${qst.ok}개)</p>` : ""}<p class="qz-n">내일 새 퀴즈가 나와요 · 참고: 나무위키 「잉여맨」 문서 (CC BY-NC-SA 2.0 KR)</p></details>`;
    }
    const opts = q.o.map((t, i) => `<button type="button" class="qz-o" data-qz="${i}">${esc(t)}</button>`).join("");
    return `<section class="qz" id="qz" aria-label="오늘의 한 줄 퀴즈"><div class="qz-h"><span class="qz-t">🧠 오늘의 한 줄 퀴즈</span></div><p class="qz-q">${esc(q.q)}</p><div class="qz-os">${opts}</div><p class="qz-n">매일 하나씩 바뀌어요 · 틀려도 괜찮아요</p></section>`;
  }
  fetch("quiz.json").then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (Array.isArray(d)) { QZ = d; const el = $("qz"); if (el) el.outerHTML = quizHtml(); else if (isHome()) render(); } }).catch(() => {});
  $("home").addEventListener("click", e => {
    if (e.target.closest && e.target.closest("#lpLater")) { lpHide = true; const el = $("qz"); if (el) el.remove(); return; }
    const b = e.target.closest && e.target.closest("[data-qz]"); if (!b || !QZ || !rtok) return;
    const n = QZ.length, q = QZ[(qzDay() * qzStep(n)) % n], pick = +b.dataset.qz;
    store.set("qz1", { d: qzDay(), p: pick });
    const el = $("qz"); if (el) el.outerHTML = quizHtml();
    quizReport(pick === q.a);
  });

  function renderHome() {   // 첫 화면: 분류별로 한 줄씩
    const sorted = all.slice().sort((a, b) => order(b) - order(a));
    const extra = [...new Set(all.map(v => v.category).filter(c => c && !CATS.includes(c)))].sort();
    const top = ranked(all).slice(0, 10);
    $("home").innerHTML = quizHtml() +
      (top.length ? `<section class="row"><div class="row-h"><h2>인기 영상</h2><a class="more" href="#rank">랭킹 전체 보기</a></div>
        <div class="rail-wrap">${ARR(-1)}<div class="rail">${top.map((v, i) => cardHtml(v, true, i + 1)).join("")}</div>${ARR(1)}</div></section>` : "") +
      (() => { const b = promoHtml(); return b ? `<div class="promos">${b}</div>` : ""; })() +
      rowHtml("최근 열어본 영상", recent.map(byKey).filter(Boolean), `<a class="more" href="#recent">전체 보기</a>`) +
      rowHtml("즐겨찾기", sorted.filter(v => favs.has(key(v))), `<a class="more" href="#fav">전체 보기</a>`) +
      [...CATS, ...extra].map(c => rowHtml(c, sorted.filter(v => v.category === c), `<button class="more" type="button" data-cat="${esc(c)}">전체 보기</button>`, c)).join("") ||
      `<div class="empty"><b>아직 등록된 영상이 없어요</b>곧 채워질 예정이에요.</div>`;
    $("home").querySelectorAll(".rail-wrap").forEach(syncArrows);
  }
  document.querySelectorAll("[data-youtube]").forEach(a => { if (/^https?:\/\//i.test(SITE.youtube || "")) a.href = encodeURI(SITE.youtube); else a.hidden = true; });
  function promoHtml() {   // 잉여맨 유튜브 채널 배너
    if (!/^https?:\/\//i.test(SITE.youtube || "")) return "";
    return `<a class="promo" href="${esc(encodeURI(SITE.youtube))}" target="_blank" rel="noopener noreferrer">
      <span class="promo-ic" aria-hidden="true"></span>
      <span class="promo-t"><small>잉여맨 유튜브 채널</small><b>잉여맨을 유튜브에서도 만나 보세요</b><i>${esc(decodeURI(SITE.youtube).replace(/^https?:\/\/(www\.)?/, ""))}</i></span>
      <span class="btn promo-go">채널 보러 가기${OUT}</span></a>`;
  }
  function syncArrows(w) {
    const r = w.querySelector(".rail");
    w.querySelector(".arr.l").hidden = r.scrollLeft < 8;
    w.querySelector(".arr.r").hidden = r.scrollLeft + r.clientWidth > r.scrollWidth - 8;
  }
  function render() {
    const home = isHome(), list = home ? [] : filtered(), q = $("q").value.trim();
    const tiles = tab === "series" && !ser && !q, rank = tab === "rank";
    document.querySelectorAll(".nFav").forEach(el => { el.textContent = favs.size || ""; });
    $("home").hidden = !home; $("browse").hidden = home;
    renderChips(); renderToday();
    $("chips").hidden = tiles || tab === "nothumb";
    if (home) { renderHome(); return playIn($("home")); }
    $("pageH").textContent = tiles ? "시리즈" : rank ? "인기 랭킹" : tab === "series" && ser ? ser : q ? "검색 결과" : tab === "fav" ? "즐겨찾기" : tab === "recent" ? "열어본 영상" : tab === "nothumb" ? "썸네일 없는 영상" : cat && cat !== "*" ? cat : "전체 영상";
    $("count").textContent = tiles ? SERIES.length + "개" : list.length + (tab === "series" ? "편" : "개");
    { const bk = $("back"); bk.hidden = !((tab === "series" && ser) || tab === "nothumb"); bk.setAttribute("href", tab === "nothumb" ? "#" : "#series"); bk.textContent = tab === "nothumb" ? "홈으로" : "시리즈 목록"; }
    { const inS = tab === "series" && !!ser; $("serQBox").hidden = !inS; if (!inS || serQFor !== ser) { $("serQ").value = ""; } serQFor = inS ? ser : ""; }
    { const sm = $("serMode"); sm.hidden = tab !== "series"; if (tab !== "series") serOn = false; sm.classList.toggle("primary", serOn); sm.textContent = serOn ? "✔ 편집 끝내기" : "✏️ 시리즈 편집"; document.body.classList.toggle("ser-on", serOn); $("serBar").hidden = !serOn; }
    $("sort").hidden = tiles || rank; document.querySelector(".seg").hidden = tiles || rank;
    const note = serOn ? (tiles ? "시리즈를 열어서 고칠 영상을 눌러 주세요. 고친 내용은 이 기기에만 저장돼요." : "시리즈를 바꿀 영상을 눌러 주세요. 고친 내용은 이 기기에만 저장돼요.") : tab === "nothumb" ? "아직 썸네일이 없는 영상이에요. 영상 제목 옆 점 세 개(⋮) 메뉴에서 “썸네일 제보”를 눌러 주세요. 여러분의 제보로 목록이 채워져요." : tiles ? "같은 콘텐츠끼리 묶었어요. 제목으로 자동 분류해서 빠지거나 잘못 들어간 영상이 있을 수 있어요."
      : rank ? "네이버 카페 조회수와 좋아요를 합친 점수 순서예요. 좋아요 1개를 조회수 " + LIKE_W + "회로 쳤어요." + "" + " 카페 숫자는 목록을 정리한 때 기준이라 지금과 조금 다를 수 있어요." : "";
    $("pageNote").hidden = !note; $("pageNote").textContent = note;
    $("favXferBox").hidden = tab !== "fav";
    $("grid").className = tiles ? "grid tiles" : "grid" + (view === "rows" || rank ? " rows" : "");
    $("vGrid").classList.toggle("on", view === "grid"); $("vList").classList.toggle("on", view === "rows");
    if (rank && !rankWas) { $("grid").classList.add("rank-in"); setTimeout(() => $("grid").classList.remove("rank-in"), 1800); }   // 랭킹 화면에 처음 들어올 때만 차례로 등장
    rankWas = rank;
    $("grid").innerHTML = tiles ? tilesHtml() : list.slice(0, shown).map((v, i) => cardHtml(v, false, rank ? i + 1 : 0)).join("") || emptyHtml();
    $("sentinel").hidden = tiles || list.length <= shown;
    playIn($("grid"));
  }
  function playIn(el) {   // 화면이 바뀔 때만 등장 움직임
    if (!anim) return; anim = false;
    el.classList.remove("anim"); void el.offsetWidth; el.classList.add("anim");
  }
  function reset() { shown = PAGE; anim = true; render(); }

  /* ── 화면 바꾸기 ── */
  function route() {
    let h = location.hash.replace("#", ""); try { h = decodeURIComponent(h); } catch (e) {}
    const next = ["fav", "recent", "guide", "about", "notes", "ach", "rank", "series", "nothumb"].includes(h) ? h : h.startsWith("series=") ? "series" : "all";
    const nextSer = h.startsWith("series=") ? h.slice(7) : "";
    const moved = next !== tab || nextSer !== ser;   // 화면(탭)이 실제로 바뀔 때만 전환 효과
    if (moved) { const h0 = document.documentElement; h0.style.scrollBehavior = "auto"; window.scrollTo(0, 0); h0.style.scrollBehavior = ""; }   // 새 화면을 훑으며 올라가지 않고 바로 맨 위에서 시작
    if (next !== tab || nextSer !== ser) cat = "";
    if (nextSer !== ser) $("q").value = "";
    tab = next; ser = nextSer;
    if (tab !== "series" && serOn) { serOn = false; $("serBar").hidden = true; document.body.classList.remove("ser-on"); }   // 시리즈 탭을 떠나면 편집 모드는 꺼져요
    $("viewGuide").hidden = tab !== "guide"; $("viewAbout").hidden = tab !== "about"; $("viewNotes").hidden = tab !== "notes"; if (tab === "notes") showNotes(); $("viewAch").hidden = tab !== "ach"; if (tab === "ach") renderAch(); $("viewList").hidden = isInfo();
    document.querySelectorAll(".tab").forEach(a => a.classList.toggle("on", a.dataset.tab === (tab === "ach" ? "ach" : isInfo() ? "info" : tab === "nothumb" ? "all" : tab)));
    const pg = tab === "guide" ? $("viewGuide") : tab === "about" ? $("viewAbout") : tab === "notes" ? $("viewNotes") : tab === "ach" ? $("viewAch") : $("viewList"); pg.classList.remove("enter"); if (moved && !document.documentElement.classList.contains("vt")) { void pg.offsetWidth; pg.classList.add("enter"); }
    closeMenu();
    document.documentElement.classList.remove("pre-guide", "pre-about", "pre-notes", "pre-ach", "pre-rank", "pre-series", "pre-fav", "pre-recent", "pre-nothumb");
    if (!isInfo()) reset();
    if (h.startsWith("import=")) { askImport(h.slice(7)); }
    else if (h.startsWith("v=")) { const v = all.find(x => vid(x) === h.slice(2)); if (v) openModal(v); else if (all.length) toast("영상을 찾지 못했어요"); }
    else { if (!$("modal").hidden) closeModal(true); window.scrollTo(0, 0); }
  }

  /* ── 영상 열기 ── */
  function markSeen(v) { const k = key(v); recent = [k, ...recent.filter(x => x !== k)].slice(0, RECENT_MAX); store.set("recent", recent); achOpen(v); }
  function appUrl(href) {   // 안드로이드: 네이버 카페 앱으로 열기 (앱이 없으면 브라우저로)
    try {
      const u = new URL(href);
      if (u.protocol !== "https:" || !/(^|\.)cafe\.naver\.com$/.test(u.hostname)) return null;
      return "intent://" + u.host + u.pathname + u.search + "#Intent;scheme=https;package=com.nhn.android.navercafe;S.browser_fallback_url=" + encodeURIComponent(href) + ";end";
    } catch (e) { return null; }
  }
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  let cafeWin = null;
  const isCafe = u => { try { const x = new URL(u); return x.protocol === "https:" && /(^|\.)cafe\.naver\.com$/.test(x.hostname); } catch (e) { return false; } };
  const popupOn = () => !isPhone && store.get("popup", "on") !== "off";
  function follow(e, v, href) {   // 영상 링크를 눌렀을 때
    if (ytId(v) && $("modal").hidden) { e.preventDefault(); return openModal(v); }   // 유튜브 영상은 사이트 안에서 재생
    markSeen(v);
    const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
    if (isAndroid && plain) { const u = appUrl(href); if (u) { e.preventDefault(); location.href = u; } }
    else if (popupOn() && plain && isCafe(href)) {   // 컴퓨터: 카페 글을 작은 창으로 (사이트는 그대로 남아요)
      const w = Math.min(1180, screen.availWidth - 80), h = Math.min(900, screen.availHeight - 80);
      const x = Math.max(0, (screen.availWidth - w) / 2), y = Math.max(0, (screen.availHeight - h) / 2);
      let win = null;
      if (cafeWin && !cafeWin.closed) { try { cafeWin.location.href = href; win = cafeWin; } catch (err) { win = null; } }   // 이미 열린 팝업 창이 있으면 그 창에서 바꿔 열기
      if (!win) win = window.open(href, "_blank", "popup=yes,width=" + w + ",height=" + h + ",left=" + x + ",top=" + y);
      if (win) { e.preventDefault(); cafeWin = win; try { win.focus(); } catch (err) {} }   // 팝업이 막혀 있으면 원래대로 새 탭으로 열려요
    }
    setTimeout(render, 400);
  }
  function openModal(v) {
    current = v;
    const id = ytId(v);
    $("mScreen").style.setProperty("--g", grad(v.category));
    $("mScreen").innerHTML = id ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>` : picHtml(v);
    $("mScreen").classList.toggle("still", !id);
    $("mCat").textContent = v.category || "기타"; $("mCat").style.setProperty("--c", dot(v.category));
    $("mTitle").textContent = v.title || "";
    $("mGo").href = safeUrl(v.url); $("mGo").innerHTML = (id ? "원본 글 열기" : "다시보기") + OUT; $("mGo").hidden = safeUrl(v.url) === "#";
    $("mTip").hidden = !!id || !isPhone || safeUrl(v.url) === "#"; syncModalFav();
    $("modal").hidden = false; document.body.style.overflow = "hidden"; $("mClose").focus();
    if (id) { markSeen(v); render(); }
  }
  function syncModalFav() { if (!current) return; $("mFav").textContent = favs.has(key(current)) ? "♥ 담았어요" : "♡ 즐겨찾기"; }
  function closeModal(keepHash) {
    $("modal").hidden = true; $("mScreen").innerHTML = ""; document.body.style.overflow = ""; current = null;
    if (!keepHash && location.hash.startsWith("#v=")) history.replaceState(history.state, "", location.pathname + location.search);
  }
  function toggleFav(k) {
    if (favs.has(k)) { favs.delete(k); toast("즐겨찾기에서 뺐어요"); } else { favs.add(k); toast("즐겨찾기에 담았어요"); }
    store.set("favs", [...favs]); popKey = favs.has(k) ? k : null; render(); popKey = null; syncModalFav(); achCheck();
  }
  const canShare = !!navigator.share && matchMedia("(pointer:coarse)").matches;   // 휴대폰은 카카오톡 등으로 바로 공유
  if (canShare) $("mShare").textContent = "공유하기";
  function share(v) {
    achFlag("share");
    const url = location.origin + location.pathname + "#v=" + vid(v);
    const done = () => toast("링크를 복사했어요"), fail = () => toast("복사하지 못했어요");
    if (canShare) { navigator.share({ title: v.title || "잉여맨추억자료실", text: v.title || "", url }).catch(e => { if (e && e.name !== "AbortError") fail(); }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail);
    else { const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy") ? done() : fail(); } catch (e) { fail(); } t.remove(); }
  }
  function report(v) {
    if (SITE.repo) achFlag("report");
    if (!SITE.repo) return toast("썸네일 제보는 준비 중이에요");
    const body = "**영상**: " + v.title + "\n**카페 글**: " + (v.url || "") + "\n\n**썸네일 이미지** (아래에 이미지를 끌어다 놓거나 주소를 붙여넣어 주세요)\n\n";
    toast("GitHub 제보 화면이 새 창으로 열려요. GitHub 로그인이 필요해요"); window.open("https://github.com/" + SITE.repo + "/issues/new?labels=thumbnail&title=" + encodeURIComponent("[썸네일] " + v.title) + "&body=" + encodeURIComponent(body), "_blank", "noopener");
  }

  /* 검색창 안내 글자: 창이 좁아지면 짧게 줄여서 잘리지 않게 해요 */
  { const q = $("q"), m1 = matchMedia("(max-width:1320px)"), m2 = matchMedia("(max-width:1180px)"), m3 = matchMedia("(max-width:860px)");
    const fit = () => { q.placeholder = m3.matches ? "제목이나 분류로 검색" : m2.matches ? "검색" : m1.matches ? "제목·분류 검색" : "제목이나 분류로 검색"; };
    [m1, m2, m3].forEach(m => m.addEventListener ? m.addEventListener("change", fit) : m.addListener(fit)); fit(); }

  const calm = () => document.documentElement.getAttribute("data-motion") === "off";   // 「움직임 줄이기」를 켰는지
  /* ── 효과음 (파일 없이 브라우저가 직접 만드는 소리) ── */
  let actx = null;
  const soundOn = () => store.get("sound", "on") !== "off";
  function ac() {
    if (!soundOn()) return null;
    try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = actx || new C(); if (actx.state === "suspended") actx.resume(); return actx; } catch (e) { return null; }
  }
  function tone(f, at, dur, type, vol, f2) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function syncSound() {
    const on = soundOn();
    $("sound").setAttribute("aria-checked", on);
  }
  function toggleSound() { store.set("sound", soundOn() ? "off" : "on"); syncSound(); if (soundOn()) tone(880, 0, 0.18, "sine", 0.1); }
  $("sound").addEventListener("click", toggleSound);
  syncSound();

  /* ── 도전과제 (이 기기에만 기록돼요) ── */
  const st = Object.assign({ opened: [], draws: 0, rare: 0, legends: [], days: [], flags: {} }, store.get("stat", {}));
  let got = store.get("ach", {});
  const saveSt = () => store.set("stat", st);
  const openedCats = () => new Set(st.opened.map(id => (all.find(v => vid(v) === id) || {}).category).filter(Boolean)).size;
  function seriesDone() {   // 다 열어 본 시리즈가 있는지 (가장 많이 진행한 시리즈의 진행도)
    let best = [0, 1]; const op = new Set(st.opened);
    SERIES.forEach(x => { const l = all.filter(v => v._s.includes(x.name)), n = l.filter(v => op.has(vid(v))).length; if (n / l.length > best[0] / best[1]) best = [n, l.length]; });
    return best;
  }
  const ACH = [
    { id: "open1", t: "첫 발걸음", d: "영상을 처음으로 열어 보기", p: () => [st.opened.length, 1] },
    { id: "open10", t: "정주행 시작", d: "영상 10개 열어 보기", p: () => [st.opened.length, 10] },
    { id: "open50", t: "추억 여행자", d: "영상 50개 열어 보기", p: () => [st.opened.length, 50] },
    { id: "open100", t: "올드팬의 품격", d: "영상 100개 열어 보기", p: () => [st.opened.length, 100] },
    { id: "cats", t: "골고루 맛보기", d: "서로 다른 분류 6곳의 영상 열어 보기", p: () => [openedCats(), 6] },
    { id: "series", t: "시리즈 정복", d: "한 시리즈의 영상을 전부 열어 보기", p: () => seriesDone() },
    { id: "rank1", t: "1위의 맛", d: "인기 랭킹 1위 영상 열어 보기", p: () => [st.flags.rank1 ? 1 : 0, 1] },
    { id: "search", t: "명탐정", d: "검색으로 찾은 영상 열어 보기", p: () => [st.flags.search ? 1 : 0, 1] },
    { id: "owl", t: "올빼미", d: "새벽 2시에서 5시 사이에 영상 열어 보기", p: () => [st.flags.owl ? 1 : 0, 1] },
    { id: "fav1", t: "찜", d: "즐겨찾기에 처음으로 담기", p: () => [favs.size, 1] },
    { id: "fav20", t: "수집가", d: "즐겨찾기에 20개 담기", p: () => [favs.size, 20] },
    { id: "share", t: "나눔의 기쁨", d: "영상 링크 복사하기", p: () => [st.flags.share ? 1 : 0, 1] },
    { id: "report", t: "썸네일 도우미", d: "썸네일 제보 눌러 보기", p: () => [st.flags.report ? 1 : 0, 1] },
    { id: "moved", t: "이사 완료", d: "다른 기기에서 보낸 기록 가져오기", p: () => [st.flags.moved ? 1 : 0, 1] },
    { id: "days7", t: "단골손님", d: "서로 다른 날 7일 방문하기", p: () => [st.days.length, 7] },
    { id: "all", t: "추억자료실 마스터", d: "다른 도전과제를 모두 달성하기", p: () => [ACH.filter(a => a.id !== "all" && got[a.id]).length, ACH.length - 1] }
  ];
  const popQ = []; let popBusy = false;
  function achCheck() {
    if (!all.length) return;
    let hit = false;
    ACH.forEach(a => { if (got[a.id]) return; const p = a.p(); if (p[0] >= p[1]) { got[a.id] = Date.now(); popQ.push(a); hit = true; } });
    if (hit) { store.set("ach", got); if (!got.all) return achCheck(); }
    syncAch(); nextPop();
  }
  function syncAch() {
    const n = ACH.filter(a => got[a.id]).length;
    $("achN").textContent = n || "";
    if (tab === "ach") renderAch();
  }
  function nextPop() {
    if (popBusy || !popQ.length) return;
    popBusy = true;
    const a = popQ.shift(), el = $("achPop");
    $("achPopT").textContent = a.t; $("achPopD").textContent = a.d;
    el.hidden = false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    tone(784, 0, 0.14, "triangle", 0.09); tone(1047, 0.11, 0.14, "triangle", 0.09); tone(1568, 0.22, 0.4, "sine", 0.1);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.hidden = true; popBusy = false; nextPop(); }, 350); }, 3600);
  }
  $("achPop").addEventListener("click", () => { location.hash = "ach"; });
  function achFlag(name) { if (st.flags[name]) return; st.flags[name] = 1; saveSt(); achCheck(); }
  function achOpen(v) {
    const id = vid(v);
    if (!st.opened.includes(id)) st.opened.push(id);
    const top = ranked(all)[0]; if (top && key(top) === key(v)) st.flags.rank1 = 1;
    if (words().length && !isHome()) st.flags.search = 1;
    const h = new Date().getHours(); if (h >= 2 && h < 5) st.flags.owl = 1;
    saveSt(); achCheck();
  }
  function renderAch() {
    const n = ACH.filter(a => got[a.id]).length;
    $("achSum").textContent = ACH.length + "개 중 " + n + "개 달성";
    $("achBar").style.width = Math.round(n / ACH.length * 100) + "%";
    const fmt = t => { const d = new Date(t); return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " 달성"; };
    $("achList").innerHTML = ACH.slice().sort((a, b) => (got[b.id] ? 1 : 0) - (got[a.id] ? 1 : 0)).map(a => {
      const p = a.p(), cur = Math.min(p[0], p[1]), done = !!got[a.id];
      return `<div class="ach-item ${done ? "done" : ""}"><span class="ach-ic">${TROPHY}</span><div class="ach-tx"><b>${esc(a.t)}</b><i>${esc(a.d)}</i>
        ${done ? `<small>${fmt(got[a.id])}</small>` : p[1] > 1 ? `<div class="bar"><i style="width:${Math.round(cur / p[1] * 100)}%"></i></div><small>${cur} / ${p[1]}</small>` : `<small>아직 달성 전</small>`}</div></div>`;
    }).join("");
  }
  function achStart() {   // 처음 불러왔을 때: 방문 날짜 기록, 예전 기록으로 달성된 것 확인
    const today = new Date(); const dkey = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
    if (!st.days.includes(dkey)) { st.days.push(dkey); if (st.days.length > 40) st.days = st.days.slice(-40); }
    recent.map(byKey).filter(Boolean).forEach(v => { if (!st.opened.includes(vid(v))) st.opened.push(vid(v)); });
    saveSt(); achCheck();
  }

  /* ── 다른 기기로 옮기기 (QR코드·링크에 즐겨찾기와 열어본 영상을 담아요) ── */
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const packIds = keys => keys.map(byKey).filter(Boolean).map(num).filter(n => n && +n < 4096).map(n => B64[+n >> 6] + B64[+n & 63]).join("");   // 글 번호 하나를 두 글자로
  const unpackIds = t => { const out = []; for (let i = 0; i + 1 < t.length; i += 2) { const a = B64.indexOf(t[i]), b = B64.indexOf(t[i + 1]); if (a < 0 || b < 0) return null; out.push(String(a * 64 + b)); } return out; };
  const moveLink = () => location.origin + location.pathname + "#import=1." + packIds([...favs]) + "." + packIds(recent.slice(0, 40));
  function readMove(t) {
    const m = String(t || "").match(/^1\.([\w-]*)\.([\w-]*)$/); if (!m) return null;
    const f = unpackIds(m[1]), r = unpackIds(m[2]); if (!f || !r) return null;
    const map = new Map(all.map(v => [num(v), key(v)]));
    return { favs: f.map(id => map.get(id)).filter(Boolean), recent: r.map(id => map.get(id)).filter(Boolean) };
  }
  let pendingMove = null;
  function askImport(code) {   // 링크나 QR코드로 들어왔을 때
    history.replaceState(null, "", location.pathname + location.search);
    const d = readMove(code);
    if (!d) return toast("가져올 수 없는 링크예요. 링크를 다시 만들어 주세요");
    const nfv = d.favs.filter(k => !favs.has(k)).length, nr = d.recent.filter(k => !recent.includes(k)).length;
    if (!nfv && !nr) return toast("새로 더할 기록이 없어요. 이미 다 있어요");
    pendingMove = d;
    $("iText").textContent = "다른 기기에서 보낸 기록이에요. 즐겨찾기 " + nfv + "개, 열어본 영상 " + nr + "개를 이 기기에 더할까요? 지금 있는 기록은 그대로 남아요.";
    $("imp").hidden = false; document.body.style.overflow = "hidden"; $("iYes").focus();
  }
  function closeImp() { $("imp").hidden = true; document.body.style.overflow = ""; pendingMove = null; }
  $("iNo").addEventListener("click", closeImp);
  $("iYes").addEventListener("click", () => {
    const d = pendingMove; if (!d) return closeImp();
    let nfv = 0; d.favs.forEach(k => { if (!favs.has(k)) { favs.add(k); nfv++; } });
    const add = d.recent.filter(k => !recent.includes(k));
    recent = [...recent, ...add].slice(0, RECENT_MAX);
    store.set("favs", [...favs]); store.set("recent", recent);
    achFlag("moved"); closeImp(); render(); toast("즐겨찾기 " + nfv + "개, 열어본 영상 " + add.length + "개를 가져왔어요");
  });
  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "vendor/qrcode.js"; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
  }
  function openXfer() {
    closeSet(); closeMenu();
    const nfv = favs.size, nr = recent.map(byKey).filter(Boolean).length, has = nfv + nr > 0;
    $("xCount").textContent = "지금 이 기기에는 즐겨찾기 " + nfv + "개, 열어본 영상 " + nr + "개가 있어요.";
    $("xHave").hidden = !has; $("xNone").hidden = has;
    $("xfer").hidden = false; document.body.style.overflow = "hidden"; $("xClose").focus();
    if (!has) return;
    const link = moveLink();
    $("xLink").value = link; $("xShare").hidden = !(navigator.share && matchMedia("(pointer:coarse)").matches);   // 휴대폰·태블릿에서만 보여요 (컴퓨터에서는 링크 복사를 써요)
    $("xQr").textContent = "QR코드를 만드는 중이에요";
    loadQr().then(() => {
      const q = window.qrcode(0, "L"); q.addData(link); q.make();
      $("xQr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
    }).catch(() => { $("xQr").textContent = "QR코드를 만들지 못했어요. 아래 링크를 써 주세요."; });
  }
  function closeXfer() { $("xfer").hidden = true; document.body.style.overflow = ""; }
  $("favXfer").addEventListener("click", openXfer);
  $("xClose").addEventListener("click", closeXfer);
  $("xfer").addEventListener("click", e => { if (e.target === $("xfer") && downT === e.target) closeXfer(); });
  $("xLink").addEventListener("focus", () => $("xLink").select());
  $("xCopy").addEventListener("click", () => {
    const link = $("xLink").value, done = () => toast("링크를 복사했어요. 다른 기기에서 열어 주세요"), fail = () => { $("xLink").focus(); toast("위 칸의 링크를 직접 복사해 주세요"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fail); else fail();
  });
  $("xShare").addEventListener("click", () => {
    const link = $("xLink").value;
    const copy = () => { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => toast("공유가 안 돼서 링크를 복사했어요. 카톡이나 메모에 붙여넣어 주세요"), () => { $("xLink").focus(); toast("위 칸의 링크를 직접 복사해 주세요"); }); else { $("xLink").focus(); toast("위 칸의 링크를 직접 복사해 주세요"); } };
    if (!navigator.share) return copy();
    navigator.share({ title: "잉여맨 추억자료실 내 기록", text: "잉여맨 추억자료실 내 기록 링크예요. 다른 기기에서 열어 주세요", url: link }).catch(e => { if (!e || e.name !== "AbortError") copy(); });   // 닫기만 한 경우는 그대로 두고, 오류면 복사해 줘요
  });

  /* ── 썸네일 제보 건수 (GitHub에 열려 있는 제보 글을 세요) ── */
  let reports = {};
  const repCount = v => reports["n" + num(v)] || reports["t" + (v.title || "")] || 0;
  function countReports(list) {
    const m = {};
    (Array.isArray(list) ? list : []).forEach(i => {
      if (i.pull_request || !/^\[썸네일\]/.test(i.title || "")) return;
      const u = ((i.body || "").match(/cafe\.naver\.com\/[^\s/]+\/(\d+)/) || [])[1];
      const k = u ? "n" + u : "t" + i.title.replace(/^\[썸네일\]\s*/, "");
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }
  function loadReports() {
    if (!SITE.repo) return;
    let c = null; try { c = JSON.parse(sessionStorage.getItem("reports") || "null"); } catch (e) {}
    if (c && Date.now() - c.t < 5 * 60 * 1000) { reports = c.m || {}; return; }
    fetch("https://api.github.com/repos/" + SITE.repo + "/issues?state=open&per_page=100", { headers: { Accept: "application/vnd.github+json" } })
      .then(r => r.ok ? r.json() : Promise.reject()).then(list => {
        reports = countReports(list);
        try { sessionStorage.setItem("reports", JSON.stringify({ t: Date.now(), m: reports })); } catch (e) {}
        if (all.length && Object.keys(reports).length) render();
      }).catch(() => {});
  }
  loadReports();
  loadRatings();

  /* ── 점 세 개 메뉴 ── */
  function openMenu(btn, v) {
    const m = $("menu"), k = key(v);
    menuFor = v; openMenu.y = window.scrollY;
    m.querySelector('[data-act="seen"]').hidden = !recent.includes(k);
    m.querySelector('[data-act="report"] .mt').textContent = "썸네일 제보" + (repCount(v) ? " (지금 " + repCount(v) + "건)" : "");
    m.hidden = false;
    const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    const below = r.bottom + h + 12 <= window.innerHeight;
    m.style.top = (below ? r.bottom + 6 : r.top - h - 6) + window.scrollY + "px";
    m.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + window.scrollX + "px";
  }
  function closeMenu() { $("menu").hidden = true; menuFor = null; }
  window.PLAYAPI = { isIn: () => !!rtok, name: () => (rtok && rtok.name) || "손님", rapi: (path, opt) => RATE ? rApi(path, opt) : Promise.reject(new Error("no server")), loginBtn: el => gBtn(el, { text: "signin_with", shape: "pill", locale: "ko" }), vids: () => all, esc, url: safeUrl, key, grad, closeMenu, addFav: v => { const k = key(v); if (!favs.has(k)) { favs.add(k); store.set("favs", [...favs]); } toast("즐겨찾기에 담았어요"); } };
  $("menu").addEventListener("click", e => {
    const b = e.target.closest("button"), v = menuFor; if (!b || !v) return;
    closeMenu();
    const k = key(v), a = b.dataset.act;
    if (a === "report") report(v);
    else if (a === "series") openSerEdit(v);
    else if (a === "seen") {
      recent = recent.filter(x => x !== k); store.set("recent", recent); toast("열어본 기록에서 지웠어요"); render();
    }
  });

  /* ── 누르기 ── */
  function onCards(e) {
    if (e.target.closest("[data-reset]")) { $("q").value = ""; cat = ""; return reset(); }
    const sr = e.target.closest("[data-ser]"); if (sr) { e.preventDefault(); location.hash = "series=" + encodeURIComponent(sr.dataset.ser); return; }
    const card = e.target.closest(".card"); if (!card) return;
    const v = byKey(card.dataset.k); if (!v) return;
    if (e.target.closest(".heart")) return toggleFav(key(v));
    const d = e.target.closest(".dots");
    if (d) { e.stopPropagation(); return menuFor === v ? closeMenu() : openMenu(d, v); }
    const link = e.target.closest("a"); if (link) { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return follow(e, v, link.href); e.preventDefault(); openModal(v); }
  }
  $("grid").addEventListener("click", onCards);
  $("home").addEventListener("click", e => {
    const m = e.target.closest("[data-cat]"); if (m) { cat = m.dataset.cat; reset(); return window.scrollTo(0, 0); }
    const a = e.target.closest(".arr"); if (a) { const r = a.parentNode.querySelector(".rail"); return r.scrollBy({ left: +a.dataset.dir * r.clientWidth * 0.85, behavior: calm() ? "auto" : "smooth" }); }
    onCards(e);
  });
  $("home").addEventListener("scroll", e => { const w = e.target.closest && e.target.closest(".rail-wrap"); if (w) syncArrows(w); }, true);
  $("today").addEventListener("click", e => {
    const v = byKey($("today").dataset.k); if (!v) return;
    const go = e.target.closest("[data-go]"); if (go) return follow(e, v, go.href);
    if (e.target.closest("[data-fav]")) return toggleFav(key(v));
  });
  $("chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; cat = b.dataset.c; if (b.dataset.c === "" && tab === "all") $("q").value = ""; reset(); });
  /* ── 검색창: 최근 검색어 + 자동완성 ── */
  { const q = $("q"), box = document.createElement("div"); box.id = "sg"; box.className = "sg"; box.hidden = true; q.parentNode.appendChild(box);
    const RS = "rs1", getR = () => { const a = store.get(RS, []); return Array.isArray(a) ? a.filter(x => typeof x === "string").slice(0, 8) : []; };
    const addR = t => { t = (t || "").trim().slice(0, 40); if (t.length < 2) return; store.set(RS, [t, ...getR().filter(x => x !== t)].slice(0, 8)); };
    const hide = () => { box.hidden = true; }, apply = t => { q.value = t; addR(t); hide(); q.blur(); q.dispatchEvent(new Event("input")); };
    function draw() {
      const t = q.value.trim().toLowerCase(); let h = "";
      if (!t) { const r = getR(); if (r.length) h = `<div class="sg-h"><b>최근 검색어</b><button type="button" data-sgclr>모두 지우기</button></div>` + r.map(x => `<div class="sg-r"><button type="button" class="sg-i" data-sg="${esc(x)}">🕘 ${esc(x)}</button><button type="button" class="sg-x" data-sgdel="${esc(x)}" aria-label="${esc(x)} 지우기">✕</button></div>`).join(""); }
      else {
        const ws = t.split(/\s+/).filter(Boolean), cats = [...new Set(all.map(v => v.category).filter(Boolean))].filter(c => c.toLowerCase().includes(t)).slice(0, 3);
        const ts = []; for (const v of all) { if (hit(v, ws)) { ts.push(v.title); if (ts.length >= 6) break; } }
        h = cats.map(c => `<div class="sg-r"><button type="button" class="sg-i" data-sg="${esc(c)}">📁 ${esc(c)} <small>분류</small></button></div>`).join("") + ts.map(x => `<div class="sg-r"><button type="button" class="sg-i" data-sg="${esc(x)}">${esc(x)}</button></div>`).join("");
      }
      box.innerHTML = h; box.hidden = !h;
    }
    q.addEventListener("focus", draw); q.addEventListener("input", draw);
    q.addEventListener("keydown", e => { if (e.key === "Enter") { addR(q.value); hide(); } });
    q.addEventListener("blur", () => { addR(q.value); setTimeout(hide, 120); });
    box.addEventListener("mousedown", e => e.preventDefault());   // 목록을 눌러도 입력창 포커스가 유지돼요
    box.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.sgclr !== undefined) { store.set(RS, []); return draw(); }
      if (b.dataset.sgdel !== undefined) { store.set(RS, getR().filter(x => x !== b.dataset.sgdel)); return draw(); }
      if (b.dataset.sg !== undefined) apply(b.dataset.sg);
    });
  }
  $("q").addEventListener("input", () => { if (isInfo()) location.hash = ""; reset(); });
  $("sort").addEventListener("change", () => { store.set("sort", $("sort").value); reset(); });
  $("vGrid").addEventListener("click", () => { view = "grid"; store.set("view2", view); render(); });
  $("vList").addEventListener("click", () => { view = "rows"; store.set("view2", view); render(); });
  $("mFav").addEventListener("click", () => current && toggleFav(key(current)));
  $("mShare").addEventListener("click", () => current && share(current));
  $("mGo").addEventListener("click", e => current && follow(e, current, $("mGo").href));
  $("admBtn").addEventListener("click", openDash);
  $("admSrvGo").addEventListener("click", () => { $("admSrvT").textContent = "확인하는 중…"; srvCheck(); });
  $("admBack").addEventListener("click", () => { $("admModal").hidden = true; });
  $("mClose").addEventListener("click", () => closeModal());
  let downT = null;   // 마지막으로 누른 곳 (창 바깥을 눌렀다 뗄 때만 닫기 위해)
  document.addEventListener("mousedown", e => { downT = e.target; }, true);
  document.addEventListener("touchstart", e => { downT = e.target; }, { capture: true, passive: true });
  let mDown = false;   // 글을 드래그해 지우다가 바깥에서 손을 떼도 창이 닫히지 않게: 누른 곳도 바깥일 때만 닫기
  $("modal").addEventListener("mousedown", e => { mDown = e.target === $("modal"); });
  $("modal").addEventListener("touchstart", e => { mDown = e.target === $("modal"); }, { passive: true });
  $("modal").addEventListener("click", e => { if (e.target === $("modal") && mDown) closeModal(); mDown = false; });
  $("totop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }));
  document.addEventListener("click", e => { if (!$("menu").hidden && !e.target.closest(".menu")) closeMenu(); if (!$("setMenu").hidden && !e.target.closest(".menu")) closeSet(); });
  document.addEventListener("ovback", () => {   // 휴대폰 뒤로가기: 열려 있는 창 중 맨 위 하나만 닫기
    if (!$("noticePop").hidden && window.closeNotice) window.closeNotice(); else if (!$("serEdit").hidden) closeSerEdit(); else if (!$("dcChat").hidden) closeDc(); else if (!$("admModal").hidden && $("modal").hidden) $("admModal").hidden = true;
    else if (!$("setMenu").hidden) closeSet(); else if (!$("menu").hidden) closeMenu(); else if (!$("modal").hidden) closeModal(); else if (!$("xfer").hidden) closeXfer(); else if (!$("imp").hidden) closeImp(); else if (!$("admModal").hidden) $("admModal").hidden = true;
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("noticePop").hidden && window.closeNotice) { window.closeNotice(); return; }
    if (e.key === "Escape" && !$("serEdit").hidden) { closeSerEdit(); return; }
    if (e.key === "Escape" && document.getElementById("intro")) { introEnd(true); return; }
    if (e.key === "Escape" && !$("dcChat").hidden) { closeDc(); return; }
    if (e.key === "Escape" && !$("tnPop").hidden) { tnClose(); return; }
    if (e.key === "Escape" && !$("admModal").hidden && $("menu").hidden && $("modal").hidden) { $("admModal").hidden = true; return; }
    if (e.key === "Escape") {
      if (!$("setMenu").hidden) closeSet(); else if (!$("menu").hidden) closeMenu(); else if (!$("modal").hidden) closeModal(); else if (!$("xfer").hidden) closeXfer(); else if (!$("imp").hidden) closeImp();
      else if (document.activeElement === $("q")) { $("q").value = ""; $("q").blur(); reset(); }
    }
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-ser]")) { e.preventDefault(); location.hash = "series=" + encodeURIComponent(e.target.dataset.ser); }
    if (e.key === "/" && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); $("q").focus(); }
  });
  window.addEventListener("scroll", () => { $("totop").hidden = window.scrollY < 700; if (!$("menu").hidden && Math.abs(window.scrollY - openMenu.y) > 60) closeMenu(); }, { passive: true });
  window.addEventListener("resize", () => { closeMenu(); closeSet(); $("home").querySelectorAll(".rail-wrap").forEach(syncArrows); });
  document.querySelector(".logo").addEventListener("click", e => {   // 로고·이름을 누르면 어디서든 처음 화면(홈)으로
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault(); $("q").value = ""; cat = "";
    if (tab === "all" && !ser && !location.hash.replace("#", "")) { if (!$("modal").hidden) closeModal(); reset(); window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }); }
    else location.hash = "";
  });
  window.addEventListener("hashchange", () => {   // 탭 이동은 이전 화면이 부드럽게 사라지며 새 화면으로 바뀌어요
    const h = location.hash.replace("#", "");
    const sameView = h.startsWith("v=") || h.startsWith("import=");
    if (!document.startViewTransition || calm() || sameView || !$("consent") || document.documentElement.classList.contains("consent-on")) return route();
    const de = document.documentElement; de.classList.add("vt");
    let t; try { t = document.startViewTransition(() => route()); } catch (e) { de.classList.remove("vt"); return route(); }
    t.finished.finally(() => de.classList.remove("vt"));
  });
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { if (es[0].isIntersecting && !$("sentinel").hidden) { shown += PAGE; render(); } }, { rootMargin: "600px" }).observe($("sentinel"));

  const FB = /^https?:\/\//i.test(SITE.discord || "") ? SITE.discord : SITE.feedback;   // 디스코드 주소가 있으면 디스코드로, 없으면 카페 채팅방으로
  document.querySelectorAll("[data-feedback]").forEach(a => { if (/^https?:\/\//i.test(FB || "")) a.href = FB; else a.hidden = true; });
  if (FB === SITE.discord) { const g = $("fbHelp"); if (g) g.innerHTML = "아래 버튼이나 화면 오른쪽 아래 <b>디스코드 참여하기</b> 버튼을 누르면 안내 채팅창이 열려요. 디스코드는 무료로 가입할 수 있고, 이런 일을 할 수 있어요.<ul><li>🐞 사이트 <b>버그</b> 제보</li><li>📚 시리즈 <b>분류 오류</b> 제보</li><li>💡 기능 <b>건의</b></li></ul>"; }
  /* ── 디스코드 참여하기 (채팅창 안내) ── */
  const DC = [
    "안녕하세요! 👋 잉여맨추억자료실 디스코드를 소개하는 <b>자동 안내</b>예요. 실시간으로 대화하는 곳은 아니니 편하게 읽어 주세요.",
    "여기에서는 사이트에 대한 <b>제보와 문의</b>를 받아요. <b>🛠-사이트-제보</b> 채널에 글을 올릴 때 아래 종류 중 하나를 골라 주세요.",
    "<ul><li>🐞 <b>버그</b> : 버튼이 안 눌리거나 화면이 깨지는 등 사이트가 제대로 작동하지 않을 때</li><li>📚 <b>시리즈 분류</b> : 시리즈 몰아보기에 다른 시리즈 영상이 섞여 있거나, 들어가야 할 영상이 빠져 있을 때</li><li>💡 <b>건의</b> : 이런 기능이 있으면 좋겠다는 아이디어</li><li>🔑 <b>로그인·내 기록</b> : 로그인이 안 되거나 즐겨찾기·퀴즈 기록이 이상할 때</li></ul>",
    "디스코드 가입은 무료예요 🙂",
    "그럼 <b>디스코드에 참여하시겠어요?</b>"
  ];
  const SLEEP = ms => new Promise(r => setTimeout(r, ms));
  const AVSVG = '<span class="av"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H10l-5 4z"/></svg></span>';
  let dcRun = 0, dcFirst = true;
  const dcNow = () => new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  const dcScroll = () => { const b = $("dcBody"); b.scrollTo({ top: b.scrollHeight, behavior: calm() || dcFast ? "auto" : "smooth" }); };
  function dcAdd(html, cls, me) {
    const row = document.createElement("div"); row.className = "dc-r" + (me ? " me" : "") + (!me && !dcFirst ? " sp" : "");
    row.innerHTML = (me ? "" : AVSVG) + `<div class="dc-col"><div class="dc-m ${cls || ""}${me ? " me" : ""}">${html}</div><span class="dc-t">${dcNow()}</span></div>`;
    $("dcBody").appendChild(row); dcFirst = !!me; dcScroll();
  }
  async function dcTyping(run, ms) {   // 입력 중 … 말풍선과 윗줄 "입력 중"
    if (calm() || dcFast) return;
    const row = document.createElement("div"); row.className = "dc-r" + (dcFirst ? "" : " sp");
    row.innerHTML = AVSVG + '<div class="dc-typing"><i></i><i></i><i></i></div>';
    $("dcBody").appendChild(row); dcScroll();
    const st = $("dcSt"); st.classList.add("typing"); st.lastChild.textContent = "안내문을 불러오는 중…";
    await SLEEP(ms); row.remove(); st.classList.remove("typing"); st.lastChild.textContent = "자동 안내예요 · 실제 채팅이 아니에요";
  }
  const dcMs = html => Math.min(2300, 650 + html.replace(/<[^>]+>/g, "").length * 24);   // 글이 길수록 오래 입력해요
  let dcFast = false;   // 처음이 아니면 입력 애니메이션 없이 바로 보여줘요
  async function dcSay(run, m) {
    const warn = Array.isArray(m), html = warn ? m[1] : m;
    if (dcFast) { dcAdd(html, warn ? "warn" : ""); return run === dcRun; }
    await dcTyping(run, dcMs(html)); if (run !== dcRun) return false;
    dcAdd(html, warn ? "warn" : ""); await (calm() ? 0 : SLEEP(420)); return run === dcRun;
  }
  async function openDc() {
    const run = ++dcRun; dcFirst = true;
    dcFast = store.get("dcSeen1", false) === true;   // 한 번이라도 봤으면 바로 보여줘요
    if (!dcFast) store.set("dcSeen1", true);
    $("dcBody").innerHTML = ""; $("dcAsk").hidden = true; $("dcJoin").href = SITE.discord;
    $("dcChat").hidden = false; document.body.style.overflow = "hidden";
    await (calm() || dcFast ? 0 : SLEEP(500));
    for (const m of DC) if (!await dcSay(run, m)) return;
    $("dcAsk").hidden = false; $("dcJoin").focus({ preventScroll: true });
  }
  function closeDc() { dcRun++; $("dcChat").hidden = true; document.body.style.overflow = ""; }
  async function dcAnswer(me, bot, wait) {   // 버튼을 누르면 내 말풍선 → 운영진 답장 → 창 닫기
    const run = dcRun; $("dcAsk").hidden = true; dcAdd(me, "", true);
    await SLEEP(calm() ? 0 : 650); if (run !== dcRun) return;
    await dcTyping(run, 900); if (run !== dcRun) return;
    dcAdd(bot); await SLEEP(wait); if (run === dcRun) closeDc();
  }
  if (/^https?:\/\//i.test(SITE.discord || "")) document.addEventListener("click", e => { const f = e.target.closest("[data-feedback]"); if (!f) return; e.preventDefault(); closeMenu(); openDc(); });
  $("dcX").addEventListener("click", closeDc);
  $("dcNo").addEventListener("click", () => dcAnswer("다음에 할게요", "알겠어요! 필요할 때 언제든 다시 눌러 주세요 👋", 1500));
  $("dcJoin").addEventListener("click", () => dcAnswer("네, 참여할래요!", "좋아요! 🎉 새 탭에서 디스코드가 열려요. 곧 만나요!", 2200));
  $("dcChat").addEventListener("click", e => { if (e.target === $("dcChat") && downT === e.target) closeDc(); });
  document.querySelectorAll("[data-cafe]").forEach(a => { if (/^https?:\/\//i.test(SITE.cafe || "")) a.href = SITE.cafe; else a.hidden = true; });

  /* ── 화면 설정 (어두운 화면 / 움직임 줄이기) ── */
  const root = document.documentElement;
  function syncSet() {
    $("theme").setAttribute("aria-checked", root.getAttribute("data-theme") === "dark");
    $("motion").setAttribute("aria-checked", root.getAttribute("data-motion") === "off");
    $("popup").setAttribute("aria-checked", popupOn()); $("popup").hidden = isPhone;
  }
  $("popup").addEventListener("click", () => { store.set("popup", popupOn() ? "off" : "on"); syncSet(); toast(popupOn() ? "카페 글을 팝업 창으로 열어요" : "카페 글을 새 탭으로 열어요"); });
  syncSet();
  $("theme").addEventListener("click", () => {
    const t = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", t); try { localStorage.setItem("theme", t); } catch (e) {} syncSet();
  });
  $("motion").addEventListener("click", () => {
    const m = root.getAttribute("data-motion") === "off" ? "on" : "off";
    root.setAttribute("data-motion", m); try { localStorage.setItem("motion", m); } catch (e) {} syncSet();
    toast(m === "off" ? "움직임 줄이기를 켰어요" : "움직임 줄이기를 껐어요");
  });
  /* ── 앱으로 설치 (홈 화면에 추가) ── */
  if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  { let dip = null;
    const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const show = () => { $("install").hidden = standalone() || !(dip || ios); };
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); dip = e; show(); });
    window.addEventListener("appinstalled", () => { dip = null; show(); toast("설치했어요. 홈 화면에서 열어 보세요"); });
    $("install").addEventListener("click", async () => {
      closeSet();
      if (dip) { dip.prompt(); try { await dip.userChoice; } catch (e) {} dip = null; show(); }
      else if (ios) { alert("아이폰에서는 사파리 아래쪽 공유 버튼(네모에 화살표)을 누르고\n‘홈 화면에 추가’를 선택하세요."); }
    });
    show();
  }
  function closeSet() { $("setMenu").hidden = true; $("set").setAttribute("aria-expanded", "false"); }
  $("set").addEventListener("click", e => {
    e.stopPropagation();
    const m = $("setMenu"); if (!m.hidden) return closeSet();
    closeMenu(); m.hidden = false; $("set").setAttribute("aria-expanded", "true");
    const r = $("set").getBoundingClientRect();
    m.style.top = r.bottom + 8 + window.scrollY + "px";
    m.style.left = Math.max(8, r.right - m.offsetWidth) + window.scrollX + "px";
  });
  $("setMenu").addEventListener("click", e => { if (e.target.closest("a")) closeSet(); });
  $("noticeBtn").addEventListener("click", () => { closeSet(); if (window.showNotice) window.showNotice(); });


  /* ── 접속할 때 뜨는 썸네일 제보 안내 창 ── */
  const tnDay = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  function tnClose() { $("tnPop").hidden = true; }
  function tnOpen() {
    if (!SITE.repo || store.get("tnHide", "") === tnDay()) return;
    const n = all.filter(v => !v.thumb).length; if (!n) return;
    $("tnN").textContent = nf(n); $("tnPop").hidden = false;
  }
  function tnWait() {   // 동의 화면·인트로가 끝난 뒤에 보여줘요
    let tries = 0; const t = setInterval(() => {
      const de = document.documentElement; if (++tries > 240) return clearInterval(t);
      if (de.classList.contains("consent-on") || de.classList.contains("intro-on")) return;
      clearInterval(t); if (!$("modal").hidden || /^#(v|import)=/.test(location.hash)) return; setTimeout(tnOpen, 700);
    }, 500);
  }
  $("tnGo").addEventListener("click", () => { tnClose(); if (!$("modal").hidden) closeModal(true); location.hash = "nothumb"; });
  { /* 팝업을 끌어서 사이트 어디로든 옮길 수 있어요 */
    const pop = $("tnPop"), box = pop.querySelector(".tnp"); let st = null, drag = false;
    box.addEventListener("pointerdown", e => {
      if ((e.pointerType === "mouse" && e.button !== 0) || e.target.closest(".tn-bar button")) return;
      const r = pop.getBoundingClientRect(); st = { x: e.clientX, y: e.clientY, l: r.left, t: r.top }; drag = false;
    });
    document.addEventListener("pointermove", e => {
      if (!st) return; const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!drag && Math.hypot(dx, dy) < 6) return; drag = true; box.classList.add("dragging");
      const W = innerWidth - box.offsetWidth, H = innerHeight - box.offsetHeight;
      pop.style.left = Math.min(Math.max(0, st.l + dx), Math.max(0, W)) + "px"; pop.style.top = Math.min(Math.max(0, st.t + dy), Math.max(0, H)) + "px";
    });
    const end = () => { if (st) { st = null; box.classList.remove("dragging"); setTimeout(() => { drag = false; }, 0); } };
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
    box.addEventListener("click", e => { if (drag) { e.preventDefault(); e.stopPropagation(); } }, true);   // 끌고 놓았을 때는 '이동' 버튼이 눌리지 않게
  }
  $("tnHide").addEventListener("click", () => { store.set("tnHide", tnDay()); tnClose(); toast("오늘은 다시 안 보여드릴게요"); });
  $("tnX").addEventListener("click", tnClose);

  /* ── 패치노트 (patchnotes.json) ── */
  let notes = null;
  const NOTE_TAG = { "신규": "new", "개선": "up", "수정": "fix", "삭제": "del" };
  const noteDate = d => { const m = /^(\d+)-(\d+)-(\d+)$/.exec(d || ""); return m ? m[1] + "년 " + +m[2] + "월 " + +m[3] + "일" : esc(d || ""); };
  function drawNotes() {
    const box = $("notesList"); if (!box) return;
    if (!notes) { box.innerHTML = `<p class="empty">불러오는 중이에요…</p>`; return; }
    box.innerHTML = notes.length ? notes.map(n => `<section class="g-item note"><time>${noteDate(n.date)}</time><h3>${esc(n.title)}</h3><ul>${(n.items || []).map(i => `<li><span class="nt ${NOTE_TAG[i.t] || ""}">${esc(i.t || "")}</span>${esc(i.text)}</li>`).join("")}</ul></section>`).join("") : `<p class="empty">아직 패치노트가 없어요.</p>`;
  }
  function markNotes() {   // 새 패치노트가 있으면 설정 메뉴에 표시
    if (!notes || !notes.length) return;
    const latest = notes[0].date, seen = store.get("notes_seen", "");
    const l = $("notesLink"); if (l) l.classList.toggle("new", latest !== seen);
    const b = $("set"); if (b) b.classList.toggle("dot", latest !== seen);
  }
  function showNotes() { drawNotes(); if (notes && notes.length) { store.set("notes_seen", notes[0].date); markNotes(); } }
  fetch("patchnotes.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(n => { notes = Array.isArray(n) ? n : []; if (tab === "notes") showNotes(); else markNotes(); }).catch(() => { notes = []; if (tab === "notes") drawNotes(); });

  /* ── 공지 (notice.json): 팝업창으로 보여 드려요. "오늘 하루 보지 않기"를 누르면 그날은 안 나와요 ── */
  fetch("notice.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(n => {
    const text = ((n && n.text) || "").trim(), title = ((n && n.title) || "공지").trim();
    if (!n || !n.enabled || !text) return;
    const id = String(hash(title + text + (n.link || ""))), day = id + "|" + tnDay();
    const pop = $("noticePop"), de = document.documentElement;
    const close = () => { pop.hidden = true; };
    $("npX").addEventListener("click", close);
    $("npGo").addEventListener("click", close);
    $("npHide").addEventListener("click", () => { store.set("notice_hide", day); close(); toast("오늘은 다시 안 보여드릴게요"); });
    window.closeNotice = close;
    { const sh = pop.querySelector(".sheet"); let d = null;   // 공지창은 끌어서 옮길 수 있고, 뒤의 사이트도 그대로 쓸 수 있어요
      const clamp = (l, t) => [Math.max(4, Math.min(innerWidth - sh.offsetWidth - 4, l)), Math.max(4, Math.min(innerHeight - 60, t))];
      sh.addEventListener("pointerdown", e => { if (e.target.closest("button, a") || (e.pointerType === "mouse" && e.button !== 0)) return; const r = sh.getBoundingClientRect(); d = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, id: e.pointerId }; try { sh.setPointerCapture(e.pointerId); } catch (x) {} sh.classList.add("drag"); });
      sh.addEventListener("pointermove", e => { if (!d || e.pointerId !== d.id) return; const [l, t] = clamp(d.l + e.clientX - d.x, d.t + e.clientY - d.y); sh.style.left = l + "px"; sh.style.top = t + "px"; });
      const end = () => { d = null; sh.classList.remove("drag"); };
      sh.addEventListener("pointerup", end); sh.addEventListener("pointercancel", end);
      window.addEventListener("resize", () => { if (pop.hidden) return; const [l, t] = clamp(sh.offsetLeft, sh.offsetTop); sh.style.left = l + "px"; sh.style.top = t + "px"; }); }
    const show = () => {
      $("npT").textContent = title;
      const box = $("npD"); box.textContent = "";
      text.split("\n").map(x => x.trim()).filter(Boolean).forEach(x => { const el = document.createElement(x.startsWith("•") ? "div" : "p"); el.className = x.startsWith("•") ? "np-li" : "np-p"; el.textContent = x.startsWith("•") ? x.slice(1).trim() : x; box.appendChild(el); });
      const go = $("npGo"); if (FB && /^https?:\/\//i.test(FB)) { go.href = FB; go.hidden = false; }
      const open = () => { const sh = pop.querySelector(".sheet"); pop.hidden = false; if (!sh.style.left) { const w = sh.offsetWidth, m = innerWidth <= 860; sh.style.left = Math.max(4, m ? (innerWidth - w) / 2 : innerWidth - w - 20) + "px"; sh.style.top = (m ? 56 : 84) + "px"; } };
      if (/^[\w./-]+\.(webp|png|jpe?g)$/i.test(n.image || "")) {   // 공지 이미지가 있으면 글 대신 이미지로 보여줘요 (이미지를 못 불러오면 글로 보여줘요)
        const im = new Image(), el = $("npImg");
        im.onload = () => { el.src = im.src; el.alt = title + ". " + text.replace(/\n+/g, " "); el.hidden = false; pop.querySelector(".sheet").classList.add("has-img"); open(); };
        im.onerror = open; im.src = n.image + "?v=" + id;
      } else open();
    };
    window.showNotice = show; $("noticeBtn").hidden = false;   // 설정 메뉴의 "공지 다시 보기"
    if (store.get("notice_hide", "") === day) return;   // "오늘 하루 보지 않기"를 누른 날에만 안 나와요
    let tries = 0;
    const t = setInterval(() => {   // 소개 화면·동의 창·사용법 안내가 모두 끝난 뒤에 보여줘요
      if (++tries > 400) return clearInterval(t);
      if (de.classList.contains("consent-on") || de.classList.contains("intro-on") || /^#(v|import)=/.test(location.hash) || document.getElementById("tourBox")) return;
      let toured = true; try { toured = !!localStorage.getItem("tour1") || !!location.hash; } catch (e) {}
      if (!toured || document.querySelector(".modal:not([hidden]):not(#noticePop), .gacha:not([hidden])")) return;
      clearInterval(t); show();
    }, 600);
  }).catch(() => {});

  /* ── 글자 끌기·오른쪽 클릭 막기 (검색창은 그대로 사용 가능) ── */
  const inField = e => e.target && e.target.closest && e.target.closest("input, textarea");
  document.addEventListener("contextmenu", e => { if (!inField(e)) e.preventDefault(); });
  document.addEventListener("dragstart", e => e.preventDefault());
  document.addEventListener("selectstart", e => { if (!inField(e)) e.preventDefault(); });

  /* ── 새로고침해도 보던 자리 기억 (이 탭에서만, 닫으면 사라져요) ── */
  const saveView = () => { try { sessionStorage.setItem("view1", JSON.stringify({ h: location.hash, cat, q: $("q").value, y: Math.round(window.scrollY), shown })); } catch (e) {} };
  window.addEventListener("pagehide", saveView); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveView(); });
  /* ── 시작 ── */
  fetch("videos.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json())
    .then(data => {
      all = Array.isArray(data) ? data : [];
      SDEFS = (SITE.series || []).map(x => { try { return { name: x[0], re: new RegExp(x[1], "i") }; } catch (e) { return null; } }).filter(Boolean);
      all.forEach((v, i) => { v._i = i; v._a = SDEFS.filter(x => x.re.test(v.title || "")).map(x => x.name); });
      const ac = {}; all.forEach(v => v._a.forEach(n => { ac[n] = (ac[n] || 0) + 1; })); baseOk = new Set(Object.keys(ac).filter(n => ac[n] >= 3));
      buildSeries();
      $("abN").textContent = nf(all.length); $("abC").textContent = new Set(all.map(v => v.category).filter(Boolean)).size; $("abS").textContent = SERIES.length;
      let sv = null; try { if (((performance.getEntriesByType("navigation")[0] || {}).type) === "reload") sv = JSON.parse(sessionStorage.getItem("view1")); } catch (e) {}
      route(); achStart(); if (rtok) syncPull();
      if (sv && sv.h === location.hash && !location.hash.startsWith("#v=") && !location.hash.startsWith("#import=")) {   // 새로고침하면 보던 분류·검색·위치를 그대로 이어서 보여줘요
        if (typeof sv.cat === "string" && sv.cat) cat = sv.cat;
        if (typeof sv.q === "string" && sv.q) $("q").value = sv.q.slice(0, 80);
        reset(); if (sv.shown > shown) { shown = Math.min(sv.shown, all.length + PAGE); render(); }
        requestAnimationFrame(() => window.scrollTo(0, Number(sv.y) || 0));
      }
    })
    .catch(() => { route(); $("grid").innerHTML = `<div class="empty"><b>목록을 불러오지 못했어요</b>잠시 뒤 새로고침해 주세요.</div>`; });
})();
