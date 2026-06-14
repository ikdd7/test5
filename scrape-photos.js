/*
 * scrape-photos.js — 사진 없는 식장에 "공식 홈페이지 대표사진(og:image)"을 채움.
 *   1) 네이버 지역검색 API(공식)로 식장명+지역 검색 → 업체 공식 홈페이지 link 획득
 *   2) 그 홈페이지의 <meta property="og:image"> (식장이 직접 지정한 대표 이미지)만 추출
 *   실행: NAVER_ID=클라이언트ID NAVER_SECRET=시크릿 [MAX=200] node scrape-photos.js
 *   ⚠️ og:image는 사이트가 공유용으로 직접 게시한 대표 이미지. 블로그/카페/지도/SNS는 제외.
 *      rate limit·robots/ToS 존중. 깨질 수 있는 핫링크이므로 화면엔 onerror 폴백(지도 썸네일) 있음.
 */
const fs = require("fs"), path = require("path"), vm = require("vm"), https = require("https"), zlib = require("zlib");
const { URL } = require("url");
const { nameOverlap } = require("./pricemerge.js");

const ID = process.env.NAVER_ID, SECRET = process.env.NAVER_SECRET;
if (!ID || !SECRET) { console.error("❌ NAVER_ID / NAVER_SECRET 환경변수가 필요합니다."); process.exit(1); }
const FILE = path.join(__dirname, "venues.js");
const MAX = parseInt(process.env.MAX || "300", 10);

// 공식 홈페이지로 볼 수 없는 호스트(블로그/카페/지도/쇼핑/SNS 등) 제외
const BAD_HOST = /(blog\.|cafe\.|m\.blog|map\.naver|place\.|smartstore|shopping\.|search\.|news\.|post\.naver|tv\.naver|youtube|youtu\.be|facebook|instagram|band\.us|pf\.kakao|tistory|wikipedia|namu\.wiki|jobkorea|saramin)/i;
const IMG_OK = /\.(jpe?g|png|webp)(\?|$)/i;

function get(url, headers, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(new Error("bad url")); }
    const req = https.get(u, {
      headers: Object.assign({
        "User-Agent": "Mozilla/5.0 (compatible; weddingmap-photo/1.0)",
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      }, headers || {}),
      timeout: 12000,
    }, (res) => {
      const sc = res.statusCode || 0;
      if (sc >= 300 && sc < 400 && res.headers.location && redirects < 4) {
        res.resume();
        const next = new URL(res.headers.location, u).href;
        return resolve(get(next, headers, redirects + 1));
      }
      if (sc !== 200) { res.resume(); return reject(new Error("http " + sc)); }
      const enc = String(res.headers["content-encoding"] || "");
      let stream = res, chunks = [], size = 0;
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      stream.on("data", (c) => { size += c.length; if (size > 1500000) { req.destroy(); } else chunks.push(c); });
      stream.on("end", () => resolve({ url: u.href, body: Buffer.concat(chunks).toString("utf8") }));
      stream.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, "").trim(); }

async function findHomepage(name, region) {
  const q = encodeURIComponent((region ? region + " " : "") + name + " 웨딩홀");
  const api = "https://openapi.naver.com/v1/search/local.json?display=5&query=" + q;
  let data;
  try {
    const r = await get(api, { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET });
    data = JSON.parse(r.body);
  } catch (e) { return null; }
  const items = (data && data.items) || [];
  for (const it of items) {
    const link = String(it.link || "").trim();
    if (!link || !/^https?:/.test(link)) continue;
    let host; try { host = new URL(link).host; } catch (e) { continue; }
    if (BAD_HOST.test(host)) continue;
    // 검색결과 상호가 식장명과 충분히 겹칠 때만(과매칭 방지)
    if (!nameOverlap(name, stripTags(it.title))) continue;
    return link;
  }
  return null;
}

function extractOgImage(html, baseUrl) {
  const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
  let img =
    pick(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (!img) return null;
  img = img.replace(/&amp;/g, "&").trim();
  try { img = new URL(img, baseUrl).href; } catch (e) { return null; }
  if (!/^https:/.test(img)) return null;            // 혼합콘텐츠 방지: https만
  if (/(logo|sprite|blank|spacer|1x1|icon|favicon)/i.test(img)) return null;
  if (!IMG_OK.test(img) && !/og|image|thumb|photo|img/i.test(img)) return null;
  return img;
}

(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const venues = sandbox.window.WEDDING_VENUES || [];
  const targets = venues.filter((v) => v.name && !v.photo).slice(0, MAX);
  console.log("사진 없는 식장 " + venues.filter((v) => v.name && !v.photo).length + "곳 중 이번 대상 " + targets.length + "곳");

  let ok = 0, noSite = 0, noImg = 0, err = 0, idx = 0;
  for (const v of targets) {
    idx++;
    const tag = "[" + idx + "/" + targets.length + "] " + v.name;
    try {
      const home = await findHomepage(v.name, v.region);
      if (!home) { noSite++; console.log("  - " + tag + ": 공식사이트 못찾음"); await sleep(350); continue; }
      let page; try { page = await get(home); } catch (e) { err++; console.log("  ! " + tag + ": 사이트 오류(" + (e.message || "err") + ")"); await sleep(350); continue; }
      const img = extractOgImage(page.body, page.url);
      if (!img) { noImg++; console.log("  · " + tag + ": og:image 없음 (" + home + ")"); await sleep(350); continue; }
      v.photo = img; ok++;
      console.log("  ✓ " + tag + " → " + img.slice(0, 80));
    } catch (e) { err++; console.log("  ! " + tag + ": " + (e.message || "err")); }
    await sleep(450);
  }

  const total = venues.filter((v) => v.photo).length;
  const header = "/* 전국 예식장 리스트 — 공식 홈페이지 대표사진 채움(" + new Date().toISOString().slice(0, 10) + ", 사진 " + total + "곳) */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("\n채움 " + ok + " · 사이트없음 " + noSite + " · og이미지없음 " + noImg + " · 오류 " + err + " → 총 사진 " + total + "곳");
})();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
