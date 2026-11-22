/* 잉여맨 추억자료실: 처음 오신 분께 보여 드리는 사용법 안내 (PC·휴대폰 공용)
   - 처음 한 번만 자동으로 나와요. 설정(⚙) 메뉴의 "사용법 보기"에서 다시 볼 수 있어요. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "tour1", de = document.documentElement, calm = function () { return de.getAttribute("data-motion") === "off"; };
  var seen = function () { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } };
  var mark = function () { try { localStorage.setItem(KEY, "1"); } catch (e) {} };
  var mobile = function () { return matchMedia("(max-width:860px)").matches; };
  var pick = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? e : null; };

  var STEPS = [
    { t: "찾는 영상이 있나요?", d: function () { return "여기에 제목이나 분류를 입력해 검색해요. 자동완성과 최근 검색어도 나와요." + (mobile() ? "" : " 키보드의 / 키를 누르면 바로 검색창으로 와요."); }, el: function () { return pick(".top .search"); } },
    { t: "분류로 골라 보세요", d: function () { return "분류 버튼을 누르면 그 분류의 영상만 모아 볼 수 있어요." + (mobile() ? " 옆으로 밀면 더 많은 분류가 나와요." : ""); }, el: function () { return pick("#chips"); } },
    { t: "영상을 눌러 보세요", d: function () { return "영상을 누르면 바로 재생돼요. 하트(♡)를 누르면 즐겨찾기에 담겨요. 카페에서만 열리는 영상은 카페 가입이 필요하다고 안내가 나와요."; }, el: function () { return pick("#viewList .card"); } },
    { t: "메뉴로 이동해요", d: function () { return "인기 랭킹, 시리즈, 즐겨찾기, 열어본 영상으로 이동할 수 있어요."; }, el: function () { return mobile() ? pick(".bottom") : pick(".top .nav"); } },
    { t: "불편한 점은 알려 주세요", d: function () { return "버그나 건의, 잘못된 분류는 \"제보하기\" 버튼으로 카페 「다시보기 사이트 제보」 게시판에 남겨 주세요. 이 안내는 오른쪽 위 설정(⚙) 메뉴의 \"사용법 보기\"에서 다시 볼 수 있어요."; }, el: function () { return null; } }
  ];

  var root = null, hole = null, tip = null, idx = 0, steps = [], cur = null;

  function close(done) {
    if (!root) return;
    window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("keydown", onKey, true);
    root.remove(); root = hole = tip = null; mark();
    if (cur && cur.focus) try { cur.focus({ preventScroll: true }); } catch (e) {}
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { if (e.target && e.target.tagName === "BUTTON") return; e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }
  function go(d) {
    var n = idx + d;
    if (n < 0) return;
    if (n >= steps.length) return close(true);
    idx = n; draw();
  }
  function draw() {
    var s = steps[idx], last = idx === steps.length - 1, el = s.el();
    if (el) { try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch (e) {} }
    tip.innerHTML = '<div class="tr-dots" aria-hidden="true">' + steps.map(function (_, i) { return '<i' + (i === idx ? ' class="on"' : '') + '></i>'; }).join("") + '</div>'
      + '<h2 id="trT">' + s.t + '</h2><p>' + s.d() + '</p>'
      + '<div class="tr-b"><button type="button" class="tr-skip" data-k="skip">' + (last ? "닫기" : "건너뛰기") + '</button><span>'
      + (idx > 0 ? '<button type="button" class="tr-prev" data-k="prev">이전</button>' : "")
      + '<button type="button" class="tr-next" data-k="next">' + (last ? "시작하기" : "다음") + '</button></span></div>';
    var nb = tip.querySelector(".tr-next"); if (nb) nb.focus({ preventScroll: true });
    place();
  }
  function place() {
    if (!root || !tip) return;
    var s = steps[idx], el = s.el(), vw = window.innerWidth, vh = window.innerHeight, m = 12;
    var tw = Math.min(330, vw - 2 * m); tip.style.width = tw + "px";
    if (!el) { hole.style.cssText = "left:50%;top:50%;width:0;height:0;"; tip.style.left = (vw - tw) / 2 + "px"; tip.style.top = Math.max(m, (vh - tip.offsetHeight) / 2) + "px"; return; }
    var r = el.getBoundingClientRect(), pad = 6, x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(vw - 8, r.width + 2 * pad), h = Math.min(vh - 8, r.height + 2 * pad);
    hole.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;";
    var th = tip.offsetHeight, below = y + h + m + th <= vh - m, top = below ? y + h + m : y - m - th;
    if (top < m) top = Math.max(m, Math.min(vh - th - m, vh - th - m));   // 위아래 모두 좁으면 화면 아래쪽에 놓아요
    var left = Math.max(m, Math.min(vw - tw - m, x + w / 2 - tw / 2));
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function start() {
    if (root) return;
    mark(); idx = 0; cur = document.activeElement;
    var tn = $("tnPop"); if (tn) tn.hidden = true;   // 썸네일 제보 팝업이 겹치지 않게 (내일 다시 나와요)
    steps = STEPS.filter(function (s, i) { return i === STEPS.length - 1 || s.el(); });   // 화면에 없는 항목은 건너뛰어요
    root = document.createElement("div"); root.id = "tourBox"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "trT");
    if (calm()) root.className = "calm";
    hole = document.createElement("div"); hole.className = "tr-hole"; tip = document.createElement("div"); tip.className = "tr-tip";
    root.appendChild(hole); root.appendChild(tip); document.body.appendChild(root);
    root.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button[data-k]"); if (!b) return; var k = b.dataset.k; if (k === "next") go(1); else if (k === "prev") go(-1); else close(); });
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true); document.addEventListener("keydown", onKey, true);
    draw();
  }
  window.startTour = start;

  /* 튜토리얼이 나오기 전·나오는 동안에는 썸네일 제보 팝업이 뜨지 않게 해요 (내일부터 다시 나와요) */
  var tnp = $("tnPop");
  if (tnp && "MutationObserver" in window) new MutationObserver(function () { if (!tnp.hidden && root) tnp.hidden = true; }).observe(tnp, { attributes: true, attributeFilter: ["hidden"] });

  var rb = $("tour");
  if (rb) rb.addEventListener("click", function () {
    var m = $("setMenu"); if (m) m.hidden = true; var sb = $("set"); if (sb) sb.setAttribute("aria-expanded", "false");
    if (location.hash) location.hash = ""; window.scrollTo(0, 0); setTimeout(start, 250);
  });

  /* 처음 오신 분: 소개 화면·동의 창이 끝나고 첫 화면이 보이면 자동으로 시작해요 */
  if (seen()) return;
  var tries = 0, t = setInterval(function () {
    if (++tries > 240) return clearInterval(t);   // 2분 안에 조건이 안 맞으면 포기 (다음 방문 때 다시 시도)
    if (de.classList.contains("consent-on") || de.classList.contains("intro-on")) return;
    if (location.hash || document.querySelector(".modal:not([hidden]):not(#tnPop), .gacha:not([hidden])")) return;
    if (!pick("#viewList .card")) return;   // 목록이 아직 안 떴어요
    clearInterval(t); setTimeout(function () { if (!seen() && !location.hash) start(); }, 700);
  }, 500);
})();
