/* 잉여맨 추억자료실: 휴대폰 편의 기능
   1) 뒤로가기 버튼: 영상·창이 열려 있으면 앱이 꺼지지 않고 그 창만 닫아요
   2) 당겨서 새로고침 (앱으로 설치했을 때)
   3) 인터넷 끊김 안내 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  /* ── 1) 뒤로가기 ── */
  var ids = ["modal", "play", "xfer", "imp", "dcChat", "admModal", "serEdit"];
  var els = ids.map($).filter(Boolean), pushed = 0, skip = 0, skipT = 0;
  var openN = function () { return els.filter(function (e) { return !e.hidden; }).length; };
  var onOv = function () { return !!(history.state && history.state.ov); };
  function go(n) { skip++; clearTimeout(skipT); skipT = setTimeout(function () { skip = 0; }, 800); history.go(n); }
  function sync() {
    var n = openN();
    while (pushed < n) { try { history.pushState({ ov: pushed + 1 }, "", location.href); } catch (e) { break; } pushed++; }
    if (pushed > n) {
      var d = pushed - n; pushed = n;
      if (onOv()) go(-d);   // 화면의 ✕로 닫았을 때: 쌓아 둔 기록도 함께 정리
    }
  }
  if ("MutationObserver" in window) {
    var mo = new MutationObserver(sync);
    els.forEach(function (e) { mo.observe(e, { attributes: true, attributeFilter: ["hidden"] }); });
  }
  /* 앱에서 홈 화면 뒤로가기: 한 번 더 누르면 꺼져요 */
  var isApp = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var exitT = 0, exitArmed = false;
  function exitToast() {
    var t = $("toast"); if (!t) return;
    t.textContent = "한 번 더 뒤로가기를 누르면 꺼져요"; t.classList.add("show");
    clearTimeout(exitToast.t); exitToast.t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  if (isApp) {
    var st = history.state;
    if (!(st && (st.root || st.guard))) {
      try { history.replaceState({ root: 1 }, "", location.href); history.pushState({ guard: 1 }, "", location.href); } catch (e) {}
    }
  }
  window.addEventListener("popstate", function () {
    if (skip > 0) {
      skip--;
      if (location.hash.indexOf("#v=") === 0 && $("modal") && $("modal").hidden) history.replaceState(history.state, "", location.pathname + location.search);   // 공유 링크로 열린 영상을 닫고 돌아올 때 다시 열리지 않게
      return;
    }
    if (isApp && history.state && history.state.root && openN() === 0) {   // 맨 처음 기록까지 왔어요
      if (exitArmed) { exitArmed = false; clearTimeout(exitT); history.back(); return; }   // 두 번째: 꺼져요
      exitArmed = true; exitT = setTimeout(function () { exitArmed = false; }, 2500);
      try { history.pushState({ guard: 1 }, "", location.href); } catch (e) {}
      exitToast(); return;
    }
    if (openN() > 0) {   // 뒤로가기: 열린 창 중 맨 위 하나만 닫기 
      if (pushed > 0) pushed--;
      document.dispatchEvent(new Event("ovback"));
      setTimeout(sync, 0);
    } else { pushed = 0; if (onOv()) go(-1); }   // 앞으로가기로 빈 기록에 온 경우 되돌려요
  });

  /* ── 2) 당겨서 새로고침 (앱 화면에서만) ── */
  var app = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (app) {
    document.documentElement.classList.add("is-app");
    var bar = document.createElement("div"); bar.id = "ptr"; bar.setAttribute("aria-hidden", "true"); bar.textContent = "↓ 당겨서 새로고침"; document.body.appendChild(bar);
    var y0 = 0, pull = 0, on = false, MAX = 90, GO = 70;
    var blocked = function () { return openN() > 0 || window.scrollY > 0 || document.documentElement.classList.contains("consent-on") || document.documentElement.classList.contains("intro-on"); };
    document.addEventListener("touchstart", function (e) {
      on = !blocked() && e.touches.length === 1 && !(e.target.closest && e.target.closest("#noticePop, #tourBox")); pull = 0; if (on) y0 = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (!on) return;
      var d = e.touches[0].clientY - y0;
      if (d <= 0 || window.scrollY > 0) { pull = 0; bar.style.transform = ""; bar.classList.remove("on"); return; }
      pull = Math.min(MAX, d * .5);
      bar.classList.add("on"); bar.style.transform = "translate(-50%," + (pull - 44) + "px)";
      bar.textContent = pull >= GO * .5 + 20 ? "↑ 놓으면 새로고침" : "↓ 당겨서 새로고침";
    }, { passive: true });
    document.addEventListener("touchend", function () {
      if (!on) return; on = false;
      var ready = pull >= GO * .5 + 20;
      bar.classList.remove("on"); bar.style.transform = "";
      if (ready) { bar.textContent = "새로고침 중…"; bar.classList.add("on"); bar.style.transform = "translate(-50%,14px)"; setTimeout(function () { location.reload(); }, 150); }
    }, { passive: true });
  }

  /* ── 3) 인터넷 끊김 안내 ── */
  var off = document.createElement("div"); off.id = "offline"; off.setAttribute("role", "status"); off.hidden = true; document.body.appendChild(off);
  var offT = 0;
  function net() {
    clearTimeout(offT);
    if (navigator.onLine === false) { off.textContent = "인터넷에 연결되지 않았어요. 연결을 확인해 주세요"; off.className = "bad"; off.hidden = false; }
    else if (!off.hidden) { off.textContent = "다시 연결됐어요"; off.className = "ok"; offT = setTimeout(function () { off.hidden = true; }, 2200); }
  }
  window.addEventListener("offline", net); window.addEventListener("online", net);
  if (navigator.onLine === false) net();
})();
