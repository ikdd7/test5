// /api/reviews — 공유 후기. GET=목록, POST=등록, DELETE=본인 글 삭제
//   GET    ?venue=KEY          →  { reviews:[{id,t,d,cid}...] }
//   POST   { venue, name, text, cid } → 등록된 { id, t, d, cid }
//   DELETE ?id=ID&cid=CLIENT   →  { ok:true }
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const venue = String(req.query.venue || "");
      if (!venue) return res.status(400).json({ error: "venue required" });
      let rows;
      try {
        rows = await sql`
          select id, body, client_id, rating, (extract(epoch from created_at) * 1000)::bigint as ts
          from reviews where venue_key = ${venue} and status = 'visible'
          order by created_at desc limit 100`;
      } catch (e) { // rating 컬럼 없는 경우(마이그레이션 전) 폴백
        rows = await sql`
          select id, body, client_id, (extract(epoch from created_at) * 1000)::bigint as ts
          from reviews where venue_key = ${venue} and status = 'visible'
          order by created_at desc limit 100`;
      }
      return res.json({ reviews: rows.map((x) => ({ id: Number(x.id), t: x.body, d: Number(x.ts), cid: x.client_id, rating: x.rating != null ? Number(x.rating) : null })) });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const venue = String(b.venue || ""), cid = String(b.cid || "");
      const text = String(b.text || "").trim().slice(0, 300);
      const name = b.name ? String(b.name).slice(0, 80) : null;
      const rating = (b.rating >= 1 && b.rating <= 5) ? Math.round(b.rating) : null;
      if (!venue || !text || !cid) return res.status(400).json({ error: "venue, text, cid required" });
      let rows;
      try {
        rows = await sql`
          insert into reviews (venue_key, venue_name, client_id, body, rating)
          values (${venue}, ${name}, ${cid}, ${text}, ${rating})
          returning id, rating, (extract(epoch from created_at) * 1000)::bigint as ts`;
      } catch (e) { // rating 컬럼 없으면 rating 없이 저장
        rows = await sql`
          insert into reviews (venue_key, venue_name, client_id, body)
          values (${venue}, ${name}, ${cid}, ${text})
          returning id, (extract(epoch from created_at) * 1000)::bigint as ts`;
      }
      const row = rows[0];
      return res.json({ id: Number(row.id), t: text, d: Number(row.ts), cid, rating: row.rating != null ? Number(row.rating) : rating });
    }
    if (req.method === "DELETE") {
      const id = parseInt(req.query.id, 10), cid = String(req.query.cid || "");
      if (!id || !cid) return res.status(400).json({ error: "id, cid required" });
      await sql`delete from reviews where id = ${id} and client_id = ${cid}`;
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
