/*
 * scrape-oding.js — 오딩(oding.co.kr) 스몰웨딩 목록에서 식대·대관료를 긁어 venues.js에 채움/추가
 *   GitHub Actions("Scrape oding")에서 실행(헤드리스 크로미움).
 *   ⚠️ 공개 가격정보 집계 목적. 호출 간격 준수, robots/ToS 존중.
 *
 * 동작: 스몰웨딩 목록 페이지 렌더 → '대관료'+'식대'를 가진 카드 텍스트 수집 →
 *       지역/이름/식대/대관료 파싱 → applyScrape(매칭 채움 / 신규 삽입 / 모호 보류).
 *       소규모·롱테일 식장 위주(대형 플랫폼에 없는 곳) 확보용.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const { applyScrape } = require("./pricemerge.js");

const LIST_PAGES = [
  "https://oding.co.kr/newSmallService",
  "https://oding.co.kr/smallService",
];
const FILE = path.join(__dirname, "venues.js");
const REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
function parseRegion(t) { var m = t.match(/\[([가-힣]{2,4})\]/); if (m && REGIONS.indexOf(m[1]) >= 0) return m[1]; for (const r of REGIONS) if (t.indexOf(r) >= 0) return r; return null; }
function parseName(t) {
  var m = t.match(/\]\s*(.+?)\s*(?:대관료|식대|디테일|보증|연출)/);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 40) : "";
}
function won(s) { return parseInt(String(s).replace(/,/g, ""), 10); }
function parseMeal(t) {
  var m = t.match(/식대[^\d]{0,10}([\d,]+)\s*만/); if (m) { var v = won(m[1]) * 10000; if (v >= 20000 && v <= 300000) return v; }
  var m2 = t.match(/식대[^\d]{0,10}([1-9]\d?,?\d{3})\s*원/); if (m2) { var v2 = won(m2[1]); if (v2 >= 20000 && v2 <= 300000) return v2; }
  return null;
}
function parseRental(t) {
  var m = t.match(/대관료?[^\d]{0,10}([\d,]+)\s*만/); if (m) { var v = won(m[1]) * 10000; if (v >= 100000 && v <= 100000000) return v; }
  var m2 = t.match(/대관료?[^\d]{0,10}([1-9][\d,]{5,9})\s*원/); if (m2) { var v2 = won(m2[1]); if (v2 >= 100000 && v2 <= 100000000) return v2; }
  return null;
}

(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const venues = sandbox.window.WEDDING_VENUES || [];

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 카드 텍스트 수집: '대관료'+'식대'를 모두 가진 가장 작은 요소
  let cards = [];
  for (const lp of LIST_PAGES) {
    try {
      await page.goto(lp, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      const found = await page.evaluate(() => {
        const out = [];
        Array.from(document.querySelectorAll("li,div,a,article,section")).forEach((el) => {
          const t = (el.innerText || "").replace(/\s+/g, " ").trim();
          if (t.length >= 8 && t.length <= 240 && t.indexOf("대관료") >= 0 && t.indexOf("식대") >= 0) out.push(t);
        });
        return out;
      });
      found.forEach((c) => cards.push(c));
    } catch (e) { console.log("목록 오류 " + lp + ": " + (e.message || e)); }
  }
  cards = Array.from(new Set(cards));
  console.log("카드 후보 " + cards.length + "개");

  let filled = 0, inserted = 0, idx = 0; const report = [];
  const log = (s) => { report.push(s); console.log("  [" + idx + "/" + cards.length + "] " + s); };
  for (const t of cards) {
    idx++;
    const name = parseName(t), region = parseRegion(t), meal = parseMeal(t), rental = parseRental(t);
    if (!name || !meal) { log("- 파싱실패(name=" + name + ",meal=" + meal + ")"); continue; }
    const out = applyScrape(venues, { name: name, region: region, meal: meal, rental: rental, source: "oding/" + name, type: "하우스웨딩" });
    const v = out.venue;
    if (out.status === "filled" || out.status === "averaged") { filled++; log((out.status === "averaged" ? "≈ " : "✓ ") + name + " : " + v.meal); }
    else if (out.status === "inserted") { inserted++; log("＋ " + name + " : " + v.meal + " (신규, 지역=" + (region || "?") + ")"); }
    else log("- " + name + " (" + out.status + ")");
  }
  await browser.close();

  const header = "/* 전국 예식장 리스트 — oding 가격 채움(" + new Date().toISOString().slice(0, 10) + ", 가격 " + venues.filter((v) => v.meal).length + "곳) */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("채움 " + filled + ", 신규삽입 " + inserted + "(좌표는 geocode가 채움), 총 가격 " + venues.filter((v) => v.meal).length + "곳");
})();
