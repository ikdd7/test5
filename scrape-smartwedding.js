/*
 * scrape-smartwedding.js — 스마트웨딩(공개 가격정보)에서 식대·대관료를 긁어 venues.js의 회색 식장에 채움
 *   GitHub Actions("Scrape smartwedding")에서 실행(헤드리스 크로미움 필요).
 *   ⚠️ 공개된 가격정보 집계 목적. 호출 간격(rate limit) 두고, 대상 사이트 robots/ToS를 존중하세요.
 *
 * 동작: sitemap에서 식장 슬러그 수집(실패 시 시드 목록) → 각 페이지 렌더 →
 *       식대/대관료/이름/지역 파싱 → venues.js 기존 식장에 이름 매칭으로 채움(이미 가격 있으면 스킵).
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const { addPrice } = require("./pricemerge.js");

const BASE = "https://smartwedding-besthall.com/";
const SEED = ["eltower", "TheRaum", "noblevalentidaechi", "swtower", "withus", "YeouidoWeddingConvention",
  "FKIPLAZA", "botanicparkwedding", "thenewwedding", "lalucewedding", "grandhill", "weddingpropose",
  "thechapel", "thechapelnonhyeon", "WHillsConvention", "hotelritzkr", "ThepartyumAnyang", "partyumhouse",
  "marryvilia", "grandostium", "graceparty", "Bellaluce", "Crust72", "thehuewedding", "ThemarevoHotelWedding",
  "Irumconvention", "houseoftheraum", "hwcc", "wocon", "tmwedding", "GladHotelYeouido", "lvwedding"];

const FILE = path.join(__dirname, "venues.js");
const norm = (s) => String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase();
function match(v, p) {
  if (p.region && v.region && v.region !== p.region) return false;
  const a = norm(v.name), b = norm(p.name);
  return a === b || (a.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
}
const REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
function parseRegion(t) { for (const r of REGIONS) if (t.indexOf(r) >= 0) return r; return null; }
function parsePrice(t) {
  var meal = null, rental = null;
  var m = t.match(/(?:뷔페|양식|코스|한식|식대)[^\d]{0,16}([1-9]\d?,?\d{3})\s*원/);
  if (m) { var v = parseInt(m[1].replace(/,/g, ""), 10); if (v >= 20000 && v <= 300000) meal = v; }
  var r = t.match(/대관료?[^\d]{0,16}([1-9][\d,]{5,9})\s*원/);
  if (r) { var rv = parseInt(r[1].replace(/,/g, ""), 10); if (rv >= 100000 && rv <= 100000000) rental = rv; }
  return { meal: meal, rental: rental };
}
function tagsFromText(t) {
  var tg = [], push = function (re, label) { if (re.test(t) && tg.indexOf(label) < 0) tg.push(label); };
  push(/발렛|발레파킹/, "발렛파킹"); push(/주차/, "주차 가능");
  push(/역세권|역\s*도보|지하철\s*도보|역\s*\d+\s*분/, "역세권");
  push(/단독홀|단독\s*예식|단독\s*건물/, "단독홀"); push(/동시예식/, "동시예식");
  push(/오션뷰|바다\s*전망/, "오션뷰"); push(/천고|층고/, "높은 천고");
  push(/생화/, "생화 꽃장식"); push(/뷔페/, "뷔페"); push(/코스/, "코스요리");
  push(/야외|가든|루프탑/, "야외·가든"); push(/채플/, "채플"); push(/스몰웨딩|소규모/, "스몰웨딩");
  return tg.slice(0, 8);
}

(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const venues = sandbox.window.WEDDING_VENUES || [];

  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; WeddingPriceBot/1.0)" });

  let slugs = SEED.slice();
  try {
    await page.goto(BASE + "sitemap.xml", { timeout: 15000 });
    const xml = await page.content();
    const found = [...xml.matchAll(/besthall\.com\/([A-Za-z0-9_-]{2,})(?:<|\/)/g)].map((x) => x[1]).filter((s) => s !== "sitemap");
    if (found.length) slugs = Array.from(new Set(slugs.concat(found)));
  } catch (e) { /* 시드만 사용 */ }
  console.log("대상 슬러그 " + slugs.length + "개");

  let scraped = 0, filled = 0; const report = [];
  for (const slug of slugs) {
    try {
      await page.goto(BASE + slug, { waitUntil: "networkidle", timeout: 20000 });
      const title = await page.title();
      const text = await page.evaluate(() => document.body.innerText);
      const name = (title.split("|")[0] || "").replace(/스마트웨딩.*/, "").trim();
      const pr = parsePrice(text), region = parseRegion(text);
      let photo = ""; try { photo = await page.$eval('meta[property="og:image"]', (e) => e.content); } catch (e) {}
      scraped++;
      if (!name || !pr.meal) { report.push(slug + ": 파싱 실패(name=" + name + ", meal=" + pr.meal + ")"); continue; }
      const v = venues.find((x) => match(x, { name: name, region: region }));
      if (v) {
        var res = addPrice(v, { meal: pr.meal, rental: pr.rental, source: "smartwedding/" + slug });
        if (photo && !v.photo) v.photo = photo;
        var tg = tagsFromText(text); if (tg.length && !(v.tags && v.tags.length)) v.tags = tg;
        if (res === "filled" || res === "averaged") { filled++; report.push((res === "averaged" ? "≈" : "✓") + " " + slug + " → " + name + " : " + v.meal + (v.nobs > 1 ? " (" + v.nobs + "소스)" : "")); }
        else report.push("- " + slug + " → " + name + " (" + res + ")");
      } else {
        report.push("? " + slug + " → " + name + " (지도에 없음)");
      }
    } catch (e) { report.push("! " + slug + " 오류"); }
    await new Promise((r) => setTimeout(r, 800)); // rate limit
  }
  await browser.close();

  const header = "/* 전국 예식장 리스트 — 스마트웨딩 가격 채움(" + new Date().toISOString().slice(0, 10) + ", 가격 " + venues.filter((v) => v.meal).length + "곳) */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("스크랩 " + scraped + "곳, 가격 채움 " + filled + "곳, 총 가격 " + venues.filter((v) => v.meal).length + "곳");
  report.slice(0, 120).forEach((l) => console.log("  " + l));
})();
