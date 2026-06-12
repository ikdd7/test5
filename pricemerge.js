/*
 * pricemerge.js — 식장에 가격을 더할 때, 다른 소스면 평균 / 같은 소스면 스킵
 *   addPrice(venue, {meal, rental, source, slot?, guarantee?})
 *   반환: 'filled'(처음) | 'averaged'(다른 소스 평균) | 'dup'(같은 소스) | 'invalid'
 *   누적 정보: venue.nobs(관측 수), venue.priceSources(소스 목록 '|' 구분)
 */
function addPrice(v, p) {
  if (!(p.meal >= 20000 && p.meal <= 300000)) return "invalid";
  var existing = v.priceSources || (v.meal ? v.source : "") || "";
  var srcs = existing.split("|").filter(Boolean);
  var has = typeof v.meal === "number" && v.meal > 0;

  if (has) {
    if (p.source && srcs.indexOf(p.source) >= 0) return "dup"; // 같은 소스 → 스킵
    var n = v.nobs || 1;
    v.meal = Math.round((v.meal * n + p.meal) / (n + 1));
    if (p.rental) v.rental = v.rental ? Math.round((v.rental * n + p.rental) / (n + 1)) : p.rental;
    v.nobs = n + 1;
    v.priceSources = srcs.concat(p.source ? [p.source] : []).join("|");
    return "averaged";
  } else {
    v.meal = p.meal;
    if (p.rental) v.rental = p.rental;
    if (p.slot && !v.slot) v.slot = p.slot;
    if (p.guarantee && !v.guarantee) v.guarantee = p.guarantee;
    v.nobs = 1;
    v.priceSources = p.source || "";
    v.source = p.source || v.source;
    v.verified = false;
    return "filled";
  }
}
module.exports = { addPrice: addPrice };
