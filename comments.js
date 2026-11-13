// 댓글 (구글 로그인) — Firebase 로그인 + Firestore. config.js 의 FIREBASE 값이 있어야 켜져요.
(function () {
  const CFG = window.SITE && window.SITE.firebase;
  const V = "10.14.1", BASE = "https://www.gstatic.com/firebasejs/" + V + "/";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let fb = null, user = null, unsub = null, curId = null, last = 0, items = [], root = null;

  async function load() {
    if (fb) return fb;
    const [app, auth, fs] = await Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]);
    const a = app.initializeApp(CFG), au = auth.getAuth(a), db = fs.getFirestore(a);
    fb = { auth, fs, au, db };
    auth.onAuthStateChanged(au, u => { user = u; draw(); });
    return fb;
  }
  const ago = t => {
    if (!t) return "방금";
    const s = Math.max(0, (Date.now() - t.toMillis()) / 1000);
    if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전"; if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    const d = t.toDate(); return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate();
  };
  function draw() {
    if (!root) return;
    const n = items.length;
    root.querySelector("#cmtN").textContent = n ? n : "";
    const me = root.querySelector("#cmtMe");
    if (user) {
      me.innerHTML = `<div class="cmt-who">${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : ""}<b>${esc(user.displayName || "이름 없음")}</b><button type="button" class="cmt-link" data-out>로그아웃</button></div>
        <textarea id="cmtTx" maxlength="300" rows="2" placeholder="댓글을 남겨 보세요 (최대 300자)"></textarea>
        <div class="cmt-row"><span id="cmtLen">0/300</span><button type="button" class="btn primary" data-send>등록</button></div>`;
    } else {
      me.innerHTML = `<button type="button" class="btn gbtn" data-in><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.3 0 20 0 24s.9 7.7 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>Google로 로그인하고 댓글 쓰기</button>`;
    }
    const list = root.querySelector("#cmtList");
    list.innerHTML = n ? items.map(c => `<div class="cmt-i"><div class="cmt-h">${c.photo ? `<img src="${esc(c.photo)}" alt="" referrerpolicy="no-referrer">` : `<i></i>`}<b>${esc(c.name)}</b><time>${ago(c.ts)}</time>${user && user.uid === c.uid ? `<button type="button" class="cmt-link" data-del="${esc(c.id)}">삭제</button>` : ""}</div><p>${esc(c.text)}</p></div>`).join("") : `<p class="cmt-none">아직 댓글이 없어요. 첫 댓글을 남겨 보세요!</p>`;
  }
  async function listen(id) {
    const { fs, db } = fb;
    unsub && unsub();
    unsub = fs.onSnapshot(fs.query(fs.collection(db, "comments"), fs.where("vid", "==", id)), snap => {
      if (curId !== id) return;
      items = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.ts ? b.ts.toMillis() : Date.now()) - (a.ts ? a.ts.toMillis() : Date.now())).slice(0, 100);
      draw();
    }, () => { if (root) root.querySelector("#cmtList").innerHTML = `<p class="cmt-none">댓글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>`; });
  }
  function bind() {
    root.addEventListener("click", async e => {
      const t = e.target.closest("button"); if (!t) return;
      const { auth, fs, au, db } = fb;
      if (t.hasAttribute("data-in")) {
        try { await auth.signInWithPopup(au, new auth.GoogleAuthProvider()); } catch (err) { if (err && err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") window.__toast && window.__toast("로그인하지 못했어요. 팝업 차단을 확인해 주세요"); }
      } else if (t.hasAttribute("data-out")) { auth.signOut(au); }
      else if (t.hasAttribute("data-send")) {
        const tx = root.querySelector("#cmtTx"), text = tx.value.trim();
        if (!text) return window.__toast && window.__toast("내용을 입력해 주세요");
        if (Date.now() - last < 5000) return window.__toast && window.__toast("잠시 후 다시 등록해 주세요");
        last = Date.now(); t.disabled = true;
        try {
          await fs.addDoc(fs.collection(db, "comments"), { vid: curId, uid: user.uid, name: (user.displayName || "이름 없음").slice(0, 40), photo: user.photoURL || "", text: text.slice(0, 300), ts: fs.serverTimestamp() });
          tx.value = "";
        } catch (err) { window.__toast && window.__toast("등록하지 못했어요"); }
        t.disabled = false;
      } else if (t.hasAttribute("data-del")) {
        if (!confirm("이 댓글을 삭제할까요?")) return;
        try { await fs.deleteDoc(fs.doc(db, "comments", t.getAttribute("data-del"))); } catch (err) { window.__toast && window.__toast("삭제하지 못했어요"); }
      }
    });
    root.addEventListener("input", e => { if (e.target.id === "cmtTx") root.querySelector("#cmtLen").textContent = e.target.value.length + "/300"; });
  }
  window.Comments = {
    on: !!(CFG && CFG.apiKey),
    async mount(el, id) {
      if (!this.on) { el.hidden = true; return; }
      el.hidden = false; root = el; curId = id; items = [];
      if (!el.dataset.b) { el.innerHTML = `<h3>댓글 <span id="cmtN"></span></h3><div id="cmtMe" class="cmt-me"></div><div id="cmtList"></div>`; }
      el.querySelector("#cmtList").innerHTML = `<p class="cmt-none">불러오는 중…</p>`;
      try { await load(); } catch (err) { el.querySelector("#cmtList").innerHTML = `<p class="cmt-none">댓글을 불러오지 못했어요.</p>`; return; }
      if (!el.dataset.b) { bind(); el.dataset.b = "1"; }
      draw(); listen(id);
    },
    unmount() { unsub && unsub(); unsub = null; curId = null; }
  };
})();
