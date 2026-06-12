/*
 * dedupe.js — 같은 식장의 여러 홀(근접 + 동일 베이스 이름)을 하나로 병합
 *   예) "라마다송도호텔 신의정원" + "라마다송도호텔 컨벤션센터" → "라마다송도호텔" (홀 2개)
 *
 * 단독 실행:  node dedupe.js   (venues.js를 병합본으로 덮어씀)
 * 모듈 사용:  const { dedupeVenues } = require("./dedupe.js")
 *
 * 병합 기준: 150m 이내 + (첫 어절 동일(≥4자) 또는 한 이름이 다른 이름의 접두어)
 */
function normName(s) { return String(s || "").replace(/[\s()\-·_]/g, ""); }
function firstTok(s) { return String(s || "").trim().split(/\s+/)[0]; }
function distM(a, b) {
  var dlat = a.lat - b.lat, dlng = (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng) * 111000;
}
function related(a, b) {
  var ta = firstTok(a.name), tb = firstTok(b.name);
  if (ta === tb && ta.length >= 4) return true;
  var na = normName(a.name), nb = normName(b.name), sh = na.length < nb.length ? na : nb;
  if (sh.length >= 6 && (na.indexOf(nb) === 0 || nb.indexOf(na) === 0)) return true;
  return false;
}

function dedupeVenues(vs) {
  var clusters = [];
  vs.forEach(function (v) {
    if (!(v.lat && v.lng)) { clusters.push({ rep: v, items: [v] }); return; }
    var hit = null;
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      if (c.rep.lat && distM(c.rep, v) < 150 && related(c.rep, v)) { hit = c; break; }
    }
    if (hit) hit.items.push(v); else clusters.push({ rep: v, items: [v] });
  });

  return clusters.map(function (c) {
    var items = c.items;
    if (items.length === 1) return items[0];
    var priced = items.filter(function (x) { return typeof x.meal === "number" && x.meal; });
    var ct = firstTok(items[0].name);
    var shortest = items.map(function (x) { return x.name; }).sort(function (a, b) { return a.length - b.length; })[0];
    var merged = {
      name: ct.length >= 4 ? ct : shortest,
      region: items[0].region, district: items[0].district, type: items[0].type,
      meal: null, lat: items[0].lat, lng: items[0].lng,
      verified: items.some(function (x) { return x.verified; }),
      source: items[0].source, halls: items.length,
    };
    if (priced.length) {
      merged.meal = Math.round(priced.reduce(function (s, x) { return s + x.meal; }, 0) / priced.length);
      var rents = priced.filter(function (x) { return x.rental; });
      if (rents.length) merged.rental = Math.round(rents.reduce(function (s, x) { return s + x.rental; }, 0) / rents.length);
      // 가격 가진 항목의 이름을 대표로(보통 구체적 식장명)
      if (priced[0].name) merged.name = firstTok(priced[0].name).length >= 4 ? firstTok(priced[0].name) : priced[0].name;
      if (priced[0].guarantee) merged.guarantee = priced[0].guarantee;
      if (priced[0].slot) merged.slot = priced[0].slot;
    }
    return merged;
  });
}

module.exports = { dedupeVenues: dedupeVenues };

if (require.main === module) {
  var fs = require("fs"), path = require("path"), vm = require("vm");
  var FILE = path.join(__dirname, "venues.js");
  var sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  var before = sandbox.window.WEDDING_VENUES || [];
  var after = dedupeVenues(before);
  var header = "/* 전국 예식장 리스트 — 중복(같은 식장 다른 홀) 병합본(" + new Date().toISOString().slice(0, 10) + ", " + after.length + "곳) */\n";
  var body = "window.WEDDING_VENUES = [\n" + after.map(function (v) { return "  " + JSON.stringify(v); }).join(",\n") + "\n];\n";
  fs.writeFileSync(FILE, header + body, "utf8");
  console.log("병합: " + before.length + " → " + after.length + "곳 (" + (before.length - after.length) + "곳 합쳐짐)");
}
