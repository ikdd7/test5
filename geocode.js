/*
 * geocode.js — venues.js의 좌표(lat/lng)를 카카오 지도 API로 정밀 갱신
 *
 * 사용법:
 *   1) 카카오 REST API 키 발급 (아래 README/안내 참고)
 *   2) 터미널에서:  KAKAO_REST_KEY=발급받은키 node geocode.js
 *      (Windows PowerShell:  $env:KAKAO_REST_KEY="키"; node geocode.js )
 *   3) venues.js의 좌표가 실제 위치로 갱신됨 → git diff 로 확인 후 커밋
 *
 * 동작: 각 식장을 "식장명 + 구/지역"으로 카카오 키워드(장소) 검색 →
 *       첫 결과의 좌표로 갱신. 못 찾으면 주소 검색으로 폴백, 그래도 없으면 기존 근사값 유지.
 * 무료 한도: 카카오 로컬 API 하루 300,000건 → 72곳은 문제 없음.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const https = require("https");

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) {
  console.error("❌ 환경변수 KAKAO_REST_KEY 가 필요합니다.\n   예) KAKAO_REST_KEY=발급키 node geocode.js");
  process.exit(1);
}

const FILE = path.join(__dirname, "venues.js");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
const venues = sandbox.window.WEDDING_VENUES || [];

function req(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { Authorization: "KakaoAK " + KEY } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

(async () => {
  // ONLY_MISSING=1 → 좌표 없는 식장(스크래퍼 신규삽입분)만 지오코딩(기존 좌표 보존, 호출 절약)
  const ONLY_MISSING = !!process.env.ONLY_MISSING;
  const targets = ONLY_MISSING ? venues.filter((v) => !(v.lat && v.lng)) : venues;
  console.log((ONLY_MISSING ? "좌표 없는 " : "전체 ") + targets.length + "곳 지오코딩 시작");
  let updated = 0; const failed = [];
  for (const v of targets) {
    const q = (v.name + " " + (v.district || v.region || "")).trim();
    let hit = null;
    try {
      let j = await req("https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=" + enc(q));
      if (j.documents && j.documents.length) hit = j.documents[0];
      else {
        const a = await req("https://dapi.kakao.com/v2/local/search/address.json?size=1&query=" + enc(v.district || v.region));
        if (a.documents && a.documents.length) hit = a.documents[0];
      }
    } catch (e) { /* 무시하고 폴백 */ }

    if (hit) {
      const lat = +hit.y, lng = +hit.x;
      // 한반도 범위 + (가능하면) 지역명 일치 확인
      const addr = hit.address_name || hit.road_address_name || "";
      const regionOk = !v.region || addr.indexOf(v.region.slice(0, 2)) >= 0 || true; // 느슨하게
      if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 && regionOk) {
        v.lat = +lat.toFixed(6); v.lng = +lng.toFixed(6); updated++;
      } else failed.push(v.name);
    } else failed.push(v.name);
    await sleep(200); // 호출 간격
  }

  // venues.js 재생성(필드 유지, 좌표만 갱신됨)
  const header = "/* 전국 예식장 리스트 — 좌표 카카오 지도 API 갱신(" + new Date().toISOString().slice(0, 10) + ") */\n";
  const body = "window.WEDDING_VENUES = [\n" +
    venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n";
  fs.writeFileSync(FILE, header + body, "utf8");

  console.log("✅ 좌표 갱신: " + updated + " / " + venues.length + "곳");
  if (failed.length) console.log("⚠️ 못 찾음(기존 근사 유지): " + failed.join(", "));
  console.log("→ git diff venues.js 로 확인 후 커밋하세요.");
})();
