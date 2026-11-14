// 잉여맨추억자료실 별점 서버 (Cloudflare Worker)
// - 디스코드로 로그인 → 우리 서버 멤버인지 확인 → 별점 저장 (한 계정당 영상 하나에 한 번)
// - 별점을 줄 때마다 멤버인지 다시 확인해서, 차단·추방된 사람은 바로 막혀요
// - 하루 한 번, 서버를 나간 사람의 별점을 정리해요
//
// 필요한 설정(wrangler.toml / 대시보드):
//   변수  : CLIENT_ID, GUILD_ID, SITE_ORIGIN (예: https://sam7599.github.io), SITE_PATH (예: /ingyoeman_archive/), [ROLE_ID 선택]
//   비밀값: CLIENT_SECRET, BOT_TOKEN, SESSION_SECRET
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

// 디스코드 서버 멤버인지 확인 (봇이 확인해요). true=멤버, false=아님(차단·추방·미가입), null=확인 실패
async function isMember(env, uid) {
  if (!/^\d{5,25}$/.test(uid)) return false;
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.GUILD_ID}/members/${uid}`, { headers: { Authorization: "Bot " + env.BOT_TOKEN } });
  if (r.status === 404) return false;
  if (!r.ok) return null;
  if (env.ROLE_ID) { const m = await r.json(); return Array.isArray(m.roles) && m.roles.includes(env.ROLE_ID); }
  return true;
}

async function handle(req, env, ctx) {
  const url = new URL(req.url), p = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  const redirect = `${url.origin}/callback`;

  if (p === "/login") {   // 디스코드 로그인 화면으로 보내기
    const state = await sign(env, { n: crypto.randomUUID() }, 600);
    const q = new URLSearchParams({ client_id: env.CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: "identify", state, prompt: "none" });
    return Response.redirect("https://discord.com/oauth2/authorize?" + q, 302);
  }

  if (p === "/callback") {   // 로그인 끝나고 돌아오는 곳
    if (url.searchParams.get("error")) return Response.redirect(siteUrl(env, "auth=cancel"), 302);
    if (!await verify(env, url.searchParams.get("state"))) return Response.redirect(siteUrl(env, "auth=fail"), 302);
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect(siteUrl(env, "auth=fail"), 302);
    const t = await fetch("https://discord.com/api/v10/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirect }) });
    if (!t.ok) return Response.redirect(siteUrl(env, "auth=fail"), 302);
    const { access_token } = await t.json();
    const me = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: "Bearer " + access_token } });
    if (!me.ok) return Response.redirect(siteUrl(env, "auth=fail"), 302);
    const u = await me.json();
    const mem = await isMember(env, u.id);
    if (mem === null) return Response.redirect(siteUrl(env, "auth=fail"), 302);
    if (!mem) return Response.redirect(siteUrl(env, "auth=nomember"), 302);
    const tok = await sign(env, { uid: u.id, name: String(u.global_name || u.username || "").slice(0, 32) }, 30 * DAY);
    return Response.redirect(siteUrl(env, "auth=" + tok), 302);
  }

  if (p === "/ratings" && req.method === "GET") {   // 영상별 평균 (누구나)
    const rs = await env.DB.prepare("SELECT vid, ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings GROUP BY vid").all();
    const out = {}; for (const r of rs.results) out[r.vid] = [r.avg, r.n];
    return json(env, out, 200, { "Cache-Control": "public, max-age=60" });
  }

  if (p === "/me" && req.method === "GET") {   // 내가 준 별점 + 아직 멤버인지
    const s = await verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
    if (!s) return json(env, { error: "login" }, 401);
    const mem = await isMember(env, s.uid);
    const rs = await env.DB.prepare("SELECT vid, stars FROM ratings WHERE uid = ?").bind(s.uid).all();
    const mine = {}; for (const r of rs.results) mine[r.vid] = r.stars;
    return json(env, { name: s.name, member: mem !== false, mine });
  }

  if (p === "/rate" && req.method === "POST") {   // 별점 주기 (stars 0 = 내 별점 지우기)
    const s = await verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
    if (!s) return json(env, { error: "login" }, 401);
    let b; try { b = await req.json(); } catch (e) { return json(env, { error: "bad" }, 400); }
    const vid = String(b.vid || ""), stars = Number(b.stars);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid) || !Number.isInteger(stars) || stars < 0 || stars > 5) return json(env, { error: "bad" }, 400);
    const mem = await isMember(env, s.uid);   // 줄 때마다 지금도 멤버인지 확인
    if (mem === null) return json(env, { error: "busy" }, 503);
    if (!mem) { await env.DB.prepare("DELETE FROM ratings WHERE uid = ?").bind(s.uid).run(); return json(env, { error: "nomember" }, 403); }
    if (stars === 0) await env.DB.prepare("DELETE FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).run();
    else await env.DB.prepare("INSERT INTO ratings (vid, uid, stars, ts) VALUES (?, ?, ?, ?) ON CONFLICT(vid, uid) DO UPDATE SET stars = excluded.stars, ts = excluded.ts").bind(vid, s.uid, stars, Date.now()).run();
    const a = await env.DB.prepare("SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings WHERE vid = ?").bind(vid).first();
    return json(env, { ok: true, avg: a.avg || 0, n: a.n || 0 });
  }

  return json(env, { error: "not found" }, 404);
}

// 하루 한 번: 서버를 나갔거나 차단·추방된 사람의 별점을 지워요
async function purge(env) {
  const rs = await env.DB.prepare("SELECT DISTINCT uid FROM ratings LIMIT 300").all();
  let removed = 0;
  for (const r of rs.results) {
    const mem = await isMember(env, r.uid);
    if (mem === false) { await env.DB.prepare("DELETE FROM ratings WHERE uid = ?").bind(r.uid).run(); removed++; }
  }
  return removed;
}

export default {
  async fetch(req, env, ctx) { try { return await handle(req, env, ctx); } catch (e) { return json(env, { error: "server" }, 500); } },
  async scheduled(event, env, ctx) { ctx.waitUntil(purge(env)); }
};
export { handle, purge, sign, verify };
