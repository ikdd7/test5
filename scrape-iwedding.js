/*
 * scrape-iwedding.js — 아이웨딩 식장 페이지(/enterprise/info/{id})에서 가격 수집
 *   ID가 순번이 아니라 긴 숫자 → 목록 크롤링 + 시드 ID로 대상 수집.
 *   GitHub Actions("Scrape iwedding")에서 실행. addPrice(다른 소스면 평균).
 *   ⚠️ 공개 가격정보 집계 목적. rate limit·robots/ToS 존중.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const { applyScrape, fillPhoto } = require("./pricemerge.js");

const HOST = "https://www.iwedding.co.kr";
const INFO = HOST + "/enterprise/info/";
const LIST_PAGES = [HOST + "/brand/ihall?tab=best", HOST + "/brand/ihall"];
const SEED = ["1527650130","1350290898","1303091158","1378801892","1382437461","1402283129","1459495032",
  "1514451611","1537518991","1579250358","1477040993","1627872076","1639718676","1166261680","1318843774",
  "1356918382","1377222636","1399855812","1317273183","1207559364","1236734049","1291092907","1118452871",
  "1082168054","1218625637","1231916831","1353995662","1441601004","1441870768","1569375448","1570155300","1570158064"];

const FILE = path.join(__dirname, "venues.js");
const REGIONS = ["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"];
function parseRegion(t) { for (const r of REGIONS) if (t.indexOf(r) >= 0) return r; return null; }
function num(t, kw) { // 식대: 전체숫자 또는 "6만5천"/"4만" 표기 모두 처리
  var m = t.match(new RegExp(kw + "[^\\d]{0,16}([1-9]\\d?,?\\d{3})\\s*원"));
  if (m) { var v = parseInt(m[1].replace(/,/g, ""), 10); if (v >= 20000 && v <= 300000) return v; }
  var mc = t.match(new RegExp(kw + "[^\\d]{0,16}([1-9])\\s*만(?:\\s*([1-9])\\s*천)?\\s*원"));
  if (mc) { var v2 = (+mc[1]) * 10000 + (mc[2] ? (+mc[2]) * 1000 : 0); if (v2 >= 20000 && v2 <= 300000) return v2; }
  return null;
}
function parsePrice(t) {
  var meal = num(t, "(?:뷔페|양식|코스|한식|식대|식사)");
  var rental = null;
  var r = t.match(/대관료?[^\d]{0,16}([1-9][\d,]{5,9})\s*원/);
  if (r) { var rv = parseInt(r[1].replace(/,/g, ""), 10); if (rv >= 100000 && rv <= 100000000) rental = rv; }
  return { meal: meal, rental: rental };
}
function cleanName(title) { return String(title || "").replace(/웨딩홀|아이웨딩|\|.*/g, "").trim(); }

