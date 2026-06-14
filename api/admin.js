// /api/admin — 운영자 전용. 헤더 x-admin-token === ADMIN_TOKEN 일 때만 동작.
//   GET  ?type=price-pending | price-recent | reviews   → 목록
//   POST { action, id }  action: approve|reject|delPrice|hideReview|showReview|delReview
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

function authed(req) {
  const t = req.headers["x-admin-token"] || (req.query && req.query.token) || "";
  return !!process.env.ADMIN_TOKEN && String(t) === String(process.env.ADMIN_TOKEN);
}

module.exports = async (req, res) => {
  try {
    if (!authed(req)) return res.status(401).json({ error: "unauthorized" });

    if (req.method === "GET") {
      const type = String(req.query.type || "price-pending");
      if (type === "price-pending") {
        const r = await sql`select id, venue_name, meal, rental, client_id, (extract(epoch from created_at)*1000)::bigint as ts
          from price_reports where status = 'pending' order by created_at desc limit 300`;
        return res.json({ rows: r });
      }
      if (type === "price-recent") {
        const r = await sql`select id, venue_name, meal, rental, status, (extract(epoch from created_at)*1000)::bigint as ts
          from price_reports where status <> 'pending' order by created_at desc limit 100`;
        return res.json({ rows: r });
      }
      if (type === "reviews") {
        const r = await sql`select id, venue_name, rating, body, status, (extract(epoch from created_at)*1000)::bigint as ts
          from reviews order by created_at desc limit 200`;
        return res.json({ rows: r });
      }
      if (type === "counts") {
        const p = await sql`select count(*)::int as n from price_reports where status='pending'`;
        const rv = await sql`select count(*)::int as n from reviews where status='visible'`;
        return res.json({ pending: p[0].n, reviews: rv[0].n });
      }
      return res.status(400).json({ error: "bad type" });
    }

    if (req.method === "POST") {
      const b = req.body || {};
      const id = parseInt(b.id, 10), action = String(b.action || "");
      if (!id) return res.status(400).json({ error: "id required" });
      if (action === "approve") await sql`update price_reports set status='approved' where id=${id}`;
      else if (action === "reject") await sql`update price_reports set status='rejected' where id=${id}`;
      else if (action === "delPrice") await sql`delete from price_reports where id=${id}`;
      else if (action === "hideReview") await sql`update reviews set status='hidden' where id=${id}`;
      else if (action === "showReview") await sql`update reviews set status='visible' where id=${id}`;
      else if (action === "delReview") await sql`delete from reviews where id=${id}`;
      else return res.status(400).json({ error: "bad action" });
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
