// /api/price — 사용자 가격 제보. GET=집계 조회, POST=제보 등록
//   GET  ?venue=KEY            →  { n, meal, rental }  (중앙값)
//   POST { venue, name, meal, rental, cid } → { ok:true, n, meal, rental }
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function agg(venue) {
  let r;
  try {
    r = await sql`
      select count(*)::int as n,
        percentile_cont(0.5) within group (order by meal) filter (where meal is not null) as meal,
        percentile_cont(0.5) within group (order by rental) filter (where rental is not null) as rental
      from price_reports where venue_key = ${venue} and status = 'approved'`;
  } catch (e) { // status 컬럼 없으면 전체 집계
    r = await sql`
      select count(*)::int as n,
        percentile_cont(0.5) within group (order by meal) filter (where meal is not null) as meal,
        percentile_cont(0.5) within group (order by rental) filter (where rental is not null) as rental
      from price_reports where venue_key = ${venue}`;
  }
  const x = r[0] || {};
  return { n: Number(x.n || 0), meal: x.meal != null ? Math.round(Number(x.meal)) : null, rental: x.rental != null ? Math.round(Number(x.rental)) : null };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const venue = String(req.query.venue || "");
      if (!venue) return res.status(400).json({ error: "venue required" });
      return res.json(await agg(venue));
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const venue = String(b.venue || ""), cid = String(b.cid || "");
      const meal = (b.meal >= 10000 && b.meal <= 400000) ? Math.round(b.meal) : null;
      const rental = (b.rental >= 100000 && b.rental <= 100000000) ? Math.round(b.rental) : null;
      const name = b.name ? String(b.name).slice(0, 80) : null;
      const photo = (typeof b.photo === "string" && b.photo.length > 100 && b.photo.length < 900000) ? b.photo : null;
      const note = b.note ? String(b.note).slice(0, 200) : null;
      if (!venue || !cid || meal == null) return res.status(400).json({ error: "venue, cid, meal required" });
      if (!photo) return res.status(400).json({ error: "photo required" });
      try {
        await sql`insert into price_reports (venue_key, venue_name, client_id, meal, rental, photo, note) values (${venue}, ${name}, ${cid}, ${meal}, ${rental}, ${photo}, ${note})`;
      } catch (e) { // photo/note 컬럼 없으면(마이그레이션 전) 기본 컬럼만
        await sql`insert into price_reports (venue_key, venue_name, client_id, meal, rental) values (${venue}, ${name}, ${cid}, ${meal}, ${rental})`;
      }
      const a = await agg(venue);
      return res.json({ ok: true, n: a.n, meal: a.meal, rental: a.rental });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