(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const venues = sandbox.window.WEDDING_VENUES || [];

  const browser = await chromium.launch();
  const page = await browser.newPage(); // 기본(실제 크롬) UA

  // 1) 목록 페이지네이션으로 식장 ID 대량 수집
  //    brand/ihall?tab=list&category=웨딩홀&subCategory=N&page=M  (네가 준 형식)
  const ids = new Set(SEED);
  const MAX = parseInt(process.env.MAX || "500", 10);
  const cat = encodeURIComponent("웨딩홀");
  // 목록이 JS 렌더라 a[href] 대신 페이지 HTML 전체에서 enterprise/info/<id> 정규식 추출(스크롤로 lazy 로드 유도)
  const grabIds = async () => {
    try { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); } catch (e) {}
    await page.waitForTimeout(800);
    const html = await page.content();
    return [...html.matchAll(/enterprise\/info\/(\d+)/g)].map((m) => m[1]);
  };
  for (const lp of LIST_PAGES) { // best/기본 목록
    try {
      await page.goto(lp, { waitUntil: "networkidle", timeout: 25000 });
      (await grabIds()).forEach((x) => ids.add(x));
    } catch (e) {}
  }
  for (let sc = 1; sc <= 6 && ids.size < MAX; sc++) {
    let empty = 0;
    for (let pg = 1; pg <= 20 && ids.size < MAX; pg++) {
      const url = HOST + "/brand/ihall?tab=list&category=" + cat + "&subCategory=" + sc + "&page=" + pg + "&sort=recommendations";
      let found = [];
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
        found = await grabIds();
      } catch (e) {}
      const before = ids.size; found.forEach((x) => ids.add(x));
      const added = ids.size - before;
      if (pg === 1 || added) console.log("  목록 sub" + sc + " p" + pg + ": 링크" + found.length + " 신규+" + added + " (누적 " + ids.size + ")");
      if (!found.length) { if (++empty >= 2) break; } else empty = 0;
    }
  }
  const list = Array.from(ids).slice(0, MAX);
  console.log("대상 식장 ID " + list.length + "개");

  let scraped = 0, filled = 0, averaged = 0, inserted = 0, photoed = 0, idx = 0; const report = [];
  const log = (s) => { report.push(s); console.log("  [" + idx + "/" + list.length + "] " + s); };
  for (const id of list) {
    idx++;
    try {
      try { await page.goto(INFO + id, { waitUntil: "domcontentloaded", timeout: 15000 }); }
      catch (e) { /* networkidle 타임아웃이어도 렌더된 내용으로 계속 시도 */ }
      const name = cleanName(await page.title());
      if (!name) { log(id + ": 이름 없음"); continue; }
      // 가격이 JS로 늦게 렌더되는 SPA 대비: 가격 키워드가 보일 때까지 대기
      await page.waitForFunction(() => /식대|뷔페|대관|보증\s*인원|코스|한식/.test(document.body.innerText), { timeout: 6000 }).catch(() => {});
      const text = await page.evaluate(() => document.body.innerText);
      const pr = parsePrice(text), region = parseRegion(name) || parseRegion(text); // 지역은 식장명에서 먼저
      let photo = ""; try { photo = await page.$eval('meta[property="og:image"]', (e) => e.content); } catch (e) {}
      scraped++;
      if (!pr.meal) {
        var fp = fillPhoto(venues, { name: name, region: region, photo: photo }); // 가격 없어도 사진은 채움
        if (fp.status === "photo") { photoed++; log("📷 " + name + " (사진만)"); continue; }
        log(id + " " + name + ": 식대 못찾음"); continue;
      }
      const out = applyScrape(venues, { name: name, region: region, meal: pr.meal, rental: pr.rental, source: "iwedding/" + id, photo: photo });
      const v = out.venue;
      if (out.status === "filled") { filled++; log("✓ " + name + " : " + v.meal); }
      else if (out.status === "averaged") { averaged++; log("≈ " + name + " : " + v.meal + " (" + v.nobs + "소스)"); }
      else if (out.status === "inserted") { inserted++; log("＋ " + name + " : " + v.meal + " (신규, 지역=" + (region || "?") + ")"); }
      else log("- " + name + " (" + out.status + ")");
    } catch (e) { log(id + ": 오류(" + (e.name || "err") + ")"); }
    await new Promise((r) => setTimeout(r, 500));
  }
  await browser.close();

  const header = "/* 전국 예식장 리스트 — iwedding 가격 채움(" + new Date().toISOString().slice(0, 10) + ", 가격 " + venues.filter((v) => v.meal).length + "곳) */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("스크랩 " + scraped + "곳 → 새채움 " + filled + ", 평균추가 " + averaged + ", 신규삽입 " + inserted + ", 사진만 " + photoed + "(좌표는 geocode가 채움), 총가격 " + venues.filter((v) => v.meal).length + "곳, 총사진 " + venues.filter((v) => v.photo).length + "곳");
})();
