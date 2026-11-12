/* 잉여맨 추억자료실 - 동작 */
(function () {
  "use strict";
  const PAGE = 48;            // 한 번에 보여 주는 영상 수
  const RECENT_MAX = 40;      // 최근 본 영상 보관 개수
  const COLORS = ["#2f6fdf", "#c2452d", "#2c8a57", "#b7791f", "#7a4fd0", "#c43b7a",
                  "#1c8c9c", "#5b6b2f", "#8a5a3c", "#4a5a86", "#d0561f", "#6a3fa0"];

  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const SITE = window.SITE || {};
  const CATS = SITE.categories || [];

  let all = [], tab = "all", cat = "", shown = PAGE;
  let favs = new Set(store.get("favs", []));
  let recent = store.get("recent", []);
  let view = store.get("view", "grid") === "rows" ? "rows" : "grid";
  let current = null;

  const key = v => (v.url || "") + "|" + (v.title || "");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "#";
  const year = v => (v.date || "").slice(0, 4);
  const dateText = v => (v.date || "").replace(/-/g, ".");
  function color(c) {
    let i = CATS.indexOf(c);
    if (i < 0) { i = 0; for (const ch of String(c || "")) i = (i * 31 + ch.charCodeAt(0)) % COLORS.length; }
    return COLORS[i % COLORS.length];
  }
  function ytId(v) {
    const s = v.youtube || v.url || "";
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? m[1] : null;
  }
  function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2400); }

  /* ── 목록 고르기 ── */
  function pool() {
    if (tab === "fav") return all.filter(v => favs.has(key(v)));
    if (tab === "recent") { const m = new Map(all.map(v => [key(v), v])); return recent.map(k => m.get(k)).filter(Boolean); }
    return all;
  }
  function filtered() {
    const q = $("q").value.trim().toLowerCase(), y = $("year").value, s = $("sort").value;
    const list = pool().filter(v => (!cat || v.category === cat) && (!y || year(v) === y) && (!q || (v.title || "").toLowerCase().includes(q)));
    if (tab === "recent" && s === "new") return list;   // 최근 본 순서 그대로
    return list.sort((a, b) => s === "title" ? (a.title || "").localeCompare(b.title || "", "ko")
      : s === "old" ? (a.date || "").localeCompare(b.date || "") : (b.date || "").localeCompare(a.date || ""));
  }

  /* ── 그리기 ── */
  function thumbHtml(v) {
    if (v.thumb) return `<img src="${esc(v.thumb)}" alt="" loading="lazy">`;
    return `<div class="tape"><span class="tape-l">${esc(v.category || "다시보기")}</span><span class="tape-y">${esc(year(v) || "")}</span></div>`;
  }
  function cardHtml(v) {
    const k = key(v), on = favs.has(k), c = color(v.category);
    return `<article class="card" data-k="${esc(k)}" style="--c:${c}">
      <a href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer">
        <div class="thumb">${thumbHtml(v)}${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ""}</div>
        <div class="txt">
          <h3>${esc(v.title)}</h3>
          <div class="meta"><span class="c">${esc(v.category || "기타")}</span><time>${esc(dateText(v))}</time>${recent.includes(k) && tab !== "recent" ? `<span class="seen">봤어요</span>` : ""}</div>
        </div>
      </a>
      <div class="acts">
        <button class="ic heart ${on ? "on" : ""}" type="button" aria-label="${on ? "즐겨찾기에서 빼기" : "즐겨찾기에 담기"}" title="즐겨찾기">${on ? "♥" : "♡"}</button>
        <button class="ic rep" type="button" aria-label="썸네일 제보" title="썸네일 제보"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button>
      </div>
    </article>`;
  }
  function emptyHtml() {
    const q = $("q").value.trim();
    if (!all.length) return `<div class="empty"><b>아직 등록된 영상이 없어요</b>곧 채워질 예정이에요.</div>`;
    if (tab === "fav" && !favs.size) return `<div class="empty"><b>즐겨찾기가 비어 있어요</b>영상의 하트(♡)를 누르면 여기에 모여요.<br><a class="btn" href="#">영상 보러 가기</a></div>`;
    if (tab === "recent" && !recent.length) return `<div class="empty"><b>아직 본 영상이 없어요</b>영상을 눌러 보면 여기에 차례로 쌓여요.<br><a class="btn" href="#">영상 보러 가기</a></div>`;
    return `<div class="empty"><b>${q ? "‘" + esc(q) + "’ 검색 결과가 없어요" : "조건에 맞는 영상이 없어요"}</b>검색어를 줄이거나 분류와 연도를 풀어 보세요.<br><button class="btn" type="button" data-reset>조건 모두 풀기</button></div>`;
  }
  function renderCats() {
    const p = pool(), n = {};
    p.forEach(v => { n[v.category] = (n[v.category] || 0) + 1; });
    const extra = Object.keys(n).filter(c => c && c !== "undefined" && !CATS.includes(c)).sort();
    $("cats").innerHTML = ["", ...CATS, ...extra].map(c => {
      const cnt = c ? (n[c] || 0) : p.length;
      return `<button class="cat ${c === cat ? "on" : ""} ${c && !cnt ? "zero" : ""}" type="button" data-c="${esc(c)}" style="--c:${c ? color(c) : "var(--ink)"}"><i></i><span>${c ? esc(c) : "전체"}</span><em>${cnt}</em></button>`;
    }).join("");
  }
  function renderYears() {
    const ys = [...new Set(all.map(year).filter(Boolean))].sort().reverse(), cur = $("year").value;
    $("year").innerHTML = `<option value="">모든 연도</option>` + ys.map(y => `<option value="${esc(y)}">${esc(y)}년</option>`).join("");
    $("year").value = ys.includes(cur) ? cur : "";
  }
  function render() {
    const list = filtered();
    $("nFav").textContent = favs.size;
    $("nRecent").textContent = recent.filter(k => all.some(v => key(v) === k)).length;
    $("count").textContent = "영상 " + list.length + "개";
    $("grid").className = "grid" + (view === "rows" ? " rows" : "");
    $("vGrid").classList.toggle("on", view === "grid");
    $("vList").classList.toggle("on", view === "rows");
    $("grid").innerHTML = list.slice(0, shown).map(cardHtml).join("") || emptyHtml();
    $("more").hidden = list.length <= shown;
    $("random").hidden = list.length < 2;
    $("intro").hidden = tab !== "all";
    renderCats();
  }
  function reset() { shown = PAGE; render(); }

  /* ── 화면 바꾸기 (다시보기 / 즐겨찾기 / 최근 본 영상 / 이용방법) ── */
  function route() {
    const h = location.hash.replace("#", "");
    const next = ["fav", "recent", "guide"].includes(h) ? h : "all";
    if (next !== tab) cat = "";
    tab = next;
    $("viewGuide").hidden = tab !== "guide";
    $("viewList").hidden = tab === "guide";
    document.querySelectorAll(".tab").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    if (tab !== "guide") reset();
    window.scrollTo(0, 0);
  }

  /* ── 영상 열기 ── */
  function markSeen(v) {
    const k = key(v);
    recent = [k, ...recent.filter(x => x !== k)].slice(0, RECENT_MAX);
    store.set("recent", recent);
  }
  function appUrl(href) {   // 안드로이드: 네이버 카페 앱으로 열기 (앱이 없으면 브라우저로)
    try {
      const u = new URL(href);
      if (u.protocol !== "https:" || !/(^|\.)cafe\.naver\.com$/.test(u.hostname)) return null;
      return "intent://" + u.host + u.pathname + u.search + "#Intent;scheme=https;package=com.nhn.android.navercafe;S.browser_fallback_url=" + encodeURIComponent(href) + ";end";
    } catch (e) { return null; }
  }
  const isAndroid = /Android/i.test(navigator.userAgent);
  function goCafe(e, href) {
    if (isAndroid && !e.ctrlKey && !e.metaKey && !e.shiftKey) { const u = appUrl(href); if (u) { e.preventDefault(); location.href = u; } }
  }
  function openModal(v, picked) {
    current = v;
    const c = color(v.category), id = ytId(v), sheet = $("modal").querySelector(".sheet");
    sheet.style.setProperty("--c", c);
    $("mScreen").innerHTML = id
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : thumbHtml(v);
    $("mScreen").classList.toggle("still", !id);
    $("mCat").textContent = v.category || "기타";
    $("mTitle").textContent = v.title || "";
    $("mDate").textContent = dateText(v);
    $("mGo").href = safeUrl(v.url);
    $("mGo").textContent = id ? "원본 글 열기" : "카페에서 보기";
    $("mGo").hidden = safeUrl(v.url) === "#";
    $("mAgain").hidden = !picked;
    syncModalFav();
    $("modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("mClose").focus();
    if (id) { markSeen(v); render(); }
  }
  function syncModalFav() { if (current) $("mFav").textContent = favs.has(key(current)) ? "♥ 즐겨찾기에서 빼기" : "♡ 즐겨찾기에 담기"; }
  function closeModal() { $("modal").hidden = true; $("mScreen").innerHTML = ""; document.body.style.overflow = ""; current = null; }
  function pickRandom() {
    const list = filtered().filter(v => !current || key(v) !== key(current));
    if (list.length) openModal(list[Math.floor(Math.random() * list.length)], true);
  }
  function toggleFav(k) {
    if (favs.has(k)) { favs.delete(k); toast("즐겨찾기에서 뺐어요"); } else { favs.add(k); toast("즐겨찾기에 담았어요"); }
    store.set("favs", [...favs]); render(); syncModalFav();
  }
  function report(v) {
    if (!SITE.repo) return toast("썸네일 제보는 준비 중이에요");
    const body = "**영상**: " + v.title + "\n**날짜**: " + (v.date || "") + "\n**카페 글**: " + (v.url || "") +
      "\n\n**썸네일 이미지** (아래에 이미지를 끌어다 놓거나 주소를 붙여넣어 주세요)\n\n";
    window.open("https://github.com/" + SITE.repo + "/issues/new?labels=thumbnail&title=" + encodeURIComponent("[썸네일] " + v.title) + "&body=" + encodeURIComponent(body), "_blank", "noopener");
  }

  /* ── 누르기 ── */
  $("grid").addEventListener("click", e => {
    if (e.target.closest("[data-reset]")) { $("q").value = ""; $("year").value = ""; cat = ""; return reset(); }
    const card = e.target.closest(".card"); if (!card) return;
    const v = all.find(x => key(x) === card.dataset.k); if (!v) return;
    if (e.target.closest(".heart")) return toggleFav(key(v));
    if (e.target.closest(".rep")) return report(v);
    const link = e.target.closest("a"); if (!link) return;
    if (ytId(v)) { e.preventDefault(); return openModal(v, false); }   // 유튜브 영상은 사이트 안에서 재생
    markSeen(v); goCafe(e, link.href); setTimeout(render, 300);
  });
  $("cats").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; cat = b.dataset.c; reset(); });
  $("q").addEventListener("input", () => { if (tab === "guide") location.hash = ""; reset(); });
  $("year").addEventListener("change", reset);
  $("sort").addEventListener("change", reset);
  $("more").addEventListener("click", () => { shown += PAGE; render(); });
  $("random").addEventListener("click", pickRandom);
  $("vGrid").addEventListener("click", () => { view = "grid"; store.set("view", view); render(); });
  $("vList").addEventListener("click", () => { view = "rows"; store.set("view", view); render(); });
  $("mAgain").addEventListener("click", pickRandom);
  $("mFav").addEventListener("click", () => current && toggleFav(key(current)));
  $("mGo").addEventListener("click", e => { if (current) { markSeen(current); goCafe(e, $("mGo").href); setTimeout(render, 300); } });
  $("mClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("modal").hidden) closeModal();
    if (e.key === "/" && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); $("q").focus(); }
  });
  window.addEventListener("hashchange", route);

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
    let h = 0; for (const c of text + (n.link || "")) h = (h * 31 + c.charCodeAt(0)) | 0;
    const id = String(h), closable = n.closable === true;
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
    .then(data => { all = Array.isArray(data) ? data : []; renderYears(); route(); })
    .catch(() => { route(); $("grid").innerHTML = `<div class="empty"><b>목록을 불러오지 못했어요</b>잠시 뒤 새로고침해 주세요.</div>`; });
})();
