// 잉여맨추억자료실 별점 서버 (Cloudflare Worker)
// - 구글로 로그인 → 별점 + 후기 저장 (한 계정당 영상 하나에 한 번, 후기는 꼭 써야 해요)
// - 후기 신고 → 신고 번호를 받고, 신고자가 디스코드 신고 채널에 번호와 캡처를 직접 올려요 (웹훅 없음)
// - 운영진(지정한 구글 계정)은 사이트에 로그인하면 신고함에서 신고 목록(현재 후기 + 고치기 전 기록)을 보고 삭제·차단해요
// - 차단된 구글 계정은 별점·후기·신고를 할 수 없고, 그 사람의 후기는 사라져요
//
// 필요한 설정(wrangler.toml / 대시보드):
//   변수  : GOOGLE_CLIENT_ID, SITE_ORIGIN (예: https://sam7599.github.io), SITE_PATH (예: /ingyoeman_archive/)
//   비밀값: SESSION_SECRET
//   변수  : ADMIN_EMAILS (운영진 구글 이메일, 쉼표로 구분)
//   D1    : DB (schema.sql 로 표 만들기)

const DAY = 86400;
const enc = new TextEncoder();
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = s => b64u(enc.encode(s));
const unb64uStr = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));

async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const same = (a, b) => { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < b.length; i++) d |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i); return d === 0; };
async function sign(env, obj, ttl) {
  const body = b64uStr(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttl }));
  return body + "." + await hmac(env.SESSION_SECRET, body);
}
async function verify(env, tok) {
  try {
    const [body, sig] = String(tok || "").split(".");
    if (!body || !sig || !same(sig, await hmac(env.SESSION_SECRET, body))) return null;   // 서명 비교는 시간 차이로 알아내지 못하게 끝까지 비교해요
    const o = JSON.parse(unb64uStr(body));
    return o.exp > Date.now() / 1000 ? o : null;
  } catch (e) { return null; }
}

const cors = env => ({ "Access-Control-Allow-Origin": env.SITE_ORIGIN, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin" });
const json = (env, data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env), ...extra } });
const siteUrl = (env, hash) => env.SITE_ORIGIN + (env.SITE_PATH || "/") + "#" + hash;

