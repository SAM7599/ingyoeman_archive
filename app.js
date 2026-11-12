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

  let all = [], tab = "all", cat = "", shown = PAGE, todayKey = null, menuFor = null, current = null;
  let favs = new Set(store.get("favs", []));
  let recent = store.get("recent", []);   // 열어본 영상 (자동)
  let view = store.get("view2", "grid") === "rows" ? "rows" : "grid";
  const savedSort = store.get("sort", "new");
  $("sort").value = ["new", "old", "title"].includes(savedSort) ? savedSort : "new";

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
  const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
  const OUT = `<svg class="out" viewBox="0 0 24 24"><path d="M9 6h9v9M18 6L7 17"/></svg>`;
  const DOTS = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;

  /* ── 목록 고르기 ── */
  function pool() {
    if (tab === "fav") return all.filter(v => favs.has(key(v)));
    if (tab === "recent") return recent.map(byKey).filter(Boolean);
    return all;
  }
  const words = () => $("q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  function filtered() {
    const w = words(), s = $("sort").value;
    const list = pool().filter(v => {
      if (cat && cat !== "*" && v.category !== cat) return false;
      const hay = ((v.title || "") + " " + (v.category || "")).toLowerCase();
      return w.every(x => hay.includes(x));
    });
    if (tab === "recent" && s === "new") return list;   // 본 순서 그대로
    return list.sort((a, b) => s === "title" ? (a.title || "").localeCompare(b.title || "", "ko") : s === "old" ? order(a) - order(b) : order(b) - order(a));
  }
  const isHome = () => tab === "all" && !cat && !words().length;

  /* ── 그리기 ── */
  function mark(title) {   // 검색어에 색칠
    const w = words(), t = String(title || "");
    if (!w.length) return esc(t);
    const re = new RegExp("(" + w.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    return t.split(re).map((p, i) => i % 2 ? "<mark>" + esc(p) + "</mark>" : esc(p)).join("");
  }
  const picHtml = (v, hl) => v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : `<div class="ph"><b>${hl ? mark(v.title) : esc(v.title)}</b></div>`;   // 썸네일이 없으면 제목 카드
  function cardHtml(v, shelf) {
    const k = key(v), on = favs.has(k), seen = recent.includes(k) && tab !== "recent" && !shelf, rows = view === "rows" && !shelf;
    const info = `<div class="t"><h3>${shelf ? esc(v.title) : mark(v.title)}</h3><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span></div>`;
    const dots = `<button class="dots" type="button" aria-label="더 보기 메뉴" aria-haspopup="menu">${DOTS}</button>`;
    const heart = `<button class="heart ${on ? "on" : ""}" type="button" aria-label="${on ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기"}" title="즐겨찾기">${HEART}</button>`;
    const thumb = `<div class="thumb" style="--g:${grad(v.category)}">${picHtml(v, !shelf)}${seen ? `<span class="seen">열어봄</span>` : ""}${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ""}</div>`;
    const a = `href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer"`;
    return `<article class="card ${v.thumb ? "" : "no-thumb"}" data-k="${esc(k)}">` + (rows
      ? `<a ${a}>${thumb}<div class="info">${info}</div><span class="go">${ytId(v) ? "바로 보기" : "다시보기" + OUT}</span></a>${heart}${dots}`
      : `<a ${a}>${thumb}</a><div class="info">${info}${dots}</div>${heart}`) + `</article>`;
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
    $("chips").innerHTML = (home ? chip("", "홈") + chip("*", "전체 영상", p.length) : chip("", "전체", p.length)) +
      [...CATS, ...extra].map(c => chip(c, c, n[c] || 0, !n[c] && c !== cat)).join("");
  }
  function renderToday() {
    const box = $("today");
    const v = isHome() && all.length ? (byKey(todayKey) || all[hash(new Date().toDateString()) % all.length]) : null;
    box.hidden = !v; if (!v) return;
    todayKey = key(v); box.dataset.k = todayKey;
    box.innerHTML = `<div class="hero-bg" style="--g:${grad(v.category)}">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ""}</div>
      <div class="hero-in"><span class="label">오늘의 다시보기</span><h2>${esc(v.title)}</h2>
      <p class="hero-meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span><span>${ytId(v) ? "바로 재생돼요" : "네이버 카페에서 재생돼요"}</span></p>
      <div class="acts"><a class="btn primary" data-go href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer">${ytId(v) ? "바로 보기" : "다시보기" + OUT}</a>
      <button class="btn glass" type="button" data-fav>${favs.has(todayKey) ? "♥ 담았어요" : "♡ 즐겨찾기"}</button>
      ${all.length > 1 ? `<button class="btn glass" type="button" data-next>다른 영상</button>` : ""}</div></div>`;
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
    $("home").innerHTML =
      rowHtml("최근 열어본 영상", recent.map(byKey).filter(Boolean), `<a class="more" href="#recent">전체 보기</a>`) +
      rowHtml("즐겨찾기", sorted.filter(v => favs.has(key(v))), `<a class="more" href="#fav">전체 보기</a>`) +
      [...CATS, ...extra].map(c => rowHtml(c, sorted.filter(v => v.category === c), `<button class="more" type="button" data-cat="${esc(c)}">전체 보기</button>`, c)).join("") ||
      `<div class="empty"><b>아직 등록된 영상이 없어요</b>곧 채워질 예정이에요.</div>`;
    $("home").querySelectorAll(".rail-wrap").forEach(syncArrows);
  }
  function syncArrows(w) {
    const r = w.querySelector(".rail");
    w.querySelector(".arr.l").hidden = r.scrollLeft < 8;
    w.querySelector(".arr.r").hidden = r.scrollLeft + r.clientWidth > r.scrollWidth - 8;
  }
  function render() {
    const home = isHome(), list = home ? [] : filtered(), q = $("q").value.trim();
    document.querySelectorAll(".nFav").forEach(el => { el.textContent = favs.size || ""; });
    $("home").hidden = !home; $("browse").hidden = home;
    renderChips(); renderToday();
    if (home) return renderHome();
    $("pageH").textContent = q ? "검색 결과" : tab === "fav" ? "즐겨찾기" : tab === "recent" ? "최근 열어본 영상" : cat && cat !== "*" ? cat : "전체 영상";
    $("count").textContent = list.length + "개";
    $("grid").className = "grid" + (view === "rows" ? " rows" : "");
    $("vGrid").classList.toggle("on", view === "grid"); $("vList").classList.toggle("on", view === "rows");
    $("grid").innerHTML = list.slice(0, shown).map(v => cardHtml(v)).join("") || emptyHtml();
    $("sentinel").hidden = list.length <= shown;
  }
  function reset() { shown = PAGE; render(); }

  /* ── 화면 바꾸기 ── */
  function route() {
    let h = location.hash.replace("#", ""); try { h = decodeURIComponent(h); } catch (e) {}
    const next = ["fav", "recent", "guide"].includes(h) ? h : "all";
    if (next !== tab) cat = "";
    tab = next;
    $("viewGuide").hidden = tab !== "guide"; $("viewList").hidden = tab === "guide";
    document.querySelectorAll(".tab").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    closeMenu();
    if (tab !== "guide") reset();
    if (h.startsWith("v=")) { const v = all.find(x => vid(x) === h.slice(2)); if (v) openModal(v); else if (all.length) toast("영상을 찾지 못했어요"); }
    else { if (!$("modal").hidden) closeModal(true); window.scrollTo(0, 0); }
  }

  /* ── 영상 열기 ── */
  function markSeen(v) { const k = key(v); recent = [k, ...recent.filter(x => x !== k)].slice(0, RECENT_MAX); store.set("recent", recent); }
  function appUrl(href) {   // 안드로이드: 네이버 카페 앱으로 열기 (앱이 없으면 브라우저로)
    try {
      const u = new URL(href);
      if (u.protocol !== "https:" || !/(^|\.)cafe\.naver\.com$/.test(u.hostname)) return null;
      return "intent://" + u.host + u.pathname + u.search + "#Intent;scheme=https;package=com.nhn.android.navercafe;S.browser_fallback_url=" + encodeURIComponent(href) + ";end";
    } catch (e) { return null; }
  }
  const isAndroid = /Android/i.test(navigator.userAgent);
  function follow(e, v, href) {   // 영상 링크를 눌렀을 때
    if (ytId(v) && $("modal").hidden) { e.preventDefault(); return openModal(v); }   // 유튜브 영상은 사이트 안에서 재생
    markSeen(v);
    if (isAndroid && !e.ctrlKey && !e.metaKey && !e.shiftKey) { const u = appUrl(href); if (u) { e.preventDefault(); location.href = u; } }
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
    syncModalFav();
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
    store.set("favs", [...favs]); render(); syncModalFav();
  }
  function share(v) {
    const url = location.origin + location.pathname + "#v=" + vid(v);
    const done = () => toast("링크를 복사했어요"), fail = () => toast("복사하지 못했어요");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail);
    else { const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy") ? done() : fail(); } catch (e) { fail(); } t.remove(); }
  }
  function report(v) {
    if (!SITE.repo) return toast("썸네일 제보는 준비 중이에요");
    const body = "**영상**: " + v.title + "\n**카페 글**: " + (v.url || "") + "\n\n**썸네일 이미지** (아래에 이미지를 끌어다 놓거나 주소를 붙여넣어 주세요)\n\n";
    window.open("https://github.com/" + SITE.repo + "/issues/new?labels=thumbnail&title=" + encodeURIComponent("[썸네일] " + v.title) + "&body=" + encodeURIComponent(body), "_blank", "noopener");
  }

  /* ── 점 세 개 메뉴 ── */
  function openMenu(btn, v) {
    const m = $("menu"), k = key(v);
    menuFor = v; openMenu.y = window.scrollY;
    m.querySelector('[data-act="fav"]').textContent = favs.has(k) ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기";
    m.querySelector('[data-act="seen"]').hidden = !recent.includes(k);
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
    else if (a === "fav") toggleFav(k);
    else if (a === "report") report(v);
    else if (a === "seen") {
      recent = recent.filter(x => x !== k); store.set("recent", recent); toast("열어본 기록에서 지웠어요"); render();
    }
  });

  /* ── 누르기 ── */
  function onCards(e) {
    if (e.target.closest("[data-reset]")) { $("q").value = ""; cat = ""; return reset(); }
    const card = e.target.closest(".card"); if (!card) return;
    const v = byKey(card.dataset.k); if (!v) return;
    if (e.target.closest(".heart")) return toggleFav(key(v));
    const d = e.target.closest(".dots");
    if (d) { e.stopPropagation(); return menuFor === v ? closeMenu() : openMenu(d, v); }
    const link = e.target.closest("a"); if (link) follow(e, v, link.href);
  }
  $("grid").addEventListener("click", onCards);
  $("home").addEventListener("click", e => {
    const m = e.target.closest("[data-cat]"); if (m) { cat = m.dataset.cat; reset(); return window.scrollTo(0, 0); }
    const a = e.target.closest(".arr"); if (a) { const r = a.parentNode.querySelector(".rail"); return r.scrollBy({ left: +a.dataset.dir * r.clientWidth * 0.85, behavior: "smooth" }); }
    onCards(e);
  });
  $("home").addEventListener("scroll", e => { const w = e.target.closest && e.target.closest(".rail-wrap"); if (w) syncArrows(w); }, true);
  $("today").addEventListener("click", e => {
    const v = byKey($("today").dataset.k); if (!v) return;
    const go = e.target.closest("[data-go]"); if (go) return follow(e, v, go.href);
    if (e.target.closest("[data-fav]")) return toggleFav(key(v));
    if (e.target.closest("[data-next]")) { const rest = all.filter(x => key(x) !== todayKey); todayKey = key(rest[Math.floor(Math.random() * rest.length)]); renderToday(); }
  });
  $("chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; cat = b.dataset.c; if (b.dataset.c === "" && tab === "all") $("q").value = ""; reset(); });
  $("q").addEventListener("input", () => { if (tab === "guide") location.hash = ""; reset(); });
  $("sort").addEventListener("change", () => { store.set("sort", $("sort").value); reset(); });
  $("vGrid").addEventListener("click", () => { view = "grid"; store.set("view2", view); render(); });
  $("vList").addEventListener("click", () => { view = "rows"; store.set("view2", view); render(); });
  $("mFav").addEventListener("click", () => current && toggleFav(key(current)));
  $("mShare").addEventListener("click", () => current && share(current));
  $("mGo").addEventListener("click", e => current && follow(e, current, $("mGo").href));
  $("mClose").addEventListener("click", () => closeModal());
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  $("totop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.addEventListener("click", e => { if (!$("menu").hidden && !e.target.closest(".menu")) closeMenu(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("menu").hidden) closeMenu(); else if (!$("modal").hidden) closeModal();
      else if (document.activeElement === $("q")) { $("q").value = ""; $("q").blur(); reset(); }
    }
    if (e.key === "/" && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); $("q").focus(); }
  });
  window.addEventListener("scroll", () => { $("totop").hidden = window.scrollY < 700; if (!$("menu").hidden && Math.abs(window.scrollY - openMenu.y) > 60) closeMenu(); }, { passive: true });
  window.addEventListener("resize", () => { closeMenu(); $("home").querySelectorAll(".rail-wrap").forEach(syncArrows); });
  window.addEventListener("hashchange", route);
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { if (es[0].isIntersecting && !$("sentinel").hidden) { shown += PAGE; render(); } }, { rootMargin: "600px" }).observe($("sentinel"));

  document.querySelectorAll("[data-feedback]").forEach(a => { if (/^https?:\/\//i.test(SITE.feedback || "")) a.href = SITE.feedback; else a.hidden = true; });
  document.querySelectorAll("[data-cafe]").forEach(a => { if (/^https?:\/\//i.test(SITE.cafe || "")) a.href = SITE.cafe; else a.hidden = true; });

  /* ── 밝은 화면 / 어두운 화면 ── */
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); $("theme").textContent = t === "dark" ? "☀" : "☾"; }
  applyTheme(document.documentElement.getAttribute("data-theme"));
  $("theme").addEventListener("click", () => {
    const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(t); try { localStorage.setItem("theme", t); } catch (e) {}
  });

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
    .then(data => { all = Array.isArray(data) ? data : []; all.forEach((v, i) => { v._i = i; }); route(); })
    .catch(() => { route(); $("grid").innerHTML = `<div class="empty"><b>목록을 불러오지 못했어요</b>잠시 뒤 새로고침해 주세요.</div>`; });
})();
