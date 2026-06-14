/*
 * build-pub.js — 배포용 파생 파일 생성 (Vercel buildCommand에서 실행)
 *   원본 venues.js(이름+가격)는 서버 함수만 읽고 공개 차단.
 *   - venues.pub.js : 이름O · 가격X(p 플래그만) → 지도(map.html)용
 *   - hub-data.js   : 가격O · 이름/좌표X(익명) → 허브 통계/계산기(wedding.html)용
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = __dirname;
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "venues.js"), "utf8"), sandbox);
const V = sandbox.window.WEDDING_VENUES || [];

// 가격 있는 식장명(그룹 단위) — 같은 이름이면 전부 priced 플래그
const pricedNames = new Set();
V.forEach(function (v) { if (v.meal > 0) pricedNames.add(v.name); });

// 1) venues.pub.js — 가격 제거, 이름/위치/특징/사진/커뮤니티는 유지 + p 플래그
const KEEP = ["name", "region", "district", "type", "lat", "lng", "verified", "halls", "tags", "pros", "cons", "photo", "community", "slot"];
const pub = V.map(function (v) {
  var o = {}; KEEP.forEach(function (k) { if (v[k] != null) o[k] = v[k]; });
  if (pricedNames.has(v.name)) o.p = 1;
  return o;
});
fs.writeFileSync(path.join(root, "venues.pub.js"), "/* 자동생성(build-pub) — 가격 제외, 지도용 */\nwindow.WEDDING_VENUES =\n" + JSON.stringify(pub) + ";\n");

// 2) hub-data.js — 가격은 있되 이름/좌표 제거(익명) → 개별 식장 가격 식별 불가
const hub = V.filter(function (v) { return v.meal > 0; }).map(function (v) {
  var o = { region: v.region, type: v.type, meal: v.meal };
  if (v.rental) o.rental = v.rental;
  if (v.guarantee) o.guarantee = v.guarantee;
  if (v.slot) o.slot = v.slot;
  return o;
});
fs.writeFileSync(path.join(root, "hub-data.js"), "/* 자동생성(build-pub) — 익명 가격, 허브 통계용 */\nwindow.WEDDING_VENUES =\n" + JSON.stringify(hub) + ";\n");

// 3) hub-stats.js — 지역/지역+타입별 가격 중앙값(비교바용). 이름/좌표 없음.
function median(arr) {
  var a = arr.filter(function (x) { return x > 0; }).sort(function (x, y) { return x - y; });
  if (!a.length) return null;
  var m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
function agg(rows) {
  return { meal: median(rows.map(function (v) { return v.meal; })), rental: median(rows.map(function (v) { return v.rental; })), n: rows.length };
}
var groupsR = {}, groupsRT = {};
hub.forEach(function (v) {
  (groupsR[v.region] = groupsR[v.region] || []).push(v);
  var k = v.region + "|" + v.type; (groupsRT[k] = groupsRT[k] || []).push(v);
});
var byRegion = {}, byRegionType = {};
Object.keys(groupsR).forEach(function (r) { byRegion[r] = agg(groupsR[r]); });
Object.keys(groupsRT).forEach(function (k) { byRegionType[k] = agg(groupsRT[k]); });
fs.writeFileSync(path.join(root, "hub-stats.js"), "/* 자동생성(build-pub) — 지역/타입 가격 중앙값(비교바용) */\nwindow.HUB_STATS = " + JSON.stringify({ byRegion: byRegion, byRegionType: byRegionType }) + ";\n");

console.log("build-pub: venues.pub.js " + pub.length + "곳(가격제외), hub-data.js " + hub.length + "곳(익명가격), hub-stats.js " + Object.keys(byRegion).length + "지역");