// 같은 접속 주소(IP 코드)가 짧은 시간에 너무 자주 요청하면 막아요 (서버 한도를 지키기 위한 속도 제한)
let rlReady = false;
const tooFast = async (env, req, key, max, secs) => {
  try {
    const h = await ipHash(env, req); if (!h) return false;
    if (!rlReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_hit (k TEXT PRIMARY KEY, win INTEGER NOT NULL, n INTEGER NOT NULL, ts INTEGER NOT NULL)").run(); rlReady = true; }
    const now = Date.now(), win = Math.floor(now / (secs * 1000));
    const r = await env.DB.prepare("INSERT INTO rate_hit (k, win, n, ts) VALUES (?1, ?2, 1, ?3) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN win = excluded.win THEN n + 1 ELSE 1 END, win = excluded.win, ts = excluded.ts RETURNING n").bind(key + ":" + h, win, now).first();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_hit WHERE ts < ?").bind(now - 864e5).run().catch(() => {});
    return !!r && r.n > max;
  } catch (e) { return false; }   // 속도 제한 장치가 고장나도 사이트는 계속 돼요
};
const slow = env => json(env, { error: "slow" }, 429);
// "내 정보 전부 삭제" 뒤 24시간 동안은 다시 로그인·후기 작성을 할 수 없어요 (삭제·재가입을 반복해서 서버에 부담을 주는 것을 막아요)
// 계정 코드(되돌릴 수 없는 코드)와 삭제한 시각만 24시간 보관하고 자동으로 지워요
const LOCK_MS = 864e5;
let lockReady = false;
const lockLeft = async (env, uid) => {
  try {
    if (!lockReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS delete_lock (uid TEXT PRIMARY KEY, ts INTEGER NOT NULL)").run(); lockReady = true; }
    const r = await env.DB.prepare("SELECT ts FROM delete_lock WHERE uid = ?").bind(uid).first();
    if (!r) return 0;
    const left = r.ts + LOCK_MS - Date.now();
    if (left <= 0) { await env.DB.prepare("DELETE FROM delete_lock WHERE uid = ?").bind(uid).run().catch(() => {}); return 0; }
    return left;
  } catch (e) { return 0; }   // 장치가 고장나도 사이트는 계속 돼요
};
const coolBody = (env, left) => json(env, { error: "cooldown", hours: Math.max(1, Math.ceil(left / 36e5)) }, 403);
const isAdmin = (env, s) => !!s && !!s.em && String(env.ADMIN_EMAILS || "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean).includes(s.em);
// 차단된 계정인지
// 접속 주소(IP)는 그대로 저장하지 않고, 되돌릴 수 없는 짧은 코드로 바꿔서만 저장해요
const ipHash = async (env, req) => { const ip = req.headers.get("CF-Connecting-IP") || ""; return ip ? (await hmac(env.SESSION_SECRET, "ip:" + ip)).slice(0, 22) : ""; };
const IPDAYS = env => (Number(env.IP_BAN_DAYS) || 30) * 864e5;
const ipBanned = async (env, req) => { const h = await ipHash(env, req); return !!h && !!await env.DB.prepare("SELECT 1 AS x FROM banned_ip WHERE h = ? AND ts > ?").bind(h, Date.now() - IPDAYS(env)).first(); };
const ipSeen = async (env, req, uid) => { const h = await ipHash(env, req); if (h) await env.DB.prepare("INSERT INTO ip_seen (uid, h, ts) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET h = excluded.h, ts = excluded.ts").bind(uid, h, Date.now()).run(); };
const banInfo = async (env, uid) => { try { return await env.DB.prepare("SELECT reason, vid, txt, ts FROM ban_info WHERE uid = ?").bind(uid).first() || {}; } catch (e) { return {}; } };   // 차단 사유(없으면 빈 값)
const banBody = async (env, uid, byIp) => ({ error: "banned", ban: byIp ? { ip: 1 } : await banInfo(env, uid) });
async function isBanned(env, uid) { return !!await env.DB.prepare("SELECT 1 AS x FROM banned WHERE uid = ?").bind(uid).first(); }

// ── 후기 검사 ──
const REASONS = { ad: "광고·홍보", spam: "스팸·도배", abuse: "욕설·비방", empty: "무의미한 내용 (점·기호만 올림 등)", off: "정치·영상과 무관한 내용", other: "기타" };
function checkText(t) {   // 문제가 있으면 이유 코드를, 괜찮으면 null
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (s.length < 5) return "short";
  if (s.length > 300) return "long";
  const core = s.replace(/[^\p{L}\p{N}]/gu, "");
  if (core.length < 4 || new Set(core).size < 3) return "empty";   // 점·기호만, 같은 글자 반복
  if (/(https?:\/\/|www\.|discord\.gg|\.(com|net|kr|io|me|gg|xyz)\b)/i.test(s)) return "link";   // 광고 링크
  return null;
}
// 구글 이름은 서버에 저장하지도, 화면에 보여주지도 않아요. 대신 계정마다 정해진 무작위 별명을 보여줘요 (같은 사람은 늘 같은 별명)
const keep = () => "";
const ADJ = ["졸린", "배고픈", "수줍은", "용감한", "느긋한", "엉뚱한", "씩씩한", "다정한", "시끄러운", "조용한", "빠른", "느린", "행복한", "심심한", "든든한", "반짝이는", "푸른", "붉은", "노란", "새하얀", "까만", "작은", "커다란", "웃는", "춤추는", "달리는", "꿈꾸는", "비밀스러운", "의젓한", "장난꾸러기"];
const NOUN = ["너구리", "고양이", "강아지", "다람쥐", "토끼", "펭귄", "수달", "부엉이", "판다", "여우", "하마", "고래", "거북이", "오리", "햄스터", "참새", "곰돌이", "사슴", "두더지", "카피바라", "미어캣", "알파카", "병아리", "청설모", "돌고래", "코알라", "앵무새", "해달", "치타", "기린"];
const nick = async (env, uid) => { const h = await hmac(env.SESSION_SECRET, "nick:" + uid), A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", v = i => A.indexOf(h[i]) + 1; return ADJ[(v(0) * 7 + v(1)) % ADJ.length] + NOUN[(v(2) * 7 + v(3)) % NOUN.length] + String((v(4) * 11 + v(5)) % 100).padStart(2, "0"); };
// 고치기 전 / 지우기 전 모습을 보관함에 남겨요 (why: edit=고침, del=본인이 지움, mod=운영진이 지움, ban=차단으로 지워짐)
// 보관함 자동 비우기: 보관한 지 RETENTION_DAYS(기본 180일 ≈ 6개월)가 지난 기록을 지워요. 별도 설정 없이 후기가 오갈 때·보관함을 열 때 알아서 정리돼요
const TITLES = [[100, "추억 지킴이"], [30, "다시보기 평론가"], [10, "열혈 팬"], [3, "단골 시청자"], [1, "새내기"]];   // 후기 글을 쓴 영상 수 → 칭호 (위에서부터 먼저 맞는 것)
const titleOf = (n) => { const i = TITLES.findIndex(t => n >= t[0]); return i < 0 ? null : { lv: TITLES.length - i, title: TITLES[i][1] }; };
const sweep = (env) => env.DB.prepare("DELETE FROM rating_history WHERE (CASE WHEN at > 0 THEN at ELSE ts END) < ?").bind(Date.now() - (Number(env.RETENTION_DAYS) || 180) * 864e5).run().then(() => env.DB.batch([env.DB.prepare("DELETE FROM ip_seen WHERE ts < ?").bind(Date.now() - IPDAYS(env)), env.DB.prepare("DELETE FROM banned_ip WHERE ts < ?").bind(Date.now() - IPDAYS(env)), env.DB.prepare("UPDATE ratings SET name = '' WHERE name != ''"), env.DB.prepare("UPDATE rating_history SET name = '' WHERE name != ''")])).then(() => warnTable(env)).then(() => env.DB.prepare("DELETE FROM warns WHERE ts < ?").bind(Date.now() - (Number(env.RETENTION_DAYS) || 180) * 864e5).run());
const archive = async (env, vid, uid, r, why) => { await env.DB.prepare("INSERT INTO rating_history (vid, uid, stars, text, ts, name, why, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(vid, uid, r.stars, r.text, r.ts, keep(r.name), why, Date.now()).run(); if (Math.random() < 0.05) await sweep(env).catch(() => {}); };
// 운영진 경고 기록 (운영진만 볼 수 있는 메모예요. 보관 기간이 지나면 자동으로 지워져요)
let warnReady = false;
const warnTable = async (env) => { if (!warnReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS warns (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, vid TEXT, reason TEXT, ts INTEGER NOT NULL)").run(); warnReady = true; } };
const strikes = async (env, uid) => {   // 운영진이 후기를 지운 횟수 / 경고 횟수
  let warns = 0, mods = 0;
  try { await warnTable(env); warns = (await env.DB.prepare("SELECT COUNT(*) AS n FROM warns WHERE uid = ?").bind(uid).first()).n; } catch (e) {}
  try { mods = (await env.DB.prepare("SELECT COUNT(*) AS n FROM rating_history WHERE uid = ? AND why = 'mod'").bind(uid).first()).n; } catch (e) {}
  return { warns, mods };
};
const clean = t => String(t || "").replace(/\s+/g, " ").trim();
const rid = (env, vid, uid) => hmac(env.SESSION_SECRET, "rid:" + vid + ":" + uid).then(h => h.slice(0, 16));
const cut = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = body => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>운영진</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 18px;line-height:1.6">${body}`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
const ago = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");   // 한국 시간

const newUid = async (env, sub) => "u" + (await hmac(env.SESSION_SECRET, "uid:" + sub)).slice(0, 24);
const UID_RE = /^(g\d{5,30}|u[\w-]{24})$/;
// 예전 기록(uid = "g"+구글번호)을 새 코드로 바꿔요. 새 코드에 이미 같은 항목이 있으면 건드리지 않아요
const migrateUid = async (env, old, nu) => env.DB.batch(["ratings", "rating_history", "banned", "ban_info", "ip_seen"].map(t => env.DB.prepare(`UPDATE OR IGNORE ${t} SET uid = ? WHERE uid = ?`).bind(nu, old)).concat([env.DB.prepare("UPDATE OR IGNORE reports SET uid = ? WHERE uid = ?").bind(nu, old), env.DB.prepare("UPDATE OR IGNORE reports SET reporter = ? WHERE reporter = ?").bind(nu, old)]));
async function getAuth(env, req) { const s = await verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, "")); return s && /^u[\w-]{24}$/.test(String(s.uid)) ? s : null; }   // 예전 방식 로그인은 한 번 다시 로그인하게 해요

async function handle(req, env, ctx) {
  const url = new URL(req.url), p = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  const redirect = `${url.origin}/callback`;

  if (p === "/google" && req.method === "POST") {   // 구글 로그인 확인 → 우리 사이트용 로그인 토큰
    if (await tooFast(env, req, "login", 20, 600)) return slow(env);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const cred = String(b.credential || "");
    if (b.adult !== true) return json(env, { error: "adult" }, 400);   // 만 19세 이상 확인(본인 선언)을 하지 않으면 로그인할 수 없어요 — 이 값은 저장하지 않아요
    if (!cred || cred.length > 4000) return json(env, { error: "bad" }, 400);
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
    if (!r.ok) return json(env, { error: "login" }, 401);
    const g = await r.json();
    if (g.aud !== env.GOOGLE_CLIENT_ID || !/^\d{5,30}$/.test(String(g.sub || "")) || !(g.exp > Date.now() / 1000)) return json(env, { error: "login" }, 401);
    const uid = await newUid(env, g.sub);   // 구글 고유 번호는 저장하지 않고, 되돌릴 수 없는 코드만 써요
    { const em1 = g.email_verified === "true" || g.email_verified === true ? String(g.email || "").toLowerCase() : ""; const left = isAdmin(env, { em: em1 }) ? 0 : await lockLeft(env, uid); if (left) return coolBody(env, left); }   // 내 정보를 지운 뒤 24시간 동안은 다시 로그인할 수 없어요
    const em0 = g.email_verified === "true" || g.email_verified === true ? String(g.email || "").toLowerCase() : "";
    await migrateUid(env, "g" + g.sub, uid).catch(() => {});   // 예전 방식(g+번호)으로 저장된 기록을 새 코드로 옮겨요 (이전 이용자 전용)
    if (await isBanned(env, uid)) return json(env, await banBody(env, uid), 403);
    if (!isAdmin(env, { em: em0 }) && await ipBanned(env, req)) return json(env, await banBody(env, uid, true), 403);   // 차단된 사람이 다른 계정으로 들어오는 것도 막아요
    await ipSeen(env, req, uid).catch(() => {});
    const name = await nick(env, uid);
    const em = g.email_verified === "true" || g.email_verified === true ? String(g.email || "").toLowerCase() : "";
    return json(env, { token: await sign(env, { uid, name, em }, 30 * DAY), name, admin: isAdmin(env, { em }) });
  }

  if (p === "/ratings" && req.method === "GET") {   // 영상별 평균 (누구나) — 1분 동안 저장해 두고 재사용해서 데이터 읽기를 아껴요
    const ck = typeof caches !== "undefined" ? caches.default : null, key = new Request(url.origin + "/__ratings_cache");
    if (ck) { const hit = await ck.match(key); if (hit) return new Response(hit.body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env), "Cache-Control": "public, max-age=60" } }); }
    const rs = await env.DB.prepare("SELECT vid, ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings GROUP BY vid").all();
    const out = {}; for (const r of rs.results) out[r.vid] = [r.avg, r.n];
    const body = JSON.stringify(out);
    if (ck && ctx) ctx.waitUntil(ck.put(key, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } })));
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env), "Cache-Control": "public, max-age=60" } });
  }

  if (p === "/me" && req.method === "GET") {   // 내가 준 별점 + 아직 멤버인지
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    const banned = await isBanned(env, s.uid);
    const rs = await env.DB.prepare("SELECT vid, stars, text FROM ratings WHERE uid = ?").bind(s.uid).all();
    const mine = {}; for (const r of rs.results) mine[r.vid] = [r.stars, r.text];
    const nTxt = (await env.DB.prepare("SELECT COUNT(*) AS c FROM ratings WHERE uid = ? AND text != ''").bind(s.uid).first()).c || 0, tt = titleOf(nTxt), nx = [...TITLES].reverse().find(t => t[0] > nTxt);
    return json(env, { name: await nick(env, s.uid), cnt: nTxt, title: tt ? tt.title : "", lv: tt ? tt.lv : 0, next: nx ? { title: nx[1], need: nx[0] - nTxt } : null, member: !banned, mine, admin: isAdmin(env, s), ban: banned ? await banInfo(env, s.uid) : null });
  }

  if (p === "/reviews" && req.method === "GET") {   // 한 영상의 후기 목록 (누구나)
    const vid = url.searchParams.get("vid") || "";
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid)) return json(env, { error: "bad" }, 400);
    const me = await getAuth(env, req);
    const rs = await env.DB.prepare("SELECT uid, name, stars, text, ts FROM ratings WHERE vid = ? ORDER BY ts DESC LIMIT 40").bind(vid).all();
    const cnt = {}; if (rs.results.length) { const q = await env.DB.prepare(`SELECT uid, COUNT(*) AS c FROM ratings WHERE text != '' AND uid IN (${rs.results.map(() => "?").join(",")}) GROUP BY uid`).bind(...rs.results.map(r => r.uid)).all(); for (const x of q.results) cnt[x.uid] = x.c; }
    const list = []; for (const r of rs.results) list.push({ id: await rid(env, vid, r.uid), name: await nick(env, r.uid), stars: r.stars, text: r.text, ts: r.ts, me: !!me && me.uid === r.uid, ...(titleOf(cnt[r.uid] || 0) || {}) });
    return json(env, list, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/rate" && req.method === "POST") {   // 별점 + 후기 남기기 (stars 0 = 내 별점·후기 지우기)
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    if (!isAdmin(env, s) && await tooFast(env, req, "rate", 40, 600)) return slow(env);
    const vid = String(b.vid || ""), stars = Number(b.stars), text = clean(b.text);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid) || !Number.isInteger(stars) || stars < 0 || stars > 5) return json(env, { error: "bad" }, 400);
    if (stars > 0) { const bad = checkText(text); if (bad) return json(env, { error: "text", code: bad }, 400); }   // 후기는 꼭 필요해요
    { const bn = await isBanned(env, s.uid); if (bn || (!isAdmin(env, s) && await ipBanned(env, req))) return json(env, await banBody(env, s.uid, !bn), 403); }   // 차단된 계정·주소는 막아요
    if (!isAdmin(env, s)) { const left = await lockLeft(env, s.uid); if (left) return coolBody(env, left); }
    if (stars === 0) {
      const old = await env.DB.prepare("SELECT stars, text, name, ts FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).first();
      if (old) await archive(env, vid, s.uid, old, "del");   // 지우기 전 모습 보관
      await env.DB.prepare("DELETE FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).run();
    } else {
      const old = await env.DB.prepare("SELECT stars, text, name, ts FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).first();
      if (!old && !isAdmin(env, s)) {   // 하루에 새 후기를 쓸 수 있는 개수 제한 (한국시간 0시 기준, 기본 10개)
        const d0 = Math.floor((Date.now() + 324e5) / 864e5) * 864e5 - 324e5;
        const n = (await env.DB.prepare("SELECT (SELECT COUNT(*) FROM ratings WHERE uid = ?1 AND ts >= ?2) + (SELECT COUNT(*) FROM rating_history WHERE uid = ?1 AND why = 'del' AND at >= ?2) AS n").bind(s.uid, d0).first()).n;
        if (n >= (Number(env.DAILY_REVIEWS) || 10)) return json(env, { error: "daily" }, 429);
      }
      if (old && (old.text !== text || old.stars !== stars)) await archive(env, vid, s.uid, old, "edit");   // 고치기 전 모습 보관
      await env.DB.prepare("INSERT INTO ratings (vid, uid, stars, text, name, ts) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(vid, uid) DO UPDATE SET stars = excluded.stars, text = excluded.text, name = excluded.name, ts = excluded.ts").bind(vid, s.uid, stars, text, keep(s.name), Date.now()).run();
    }
    const a = await env.DB.prepare("SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings WHERE vid = ?").bind(vid).first();
    return json(env, { ok: true, avg: a.avg || 0, n: a.n || 0 });
  }

  if (p === "/account/delete" && req.method === "POST") {   // 내 별점·후기·보관 기록·신고·접속 기록을 한 번에 지워요
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    if (await isBanned(env, s.uid)) return json(env, await banBody(env, s.uid), 403);   // 차단 기록은 지울 수 없어요
    const open = await env.DB.prepare("SELECT 1 AS x FROM reports r JOIN ratings g ON g.vid = r.vid AND g.uid = r.uid WHERE r.uid = ? LIMIT 1").bind(s.uid).first();
    if (open) return json(env, { error: "reported" }, 409);   // 신고가 접수된 후기가 남아 있으면 운영진 확인이 끝날 때까지 막아요
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ratings WHERE uid = ?").bind(s.uid),
      env.DB.prepare("DELETE FROM rating_history WHERE uid = ?").bind(s.uid),
      env.DB.prepare("DELETE FROM reports WHERE uid = ? OR reporter = ?").bind(s.uid, s.uid),
      env.DB.prepare("DELETE FROM ip_seen WHERE uid = ?").bind(s.uid),
    ]);
    if (!isAdmin(env, s)) { await lockLeft(env, s.uid); await env.DB.prepare("INSERT INTO delete_lock (uid, ts) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET ts = excluded.ts").bind(s.uid, Date.now()).run(); await env.DB.prepare("DELETE FROM delete_lock WHERE ts < ?").bind(Date.now() - LOCK_MS).run().catch(() => {}); }   // 24시간 동안 다시 로그인할 수 없어요
    return json(env, { ok: true, hours: 24 });
  }

  if (p === "/report" && req.method === "POST") {   // 후기 신고 → 운영진 디스코드 채널
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    if (!isAdmin(env, s) && await tooFast(env, req, "report", 30, 600)) return slow(env);
    const vid = String(b.vid || ""), reason = String(b.reason || ""), note = clean(b.note).slice(0, 200), id = String(b.id || "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid) || !REASONS[reason] || !/^[A-Za-z0-9_-]{6,40}$/.test(id)) return json(env, { error: "bad" }, 400);
    { const bn = await isBanned(env, s.uid); if (bn || (!isAdmin(env, s) && await ipBanned(env, req))) return json(env, await banBody(env, s.uid, !bn), 403); }
    if (!isAdmin(env, s)) { const left = await lockLeft(env, s.uid); if (left) return coolBody(env, left); }
    const all = await env.DB.prepare("SELECT uid, name, stars, text, ts FROM ratings WHERE vid = ?").bind(vid).all();
    let target = null; for (const r of all.results) if (await rid(env, vid, r.uid) === id) { target = r; break; }
    if (!target) return json(env, { error: "gone" }, 404);   // 이미 지워졌거나 없는 후기
    if (target.uid === s.uid) return json(env, { error: "self" }, 400);
    const today = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND ts > ?").bind(s.uid, Date.now() - DAY * 1000).first();
    if (today.n >= 10) return json(env, { error: "limit" }, 429);   // 하루 10건까지
    const dup = await env.DB.prepare("SELECT id FROM reports WHERE vid = ? AND uid = ? AND reporter = ?").bind(vid, target.uid, s.uid).first();
    if (dup) return json(env, { ok: true, dup: true, no: dup.id });
    await env.DB.prepare("INSERT INTO reports (vid, uid, reporter, reason, note, ts) VALUES (?, ?, ?, ?, ?, ?)").bind(vid, target.uid, s.uid, reason, note, Date.now()).run();
    const row = await env.DB.prepare("SELECT id FROM reports WHERE vid = ? AND uid = ? AND reporter = ?").bind(vid, target.uid, s.uid).first();
    const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE vid = ? AND uid = ?").bind(vid, target.uid).first()).n;
    return json(env, { ok: true, no: row.id });
  }

  if (p === "/admin/reports" && req.method === "GET") {   // 운영진: 신고 목록
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    const reps = await env.DB.prepare("SELECT id, vid, uid, reason, note, ts FROM reports ORDER BY id DESC LIMIT 40").all();
    const out = [];
    for (const r of reps.results) {
      const cur = await env.DB.prepare("SELECT name, stars, text, ts FROM ratings WHERE vid = ? AND uid = ?").bind(r.vid, r.uid).first();
      const cnt = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE vid = ? AND uid = ?").bind(r.vid, r.uid).first()).n;
      const hist = await env.DB.prepare("SELECT stars, text, ts FROM rating_history WHERE vid = ? AND uid = ? ORDER BY id DESC LIMIT 3").bind(r.vid, r.uid).all();
      out.push({ id: r.id, vid: r.vid, uid: r.uid, reason: REASONS[r.reason] || r.reason, note: r.note, ts: r.ts, cnt, cur: cur ? { ...cur, name: await nick(env, r.uid) } : null, hist: hist.results, banned: await isBanned(env, r.uid), ...await strikes(env, r.uid) });
    }
    return json(env, out, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/admin/history" && req.method === "GET") {   // 운영진: 보관함 (고치기 전·지우기 전 후기)
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    await sweep(env).catch(() => {});
    const before = Number(url.searchParams.get("before")) || 9e15;
    const rs = await env.DB.prepare("SELECT id, vid, uid, stars, text, ts, name, why FROM rating_history WHERE id < ? ORDER BY id DESC LIMIT 60").bind(before).all();
    const out = [];
    for (const h of rs.results) {
      const cur = await env.DB.prepare("SELECT stars, text, ts FROM ratings WHERE vid = ? AND uid = ?").bind(h.vid, h.uid).first();
      out.push({ id: h.id, vid: h.vid, uid: h.uid, name: await nick(env, h.uid), stars: h.stars, text: h.text, ts: h.ts, why: h.why, cur: cur || null, banned: await isBanned(env, h.uid) });
    }
    return json(env, out, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/admin/stats" && req.method === "GET") {   // 운영진: 사용 현황 (최근 14일 그래프용)
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    const KST = 9 * 3600000, D = 86400000, N = 14, today = Math.floor((Date.now() + KST) / D), from = (today - N + 1) * D - KST;
    const per = async tbl => { const m = {}; for (const r of (await env.DB.prepare(`SELECT CAST((ts + ?) / ? AS INTEGER) AS d, COUNT(*) AS n FROM ${tbl} WHERE ts >= ? GROUP BY d`).bind(KST, D, from).all()).results) m[r.d] = r.n; return m; };
    const [rv, rp, ar] = [await per("ratings"), await per("reports"), await per("rating_history")];
    const days = []; for (let i = today - N + 1; i <= today; i++) days.push({ day: new Date(i * D).toISOString().slice(5, 10), rev: rv[i] || 0, rep: rp[i] || 0, arc: ar[i] || 0 });
    const c = async q => (await env.DB.prepare(q).first()).n;
    const totals = { reviews: await c("SELECT COUNT(*) AS n FROM ratings"), writers: await c("SELECT COUNT(DISTINCT uid) AS n FROM ratings"), reports: await c("SELECT COUNT(*) AS n FROM reports"), banned: await c("SELECT COUNT(*) AS n FROM banned"), archive: await c("SELECT COUNT(*) AS n FROM rating_history") };
    return json(env, { days, totals }, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/admin/bans" && req.method === "GET") {   // 운영진: 차단 목록
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    const rows = (await env.DB.prepare("SELECT uid, ts FROM banned ORDER BY ts DESC LIMIT 200").all()).results;
    const out = [];
    for (const r of rows) {
      const i = await banInfo(env, r.uid);
      const n = await env.DB.prepare("SELECT name FROM rating_history WHERE uid = ? AND name != '' ORDER BY id DESC LIMIT 1").bind(r.uid).first().catch(() => null);
      out.push({ uid: r.uid, ts: r.ts, name: await nick(env, r.uid), reason: i.reason || "", vid: i.vid || "", txt: i.txt || "" });
    }
    return json(env, out, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/admin/unban" && req.method === "POST") {   // 운영진: 차단 해제 (계정 + 접속 주소)
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const uid = String(b.uid || ""); if (!UID_RE.test(uid)) return json(env, { error: "bad" }, 400);
    const ip = await env.DB.prepare("SELECT h FROM ip_seen WHERE uid = ?").bind(uid).first();
    await env.DB.prepare("DELETE FROM banned WHERE uid = ?").bind(uid).run();
    await env.DB.prepare("DELETE FROM ban_info WHERE uid = ?").bind(uid).run().catch(() => {});
    if (ip) await env.DB.prepare("DELETE FROM banned_ip WHERE h = ?").bind(ip.h).run();
    return json(env, { ok: true });
  }

  if (p === "/admin/purge" && req.method === "POST") {   // 운영진: 보관함 기록 영구 삭제 (본인이 보관을 원치 않을 때)
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    if (b.uid) { if (!UID_RE.test(String(b.uid))) return json(env, { error: "bad" }, 400); await env.DB.prepare("DELETE FROM rating_history WHERE uid = ?").bind(String(b.uid)).run(); }
    else if (Number.isInteger(b.id)) await env.DB.prepare("DELETE FROM rating_history WHERE id = ?").bind(b.id).run();
    else return json(env, { error: "bad" }, 400);
    return json(env, { ok: true });
  }

  if (p === "/admin/act" && req.method === "POST") {   // 운영진: 후기 삭제 / 작성자 차단
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const row = await env.DB.prepare("SELECT vid, uid, reason FROM reports WHERE id = ?").bind(Number(b.id)).first();
    if (!row) return json(env, { error: "gone" }, 404);
    if (b.act === "ban") {
      await env.DB.prepare("INSERT OR IGNORE INTO banned (uid, ts) VALUES (?, ?)").bind(row.uid, Date.now()).run();
      const ip = await env.DB.prepare("SELECT h FROM ip_seen WHERE uid = ?").bind(row.uid).first();   // 마지막으로 쓴 접속 주소도 함께 차단
      if (ip) await env.DB.prepare("INSERT INTO banned_ip (h, ts) VALUES (?, ?) ON CONFLICT(h) DO UPDATE SET ts = excluded.ts").bind(ip.h, Date.now()).run();
      const bad = await env.DB.prepare("SELECT text FROM ratings WHERE vid = ? AND uid = ?").bind(row.vid, row.uid).first();   // 차단 사유: 신고된 후기와 신고 종류
      await env.DB.prepare("INSERT OR REPLACE INTO ban_info (uid, reason, vid, txt, ts) VALUES (?, ?, ?, ?, ?)").bind(row.uid, REASONS[row.reason] || "", row.vid, bad ? String(bad.text || "").slice(0, 300) : "", Date.now()).run().catch(() => {});
      const all = await env.DB.prepare("SELECT vid, stars, text, name, ts FROM ratings WHERE uid = ?").bind(row.uid).all();
      for (const r of all.results) await archive(env, r.vid, row.uid, r, "ban");
      await env.DB.prepare("DELETE FROM ratings WHERE uid = ?").bind(row.uid).run();
    } else if (b.act === "warn") {
      await warnTable(env);
      await env.DB.prepare("INSERT INTO warns (uid, vid, reason, ts) VALUES (?, ?, ?, ?)").bind(row.uid, row.vid, String(REASONS[row.reason] || ""), Date.now()).run();
    } else if (b.act === "del" || b.act === "delwarn") {
      if (b.act === "delwarn") { await warnTable(env); await env.DB.prepare("INSERT INTO warns (uid, vid, reason, ts) VALUES (?, ?, ?, ?)").bind(row.uid, row.vid, String(REASONS[row.reason] || ""), Date.now()).run(); }
      const old = await env.DB.prepare("SELECT stars, text, name, ts FROM ratings WHERE vid = ? AND uid = ?").bind(row.vid, row.uid).first();
      if (old) await archive(env, row.vid, row.uid, old, "mod");
      await env.DB.prepare("DELETE FROM ratings WHERE vid = ? AND uid = ?").bind(row.vid, row.uid).run();
    }
    else return json(env, { error: "bad" }, 400);
    return json(env, { ok: true });
  }

  return json(env, { error: "not found" }, 404);
}

export default {
  async fetch(req, env, ctx) { try { return await handle(req, env, ctx); } catch (e) { return json(env, { error: "server" }, 500); } }
};
export { handle, sign, verify };
