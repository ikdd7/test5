/*
 * scrape-directwedding.js — 다이렉트결혼준비 식장 페이지(hall0001~순번)에서 가격 수집
 *   GitHub Actions("Scrape directwedding")에서 실행. 헤드리스 크로미움 필요.
 *   범위: 환경변수 START/END (기본 1~520). 매칭되는 식장에 addPrice(다른 소스면 평균).
 *   ⚠️ 공개 가격정보 집계 목적. rate limit 준수, robots/ToS 존중.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const { addPrice } = require("./pricemerge.js");

const BASE = "https://www.directwedding.co.kr/weddinghall/hall";
const START = parseInt(process.env.START, 10) || 1;
const END = parseInt(process.env.END, 10) || 520;

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
function cleanName(title) {
  return String(title || "").split(/[-|]/)[0].replace(/다이렉트.*|웨딩홀\s*$/g, "").trim();
}

(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const venues = sandbox.window.WEDDING_VENUES || [];

  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; WeddingPriceBot/1.0)" });

  let scraped = 0, filled = 0, averaged = 0, empty = 0; const report = [];
  for (let i = START; i <= END; i++) {
    const id = "hall" + String(i).padStart(4, "0");
    try {
      const resp = await page.goto(BASE + id, { waitUntil: "domcontentloaded", timeout: 18000 });
      if (resp && resp.status() >= 400) { empty++; continue; }
      const title = await page.title();
      const name = cleanName(title);
      if (!name || /다이렉트|결혼준비|^웨딩홀$/.test(name)) { empty++; continue; }
      const text = await page.evaluate(() => document.body.innerText);
      const pr = parsePrice(text), region = parseRegion(text);
      let photo = ""; try { photo = await page.$eval('meta[property="og:image"]', (e) => e.content); } catch (e) {}
      scraped++;
      if (!pr.meal) { report.push(id + " " + name + ": 식대 못찾음"); continue; }
      const v = venues.find((x) => match(x, { name: name, region: region }));
      if (v) {
        if (photo && !v.photo) v.photo = photo;
        const res = addPrice(v, { meal: pr.meal, rental: pr.rental, source: "directwedding/" + id });
        if (res === "filled") { filled++; report.push("✓ " + id + " " + name + " : " + v.meal); }
        else if (res === "averaged") { averaged++; report.push("≈ " + name + " : " + v.meal + " (" + v.nobs + "소스)"); }
        else report.push("- " + name + " (" + res + ")");
      } else {
        report.push("? " + id + " " + name + " (지도에 없음)");
      }
    } catch (e) { empty++; }
    await new Promise((r) => setTimeout(r, 700));
  }
  await browser.close();

  const header = "/* 전국 예식장 리스트 — directwedding 가격 채움(" + new Date().toISOString().slice(0, 10) + ", 가격 " + venues.filter((v) => v.meal).length + "곳) */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("스크랩 " + scraped + "곳 / 빈페이지 " + empty + " → 새채움 " + filled + ", 평균추가 " + averaged + ", 총가격 " + venues.filter((v) => v.meal).length + "곳");
  report.slice(0, 150).forEach((l) => console.log("  " + l));
})();
