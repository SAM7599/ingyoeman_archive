// 잉여맨추억자료실 별점 서버 (Cloudflare Worker)
// - 구글로 로그인 → 별점 + 후기 저장 (한 계정당 영상 하나에 한 번, 후기는 꼭 써야 해요)
// - 후기 신고 → 운영진 디스코드 채널로 전달 (웹훅, 현재 후기 + 고치기 전 기록, 삭제·차단 링크 포함)
// - 차단된 구글 계정은 별점·후기·신고를 할 수 없고, 그 사람의 후기는 사라져요
//
// 필요한 설정(wrangler.toml / 대시보드):
//   변수  : GOOGLE_CLIENT_ID, SITE_ORIGIN (예: https://sam7599.github.io), SITE_PATH (예: /ingyoeman_archive/)
//   비밀값: SESSION_SECRET, REPORT_WEBHOOK (운영진 채널의 웹훅 주소)
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
    return json(env, { token: await sign(env, { uid, name }, 30 * DAY), name });
  }

  if (p === "/ratings" && req.method === "GET") {   // 영상별 평균 (누구나)
    const rs = await env.DB.prepare("SELECT vid, ROUND(AVG(stars), 2) AS avg, COUNT(*) AS n FROM ratings GROUP BY vid").all();
    const out = {}; for (const r of rs.results) out[r.vid] = [r.avg, r.n];
    return json(env, out, 200, { "Cache-Control": "public, max-age=60" });
  }

  if (p === "/me" && req.method === "GET") {   // 내가 준 별점 + 아직 멤버인지
    const s = await verify(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
    if (!s) return json(env, { error: "login" }, 401);
    const banned = await isBanned(env, s.uid);
    const rs = await env.DB.prepare("SELECT vid, stars, text FROM ratings WHERE uid = ?").bind(s.uid).all();
    const mine = {}; for (const r of rs.results) mine[r.vid] = [r.stars, r.text];
    return json(env, { name: s.name, member: !banned, mine });
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
    if (stars === 0) await env.DB.prepare("DELETE FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).run();
    else {
      const old = await env.DB.prepare("SELECT stars, text, ts FROM ratings WHERE vid = ? AND uid = ?").bind(vid, s.uid).first();
      if (old && (old.text !== text || old.stars !== stars)) await env.DB.prepare("INSERT INTO rating_history (vid, uid, stars, text, ts) VALUES (?, ?, ?, ?, ?)").bind(vid, s.uid, old.stars, old.text, old.ts).run();   // 고치기 전 모습 보관
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
    const hist = await env.DB.prepare("SELECT stars, text, ts FROM rating_history WHERE vid = ? AND uid = ? ORDER BY id DESC LIMIT 3").bind(vid, target.uid).all();
    const modTok = await sign(env, { a: "mod", vid, uid: target.uid }, 30 * DAY);
    const sent = await notify(env, {
      title: "🚨 후기 신고 #" + row.id,
      color: 0xe5484d,
      fields: [
        { name: "영상", value: `[${vid}](${env.SITE_ORIGIN}${env.SITE_PATH || "/"}#v=${vid})`, inline: true },
        { name: "신고 사유", value: REASONS[reason], inline: true },
        { name: "누적 신고", value: total + "건", inline: true },
        { name: "현재 후기 — " + cut(target.name, 30) + " · " + "★".repeat(target.stars) + " · " + ago(target.ts), value: cut(target.text, 900) || "(없음)" },
        { name: "이전 후기 (고치기 전)", value: hist.results.length ? hist.results.map(h => `• ${ago(h.ts)} · ★${h.stars} · ${cut(h.text, 160)}`).join("\n") : "고친 기록 없음" },
        { name: "작성자", value: `${cut(target.name, 30)} (${target.uid})`, inline: true },
        { name: "신고자", value: `${cut(s.name, 30)} (${s.uid})`, inline: true },
        ...(note ? [{ name: "신고자 메모", value: cut(note, 200) }] : []),
        { name: "처리", value: `[후기 삭제 / 작성자 차단](${url.origin}/mod?t=${modTok})\n신고자가 캡처를 올리면 #${row.id} 번호와 함께 올라와요.` }
      ],
      footer: { text: "삭제 링크는 이 채널 운영진만 보세요" }, timestamp: new Date().toISOString()
    });
    return json(env, { ok: true, no: row.id, sent });
  }

  if (p === "/mod") {   // 운영진용: 신고된 후기 삭제 / 작성자 차단 (디스코드 링크 → 확인 화면 → 버튼)
    let form = null; if (req.method === "POST") form = new URLSearchParams(await req.text());
    const tok = form ? form.get("t") : url.searchParams.get("t");
    const m = await verify(env, tok);
    if (!m || m.a !== "mod") return html("<h2>링크가 올바르지 않거나 만료됐어요</h2>");
    const r = await env.DB.prepare("SELECT name, stars, text, ts FROM ratings WHERE vid = ? AND uid = ?").bind(m.vid, m.uid).first();
    if (form) {
      const act = form.get("act");
      if (act === "ban") { await env.DB.prepare("INSERT OR IGNORE INTO banned (uid, ts) VALUES (?, ?)").bind(m.uid, Date.now()).run(); await env.DB.prepare("DELETE FROM ratings WHERE uid = ?").bind(m.uid).run(); return html("<h2>✅ 작성자를 차단하고 그 사람의 모든 후기를 지웠어요</h2><p>이 계정은 앞으로 별점·후기·신고를 할 수 없어요.</p>"); }
      await env.DB.prepare("DELETE FROM ratings WHERE vid = ? AND uid = ?").bind(m.vid, m.uid).run();
      return html("<h2>✅ 후기를 삭제했어요</h2><p>이 영상의 별점 평균에서도 빠졌어요. 사이트에는 몇 분 안에 반영돼요.</p>");
    }
    if (!r) return html("<h2>이미 삭제됐거나 없는 후기예요</h2>");
    const btn = (act, label, bg) => `<button name="act" value="${act}" style="margin:14px 8px 0 0;padding:10px 18px;font-size:16px;background:${bg};color:#fff;border:0;border-radius:8px;cursor:pointer">${label}</button>`;
    return html(`<h2>이 후기를 어떻게 할까요?</h2><p><b>${esc(r.name)}</b> · ${"★".repeat(r.stars)} · ${ago(r.ts)}</p><blockquote style="border-left:4px solid #ccc;margin:0;padding:6px 12px;white-space:pre-wrap">${esc(r.text)}</blockquote><form method="post"><input type="hidden" name="t" value="${esc(tok)}">${btn("del", "이 후기만 삭제", "#e5484d")}${btn("ban", "삭제 + 작성자 차단", "#7a1f23")}</form><p style="color:#666;font-size:14px">되돌릴 수 없어요. 차단하면 그 사람의 모든 후기가 지워지고 다시 남길 수 없어요.</p>`);
  }

  return json(env, { error: "not found" }, 404);
}

// 운영진 채널에 신고 알림 (웹훅)
async function notify(env, embed) {
  if (!env.REPORT_WEBHOOK) return false;
  try {
    const r = await fetch(env.REPORT_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "후기 신고", embeds: [embed], allowed_mentions: { parse: [] } }) });
    return r.ok;
  } catch (e) { return false; }
}

export default {
  async fetch(req, env, ctx) { try { return await handle(req, env, ctx); } catch (e) { return json(env, { error: "server" }, 500); } }
};
export { handle, sign, verify };
