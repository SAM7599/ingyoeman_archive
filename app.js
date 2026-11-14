/* 잉여맨 추억자료실 - 동작 */
(function () {
  "use strict";
  const PAGE = 36;            // 한 번에 보여 주는 영상 수 (스크롤하면 더 나와요)
  const RECENT_MAX = 60;      // 본 영상 기억 개수
  const HUES = [232, 12, 150, 38, 268, 328, 190, 96, 22, 214, 350, 286];

  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const SITE = window.SITE || {};
  const CATS = SITE.categories || [];

  let anim = false, popKey = null, gv = null, gBusy = false;
  let all = [], SERIES = [], ser = "", tab = "all", cat = "", shown = PAGE, todayKey = null, menuFor = null, current = null;
  let favs = new Set(store.get("favs", []));
  let recent = store.get("recent", []);   // 열어본 영상 (자동)
  let view = store.get("view2", "grid") === "rows" ? "rows" : "grid";
  const savedSort = store.get("sort", "new");
  $("sort").value = ["new", "old", "title", "likes", "rating"].includes(savedSort) ? savedSort : "new";

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

  /* ── 별점 (구글 로그인) — 서버 주소는 config.js 의 rating ── */
  const RATE = /^(https:\/\/|http:\/\/localhost)/i.test(SITE.rating || "") ? SITE.rating.replace(/\/+$/, "") : "";
  let isAdm = false, ravg = {}, mine = {}, rtok = store.get("dtok", null);
  const rScore = v => { const a = ravg[vid(v)]; return a ? (a[0] * a[1] + 3 * 2) / (a[1] + 2) : 0; };   // 표가 적을 때 흔들리지 않게 보정
  const rStars = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  const GID = SITE.google || "";
  /* 구글 로그인: 버튼을 눌러 로그인하면 구글이 확인 정보를 주고, 서버가 그걸 검사해서 우리 사이트용 토큰을 줘요 */
  let gsiReady = false;
  async function onGoogle(resp) {
    try {
      const r = await fetch(RATE + "/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) });
      if (r.status === 403) return toast("차단된 계정이라 로그인할 수 없어요");
      if (!r.ok) return toast("로그인하지 못했어요. 잠시 후 다시 해 주세요");
      const d = await r.json(); rtok = { t: d.token, name: d.name || "" }; isAdm = !!d.admin; store.set("dtok", rtok);
      toast("구글로 로그인했어요"); loadRatings(); drawRate();
    } catch (e) { toast("로그인하지 못했어요. 잠시 후 다시 해 주세요"); }
  }
  function drawGoogleBtn() {
    const box = $("gbtn"); if (!box || !GID) return;
    const go = () => { try { if (!gsiReady) { google.accounts.id.initialize({ client_id: GID, callback: onGoogle, ux_mode: "popup" }); gsiReady = true; } google.accounts.id.renderButton(box, { theme: "outline", size: "large", text: "signin_with", locale: "ko", width: 260 }); } catch (e) {} };
    if (window.google && google.accounts) return go();
    if (document.getElementById("gsi")) return setTimeout(drawGoogleBtn, 300);
    const sc = document.createElement("script"); sc.id = "gsi"; sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = go; document.head.appendChild(sc);
  }
  const rApi = (path, opt) => fetch(RATE + path, { ...(opt || {}), headers: { ...(rtok ? { Authorization: "Bearer " + rtok.t } : {}), "Content-Type": "application/json" } });
  function rLogout() { rtok = null; isAdm = false; mine = {}; store.set("dtok", null); drawRate(); }
  function loadRatings() {
    if (!RATE) return;
    fetch(RATE + "/ratings").then(r => r.json()).then(d => { ravg = d || {}; render(); if (current) drawRate(); }).catch(() => {});
    if (rtok) rApi("/me").then(r => r.status === 401 ? Promise.reject("login") : r.json()).then(d => { mine = d.mine || {}; rtok.name = d.name || ""; isAdm = !!d.admin; if (d.member === false) toast("차단된 계정이라 별점을 줄 수 없어요"); if (current) { resetDraft(); drawRate(); loadReviews(); } }).catch(e => { if (e === "login") rLogout(); });
  }
  /* 후기(평점)는 꼭 써야 해요. 신고 번호는 디스코드 채널에 직접 올려요. */
  let draft = { stars: 0, text: "" }, reviews = [], repTarget = null;
  const TEXT_MSG = { short: "후기는 5자 이상 써 주세요", long: "후기는 300자까지 쓸 수 있어요", empty: "점이나 같은 글자만 반복한 후기는 올릴 수 없어요", link: "링크나 주소는 넣을 수 없어요" };
  function textProblem(t) {   // 서버와 같은 검사 (미리 알려 주려고)
    const s = String(t || "").replace(/\s+/g, " ").trim();
    if (s.length < 5) return "short"; if (s.length > 300) return "long";
    const core = s.replace(/[^\p{L}\p{N}]/gu, ""); if (core.length < 4 || new Set(core).size < 3) return "empty";
    if (/(https?:\/\/|www\.|discord\.gg|\.(com|net|kr|io|me|gg|xyz)\b)/i.test(s)) return "link";
    return null;
  }
  const rAgo = ms => { const d = (Date.now() - ms) / 1000; return d < 60 ? "방금" : d < 3600 ? Math.floor(d / 60) + "분 전" : d < 86400 ? Math.floor(d / 3600) + "시간 전" : d < 86400 * 30 ? Math.floor(d / 86400) + "일 전" : new Date(ms).toLocaleDateString("ko-KR"); };
  function resetDraft() { const m = current && mine[vid(current)]; draft = m ? { stars: m[0], text: m[1] } : { stars: 0, text: "" }; }
  function loadReviews() {
    if (!RATE || !current) return; const id = vid(current);
    rApi("/reviews?vid=" + encodeURIComponent(id)).then(r => r.json()).then(l => { if (current && vid(current) === id) { reviews = Array.isArray(l) ? l : []; drawRate(); } }).catch(() => {});
  }
  function formState() {   // 입력할 때마다 버튼/안내만 바꿔요 (글 쓰는 중에 화면을 다시 그리지 않아요)
    const t = $("rtext"), btn = $("rsend"); if (!t || !btn) return;
    const bad = textProblem(draft.text);
    $("rlen").textContent = draft.text.length + "/300";
    $("rhint").textContent = !draft.stars ? "별을 먼저 눌러 주세요" : bad && draft.text.trim() ? TEXT_MSG[bad] : bad ? "후기를 5자 이상 써 주세요 (후기는 꼭 필요해요)" : "";
    btn.disabled = !draft.stars || !!bad;
  }
  function drawRate() {
    const el = $("rate"); if (!el) return; el.hidden = !RATE; if (!RATE || !current) return;
    const id = vid(current), a = ravg[id], my = mine[id];
    const head = a ? `<b class="r-avg">★ ${a[0].toFixed(1)}</b><span>${a[1]}명이 남겼어요</span>` : `<span>아직 별점과 후기가 없어요</span>`;
    let body;
    const WARN = `<div class="r-warn" role="note"><b>⚠ 금지: 과거와 현재를 비교하는 후기</b><br>예전과 지금을 비교하거나 깎아내리는 후기는 <b>적발 즉시 삭제하고 작성자를 차단</b>해요. 차단되면 후기·신고를 모두 쓸 수 없어요. 영상 자체에 대한 감상만 남겨 주세요.</div>`;
    if (!rtok) body = `<div id="gbtn" class="r-g"></div><p class="r-note">구글 계정으로 로그인하면 별점과 후기를 남길 수 있어요. 한 계정당 영상마다 하나만 남길 수 있고, <b>별점과 후기를 모두</b> 써야 해요. 후기에는 이름 앞 2글자만 보여요. 로그인하면 <a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>을 확인한 것으로 봐요.</p>`;
    else body = `<div class="r-stars" role="group" aria-label="내 별점">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${n <= draft.stars ? "on" : ""}" data-star="${n}" aria-label="별 ${n}개" aria-pressed="${n === draft.stars}">★</button>`).join("")}</div>
      <textarea id="rtext" class="r-text" rows="3" maxlength="300" placeholder="후기를 남겨 주세요. 어떤 점이 좋았나요? (5자 이상)">${esc(draft.text)}</textarea>
      <div class="r-row"><span id="rhint" class="r-hint"></span><span id="rlen" class="r-len">0/300</span></div>
      <div class="r-row"><button type="button" class="btn primary" id="rsend" disabled>${my ? "수정하기" : "등록하기"}</button><span class="r-note">${my ? `<button type="button" class="r-link" data-del>내 별점·후기 지우기</button> ` : ""}<button type="button" class="r-link" data-rout>로그아웃</button>${isAdm ? ` <button type="button" class="r-link" data-adm>운영진 신고함</button>` : ""}</span></div>
      <p class="r-note">광고, 스팸, 욕설, 링크, 점(.)만 올린 후기는 신고되거나 지워질 수 있어요.</p>`;
    const list = reviews.length ? `<ul class="r-list">${reviews.map(r => `<li class="${r.me ? "mine" : ""}"><div class="r-h"><b>${esc(r.name)}</b>${r.me ? `<i class="r-me">내 후기</i>` : ""}<span class="r-s" aria-label="별 ${r.stars}개">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span><time>${rAgo(r.ts)}</time>${r.me ? "" : `<button type="button" class="r-link r-rep" data-rep="${esc(r.id)}">신고</button>`}</div><p>${esc(r.text)}</p></li>`).join("")}</ul>` : "";
    el.innerHTML = `<div class="r-head">${head}</div>${body}${WARN}${list}`;
    formState(); if (!rtok) drawGoogleBtn();
  }
  async function doSubmit() {
    if (!current || !rtok) return; const id = vid(current), n = draft.stars, text = draft.text.trim();
    const bad = textProblem(text); if (!n || bad) return formState();
    $("rsend").disabled = true;
    try {
      const r = await rApi("/rate", { method: "POST", body: JSON.stringify({ vid: id, stars: n, text }) });
      if (r.status === 401) { rLogout(); return toast("다시 로그인해 주세요"); }
      if (r.status === 403) { mine = {}; drawRate(); return toast("차단된 계정이라 남길 수 없어요"); }
      if (r.status === 400) { const d = await r.json().catch(() => ({})); formState(); return toast(TEXT_MSG[d.code] || "내용을 확인해 주세요"); }
      if (!r.ok) { formState(); return toast("지금은 남길 수 없어요. 잠시 후 다시 해 주세요"); }
      const d = await r.json(); mine[id] = [n, text]; ravg[id] = [d.avg, d.n];
      toast(my0(id) ? "후기를 남겼어요" : "후기를 남겼어요"); loadReviews(); drawRate(); render();
    } catch (e) { formState(); toast("지금은 남길 수 없어요. 잠시 후 다시 해 주세요"); }
  }
  const my0 = () => true;
  async function doDelete() {
    if (!current || !rtok || !confirm("내 별점과 후기를 지울까요?")) return; const id = vid(current);
    try {
      const r = await rApi("/rate", { method: "POST", body: JSON.stringify({ vid: id, stars: 0 }) });
      if (!r.ok) return toast("지금은 지울 수 없어요. 잠시 후 다시 해 주세요");
      const d = await r.json(); delete mine[id]; if (d.n) ravg[id] = [d.avg, d.n]; else delete ravg[id];
      draft = { stars: 0, text: "" }; toast("지웠어요"); loadReviews(); drawRate(); render();
    } catch (e) { toast("지금은 지울 수 없어요. 잠시 후 다시 해 주세요"); }
  }

  /* ── 운영진 신고함 (지정한 구글 계정만) ── */
  let tmap = null;
  const vTitle = id => { if (!tmap) { tmap = {}; all.forEach(v => { tmap[vid(v)] = v.title || ""; }); } return tmap[id] || "(목록에서 사라진 영상)"; };
  const vLink = id => `영상 <a href="#v=${esc(id)}">${esc(vTitle(id))}</a>`;
  const aAgo = ms => new Date(ms).toLocaleString("ko-KR");
  let admTab = "rep", arcRows = [];
  const WHY = { edit: "고침", del: "본인이 지움", mod: "운영진이 지움", ban: "차단으로 지워짐" };
  function admSetTab(t) { admTab = t; document.querySelectorAll(".adm-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t)); $("admQ").hidden = t !== "arc"; $("admQ").value = ""; t === "arc" ? openArchive() : openAdmin(); }
  async function openArchive() {
    $("admList").textContent = "불러오는 중…";
    try {
      const r = await rApi("/admin/history"); if (!r.ok) { $("admList").textContent = "운영진만 볼 수 있어요"; return; }
      arcRows = await r.json(); drawArchive();
    } catch (e) { $("admList").textContent = "불러오지 못했어요"; }
  }
  function drawArchive() {
    const q = $("admQ").value.trim().toLowerCase();
    const l = arcRows.filter(x => !q || (x.name + " " + x.text + " " + x.uid + " " + vTitle(x.vid)).toLowerCase().includes(q));
    $("admList").innerHTML = l.length ? l.map(x => `<section class="adm-it"><b>${esc(x.name || "이름 없음")}</b> (${esc(x.uid)})${x.banned ? " · <b>차단됨</b>" : ""}<br>${vLink(x.vid)} · <b>${WHY[x.why] || esc(x.why)}</b> · 이 내용을 올린 때 ${aAgo(x.ts)}<blockquote>${"★".repeat(x.stars)} ${esc(x.text)}</blockquote>${x.cur ? `<div class="adm-h">지금 후기: ★${x.cur.stars} ${esc(x.cur.text)}</div>` : `<div class="adm-h">지금은 없는 후기예요</div>`}<div class="adm-b"><button type="button" class="btn" data-p="id" data-id="${x.id}">이 기록 영구 삭제</button><button type="button" class="btn adm-ban" data-p="uid" data-id="${esc(x.uid)}">이 사람 보관 기록 전부 삭제</button></div></section>`).join("") : "보관된 후기가 없어요";
  }
  async function openAdmin() {
    $("admModal").hidden = false; $("admList").textContent = "불러오는 중…";
    try {
      const r = await rApi("/admin/reports"); if (!r.ok) { $("admList").textContent = "운영진만 볼 수 있어요"; return; }
      const l = await r.json();
      $("admList").innerHTML = l.length ? l.map(x => `<section class="adm-it"><b>#${x.id}</b> · ${esc(x.reason)} · 누적 ${x.cnt}건 · ${aAgo(x.ts)}${x.note ? `<br>신고자 메모: ${esc(x.note)}` : ""}<br>${vLink(x.vid)} · 작성자 ${esc(x.cur ? x.cur.name : "(이미 삭제됨)")} (${esc(x.uid)})${x.banned ? " · <b>차단됨</b>" : ""}${x.cur ? `<blockquote>${"★".repeat(x.cur.stars)} ${esc(x.cur.text)}</blockquote>` : ""}${x.hist.length ? `<div class="adm-h">이전 후기(고치기 전)<br>${x.hist.map(h => `• ${aAgo(h.ts)} ★${h.stars} ${esc(h.text)}`).join("<br>")}</div>` : ""}<div class="adm-b">${x.cur ? `<button type="button" class="btn" data-a="del" data-id="${x.id}">이 후기만 삭제</button>` : ""}${x.banned ? "" : `<button type="button" class="btn adm-ban" data-a="ban" data-id="${x.id}">삭제 + 작성자 차단</button>`}</div></section>`).join("") : "아직 신고가 없어요";
    } catch (e) { $("admList").textContent = "불러오지 못했어요"; }
  }
  async function admAct(id, act) {
    if (!confirm(act === "ban" ? "작성자를 차단하고 그 사람의 모든 후기를 지울까요? 되돌릴 수 없어요." : "이 후기를 삭제할까요? 되돌릴 수 없어요.")) return;
    try { const r = await rApi("/admin/act", { method: "POST", body: JSON.stringify({ id: +id, act }) }); if (!r.ok) return toast("처리하지 못했어요"); toast("처리했어요"); admSetTab("rep"); loadRatings(); loadReviews(); } catch (e) { toast("처리하지 못했어요"); }
  }
  async function admPurge(k, v) {
    if (!confirm(k === "uid" ? "이 사람의 보관 기록을 전부 영구 삭제할까요? 되돌릴 수 없어요." : "이 보관 기록을 영구 삭제할까요? 되돌릴 수 없어요.")) return;
    try { const r = await rApi("/admin/purge", { method: "POST", body: JSON.stringify(k === "uid" ? { uid: v } : { id: +v }) }); if (!r.ok) return toast("처리하지 못했어요"); toast("보관 기록을 지웠어요"); openArchive(); } catch (e) { toast("처리하지 못했어요"); }
  }
  /* ── 후기 신고 ── */
  function openReport(rid) {
    if (!rtok) return toast("신고하려면 먼저 구글로 로그인해 주세요");
    const r = reviews.find(x => x.id === rid); if (!r) return;
    repTarget = r;
    $("repWho").innerHTML = `<b>${esc(r.name)}</b> · ${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}<p>${esc(r.text)}</p>`;
    $("repForm").hidden = false; $("repDone").hidden = true; $("repNote").value = ""; $("repErr").textContent = "";
    const first = $("repForm").querySelector('input[name="reason"]'); if (first) first.checked = true;
    $("repGo").disabled = false; $("repModal").hidden = false; $("repGo").focus();
  }
  function closeReport() { $("repShot").hidden = true; $("repModal").hidden = true; repTarget = null; }
  /* 신고한 후기를 그림(PNG)으로 만들어 저장해요. 디스코드에 올릴 증거 캡처로 쓰세요 */
  let shotUrl = "";
  function makeShot(r, no, reasonLabel) {
    const W = 720, pad = 32, f = "'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif";
    const c = document.createElement("canvas"), x = c.getContext("2d");
    const wrap = (t, w, font) => { x.font = font; const out = []; for (const para of String(t).split(/\n/)) { let line = ""; for (const ch of Array.from(para)) { if (x.measureText(line + ch).width > w) { out.push(line); line = ch; } else line += ch; } out.push(line); } return out; };
    const title = wrap(current.title || "", W - pad * 2, "600 18px " + f).slice(0, 2);
    const body = wrap(r.text, W - pad * 2 - 4, "400 20px " + f).slice(0, 14);
    const H = pad + 22 + title.length * 26 + 22 + 30 + 18 + body.length * 30 + 28 + 56 + pad;
    c.width = W * 2; c.height = H * 2; x.scale(2, 2);
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#fff4f4"; x.fillRect(0, 0, W, 8);
    let y = pad; x.textBaseline = "top";
    x.fillStyle = "#777"; x.font = "400 14px " + f; x.fillText("후기 신고 #" + no + " · " + new Date().toLocaleString("ko-KR"), pad, y); y += 22;
    x.fillStyle = "#222"; x.font = "600 18px " + f; for (const l of title) { x.fillText(l, pad, y); y += 26; } y += 14;
    x.strokeStyle = "#e3e3e8"; x.beginPath(); x.moveTo(pad, y); x.lineTo(W - pad, y); x.stroke(); y += 16;
    x.fillStyle = "#111"; x.font = "700 18px " + f; x.fillText(r.name, pad, y);
    const nw = x.measureText(r.name).width;
    x.fillStyle = "#e8a600"; x.font = "400 18px " + f; x.fillText("★".repeat(r.stars) + "☆".repeat(5 - r.stars), pad + nw + 12, y);
    x.fillStyle = "#888"; x.font = "400 14px " + f; const when = new Date(r.ts).toLocaleString("ko-KR"); x.fillText(when, W - pad - x.measureText(when).width, y + 3); y += 40;
    x.fillStyle = "#222"; x.font = "400 20px " + f; for (const l of body) { x.fillText(l, pad + 2, y); y += 30; } y += 14;
    x.fillStyle = "#fdecec"; x.fillRect(pad, y, W - pad * 2, 44); x.fillStyle = "#b42318"; x.font = "600 15px " + f; x.fillText("신고 사유: " + reasonLabel, pad + 14, y + 13);
    return new Promise(res => c.toBlob(res, "image/png"));
  }
  function saveShot() { if (!shotUrl) return; const a = document.createElement("a"); a.href = shotUrl; a.download = "후기신고_" + ($("repNo").textContent || "").replace("#", "") + ".png"; document.body.appendChild(a); a.click(); a.remove(); }
  async function sendReport() {
    if (!repTarget || !current) return;
    const reason = ($("repForm").querySelector('input[name="reason"]:checked') || {}).value; if (!reason) return;
    $("repGo").disabled = true; $("repErr").textContent = "";
    try {
      const r = await rApi("/report", { method: "POST", body: JSON.stringify({ vid: vid(current), id: repTarget.id, reason, note: $("repNote").value.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { closeReport(); rLogout(); return toast("다시 로그인해 주세요"); }
      if (!r.ok) { $("repGo").disabled = false; $("repErr").textContent = r.status === 403 ? "차단된 계정은 신고할 수 없어요" : r.status === 404 ? "이미 지워진 후기예요" : r.status === 429 ? "하루에 10건까지 신고할 수 있어요" : r.status === 400 ? "내 후기는 신고할 수 없어요" : "지금은 신고할 수 없어요. 잠시 후 다시 해 주세요"; return; }
      $("repNo").textContent = "#" + d.no;
      $("repText").value = `[후기 신고 #${d.no}]\n영상: ${location.origin}${location.pathname}#v=${vid(current)}\n작성자: ${repTarget.name}\n사유: ${({ ad: "광고·홍보", spam: "스팸·도배", abuse: "욕설·비방", empty: "무의미한 내용", other: "기타" })[reason]}`; $("repForm").hidden = true; $("repDone").hidden = false;
      try { const lab = ({ ad: "광고·홍보", spam: "스팸·도배", abuse: "욕설·비방", empty: "무의미한 내용", other: "기타" })[reason]; const blob = await makeShot(repTarget, d.no, lab); if (shotUrl) URL.revokeObjectURL(shotUrl); shotUrl = URL.createObjectURL(blob); $("repShot").src = shotUrl; $("repShot").hidden = false; saveShot(); toast("후기 화면을 사진으로 저장했어요"); } catch (e) {}
      const dc = $("repDiscord"); if (dc) { dc.hidden = !/^https?:\/\//i.test(SITE.discord || ""); dc.href = SITE.discord || "#"; }
      $("repClose2").focus();
    } catch (e) { $("repGo").disabled = false; $("repErr").textContent = "지금은 신고할 수 없어요. 잠시 후 다시 해 주세요"; }
  }
  const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
  const OUT = `<svg class="out" viewBox="0 0 24 24"><path d="M9 6h9v9M18 6L7 17"/></svg>`;
  const CARD = `<svg class="ci" viewBox="0 0 24 24"><rect x="6.5" y="3.5" width="11" height="17" rx="2.2"/><path d="M12 9.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/></svg>`;
  const TROPHY = `<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/></svg>`;
  const DOTS = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;

  /* ── 목록 고르기 ── */
  function pool() {
    if (tab === "fav") return all.filter(v => favs.has(key(v)));
    if (tab === "recent") return recent.map(byKey).filter(Boolean);
    if (tab === "rank") return ranked(all);
    if (tab === "series") return ser ? all.filter(v => v._s.includes(ser)) : [];
    return all;
  }
  const LIKE_W = 50;   // 인기 점수 = 조회수 + 좋아요 × 50
  const RATE_W = 40;   // 별점 한 표 = (점수 - 3) × 40점 (5점 +80, 4점 +40, 3점 0, 2점 -40, 1점 -80)
  const starBonus = v => { const a = ravg[vid(v)]; return a ? (a[0] - 3) * a[1] * RATE_W : 0; };
  const pop = v => Math.max(0, (v.views || 0) + LIKE_W * (v.likes || 0) + starBonus(v));
  const nf = n => Number(n || 0).toLocaleString("ko-KR");
  const ranked = list => list.filter(v => pop(v) > 0).sort((a, b) => pop(b) - pop(a) || order(a) - order(b));   // 카페 조회수와 좋아요를 합친 순
  const words = () => $("q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  function filtered() {
    const w = words(), s = $("sort").value;
    const list = pool().filter(v => {
      if (cat && cat !== "*" && v.category !== cat) return false;
      const hay = ((v.title || "") + " " + (v.category || "")).toLowerCase();
      return w.every(x => hay.includes(x));
    });
    if (tab === "recent" && s === "new") return list;   // 본 순서 그대로
    if (tab === "rank") return list.slice(0, 100);        // 순위 그대로, 100위까지
    if (s === "rating") return list.sort((a, b) => rScore(b) - rScore(a) || pop(b) - pop(a));
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
  const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>`;
  function cardHtml(v, shelf, rank) {
    const k = key(v), on = favs.has(k), seen = recent.includes(k) && tab !== "recent" && !shelf, rows = (view === "rows" || tab === "rank") && !shelf;
    const sn = v._s && v._s.find(n => n !== ser), showLikes = pop(v) > 0 && (rank || $("sort").value === "likes" && !shelf);
    const meta = `<div class="meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span>${RATE && ravg[vid(v)] ? `<span class="rt" title="별점 ${ravg[vid(v)][0].toFixed(1)} (${ravg[vid(v)][1]}명)">${ravg[vid(v)][0].toFixed(1)}<small>(${ravg[vid(v)][1]})</small></span>` : ""}${showLikes ? `<span class="vw">조회 ${nf(v.views)}</span><span class="lk">♥ ${v.likes || 0}</span>` : ""}${repCount(v) ? `<span class="rp">썸네일 제보 ${repCount(v)}건</span>` : ""}${sn ? `<span class="ser" role="link" tabindex="0" data-ser="${esc(sn)}">${esc(sn)}</span>` : ""}</div>`;
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
  function renderChips() {
    const p = pool(), n = {}, home = tab === "all";
    p.forEach(v => { n[v.category] = (n[v.category] || 0) + 1; });
    const extra = Object.keys(n).filter(c => c && c !== "undefined" && !CATS.includes(c)).sort();
    const chip = (c, label, cnt, zero) => `<button class="chip ${c === cat ? "on" : ""} ${zero ? "zero" : ""}" type="button" data-c="${esc(c)}">${c && c !== "*" ? `<i style="--c:${dot(c)}"></i>` : ""}${esc(label)}${cnt == null ? "" : `<em>${cnt}</em>`}</button>`;
    $("chips").innerHTML = (all.length > 1 ? `<button class="chip draw" type="button" data-draw>${CARD}랜덤 뽑기</button>` : "") + (home ? chip("", "홈") + chip("*", "전체 영상", p.length) : chip("", "전체", p.length)) +
      [...CATS, ...extra].map(c => chip(c, c, n[c] || 0, !n[c] && c !== cat)).join("");
  }
  function renderToday() {
    const box = $("today");
    const v = isHome() && all.length ? (byKey(todayKey) || all[hash(new Date().toDateString()) % all.length]) : null;
    box.hidden = !v; if (!v) return;
    todayKey = key(v); box.dataset.k = todayKey;
    box.innerHTML = `<div class="hero-bg" style="--g:${grad(v.category)}">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ""}</div>
      <div class="hero-in"><span class="label">오늘의 다시보기</span><h2>${esc(v.title)}</h2>
      <p class="hero-meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span><span>${ytId(v) ? "바로 재생돼요" : "카페 가입·올드팬 인증 후 시청"}</span></p>
      <div class="acts"><a class="btn primary" data-go href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer">${ytId(v) ? "바로 보기" : "다시보기" + OUT}</a>
      <button class="btn glass" type="button" data-fav>${favs.has(todayKey) ? "♥ 담았어요" : "♡ 즐겨찾기"}</button>
      ${all.length > 1 ? `<button class="btn glass" type="button" data-draw>${CARD}랜덤 뽑기</button>` : ""}</div></div>`;
    if (box.dataset.shown !== todayKey) { box.dataset.shown = todayKey; box.classList.remove("anim"); void box.offsetWidth; box.classList.add("anim"); }
  }
  const ARR = d => `<button class="arr ${d < 0 ? "l" : "r"}" type="button" data-dir="${d}" aria-label="${d < 0 ? "앞으로" : "뒤로"} 넘기기"><svg viewBox="0 0 24 24"><path d="${d < 0 ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"}"/></svg></button>`;
  function rowHtml(title, list, more, c) {
    if (!list.length) return "";
    return `<section class="row"><div class="row-h"><h2>${c ? `<i style="--c:${dot(c)}"></i>` : ""}${esc(title)}<em>${list.length}</em></h2>${more}</div>
      <div class="rail-wrap">${ARR(-1)}<div class="rail">${list.slice(0, 14).map(v => cardHtml(v, true)).join("")}</div>${ARR(1)}</div></section>`;
  }
  function renderHome() {   // 첫 화면: 분류별로 한 줄씩
    const sorted = all.slice().sort((a, b) => order(b) - order(a));
    const extra = [...new Set(all.map(v => v.category).filter(c => c && !CATS.includes(c)))].sort();
    const top = ranked(all).slice(0, 10);
    $("home").innerHTML =
      (top.length ? `<section class="row"><div class="row-h"><h2>인기 영상</h2><a class="more" href="#rank">랭킹 전체 보기</a></div>
        <div class="rail-wrap">${ARR(-1)}<div class="rail">${top.map((v, i) => cardHtml(v, true, i + 1)).join("")}</div>${ARR(1)}</div></section>` : "") +
      promoHtml() +
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
    $("chips").hidden = tiles;
    if (home) { renderHome(); return playIn($("home")); }
    $("pageH").textContent = tiles ? "시리즈" : rank ? "인기 랭킹" : tab === "series" && ser ? ser : q ? "검색 결과" : tab === "fav" ? "즐겨찾기" : tab === "recent" ? "열어본 영상" : cat && cat !== "*" ? cat : "전체 영상";
    $("count").textContent = tiles ? SERIES.length + "개" : list.length + (tab === "series" ? "편" : "개");
    $("back").hidden = !(tab === "series" && ser);
    $("sort").hidden = tiles || rank; document.querySelector(".seg").hidden = tiles || rank;
    const note = tiles ? "같은 콘텐츠끼리 묶었어요. 제목으로 자동 분류해서 빠지거나 잘못 들어간 영상이 있을 수 있어요."
      : rank ? "네이버 카페 조회수와 좋아요를 합친 점수 순서예요. 좋아요 1개를 조회수 " + LIKE_W + "회로 쳤어요." + (RATE ? " 사이트 별점도 반영해요. 별 한 표는 (점수 − 3) × " + RATE_W + "점이라 5점이면 +" + 2 * RATE_W + ", 1점이면 −" + 2 * RATE_W + "점이에요." : "") + " 카페 숫자는 목록을 정리한 때 기준이라 지금과 조금 다를 수 있어요." : "";
    $("pageNote").hidden = !note; $("pageNote").textContent = note;
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
    const next = ["fav", "recent", "guide", "about", "notes", "ach", "rank", "series"].includes(h) ? h : h.startsWith("series=") ? "series" : "all";
    const nextSer = h.startsWith("series=") ? h.slice(7) : "";
    if (next !== tab || nextSer !== ser) cat = "";
    if (nextSer !== ser) $("q").value = "";
    tab = next; ser = nextSer;
    $("viewGuide").hidden = tab !== "guide"; $("viewAbout").hidden = tab !== "about"; $("viewNotes").hidden = tab !== "notes"; if (tab === "notes") showNotes(); $("viewAch").hidden = tab !== "ach"; if (tab === "ach") renderAch(); $("viewList").hidden = isInfo();
    document.querySelectorAll(".tab").forEach(a => a.classList.toggle("on", a.dataset.tab === (tab === "ach" ? "ach" : isInfo() ? "info" : tab)));
    const pg = tab === "guide" ? $("viewGuide") : tab === "about" ? $("viewAbout") : tab === "notes" ? $("viewNotes") : tab === "ach" ? $("viewAch") : $("viewList"); pg.classList.remove("enter"); void pg.offsetWidth; pg.classList.add("enter");
    if (!$("gacha").hidden) closeGacha();
    closeMenu();
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
    $("mRate").hidden = !RATE; syncModalFav(); reviews = []; resetDraft(); drawRate(); loadReviews();
    $("modal").hidden = false; document.body.style.overflow = "hidden"; $("mClose").focus();
    if (id) { markSeen(v); render(); }
  }
  function syncModalFav() { if (!current) return; $("mFav").textContent = favs.has(key(current)) ? "♥ 담았어요" : "♡ 즐겨찾기"; }
  function closeModal(keepHash) {
    $("modal").hidden = true; $("mScreen").innerHTML = ""; document.body.style.overflow = ""; current = null;
    if (!keepHash && location.hash.startsWith("#v=")) history.replaceState(null, "", location.pathname + location.search);
  }
  function toggleFav(k) {
    if (favs.has(k)) { favs.delete(k); toast("즐겨찾기에서 뺐어요"); } else { favs.add(k); toast("즐겨찾기에 담았어요"); }
    store.set("favs", [...favs]); popKey = favs.has(k) ? k : null; render(); popKey = null; syncModalFav(); syncGachaFav(); achCheck();
  }
  function share(v) {
    achFlag("share");
    const url = location.origin + location.pathname + "#v=" + vid(v);
    const done = () => toast("링크를 복사했어요"), fail = () => toast("복사하지 못했어요");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail);
    else { const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy") ? done() : fail(); } catch (e) { fail(); } t.remove(); }
  }
  function report(v) {
    if (SITE.repo) achFlag("report");
    if (!SITE.repo) return toast("썸네일 제보는 준비 중이에요");
    const body = "**영상**: " + v.title + "\n**카페 글**: " + (v.url || "") + "\n\n**썸네일 이미지** (아래에 이미지를 끌어다 놓거나 주소를 붙여넣어 주세요)\n\n";
    window.open("https://github.com/" + SITE.repo + "/issues/new?labels=thumbnail&title=" + encodeURIComponent("[썸네일] " + v.title) + "&body=" + encodeURIComponent(body), "_blank", "noopener");
  }

  /* ── 뽑기 효과음 (파일 없이 브라우저가 직접 만드는 소리) ── */
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
  function whoosh(at, dur, vol) {
    const a = ac(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const t = a.currentTime + at, src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(a.destination); src.start(t); src.stop(t + dur + 0.05);
  }
  function sfxDraw(tier, shakeMs) {   // 흔들릴 때 두근두근 → 뒤집힐 때 짠
    if (!ac()) return;
    const s = shakeMs / 1000, gap = tier === "legend" ? 0.085 : 0.11, steps = Math.floor(s / gap);
    for (let i = 0; i < steps; i++) tone(200 + (i / Math.max(1, steps)) * (tier === "legend" ? 620 : tier === "rare" ? 420 : 260), i * gap, 0.06, "triangle", 0.05 + 0.05 * i / Math.max(1, steps));
    if (tier === "legend") tone(70, 0, s, "sawtooth", 0.05, 180);
    whoosh(Math.max(0, s - 0.12), 0.34, 0.16);
    const notes = tier === "legend" ? [523, 659, 784, 1047, 1319, 1568] : tier === "rare" ? [523, 659, 784, 1047] : [659, 880];
    notes.forEach((f, i) => tone(f, s + 0.1 + i * (tier === "normal" ? 0.09 : 0.075), tier === "normal" ? 0.35 : 0.55, "sine", 0.11));
    if (tier !== "normal") tone(notes[0] / 2, s + 0.1, 0.9, "triangle", 0.07);
    if (tier === "legend") for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 2200, s + 0.55 + i * 0.07, 0.16, "sine", 0.04);
  }
  function syncSound() {
    const on = soundOn();
    $("sound").setAttribute("aria-checked", on);
    $("gSound").textContent = on ? "소리 켜짐" : "소리 꺼짐"; $("gSound").setAttribute("aria-pressed", on);
  }
  function toggleSound() { store.set("sound", soundOn() ? "off" : "on"); syncSound(); if (soundOn()) tone(880, 0, 0.18, "sine", 0.1); }
  $("sound").addEventListener("click", toggleSound);
  $("gSound").addEventListener("click", toggleSound);
  syncSound();

  /* ── 랜덤 뽑기 (카드 뽑기 연출) ── */
  const calm = () => document.documentElement.getAttribute("data-motion") === "off";
  const tierOf = v => (v.likes || 0) >= 10 ? ["legend", "전설"] : (v.likes || 0) >= 5 ? ["rare", "희귀"] : ["normal", "일반"];
  function drawPool() { const l = isHome() || isInfo() ? all : filtered(); return l.length > 1 ? l : all; }
  function drawLabel() {
    if (drawPool() === all || isHome()) return "전체 영상";
    return tab === "series" && ser ? ser : tab === "rank" ? "인기 랭킹" : tab === "fav" ? "즐겨찾기" : tab === "recent" ? "열어본 영상" : words().length ? "검색 결과" : cat && cat !== "*" ? cat : "전체 영상";
  }
  function gachaPick() {
    const p = drawPool().filter(v => !gv || key(v) !== key(gv));
    gv = p[Math.floor(Math.random() * p.length)] || gv;
    const t = tierOf(gv), card = $("gCard");
    card.dataset.tier = t[0];
    card.style.setProperty("--g", grad(gv.category));
    $("gFace").innerHTML = `<span class="g-tier">${t[1]}</span><b class="g-name">${esc(gv.title)}</b>
      <span class="g-meta"><span class="cat-dot" style="--c:${dot(gv.category)}">${esc(gv.category || "기타")}</span>${gv.likes > 0 ? `<span>♥ ${gv.likes}</span>` : ""}</span>`;
    $("gGo").href = safeUrl(gv.url); $("gGo").innerHTML = (ytId(gv) ? "바로 보기" : "다시보기" + OUT);
    syncGachaFav();
  }
  function syncGachaFav() { if (gv) $("gFav").textContent = favs.has(key(gv)) ? "♥ 담았어요" : "♡ 즐겨찾기"; }
  function gachaReady() {
    const card = $("gCard");
    card.classList.add("still"); card.classList.remove("flip", "shake", "done"); void card.offsetWidth; card.classList.remove("still");
    $("gActs").classList.remove("show"); $("gFx").innerHTML = "";
    $("gTitle").textContent = "‘" + drawLabel() + "’에서 한 장 뽑아요. 카드를 눌러 보세요";
    gachaPick();
  }
  function openGacha() {
    if (all.length < 2) return;
    closeMenu(); gBusy = false; ac();
    $("gacha").hidden = false; document.body.style.overflow = "hidden";
    gachaReady(); $("gCard").focus({ preventScroll: true });
  }
  function closeGacha() { $("gacha").hidden = true; document.body.style.overflow = ""; gBusy = false; }
  function burst(tier) {
    const n = tier === "legend" ? 30 : tier === "rare" ? 18 : 10, fx = $("gFx");
    let h = `<i class="flash"></i>`;
    for (let i = 0; i < n; i++) { const a = Math.random() * 360, d = 130 + Math.random() * (tier === "legend" ? 190 : 130); h += `<i class="sp" style="--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}px;--t:${(0.5 + Math.random() * 0.6).toFixed(2)}s;--s:${(5 + Math.random() * 7).toFixed(0)}px"></i>`; }
    fx.innerHTML = h;
  }
  function gachaGo() {
    const card = $("gCard");
    if (gBusy || card.classList.contains("flip")) return;
    gBusy = true;
    const quick = calm(), tier = card.dataset.tier;
    const shakeMs = quick ? 0 : tier === "legend" ? 1500 : tier === "rare" ? 1150 : 850;
    sfxDraw(tier, shakeMs);
    $("gTitle").textContent = "두근두근…";
    card.classList.add("shake");
    setTimeout(() => {
      card.classList.remove("shake"); card.classList.add("flip");
      if (!quick) burst(tier);
      setTimeout(() => {
        card.classList.add("done"); achDraw(gv, tier);
        $("gTitle").textContent = tier === "legend" ? "전설 카드가 나왔어요!" : tier === "rare" ? "희귀 카드예요!" : "이 영상이 뽑혔어요";
        $("gActs").classList.add("show"); gBusy = false;
      }, quick ? 0 : 620);
    }, shakeMs);
  }
  $("viewAbout").addEventListener("click", e => { if (e.target.closest("[data-draw-all]")) openGacha(); });
  $("gCard").addEventListener("click", gachaGo);
  $("gCard").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); gachaGo(); } });
  $("gAgain").addEventListener("click", () => { if (gBusy) return; ac(); gachaReady(); setTimeout(gachaGo, calm() ? 0 : 260); });
  $("gFav").addEventListener("click", () => gv && toggleFav(key(gv)));
  $("gGo").addEventListener("click", e => { if (gv) { const v = gv; if (ytId(v)) closeGacha(); follow(e, v, $("gGo").href); } });
  $("gClose").addEventListener("click", closeGacha);
  $("gacha").addEventListener("click", e => { if (e.target === $("gacha")) closeGacha(); });

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
    { id: "draw1", t: "첫 뽑기", d: "랜덤 뽑기 처음 해 보기", p: () => [st.draws, 1] },
    { id: "draw30", t: "뽑기 중독", d: "랜덤 뽑기 30번 하기", p: () => [st.draws, 30] },
    { id: "rare", t: "희귀한 인연", d: "희귀 카드 뽑기", p: () => [st.rare ? 1 : 0, 1] },
    { id: "legend", t: "전설을 만나다", d: "전설 카드 뽑기", p: () => [st.legends.length, 1] },
    { id: "legend5", t: "전설 수집가", d: "서로 다른 전설 카드 5장 뽑기", p: () => [st.legends.length, 5] },
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
  function achDraw(v, tier) {
    if (!v) return;
    st.draws++; if (tier === "rare") st.rare = 1;
    if (tier === "legend" && !st.legends.includes(vid(v))) st.legends.push(vid(v));
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
    $("xLink").value = link; $("xShare").hidden = !navigator.share;
    $("xQr").textContent = "QR코드를 만드는 중이에요";
    loadQr().then(() => {
      const q = window.qrcode(0, "L"); q.addData(link); q.make();
      $("xQr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
    }).catch(() => { $("xQr").textContent = "QR코드를 만들지 못했어요. 아래 링크를 써 주세요."; });
  }
  function closeXfer() { $("xfer").hidden = true; document.body.style.overflow = ""; }
  $("xferOpen").addEventListener("click", openXfer);
  $("xClose").addEventListener("click", closeXfer);
  $("xfer").addEventListener("click", e => { if (e.target === $("xfer")) closeXfer(); });
  $("xLink").addEventListener("focus", () => $("xLink").select());
  $("xCopy").addEventListener("click", () => {
    const link = $("xLink").value, done = () => toast("링크를 복사했어요. 다른 기기에서 열어 주세요"), fail = () => { $("xLink").focus(); toast("위 칸의 링크를 직접 복사해 주세요"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fail); else fail();
  });
  $("xShare").addEventListener("click", () => { navigator.share({ title: "잉여맨 추억자료실 내 기록", url: $("xLink").value }).catch(() => {}); });

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
    m.querySelector('[data-act="fav"]').textContent = favs.has(k) ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기";
    m.querySelector('[data-act="rate"]').hidden = !RATE;
    m.querySelector('[data-act="seen"]').hidden = !recent.includes(k);
    m.querySelector('[data-act="report"]').textContent = "썸네일 제보" + (repCount(v) ? " (지금 " + repCount(v) + "건)" : "");
    m.hidden = false;
    const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    const below = r.bottom + h + 12 <= window.innerHeight;
    m.style.top = (below ? r.bottom + 6 : r.top - h - 6) + window.scrollY + "px";
    m.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + window.scrollX + "px";
  }
  function closeMenu() { $("menu").hidden = true; menuFor = null; }
  $("menu").addEventListener("click", e => {
    const b = e.target.closest("button"), v = menuFor; if (!b || !v) return;
    closeMenu();
    const k = key(v), a = b.dataset.act;
    if (a === "share") share(v);
    else if (a === "rate") openModal(v);
    else if (a === "fav") toggleFav(k);
    else if (a === "report") report(v);
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
    if (e.target.closest("[data-draw]")) return openGacha();
  });
  $("chips").addEventListener("click", e => { if (e.target.closest("[data-draw]")) return openGacha(); const b = e.target.closest(".chip"); if (!b) return; cat = b.dataset.c; if (b.dataset.c === "" && tab === "all") $("q").value = ""; reset(); });
  $("q").addEventListener("input", () => { if (isInfo()) location.hash = ""; reset(); });
  $("sort").addEventListener("change", () => { store.set("sort", $("sort").value); reset(); });
  $("vGrid").addEventListener("click", () => { view = "grid"; store.set("view2", view); render(); });
  $("vList").addEventListener("click", () => { view = "rows"; store.set("view2", view); render(); });
  $("mFav").addEventListener("click", () => current && toggleFav(key(current)));
  $("mShare").addEventListener("click", () => current && share(current));
  $("mRate").addEventListener("click", () => {
    const r = $("rate"); if (!r || r.hidden) return;
    r.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" });
    r.classList.remove("flash"); void r.offsetWidth; r.classList.add("flash");
    const f = r.querySelector("[data-star], #rtext, #gbtn"); if (f && f.focus) f.focus({ preventScroll: true });
  });
  $("mGo").addEventListener("click", e => current && follow(e, current, $("mGo").href));
  $("rate").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rout !== undefined) return rLogout();
    if (b.dataset.del !== undefined) return doDelete();
    if (b.dataset.rep) return openReport(b.dataset.rep);
    if (b.dataset.adm !== undefined) { admTab = "rep"; document.querySelectorAll(".adm-tabs button").forEach(x => x.classList.toggle("on", x.dataset.tab === "rep")); $("admQ").hidden = true; return openAdmin(); }
    if (b.dataset.star) { draft.stars = +b.dataset.star; const t = $("rtext"); if (t) draft.text = t.value; drawRate(); const t2 = $("rtext"); if (t2) t2.focus(); return; }
    if (b.id === "rsend") doSubmit();
  });
  $("rate").addEventListener("input", e => { if (e.target.id === "rtext") { draft.text = e.target.value; formState(); } });
  $("repGo").addEventListener("click", sendReport);
  $("repCopy").addEventListener("click", () => { const t = $("repText"); t.select(); try { navigator.clipboard.writeText(t.value).then(() => toast("복사했어요"), () => { document.execCommand("copy"); toast("복사했어요"); }); } catch (e) { document.execCommand("copy"); toast("복사했어요"); } });
  $("admList").addEventListener("click", e => { const b = e.target.closest("button[data-a]"); if (b) return admAct(b.dataset.id, b.dataset.a); const c = e.target.closest("button[data-p]"); if (c) admPurge(c.dataset.p, c.dataset.id); });
  document.querySelector(".adm-tabs").addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) admSetTab(b.dataset.tab); });
  $("admQ").addEventListener("input", drawArchive);
  $("admClose").addEventListener("click", () => { $("admModal").hidden = true; });
  $("admModal").addEventListener("click", e => { if (e.target === $("admModal")) $("admModal").hidden = true; });
  $("repSave").addEventListener("click", saveShot);
  $("repCancel").addEventListener("click", closeReport); $("repClose2").addEventListener("click", closeReport);
  $("repModal").addEventListener("click", e => { if (e.target === $("repModal")) closeReport(); });
  $("mClose").addEventListener("click", () => closeModal());
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  $("totop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }));
  document.addEventListener("click", e => { if (!$("menu").hidden && !e.target.closest(".menu")) closeMenu(); if (!$("setMenu").hidden && !e.target.closest(".menu")) closeSet(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("dcChat").hidden) { closeDc(); return; }
    if (e.key === "Escape" && !$("repModal").hidden) { closeReport(); return; }
    if (e.key === "Escape") {
      if (!$("setMenu").hidden) closeSet(); else if (!$("menu").hidden) closeMenu(); else if (!$("modal").hidden) closeModal(); else if (!$("gacha").hidden) closeGacha(); else if (!$("xfer").hidden) closeXfer(); else if (!$("imp").hidden) closeImp();
      else if (document.activeElement === $("q")) { $("q").value = ""; $("q").blur(); reset(); }
    }
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-ser]")) { e.preventDefault(); location.hash = "series=" + encodeURIComponent(e.target.dataset.ser); }
    if (e.key === "/" && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); $("q").focus(); }
  });
  window.addEventListener("scroll", () => { $("totop").hidden = window.scrollY < 700; if (!$("menu").hidden && Math.abs(window.scrollY - openMenu.y) > 60) closeMenu(); }, { passive: true });
  window.addEventListener("resize", () => { closeMenu(); closeSet(); $("home").querySelectorAll(".rail-wrap").forEach(syncArrows); });
  window.addEventListener("hashchange", route);
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { if (es[0].isIntersecting && !$("sentinel").hidden) { shown += PAGE; render(); } }, { rootMargin: "600px" }).observe($("sentinel"));

  const FB = /^https?:\/\//i.test(SITE.discord || "") ? SITE.discord : SITE.feedback;   // 디스코드 주소가 있으면 디스코드로, 없으면 카페 채팅방으로
  document.querySelectorAll("[data-feedback]").forEach(a => { if (/^https?:\/\//i.test(FB || "")) a.href = FB; else a.hidden = true; });
  if (FB === SITE.discord) { const g = $("fbHelp"); if (g) g.innerHTML = "화면 오른쪽 아래 <b>디스코드 참여하기</b> 버튼을 누르면 안내 채팅창이 열려요. 디스코드에서는 사이트 버그·시리즈 분류나 영상 정보 오류 제보, 건의, 영상 추가 요청, 부적절한 후기 신고를 할 수 있어요."; }
  /* ── 디스코드 참여하기 (채팅창 안내) ── */
  const DC = [
    "안녕하세요! 👋 잉여맨추억자료실 디스코드에 오신 걸 환영해요.",
    "<b>여기에서는 이런 걸 할 수 있어요</b><ul><li>🐞 사이트가 이상할 때 <b>버그 제보</b></li><li>📚 시리즈 분류나 영상 정보가 틀렸을 때 <b>제보</b></li><li>💡 있었으면 하는 기능 <b>건의</b></li><li>📥 목록에 없는 영상 <b>추가 요청</b></li><li>🚨 부적절한 <b>후기 신고</b> (광고·스팸·욕설, 과거와 현재를 비교하는 후기 등)</li></ul>",
    "<b>후기 신고는 이렇게 해요</b><br>사이트에서 후기의 <b>신고</b> 버튼을 누르면 신고 번호가 나오고, 후기 사진이 저장돼요. 그 번호와 사진을 디스코드 <b>🚨-후기-신고</b> 채널에 올려 주세요.",
    ["warn", "⚠ 신고할 때 후기 내용을 글로 그대로 적지 마세요. 보안봇이 글을 막거나 지울 수 있어요. 번호와 사진만 올려 주세요."],
    "그 밖의 제보와 건의는 <b>🛠-사이트-제보</b> 채널에 남겨 주시면 돼요. 디스코드 가입은 무료예요.",
    "그럼 <b>디스코드에 참여하시겠어요?</b>"
  ];
  let dcT = [];
  function openDc() {
    const b = $("dcBody"); b.innerHTML = ""; $("dcAsk").hidden = true; $("dcJoin").href = SITE.discord; dcT.forEach(clearTimeout); dcT = [];
    $("dcChat").hidden = false; document.body.style.overflow = "hidden";
    const quick = calm();
    const add = m => { const d = document.createElement("div"); d.className = "dc-m" + (Array.isArray(m) ? " " + m[0] : ""); d.innerHTML = Array.isArray(m) ? m[1] : m; b.appendChild(d); b.scrollTop = b.scrollHeight; };
    let t = 0;
    DC.forEach((m, n) => {
      const last = n === DC.length - 1;
      if (quick) { add(m); if (last) $("dcAsk").hidden = false; return; }
      dcT.push(setTimeout(() => { const ty = document.createElement("div"); ty.className = "dc-typing"; ty.innerHTML = "<i></i><i></i><i></i>"; b.appendChild(ty); b.scrollTop = b.scrollHeight; }, t));
      t += n === 1 || n === 2 ? 1100 : 750;
      dcT.push(setTimeout(() => { const ty = b.querySelector(".dc-typing"); if (ty) ty.remove(); add(m); if (last) { $("dcAsk").hidden = false; $("dcJoin").focus({ preventScroll: true }); } }, t));
      t += 250;
    });
  }
  function closeDc() { dcT.forEach(clearTimeout); dcT = []; $("dcChat").hidden = true; document.body.style.overflow = ""; }
  if (/^https?:\/\//i.test(SITE.discord || "")) document.addEventListener("click", e => { const f = e.target.closest("[data-feedback]"); if (!f) return; e.preventDefault(); closeMenu(); openDc(); });
  $("dcX").addEventListener("click", closeDc); $("dcNo").addEventListener("click", closeDc); $("dcJoin").addEventListener("click", () => setTimeout(closeDc, 150));
  $("dcChat").addEventListener("click", e => { if (e.target === $("dcChat")) closeDc(); });
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


  /* ── 패치노트 (patchnotes.json) ── */
  let notes = null;
  const NOTE_TAG = { "신규": "new", "개선": "up", "수정": "fix" };
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

  /* ── 공지 (notice.json) ── */
  fetch("notice.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(n => {
    const text = ((n && n.text) || "").trim(), box = $("notice");
    if (!n || !n.enabled || !text) return;
    const id = String(hash(text + (n.link || ""))), closable = n.closable === true;
    if (closable && store.get("notice_closed", "") === id) return;
    const t = box.querySelector(".t"); t.textContent = text + " ";
    if (/^https?:\/\//i.test(n.link || "")) { const a = document.createElement("a"); a.href = n.link; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "자세히 보기"; t.appendChild(a); }
    const x = box.querySelector(".x");
    if (closable) x.onclick = () => { box.hidden = true; store.set("notice_closed", id); }; else x.remove();
    box.hidden = false;
  }).catch(() => {});

  /* ── 글자 끌기·오른쪽 클릭 막기 (검색창은 그대로 사용 가능) ── */
  const inField = e => e.target && e.target.closest && e.target.closest("input, textarea");
  document.addEventListener("contextmenu", e => { if (!inField(e)) e.preventDefault(); });
  document.addEventListener("dragstart", e => e.preventDefault());
  document.addEventListener("selectstart", e => { if (!inField(e)) e.preventDefault(); });

  /* ── 시작 ── */
  fetch("videos.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json())
    .then(data => {
      all = Array.isArray(data) ? data : [];
      const defs = (SITE.series || []).map(x => { try { return { name: x[0], re: new RegExp(x[1], "i") }; } catch (e) { return null; } }).filter(Boolean);
      all.forEach((v, i) => { v._i = i; v._s = defs.filter(x => x.re.test(v.title || "")).map(x => x.name); });
      SERIES = defs.map(x => ({ name: x.name, n: all.filter(v => v._s.includes(x.name)).length })).filter(x => x.n >= 3).sort((a, b) => b.n - a.n);
      const ok = new Set(SERIES.map(x => x.name)); all.forEach(v => { v._s = v._s.filter(n => ok.has(n)); });
      $("abN").textContent = nf(all.length); $("abC").textContent = new Set(all.map(v => v.category).filter(Boolean)).size; $("abS").textContent = SERIES.length;
      route(); achStart();
    })
    .catch(() => { route(); $("grid").innerHTML = `<div class="empty"><b>목록을 불러오지 못했어요</b>잠시 뒤 새로고침해 주세요.</div>`; });
})();
