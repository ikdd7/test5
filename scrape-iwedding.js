/*
 * scrape-iwedding.js — 아이웨딩 식장 페이지(/enterprise/info/{id})에서 가격 수집
 *   ID가 순번이 아니라 긴 숫자 → 목록 크롤링 + 시드 ID로 대상 수집.
 *   GitHub Actions("Scrape iwedding")에서 실행. addPrice(다른 소스면 평균).
 *   ⚠️ 공개 가격정보 집계 목적. rate limit·robots/ToS 존중.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const { addPrice } = require("./pricemerge.js");

const HOST = "https://www.iwedding.co.kr";
const INFO = HOST + "/enterprise/info/";
const LIST_PAGES = [HOST + "/brand/ihall?tab=best", HOST + "/brand/ihall"];
const SEED = ["1527650130","1350290898","1303091158","1378801892","1382437461","1402283129","1459495032",
  "1514451611","1537518991","1579250358","1477040993","1627872076","1639718676","1166261680","1318843774",
  "1356918382","1377222636","1399855812","1317273183","1207559364","1236734049","1291092907","1118452871",
  "1082168054","1218625637","1231916831","1353995662","1441601004","1441870768","1569375448","1570155300","1570158064"];

const FILE = path.join(__dirname, "venues.js");
const norm = (s) => String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase();
function match(v, p) {
  if (p.region && v.region && v.region !== p.region) return false;
  const a = norm(v.name), b = norm(p.name);
  return a === b || (a.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
}
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
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; WeddingPriceBot/1.0)" });

  // 1) 목록 페이지에서 ID 수집
  const ids = new Set(SEED);
  for (const lp of LIST_PAGES) {
    try {
      await page.goto(lp, { waitUntil: "networkidle", timeout: 25000 });
      const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/enterprise/info/"]'))
          .map((a) => (a.getAttribute("href").match(/info\/(\d+)/) || [])[1]).filter(Boolean));
      found.forEach((x) => ids.add(x));
    } catch (e) {}
  }
  const list = Array.from(ids);
  console.log("대상 식장 ID " + list.length + "개");

  let scraped = 0, filled = 0, averaged = 0; const report = [];
  for (const id of list) {
    try {
      await page.goto(INFO + id, { waitUntil: "domcontentloaded", timeout: 18000 });
      const name = cleanName(await page.title());
      if (!name) { report.push(id + ": 이름 없음"); continue; }
      const text = await page.evaluate(() => document.body.innerText);
      const pr = parsePrice(text), region = parseRegion(text);
      scraped++;
      if (!pr.meal) { report.push(id + " " + name + ": 식대 못찾음"); continue; }
      const v = venues.find((x) => match(x, { name: name, region: region }));
      if (v) {
        const res = addPrice(v, { meal: pr.meal, rental: pr.rental, source: "iwedding/" + id });
        if (res === "filled") { filled++; report.push("✓ " + name + " : " + v.meal); }
        else if (res === "averaged") { averaged++; report.push("≈ " + name + " : " + v.meal + " (" + v.nobs + "소스)"); }
        else report.push("- " + name + " (" + res + ")");
      } else report.push("? " + name + " (지도에 없음)");
    } catch (e) { report.push(id + ": 오류"); }
    await new Promise((r) => setTimeout(r, 700));
  }
  await browser.close();

  const header = "/* 전국 예식장 리스트 — iwedding 가격 채움(" + new Date().toISOString().slice(0, 10) + ", 가격 " + venues.filter((v) => v.meal).length + "곳) */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("스크랩 " + scraped + "곳 → 새채움 " + filled + ", 평균추가 " + averaged + ", 총가격 " + venues.filter((v) => v.meal).length + "곳");
  report.slice(0, 150).forEach((l) => console.log("  " + l));
})();
