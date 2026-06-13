// /api/votes — 키워드 투표 집계(공유). GET=조회, POST=토글
//   GET  ?venue=KEY&cid=CLIENT  →  { kw:{라벨:수}, mine:[라벨...] }
//   POST { venue, keyword, cid } →  토글 후 { kw, mine }
const { sql } = require("@vercel/postgres");

async function snapshot(venue, cid) {
  const counts = await sql`select keyword, count(*)::int as n from votes where venue_key = ${venue} group by keyword`;
  const mine = cid
    ? (await sql`select keyword from votes where venue_key = ${venue} and client_id = ${cid}`).rows.map((r) => r.keyword)
    : [];
  const kw = {};
  counts.rows.forEach((r) => { kw[r.keyword] = r.n; });
  return { kw, mine };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const venue = String(req.query.venue || "");
      if (!venue) return res.status(400).json({ error: "venue required" });
      return res.json(await snapshot(venue, String(req.query.cid || "")));
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const venue = String(b.venue || ""), keyword = String(b.keyword || ""), cid = String(b.cid || "");
      if (!venue || !keyword || !cid) return res.status(400).json({ error: "venue, keyword, cid required" });
      const exists = await sql`select 1 from votes where venue_key = ${venue} and keyword = ${keyword} and client_id = ${cid}`;
      if (exists.rows.length) {
        await sql`delete from votes where venue_key = ${venue} and keyword = ${keyword} and client_id = ${cid}`;
      } else {
        await sql`insert into votes (venue_key, keyword, client_id) values (${venue}, ${keyword}, ${cid}) on conflict do nothing`;
      }
      return res.json(await snapshot(venue, cid));
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
