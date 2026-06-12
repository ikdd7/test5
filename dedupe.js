/*
 * dedupe.js — 같은 식장 병합 + 잡음(비-식장) 제거
 *   - 초근접(35m 이내)이면 이름이 달라도 같은 건물로 보고 병합
 *   - 35~150m면 이름이 관련(첫 어절 동일 또는 한쪽이 다른쪽 접두어)일 때 병합
 *   - 수산/주차/충전소/홀딩스 등 비-식장은 제거
 *
 * 단독 실행:  node dedupe.js   (venues.js 갱신)
 * 모듈:       const { dedupeVenues, isJunk } = require("./dedupe.js")
 */
function normName(s) { return String(s || "").replace(/[\s()\-·_]/g, ""); }
function firstTok(s) { return String(s || "").trim().split(/\s+/)[0]; }
function distM(a, b) {
  var dlat = a.lat - b.lat, dlng = (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng) * 111000;
}
// 명백한 비-식장(잡음) 제거
var JUNK = /(수산|축산|농산|주차|충전소|홀딩스|부동산|공인중개|중개사|주유소|정비소|세차장|편의점|약국|치과|한의원|독서실|고시원|찜질|사우나|노래방|pc방|당구|볼링장|네일|세탁소)/i;
function isJunk(name) { return JUNK.test(String(name || "")); }
function related(a, b) {
  var ta = firstTok(a.name), tb = firstTok(b.name);
  if (ta === tb && ta.length >= 3) return true;
  var na = normName(a.name), nb = normName(b.name);
  var sh = na.length <= nb.length ? na : nb, lo = na.length <= nb.length ? nb : na;
  if (sh.length >= 3 && lo.indexOf(sh) === 0) return true; // 짧은 이름이 긴 이름의 접두어
  return false;
}

function dedupeVenues(vs) {
  // 가격 있는(큐레이션) 식장은 무조건 보존, 그 외 잡음만 제거
  var clean = vs.filter(function (v) { return (typeof v.meal === "number" && v.meal) || !isJunk(v.name); });
  var clusters = [];
  clean.forEach(function (v) {
    if (!(v.lat && v.lng)) { clusters.push({ rep: v, items: [v] }); return; }
    var hit = null;
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      if (!c.rep.lat) continue;
      var d = distM(c.rep, v);
      if (d < 35 || (d < 150 && related(c.rep, v))) { hit = c; break; }
    }
    if (hit) hit.items.push(v); else clusters.push({ rep: v, items: [v] });
  });

  return clusters.map(function (c) {
    var items = c.items;
    if (items.length === 1) return items[0];
    var priced = items.filter(function (x) { return typeof x.meal === "number" && x.meal; });
    var lead = priced[0] || items.slice().sort(function (a, b) { return a.name.length - b.name.length; })[0];
    var ct = firstTok(lead.name);
    var merged = {
      name: ct.length >= 4 ? ct : lead.name,
      region: lead.region, district: lead.district, type: lead.type,
      meal: null, lat: lead.lat, lng: lead.lng,
      verified: items.some(function (x) { return x.verified; }),
      source: lead.source, halls: items.length,
    };
    if (priced.length) {
      merged.meal = Math.round(priced.reduce(function (s, x) { return s + x.meal; }, 0) / priced.length);
      var rents = priced.filter(function (x) { return x.rental; });
      if (rents.length) merged.rental = Math.round(rents.reduce(function (s, x) { return s + x.rental; }, 0) / rents.length);
      if (priced[0].guarantee) merged.guarantee = priced[0].guarantee;
      if (priced[0].slot) merged.slot = priced[0].slot;
    }
    return merged;
  });
}

module.exports = { dedupeVenues: dedupeVenues, isJunk: isJunk };

if (require.main === module) {
  var fs = require("fs"), path = require("path"), vm = require("vm");
  var FILE = path.join(__dirname, "venues.js");
  var sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  var before = sandbox.window.WEDDING_VENUES || [];
  var after = dedupeVenues(before);
  var header = "/* 전국 예식장 리스트 — 잡음 제거+중복 병합(" + new Date().toISOString().slice(0, 10) + ", " + after.length + "곳) */\n";
  var body = "window.WEDDING_VENUES = [\n" + after.map(function (v) { return "  " + JSON.stringify(v); }).join(",\n") + "\n];\n";
  fs.writeFileSync(FILE, header + body, "utf8");
  console.log("정리: " + before.length + " → " + after.length + "곳 (" + (before.length - after.length) + "곳 병합/제거)");
}
