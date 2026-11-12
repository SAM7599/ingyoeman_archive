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
  const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
  const OUT = `<svg class="out" viewBox="0 0 24 24"><path d="M9 6h9v9M18 6L7 17"/></svg>`;
  const CARD = `<svg class="ci" viewBox="0 0 24 24"><rect x="6.5" y="3.5" width="11" height="17" rx="2.2"/><path d="M12 9.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/></svg>`;
  const DOTS = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;

  /* ── 목록 고르기 ── */
  function pool() {
    if (tab === "fav") return all.filter(v => favs.has(key(v)));
    if (tab === "recent") return recent.map(byKey).filter(Boolean);
    if (tab === "rank") return ranked(all);
    if (tab === "series") return ser ? all.filter(v => v._s.includes(ser)) : [];
    return all;
  }
  const ranked = list => list.filter(v => v.likes > 0).sort((a, b) => b.likes - a.likes || order(a) - order(b));   // 카페 좋아요 많은 순
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
    if (s === "likes") return list.sort((a, b) => (b.likes || 0) - (a.likes || 0) || order(b) - order(a));
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
  function cardHtml(v, shelf, rank) {
    const k = key(v), on = favs.has(k), seen = recent.includes(k) && tab !== "recent" && !shelf, rows = (view === "rows" || tab === "rank") && !shelf;
    const sn = v._s && v._s.find(n => n !== ser), showLikes = v.likes > 0 && (rank || $("sort").value === "likes" && !shelf);
    const meta = `<div class="meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span>${showLikes ? `<span class="lk">♥ ${v.likes}</span>` : ""}${repCount(v) ? `<span class="rp">썸네일 제보 ${repCount(v)}건</span>` : ""}${sn ? `<span class="ser" role="link" tabindex="0" data-ser="${esc(sn)}">${esc(sn)}</span>` : ""}</div>`;
    const info = `<div class="t"><h3>${shelf ? esc(v.title) : mark(v.title)}</h3>${meta}</div>`;
    const dots = `<button class="dots" type="button" aria-label="더 보기 메뉴" aria-haspopup="menu">${DOTS}</button>`;
    const heart = `<button class="heart ${on ? "on" : ""} ${k === popKey ? "pop" : ""}" type="button" aria-label="${on ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기"}" title="즐겨찾기">${HEART}</button>`;
    const thumb = `<div class="thumb" style="--g:${grad(v.category)}">${picHtml(v, !shelf)}${rank && !rows ? `<span class="rkb">${rank}</span>` : seen ? `<span class="seen">열어봄</span>` : ""}${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ""}</div>`;
    const a = `href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer"`;
    return `<article class="card ${v.thumb ? "" : "no-thumb"}" data-k="${esc(k)}">` + (rows
      ? `${rank ? `<span class="rk ${rank <= 3 ? "top" : ""}">${rank}</span>` : ""}<a ${a}>${thumb}<div class="info">${info}</div><span class="go">${ytId(v) ? "바로 보기" : "다시보기" + OUT}</span></a>${heart}${dots}`
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
      <p class="hero-meta"><span class="cat-dot" style="--c:${dot(v.category)}">${esc(v.category || "기타")}</span><span>${ytId(v) ? "바로 재생돼요" : "네이버 카페에서 재생돼요"}</span></p>
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
      : rank ? "네이버 카페에서 좋아요를 많이 받은 순서예요. 목록을 정리한 때의 숫자라 지금과 조금 다를 수 있어요." : "";
    $("pageNote").hidden = !note; $("pageNote").textContent = note;
    $("grid").className = tiles ? "grid tiles" : "grid" + (view === "rows" || rank ? " rows" : "");
    $("vGrid").classList.toggle("on", view === "grid"); $("vList").classList.toggle("on", view === "rows");
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
    const next = ["fav", "recent", "guide", "rank", "series"].includes(h) ? h : h.startsWith("series=") ? "series" : "all";
    const nextSer = h.startsWith("series=") ? h.slice(7) : "";
    if (next !== tab || nextSer !== ser) cat = "";
    if (nextSer !== ser) $("q").value = "";
    tab = next; ser = nextSer;
    $("viewGuide").hidden = tab !== "guide"; $("viewList").hidden = tab === "guide";
    document.querySelectorAll(".tab").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    const pg = tab === "guide" ? $("viewGuide") : $("viewList"); pg.classList.remove("enter"); void pg.offsetWidth; pg.classList.add("enter");
    if (!$("gacha").hidden) closeGacha();
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
    store.set("favs", [...favs]); popKey = favs.has(k) ? k : null; render(); popKey = null; syncModalFav(); syncGachaFav();
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

  /* ── 랜덤 뽑기 (카드 뽑기 연출) ── */
  const calm = () => document.documentElement.getAttribute("data-motion") === "off";
  const tierOf = v => (v.likes || 0) >= 10 ? ["legend", "전설"] : (v.likes || 0) >= 5 ? ["rare", "희귀"] : ["normal", "일반"];
  function drawPool() { const l = isHome() || tab === "guide" ? all : filtered(); return l.length > 1 ? l : all; }
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
    closeMenu(); gBusy = false;
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
    $("gTitle").textContent = "두근두근…";
    card.classList.add("shake");
    setTimeout(() => {
      card.classList.remove("shake"); card.classList.add("flip");
      if (!quick) burst(tier);
      setTimeout(() => {
        card.classList.add("done");
        $("gTitle").textContent = tier === "legend" ? "전설 카드가 나왔어요!" : tier === "rare" ? "희귀 카드예요!" : "이 영상이 뽑혔어요";
        $("gActs").classList.add("show"); gBusy = false;
      }, quick ? 0 : 620);
    }, quick ? 0 : tier === "legend" ? 1500 : tier === "rare" ? 1150 : 850);
  }
  $("gCard").addEventListener("click", gachaGo);
  $("gCard").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); gachaGo(); } });
  $("gAgain").addEventListener("click", () => { if (gBusy) return; gachaReady(); setTimeout(gachaGo, calm() ? 0 : 260); });
  $("gFav").addEventListener("click", () => gv && toggleFav(key(gv)));
  $("gGo").addEventListener("click", e => { if (gv) { const v = gv; if (ytId(v)) closeGacha(); follow(e, v, $("gGo").href); } });
  $("gClose").addEventListener("click", closeGacha);
  $("gacha").addEventListener("click", e => { if (e.target === $("gacha")) closeGacha(); });

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

  /* ── 점 세 개 메뉴 ── */
  function openMenu(btn, v) {
    const m = $("menu"), k = key(v);
    menuFor = v; openMenu.y = window.scrollY;
    m.querySelector('[data-act="fav"]').textContent = favs.has(k) ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기";
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
    const link = e.target.closest("a"); if (link) follow(e, v, link.href);
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
  $("q").addEventListener("input", () => { if (tab === "guide") location.hash = ""; reset(); });
  $("sort").addEventListener("change", () => { store.set("sort", $("sort").value); reset(); });
  $("vGrid").addEventListener("click", () => { view = "grid"; store.set("view2", view); render(); });
  $("vList").addEventListener("click", () => { view = "rows"; store.set("view2", view); render(); });
  $("mFav").addEventListener("click", () => current && toggleFav(key(current)));
  $("mShare").addEventListener("click", () => current && share(current));
  $("mGo").addEventListener("click", e => current && follow(e, current, $("mGo").href));
  $("mClose").addEventListener("click", () => closeModal());
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  $("totop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }));
  document.addEventListener("click", e => { if (!$("menu").hidden && !e.target.closest(".menu")) closeMenu(); if (!$("setMenu").hidden && !e.target.closest(".menu")) closeSet(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("setMenu").hidden) closeSet(); else if (!$("menu").hidden) closeMenu(); else if (!$("modal").hidden) closeModal(); else if (!$("gacha").hidden) closeGacha();
      else if (document.activeElement === $("q")) { $("q").value = ""; $("q").blur(); reset(); }
    }
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-ser]")) { e.preventDefault(); location.hash = "series=" + encodeURIComponent(e.target.dataset.ser); }
    if (e.key === "/" && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); $("q").focus(); }
  });
  window.addEventListener("scroll", () => { $("totop").hidden = window.scrollY < 700; if (!$("menu").hidden && Math.abs(window.scrollY - openMenu.y) > 60) closeMenu(); }, { passive: true });
  window.addEventListener("resize", () => { closeMenu(); closeSet(); $("home").querySelectorAll(".rail-wrap").forEach(syncArrows); });
  window.addEventListener("hashchange", route);
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { if (es[0].isIntersecting && !$("sentinel").hidden) { shown += PAGE; render(); } }, { rootMargin: "600px" }).observe($("sentinel"));

  document.querySelectorAll("[data-feedback]").forEach(a => { if (/^https?:\/\//i.test(SITE.feedback || "")) a.href = SITE.feedback; else a.hidden = true; });
  document.querySelectorAll("[data-cafe]").forEach(a => { if (/^https?:\/\//i.test(SITE.cafe || "")) a.href = SITE.cafe; else a.hidden = true; });

  /* ── 화면 설정 (어두운 화면 / 움직임 줄이기) ── */
  const root = document.documentElement;
  function syncSet() {
    $("theme").setAttribute("aria-checked", root.getAttribute("data-theme") === "dark");
    $("motion").setAttribute("aria-checked", root.getAttribute("data-motion") === "off");
  }
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
      route();
    })
    .catch(() => { route(); $("grid").innerHTML = `<div class="empty"><b>목록을 불러오지 못했어요</b>잠시 뒤 새로고침해 주세요.</div>`; });
})();
