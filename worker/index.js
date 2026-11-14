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
async function sign(env, obj, ttl) {
  const body = b64uStr(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttl }));
  return body + "." + await hmac(env.SESSION_SECRET, body);
}
async function verify(env, tok) {
  try {
    const [body, sig] = String(tok || "").split(".");
    if (!body || !sig || sig !== await hmac(env.SESSION_SECRET, body)) return null;
    const o = JSON.parse(unb64uStr(body));
    return o.exp > Date.now() / 1000 ? o : null;
  } catch (e) { return null; }
}

const cors = env => ({ "Access-Control-Allow-Origin": env.SITE_ORIGIN, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin" });
const json = (env, data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env), ...extra } });
const siteUrl = (env, hash) => env.SITE_ORIGIN + (env.SITE_PATH || "/") + "#" + hash;

const isAdmin = (env, s) => !!s && !!s.em && String(env.ADMIN_EMAILS || "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean).includes(s.em);
// 차단된 계정인지
async function isBanned(env, uid) { return !!await env.DB.prepare("SELECT 1 AS x FROM banned WHERE uid = ?").bind(uid).first(); }

// ── 후기 검사 ──
const REASONS = { ad: "광고·홍보", spam: "스팸·도배", abuse: "욕설·비방", empty: "무의미한 내용 (점·기호만 올림 등)", other: "기타" };
function checkText(t) {   // 문제가 있으면 이유 코드를, 괜찮으면 null
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (s.length < 5) return "short";
  if (s.length > 300) return "long";
  const core = s.replace(/[^\p{L}\p{N}]/gu, "");
  if (core.length < 4 || new Set(core).size < 3) return "empty";   // 점·기호만, 같은 글자 반복
  if (/(https?:\/\/|www\.|discord\.gg|\.(com|net|kr|io|me|gg|xyz)\b)/i.test(s)) return "link";   // 광고 링크
  return null;
}
const mask = n => { const c = Array.from(String(n || "").trim()); if (!c.length) return "****"; return c.slice(0, c.length <= 2 ? 1 : 2).join("") + "****"; };   // 앞 2글자만 보이고 나머지는 ****
// 고치기 전 / 지우기 전 모습을 보관함에 남겨요 (why: edit=고침, del=본인이 지움, mod=운영진이 지움, ban=차단으로 지워짐)
// 보관함 자동 비우기: 보관한 지 RETENTION_DAYS(기본 180일 ≈ 6개월)가 지난 기록을 지워요. 별도 설정 없이 후기가 오갈 때·보관함을 열 때 알아서 정리돼요
const sweep = (env) => env.DB.prepare("DELETE FROM rating_history WHERE (CASE WHEN at > 0 THEN at ELSE ts END) < ?").bind(Date.now() - (Number(env.RETENTION_DAYS) || 180) * 864e5).run();
const archive = async (env, vid, uid, r, why) => { await env.DB.prepare("INSERT INTO rating_history (vid, uid, stars, text, ts, name, why, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(vid, uid, r.stars, r.text, r.ts, r.name || "", why, Date.now()).run(); if (Math.random() < 0.05) await sweep(env).catch(() => {}); };
const clean = t => String(t || "").replace(/\s+/g, " ").trim();
const rid = (env, vid, uid) => hmac(env.SESSION_SECRET, "rid:" + vid + ":" + uid).then(h => h.slice(0, 16));
const cut = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = body => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>운영진</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 18px;line-height:1.6">${body}`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
const ago = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");   // 한국 시간

async function getAuth(env, req) { return verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, "")); }

async function handle(req, env, ctx) {
  const url = new URL(req.url), p = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  const redirect = `${url.origin}/callback`;

  if (p === "/google" && req.method === "POST") {   // 구글 로그인 확인 → 우리 사이트용 로그인 토큰
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const cred = String(b.credential || "");
    if (!cred || cred.length > 4000) return json(env, { error: "bad" }, 400);
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
    if (!r.ok) return json(env, { error: "login" }, 401);
    const g = await r.json();
    if (g.aud !== env.GOOGLE_CLIENT_ID || !/^\d{5,30}$/.test(String(g.sub || "")) || !(g.exp > Date.now() / 1000)) return json(env, { error: "login" }, 401);
    const uid = "g" + g.sub;
    if (await isBanned(env, uid)) return json(env, { error: "banned" }, 403);
    const name = String(g.name || (g.email || "").split("@")[0] || "").slice(0, 32);
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
    const s = await verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
    if (!s) return json(env, { error: "login" }, 401);
    const banned = await isBanned(env, s.uid);
    const rs = await env.DB.prepare("SELECT vid, stars, text FROM ratings WHERE uid = ?").bind(s.uid).all();
    const mine = {}; for (const r of rs.results) mine[r.vid] = [r.stars, r.text];
    return json(env, { name: s.name, member: !banned, mine, admin: isAdmin(env, s) });
  }

  if (p === "/reviews" && req.method === "GET") {   // 한 영상의 후기 목록 (누구나)
    const vid = url.searchParams.get("vid") || "";
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid)) return json(env, { error: "bad" }, 400);
    const me = await getAuth(env, req);
    const rs = await env.DB.prepare("SELECT uid, name, stars, text, ts FROM ratings WHERE vid = ? ORDER BY ts DESC LIMIT 40").bind(vid).all();
    const list = []; for (const r of rs.results) list.push({ id: await rid(env, vid, r.uid), name: mask(r.name), stars: r.stars, text: r.text, ts: r.ts, me: !!me && me.uid === r.uid });
    return json(env, list, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/rate" && req.method === "POST") {   // 별점 + 후기 남기기 (stars 0 = 내 별점·후기 지우기)
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const vid = String(b.vid || ""), stars = Number(b.stars), text = clean(b.text);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid) || !Number.isInteger(stars) || stars < 0 || stars > 5) return json(env, { error: "bad" }, 400);
    if (stars > 0) { const bad = checkText(text); if (bad) return json(env, { error: "text", code: bad }, 400); }   // 후기는 꼭 필요해요
    if (await isBanned(env, s.uid)) return json(env, { error: "banned" }, 403);   // 차단된 계정은 막아요
    if (stars === 0) {
      const old = await env.DB.prepare("SELECT stars, text, name, ts FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).first();
      if (old) await archive(env, vid, s.uid, old, "del");   // 지우기 전 모습 보관
      await env.DB.prepare("DELETE FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).run();
    } else {
      const old = await env.DB.prepare("SELECT stars, text, name, ts FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).first();
      if (old && (old.text !== text || old.stars !== stars)) await archive(env, vid, s.uid, old, "edit");   // 고치기 전 모습 보관
      await env.DB.prepare("INSERT INTO ratings (vid, uid, stars, text, name, ts) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(vid, uid) DO UPDATE SET stars = excluded.stars, text = excluded.text, name = excluded.name, ts = excluded.ts").bind(vid, s.uid, stars, text, s.name || "", Date.now()).run();
    }
    const a = await env.DB.prepare("SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings WHERE vid = ?").bind(vid).first();
    return json(env, { ok: true, avg: a.avg || 0, n: a.n || 0 });
  }

  if (p === "/report" && req.method === "POST") {   // 후기 신고 → 운영진 디스코드 채널
    const s = await getAuth(env, req);
    if (!s) return json(env, { error: "login" }, 401);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const vid = String(b.vid || ""), reason = String(b.reason || ""), note = clean(b.note).slice(0, 200), id = String(b.id || "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid) || !REASONS[reason] || !/^[A-Za-z0-9_-]{6,40}$/.test(id)) return json(env, { error: "bad" }, 400);
    if (await isBanned(env, s.uid)) return json(env, { error: "banned" }, 403);
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
      out.push({ id: r.id, vid: r.vid, uid: r.uid, reason: REASONS[r.reason] || r.reason, note: r.note, ts: r.ts, cnt, cur: cur || null, hist: hist.results, banned: await isBanned(env, r.uid) });
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
      out.push({ id: h.id, vid: h.vid, uid: h.uid, name: h.name, stars: h.stars, text: h.text, ts: h.ts, why: h.why, cur: cur || null, banned: await isBanned(env, h.uid) });
    }
    return json(env, out, 200, { "Cache-Control": "no-store" });
  }

  if (p === "/admin/purge" && req.method === "POST") {   // 운영진: 보관함 기록 영구 삭제 (본인이 보관을 원치 않을 때)
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    if (b.uid) { if (!/^g\d+$/.test(String(b.uid))) return json(env, { error: "bad" }, 400); await env.DB.prepare("DELETE FROM rating_history WHERE uid = ?").bind(String(b.uid)).run(); }
    else if (Number.isInteger(b.id)) await env.DB.prepare("DELETE FROM rating_history WHERE id = ?").bind(b.id).run();
    else return json(env, { error: "bad" }, 400);
    return json(env, { ok: true });
  }

  if (p === "/admin/act" && req.method === "POST") {   // 운영진: 후기 삭제 / 작성자 차단
    const s = await getAuth(env, req); if (!isAdmin(env, s)) return json(env, { error: "forbidden" }, 403);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const row = await env.DB.prepare("SELECT vid, uid FROM reports WHERE id = ?").bind(Number(b.id)).first();
    if (!row) return json(env, { error: "gone" }, 404);
    if (b.act === "ban") {
      await env.DB.prepare("INSERT OR IGNORE INTO banned (uid, ts) VALUES (?, ?)").bind(row.uid, Date.now()).run();
      const all = await env.DB.prepare("SELECT vid, stars, text, name, ts FROM ratings WHERE uid = ?").bind(row.uid).all();
      for (const r of all.results) await archive(env, r.vid, row.uid, r, "ban");
      await env.DB.prepare("DELETE FROM ratings WHERE uid = ?").bind(row.uid).run();
    } else if (b.act === "del") {
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
