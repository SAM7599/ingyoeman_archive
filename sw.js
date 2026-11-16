/* 잉여맨 추억자료실: 앱으로 설치했을 때 쓰는 서비스 워커
   - 항상 인터넷에서 최신 파일을 먼저 받아오고, 인터넷이 안 될 때만 저장해 둔 파일을 보여줘요.
   - 별점·후기 서버(다른 주소)와 로그인은 건드리지 않아요. */
const CACHE = "yeoyeoman-v3";
const SHELL = ["./", "index.html", "style.css", "app.js", "mobile.js", "tour.js", "config.js", "videos.json", "icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;                 // 다른 주소(별점 서버, 구글, 유튜브 등)는 그대로 통과
  const k = u.origin + u.pathname;                          // ?v=숫자 같은 뒷부분은 빼고 저장해서 파일마다 하나씩만 남겨요
  e.respondWith(fetch(r).then(res => {
    if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(k, cp)); }
    return res;
  }).catch(() => caches.match(k).then(m => m || (r.mode === "navigate" ? caches.match("index.html") : undefined) || new Response("", { status: 504 }))));
});
