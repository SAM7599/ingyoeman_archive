// 잉여맨추억자료실 서버 (Cloudflare Worker + D1)
// - 구글로 로그인 → 즐겨찾기·열어본 영상·오늘의 퀴즈 기록을 계정에 저장해요
// - 운영진(지정한 구글 계정)은 유저 목록과 의심 접속 기록을 보고 계정을 정지·해제할 수 있어요
// - 정지된 계정은 로그인할 수 없어요
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

const ipHash = async (env, req) => { const ip = req.headers.get("CF-Connecting-IP") || ""; return ip ? (await hmac(env.SESSION_SECRET, "ip:" + ip)).slice(0, 22) : ""; };
// ── 서버에 부담을 주는 것으로 의심되는 접속 기록 (접속 주소는 되돌릴 수 없는 코드로만, 30일 뒤 자동 삭제) ──
const ABUSE_DAYS = 30;
let abReady = false;
const abTables = async (env) => { if (abReady) return; await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS abuse_log (h TEXT NOT NULL, kind TEXT NOT NULL, uid TEXT, n INTEGER NOT NULL DEFAULT 1, first INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (h, kind))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS acct_ip (h TEXT NOT NULL, uid TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (h, uid))")]); abReady = true; };
const logAbuse = async (env, h, uid, kind, n) => {
  try {
    await abTables(env); const now = Date.now();
    await env.DB.prepare("INSERT INTO abuse_log (h, kind, uid, n, first, last) VALUES (?1, ?2, ?3, ?4, ?5, ?5) ON CONFLICT(h, kind) DO UPDATE SET n = CASE WHEN ?6 = 1 THEN excluded.n ELSE n + 1 END, last = excluded.last, uid = COALESCE(excluded.uid, uid)").bind(h, kind, uid || null, n || 1, now, n ? 1 : 0).run();
    if (Math.random() < 0.03) { const old = now - ABUSE_DAYS * 864e5; await env.DB.batch([env.DB.prepare("DELETE FROM abuse_log WHERE last < ?").bind(old), env.DB.prepare("DELETE FROM acct_ip WHERE ts < ?").bind(old)]); }
  } catch (e) {}
};
// 같은 접속 주소로 하루 안에 계정이 3개 이상 로그인하면 기록해요
const noteAcct = async (env, req, uid) => {
  try {
    const h = await ipHash(env, req); if (!h) return; await abTables(env); const now = Date.now();
    await env.DB.prepare("INSERT INTO acct_ip (h, uid, ts) VALUES (?, ?, ?) ON CONFLICT(h, uid) DO UPDATE SET ts = excluded.ts").bind(h, uid, now).run();
    const c = (await env.DB.prepare("SELECT COUNT(*) AS c FROM acct_ip WHERE h = ? AND ts > ?").bind(h, now - 864e5).first()).c || 0;
    if (c >= 3) await logAbuse(env, h, uid, "many_accounts", c);
  } catch (e) {}
};
// 같은 접속 주소(IP 코드)가 짧은 시간에 너무 자주 요청하면 막아요 (서버 한도를 지키기 위한 속도 제한)
let rlReady = false, visReady = false;
const tooFast = async (env, req, key, max, secs, uid, noLog) => {
  try {
    const h = await ipHash(env, req); if (!h) return false;
    if (!rlReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_hit (k TEXT PRIMARY KEY, win INTEGER NOT NULL, n INTEGER NOT NULL, ts INTEGER NOT NULL)").run(); rlReady = true; }
    const now = Date.now(), win = Math.floor(now / (secs * 1000));
    const r = await env.DB.prepare("INSERT INTO rate_hit (k, win, n, ts) VALUES (?1, ?2, 1, ?3) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN win = excluded.win THEN n + 1 ELSE 1 END, win = excluded.win, ts = excluded.ts RETURNING n").bind(key + ":" + h, win, now).first();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_hit WHERE ts < ?").bind(now - 864e5).run().catch(() => {});
    if (r && r.n > max) { if (!noLog) await logAbuse(env, h, uid, key); return true; }   // 운영진 계정은 의심 기록에 남기지 않아요   // 한도를 넘으면 의심 기록에 남겨요
    return false;
  } catch (e) { return false; }   // 속도 제한 장치가 고장나도 사이트는 계속 돼요
};
const slow = env => json(env, { error: "slow" }, 429);
// "내 정보 전부 삭제" 뒤 24시간 동안은 다시 로그인할 수 없어요 (삭제·재가입을 반복해서 서버에 부담을 주는 것을 막아요)
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

// ── 입력 검사 ──
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
const ADJ = ["졸린", "배고픈", "수줍은", "용감한", "느긋한", "엉뚱한", "씩씩한", "다정한", "시끄러운", "조용한", "빠른", "느린", "행복한", "심심한", "든든한", "반짝이는", "푸른", "붉은", "노란", "새하얀", "까만", "작은", "커다란", "웃는", "춤추는", "달리는", "꿈꾸는", "비밀스러운", "의젓한", "장난꾸러기"];
const NOUN = ["너구리", "고양이", "강아지", "다람쥐", "토끼", "펭귄", "수달", "부엉이", "판다", "여우", "하마", "고래", "거북이", "오리", "햄스터", "참새", "곰돌이", "사슴", "두더지", "카피바라", "미어캣", "알파카", "병아리", "청설모", "돌고래", "코알라", "앵무새", "해달", "치타", "기린"];
const nick = async (env, uid) => { const h = await hmac(env.SESSION_SECRET, "nick:" + uid), A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", v = i => A.indexOf(h[i]) + 1; return ADJ[(v(0) * 7 + v(1)) % ADJ.length] + NOUN[(v(2) * 7 + v(3)) % NOUN.length] + String((v(4) * 11 + v(5)) % 100).padStart(2, "0"); };
// 고치기 전 / 지우기 전 모습을 보관함에 남겨요 (why: edit=고침, del=본인이 지움, mod=운영진이 지움, ban=차단으로 지워짐)
// 보관함 자동 비우기: 보관한 지 RETENTION_DAYS(기본 180일 ≈ 6개월)가 지난 기록을 지워요. 별도 설정 없이 접속할 때 알아서 정리돼요
// ── 로그인한 사람의 자료 저장 (즐겨찾기·열어본 영상·시리즈 고침 + 방문 도장 + 퀴즈 기록) ──
// 저장량 한도: 영상 번호만 저장하고, 사람마다 상한을 둬요. 6개월(RETENTION_DAYS) 동안 오지 않으면 자동으로 지워요.
const FAV_MAX = 300, REC_MAX = 100, SOV_MAX = 200;
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 36e5).toISOString().slice(0, 10);
let udReady = false;
const udTable = async (env) => { if (udReady) return; await env.DB.prepare("CREATE TABLE IF NOT EXISTS udata (uid TEXT PRIMARY KEY, fav TEXT NOT NULL DEFAULT '[]', rec TEXT NOT NULL DEFAULT '[]', sov TEXT NOT NULL DEFAULT '{}', days INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last TEXT NOT NULL DEFAULT '', q_ok INTEGER NOT NULL DEFAULT 0, q_all INTEGER NOT NULL DEFAULT 0, q_streak INTEGER NOT NULL DEFAULT 0, q_last TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL DEFAULT 0)").run(); udReady = true; };
const udGet = async (env, uid) => { await udTable(env); return (await env.DB.prepare("SELECT * FROM udata WHERE uid = ?").bind(uid).first()) || { uid, fav: "[]", rec: "[]", sov: "{}", days: 0, streak: 0, last: "", q_ok: 0, q_all: 0, q_streak: 0, q_last: "", ts: 0 }; };
const udSave = (env, r) => env.DB.prepare("INSERT INTO udata (uid, fav, rec, sov, days, streak, last, q_ok, q_all, q_streak, q_last, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET fav = excluded.fav, rec = excluded.rec, sov = excluded.sov, days = excluded.days, streak = excluded.streak, last = excluded.last, q_ok = excluded.q_ok, q_all = excluded.q_all, q_streak = excluded.q_streak, q_last = excluded.q_last, ts = excluded.ts").bind(r.uid, r.fav, r.rec, r.sov, r.days, r.streak, r.last, r.q_ok, r.q_all, r.q_streak, r.q_last, r.ts).run();
const purgeOld = (env) => env.DB.prepare("DELETE FROM udata WHERE ts < ?").bind(Date.now() - (Number(env.RETENTION_DAYS) || 180) * 864e5).run().catch(() => {});   // 6개월 안 온 사람의 자료는 지워요
const udOut = (r) => ({ fav: JSON.parse(r.fav || "[]"), rec: JSON.parse(r.rec || "[]"), sov: JSON.parse(r.sov || "{}"), quiz: { ok: r.q_ok, all: r.q_all, streak: r.q_streak } });
const idList = (a, max) => Array.isArray(a) ? [...new Set(a.filter(x => typeof x === "string" && /^[\w-]{1,24}$/.test(x)))].slice(0, max) : null;
const sovClean = (o) => { if (!o || typeof o !== "object" || Array.isArray(o)) return null; const out = {}; let n = 0; for (const k of Object.keys(o)) { if (!/^[\w-]{1,24}$/.test(k) || !Array.isArray(o[k])) continue; const names = [...new Set(o[k].filter(x => typeof x === "string").map(x => x.trim().slice(0, 20)).filter(Boolean))].slice(0, 6); out[k] = names; if (++n >= SOV_MAX) break; } return out; };
// 운영진 경고 기록 (운영진만 볼 수 있는 메모예요. 보관 기간이 지나면 자동으로 지워져요)

const newUid = async (env, sub) => "u" + (await hmac(env.SESSION_SECRET, "uid:" + sub)).slice(0, 24);
const UID_RE = /^(g\d{5,30}|u[\w-]{24})$/;
// 예전 기록(uid = "g"+구글번호)을 새 코드로 바꿔요. 새 코드에 이미 같은 항목이 있으면 건드리지 않아요
// ── 운영진이 정지한 계정 (계정 코드만 저장해요) ──
let banReady = false;
const isBanned = async (env, uid) => { try { if (!banReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS acct_ban (uid TEXT PRIMARY KEY, ts INTEGER NOT NULL)").run(); banReady = true; } return !!(await env.DB.prepare("SELECT 1 AS x FROM acct_ban WHERE uid = ?").bind(uid).first()); } catch (e) { return false; } };
async function getAuth(env, req) { const s = await verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, "")); return s && /^u[\w-]{24}$/.test(String(s.uid)) && !(await isBanned(env, s.uid)) ? s : null; }   // 예전 방식 로그인은 한 번 다시 로그인하게 해요

// ── 서버 사용량 (무료 한도 확인용) ──
// 요청 수는 10번에 1번만 기록하고 10씩 더해서(쓰기 한도를 아끼려고) 대략의 값을 보여줘요. 하루 기준은 한국 시간 오전 9시(= 클라우드플레어 UTC 0시)에 바뀌어요.
let useReady = false;
const utcDay = () => new Date().toISOString().slice(0, 10);
const countReq = (env, ctx, p) => {
  if (Math.random() >= 0.1) return;
  const job = (async () => {
    try {
      if (!useReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS req_count (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)").run(); useReady = true; }
      await env.DB.prepare("INSERT INTO req_count (day, n) VALUES (?, 10) ON CONFLICT(day) DO UPDATE SET n = n + 10").bind(utcDay()).run();
    } catch (e) {}
  })();
  try { ctx.waitUntil(job); } catch (e) {}
};
async function handle(req, env, ctx) {
  const url = new URL(req.url), p = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  countReq(env, ctx, p);
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
    if (await isBanned(env, uid)) return json(env, { error: "banned" }, 403);   // 운영진이 정지한 계정
    const em = g.email_verified === "true" || g.email_verified === true ? String(g.email || "").toLowerCase() : "";
    if (!isAdmin(env, { em })) await noteAcct(env, req, uid);   // 운영진 계정은 의심 기록에서 제외
    const name = await nick(env, uid);
    return json(env, { token: await sign(env, { uid, name, em }, 30 * DAY), name, admin: isAdmin(env, { em }) });
  }

  if (p === "/ping" && req.method === "POST") {   // 방문자 수: 접속 주소(IP)를 하루짜리 코드로만 바꿔 세고, 원래 주소는 저장하지 않아요 (하루가 지나면 코드도 지워요)
    try {
      if (!visReady) {
        await env.DB.batch([
          env.DB.prepare("CREATE TABLE IF NOT EXISTS visit_day (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h))"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS visit_now (h TEXT PRIMARY KEY, ts INTEGER NOT NULL)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS visit_tot (day TEXT PRIMARY KEY, n INTEGER NOT NULL)")]);
        visReady = true;
      }
      const now = Date.now(), day = new Date(now + 9 * 36e5).toISOString().slice(0, 10), ip = req.headers.get("CF-Connecting-IP") || "";
      if (ip) {
        const h = (await hmac(env.SESSION_SECRET, "vis:" + day + ":" + ip)).slice(0, 22);
        const fresh = await env.DB.prepare("INSERT INTO visit_day (day, h) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING h").bind(day, h).first();
        if (fresh) {
          await env.DB.prepare("INSERT INTO visit_tot (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1").bind(day).run();
          await env.DB.prepare("DELETE FROM visit_day WHERE day < ?").bind(day).run().catch(() => {});   // 지난 날의 접속 코드는 모두 지워요
          await env.DB.prepare("DELETE FROM visit_now WHERE ts < ?").bind(now - 6e5).run().catch(() => {});
        }
        await env.DB.prepare("INSERT INTO visit_now (h, ts) VALUES (?, ?) ON CONFLICT(h) DO UPDATE SET ts = excluded.ts WHERE visit_now.ts < excluded.ts - 30000").bind(h, now).run();
      }
      const t = await env.DB.prepare("SELECT n FROM visit_tot WHERE day = ?").bind(day).first();
      const a = await env.DB.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM visit_tot").first();
      const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM visit_now WHERE ts > ?").bind(now - 12e4).first();
      return json(env, { today: t ? t.n : 0, total: a ? a.n : 0, now: c ? c.n : 0 }, 200, { "Cache-Control": "no-store" });
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }

  if (p === "/sync" && req.method === "GET") {   // 내 즐겨찾기·열어본 영상·시리즈 고침·퀴즈 기록 가져오기
    const s = await getAuth(env, req); if (!s) return json(env, { error: "login" }, 401);
    try {
      const r = await udGet(env, s.uid);
      if (r.ts && r.ts < Date.now() - 864e5) { await env.DB.prepare("UPDATE udata SET ts = ? WHERE uid = ?").bind(Date.now(), s.uid).run().catch(() => {}); if (Math.random() < 0.05) await purgeOld(env); }   // 오늘 왔다는 표시 (6개월 계산용)
      return json(env, udOut(r), 200, { "Cache-Control": "no-store" });
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }
  if (p === "/sync" && req.method === "POST") {   // 바뀐 것만 보내면 저장해요 (한도를 넘으면 오래된 것부터 잘라요)
    const s = await getAuth(env, req); if (!s) return json(env, { error: "login" }, 401);
    if (await tooFast(env, req, "sync", 20, 60, s.uid, isAdmin(env, s))) return slow(env);
    let b; try { const t = await req.text(); if (t.length > 40000) return json(env, { error: "big" }, 413); b = JSON.parse(t); } catch (e) { return json(env, { error: "bad" }, 400); }
    try {
      const r = await udGet(env, s.uid), fav = idList(b.fav, FAV_MAX), rec = idList(b.rec, REC_MAX), sov = sovClean(b.sov);
      if (fav) r.fav = JSON.stringify(fav); if (rec) r.rec = JSON.stringify(rec); if (sov) r.sov = JSON.stringify(sov);
      r.ts = Date.now(); await udSave(env, r);
      return json(env, { ok: true });
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }
  if (p === "/quiz" && req.method === "POST") {   // 오늘의 퀴즈 결과 기록 (하루 한 번)
    const s = await getAuth(env, req); if (!s) return json(env, { error: "login" }, 401);
    if (await tooFast(env, req, "quiz", 10, 60, s.uid, isAdmin(env, s))) return slow(env);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    try {
      const r = await udGet(env, s.uid), today = kstDay();
      if (b && b.d === today && r.q_last !== today) { r.q_all += 1; if (b.ok === true) { r.q_ok += 1; r.q_streak += 1; } else r.q_streak = 0; r.q_last = today; r.ts = Date.now(); await udSave(env, r); }
      return json(env, udOut(r).quiz);
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }

  if (p === "/me" && req.method === "GET") {   // 내 별명과 운영진 여부
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    return json(env, { name: await nick(env, s.uid), admin: isAdmin(env, s) });
  }

  if (p === "/admin/users" && req.method === "GET") {   // 운영진: 로그인한 사람 목록
    const s = await getAuth(env, req); if (!s || !isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    try {
      await udTable(env); await abTables(env);
      const rows = (await env.DB.prepare("SELECT uid, fav, rec, q_ok, q_all, ts FROM udata ORDER BY ts DESC LIMIT 300").all()).results || [];
      const total = (await env.DB.prepare("SELECT COUNT(*) AS c FROM udata").first()).c || 0;
      const flags = new Set(((await env.DB.prepare("SELECT DISTINCT uid FROM abuse_log WHERE uid IS NOT NULL").all()).results || []).map(x => x.uid));
      await isBanned(env, "x"); const bans = new Map(((await env.DB.prepare("SELECT uid, ts FROM acct_ban").all()).results || []).map(x => [x.uid, x.ts]));
      const users = []; for (const r of rows) { users.push({ uid: r.uid, name: await nick(env, r.uid), ts: r.ts, fav: JSON.parse(r.fav || "[]").length, rec: JSON.parse(r.rec || "[]").length, qok: r.q_ok, qall: r.q_all, flag: flags.has(r.uid), banned: bans.has(r.uid) }); bans.delete(r.uid); }
      for (const [uid, ts] of bans) users.unshift({ uid, name: await nick(env, uid), ts, fav: 0, rec: 0, qok: 0, qall: 0, flag: flags.has(uid), banned: true });
      return json(env, { total, users }, 200, { "Cache-Control": "no-store" });
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }
  if (p === "/admin/usage" && req.method === "GET") {   // 운영진: 오늘 서버 사용량 (무료 한도 대비)
    const s = await getAuth(env, req); if (!s || !isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    try {
      await udTable(env); await abTables(env);
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS req_count (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)").run(); useReady = true;
      const q = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM udata) AS users, (SELECT n FROM req_count WHERE day = ?) AS today").bind(utcDay()).all();
      const hist = ((await env.DB.prepare("SELECT day, n FROM req_count ORDER BY day DESC LIMIT 7").all()).results || []).reverse();
      const r = (q.results || [])[0] || {};
      const now = new Date(), next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      return json(env, { reqToday: r.today || 0, reqLimit: Number(env.REQ_LIMIT) || 100000, dbBytes: (q.meta && q.meta.size_after) || 0, dbLimit: (Number(env.DB_LIMIT_MB) || 500) * 1048576, users: r.users || 0, resetAt: next, hist }, 200, { "Cache-Control": "no-store" });
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }
  if (p === "/admin/abuse" && req.method === "GET") {   // 운영진: 서버에 부담을 준 것으로 의심되는 기록
    const s = await getAuth(env, req); if (!s || !isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    try {
      await abTables(env);
      const rows = (await env.DB.prepare("SELECT h, kind, uid, n, first, last FROM abuse_log ORDER BY last DESC LIMIT 200").all()).results || [];
      const out = []; for (const r of rows) out.push({ ip: r.h.slice(0, 8), kind: r.kind, uid: r.uid, banned: r.uid ? await isBanned(env, r.uid) : false, name: r.uid ? await nick(env, r.uid) : "", n: r.n, first: r.first, last: r.last });
      return json(env, { days: ABUSE_DAYS, rows: out }, 200, { "Cache-Control": "no-store" });
    } catch (e) { return json(env, { error: "busy" }, 503); }
  }
  if (p === "/admin/user/ban" && req.method === "POST") {   // 운영진: 계정 정지 / 정지 풀기
    const s = await getAuth(env, req); if (!s || !isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const uid = String(b.uid || ""); if (!/^u[\w-]{10,40}$/.test(uid)) return json(env, { error: "bad" }, 400);
    if (uid === s.uid) return json(env, { error: "self" }, 400);   // 내 계정은 정지할 수 없어요
    await isBanned(env, "x");
    if (b.ban === false) await env.DB.prepare("DELETE FROM acct_ban WHERE uid = ?").bind(uid).run();
    else await env.DB.prepare("INSERT INTO acct_ban (uid, ts) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET ts = excluded.ts").bind(uid, Date.now()).run();
    return json(env, { ok: true, banned: b.ban !== false });
  }

  if (p === "/account/delete" && req.method === "POST") {   // 내 저장 자료와 접속 기록을 한 번에 지워요
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    for (const t of ["ratings", "rating_history", "ip_seen"]) await env.DB.prepare("DELETE FROM " + t + " WHERE uid = ?").bind(s.uid).run().catch(() => {});   // 예전 기능의 기록이 남아 있으면 함께 지워요
    await env.DB.prepare("DELETE FROM reports WHERE uid = ? OR reporter = ?").bind(s.uid, s.uid).run().catch(() => {});
    for (const t of ["acct_ip", "abuse_log"]) await env.DB.prepare("DELETE FROM " + t + " WHERE uid = ?").bind(s.uid).run().catch(() => {});   // 의심 기록에 남은 내 계정 표시도 함께 지워요
    await udTable(env).then(() => env.DB.prepare("DELETE FROM udata WHERE uid = ?").bind(s.uid).run()).catch(() => {});   // 저장해 둔 즐겨찾기·기록도 함께 지워요
    if (!isAdmin(env, s)) { await lockLeft(env, s.uid); await env.DB.prepare("INSERT INTO delete_lock (uid, ts) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET ts = excluded.ts").bind(s.uid, Date.now()).run(); await env.DB.prepare("DELETE FROM delete_lock WHERE ts < ?").bind(Date.now() - LOCK_MS).run().catch(() => {}); }   // 24시간 동안 다시 로그인할 수 없어요
    return json(env, { ok: true, hours: 24 });
  }

  return json(env, { error: "not found" }, 404);
}

export default {
  async fetch(req, env, ctx) { try { return await handle(req, env, ctx); } catch (e) { return json(env, { error: "server" }, 500); } }
};
export { handle, sign, verify };
