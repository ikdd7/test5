// /api/prices — 가격 게이팅. 가격 제보 1건 이상 한 기기(cid)에게만 실제 가격을 내려줌.
//   GET ?cid=CLIENT → { unlocked:false }  또는  { unlocked:true, prices: { 식장명: {m,r,g} } }
// 원본 venues.js(이름+가격)는 서버 함수 번들에만 포함(공개 차단). 가격은 식장명(name) 키.
const { neon } = require("@neondatabase/serverless");
const fs = require("fs"), path = require("path"), vm = require("vm");
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let PRICE_MAP = null; // 웜 인스턴스 캐시
function priceMap() {
  if (PRICE_MAP) return PRICE_MAP;
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "venues.js"), "utf8"), sandbox);
  const V = sandbox.window.WEDDING_VENUES || [];
  const g = {};
  V.forEach(function (v) { if (v.meal > 0) (g[v.name] = g[v.name] || []).push(v); });
  const m = {};
  Object.keys(g).forEach(function (name) {
    const arr = g[name];
    const meal = Math.round(arr.reduce(function (s, x) { return s + (x.meal || 0); }, 0) / arr.length);
    const rents = arr.filter(function (x) { return x.rental; });
    const rental = rents.length ? Math.round(rents.reduce(function (s, x) { return s + x.rental; }, 0) / rents.length) : 0;
    const gu = arr.find(function (x) { return x.guarantee; });
    m[name] = { m: meal };
    if (rental) m[name].r = rental;
    if (gu) m[name].g = gu.guarantee;
  });
  PRICE_MAP = m;
  return m;
}

module.exports = async (req, res) => {
  try {
    const cid = String(req.query.cid || "");
    let unlocked = false;
    if (cid) {
      const r = await sql`select 1 from price_reports where client_id = ${cid} limit 1`;
      unlocked = r.length > 0;
    }
    if (!unlocked) return res.json({ unlocked: false });
    return res.json({ unlocked: true, prices: priceMap() });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
