/* 화면 꾸미기: 포인트 색 · 글자 크기 · 한 손 모드 (이 기기에만 저장돼요) */
(function () {
  var R = document.documentElement;
  var AC = ["red", "teal", "violet", "lime", "orange", "blue"], FS = ["s", "m", "l", "xl"], FT = { round: "Gowun+Dodum", serif: "Nanum+Myeongjo:wght@400;700;800", hand: "Gaegu:wght@400;700" };
  function loadFont(f) { if (!FT[f] || document.getElementById("ft-" + f)) return; var l = document.createElement("link"); l.id = "ft-" + f; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + FT[f] + "&display=swap"; document.head.appendChild(l); }
  function g(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function apply() {
    var a = g("accent", "red"), f = g("fs", "m"), o = g("onehand", "off"), ft = g("font", "def");
    if (!FT[ft]) ft = "def"; R.setAttribute("data-font", ft); loadFont(ft);
    R.setAttribute("data-accent", AC.indexOf(a) < 0 ? "red" : a);
    R.setAttribute("data-fs", FS.indexOf(f) < 0 ? "m" : f);
    R.setAttribute("data-onehand", o === "on" ? "on" : "off");
  }
  apply();
  function sync() {
    var a = R.getAttribute("data-accent"), f = R.getAttribute("data-fs"), ft = R.getAttribute("data-font");
    [].forEach.call(document.querySelectorAll("[data-ft]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-ft") === ft)); });
    [].forEach.call(document.querySelectorAll("[data-ac]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-ac") === a)); });
    [].forEach.call(document.querySelectorAll("[data-fs]"), function (b) { if (b.tagName === "BUTTON") b.setAttribute("aria-pressed", String(b.getAttribute("data-fs") === f)); });
    var o = document.getElementById("onehand"); if (o) o.setAttribute("aria-checked", String(R.getAttribute("data-onehand") === "on"));
  }
  function ui() {
    var m = document.getElementById("setMenu"); if (!m) return;
    m.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button"); if (!b) return;
      if (b.hasAttribute("data-ac")) { s("accent", b.getAttribute("data-ac")); apply(); sync(); }
      else if (b.hasAttribute("data-fs")) { s("fs", b.getAttribute("data-fs")); apply(); sync(); }
      else if (b.hasAttribute("data-ft")) { s("font", b.getAttribute("data-ft")); apply(); sync(); }
      else if (b.id === "onehand") { s("onehand", R.getAttribute("data-onehand") === "on" ? "off" : "on"); apply(); sync(); }
    });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ui); else ui();
})();
