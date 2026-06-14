/*
 * scrape-community.js — 네이버 검색 API(블로그)로 식장별 공개 후기 스니펫에서
 *   긍정 키워드 '언급 빈도'만 집계해 venue.community 에 저장(원문 복제 X).
 *   실행: NAVER_ID=클라이언트ID NAVER_SECRET=시크릿 node scrape-community.js
 *   ⚠️ 공식 API + 스니펫 키워드 빈도만 집계 → 저작권 부담 적음. 표기는 "언급 기반·검증 전".
 *   네이버 개발자센터 → 애플리케이션 등록 → '검색' API 사용 → Client ID/Secret 발급.
 */
const fs = require("fs"), path = require("path"), vm = require("vm"), https = require("https");
const ID = process.env.NAVER_ID, SECRET = process.env.NAVER_SECRET;
if (!ID || !SECRET) { console.error("❌ NAVER_ID / NAVER_SECRET 환경변수가 필요합니다."); process.exit(1); }

// map.js KEYWORDS와 동일 라벨 + 동의어 정규식(긍정 언급)
const KW = [
  { l: "음식이 맛있어요", re: /맛있|음식.{0,3}좋|식사.{0,3}좋|뷔페.{0,3}맛|코스.{0,3}맛|밥.{0,2}맛|맛집/g },
  { l: "인테리어가 예뻐요", re: /인테리어|예쁘|이쁘|화려|꽃.{0,2}장식.{0,3}예|버진로드.{0,3}예/g },
  { l: "홀이 넓어요", re: /홀.{0,3}넓|넓은.{0,2}홀|규모.{0,2}크|웅장|층고.{0,2}높|천장.{0,2}높/g },
  { l: "응대가 친절해요", re: /친절|응대.{0,3}좋|상담.{0,3}좋|직원.{0,3}좋|플래너.{0,3}좋/g },
  { l: "가성비가 좋아요", re: /가성비|합리적|저렴|가격.{0,3}좋|혜자|착한.{0,2}가격/g },
  { l: "주차가 편해요", re: /주차.{0,3}편|주차장.{0,2}넓|발렛|발레파킹/g },
  { l: "교통이 편해요", re: /교통.{0,3}편|역세권|역.{0,2}가까|지하철.{0,2}가까|접근성.{0,3}좋/g },
  { l: "분위기가 좋아요", re: /분위기.{0,3}좋|로맨틱|고급스|예쁜.{0,2}분위기|감성.{0,2}있/g },
  { l: "깨끗해요", re: /깨끗|청결|위생.{0,3}좋|관리.{0,3}잘/g },
  { l: "하객 수용이 좋아요", re: /하객.{0,3}수용|수용.{0,2}많|대규모.{0,2}수용|많은.{0,2}하객/g },
];
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");

function api(q) {
  return new Promise((res) => {
    const opt = {
      hostname: "openapi.naver.com",
      path: "/v1/search/blog.json?display=30&sort=sim&query=" + encodeURIComponent(q),
      headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET },
    };
    https.get(opt, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { res(null); } }); }).on("error", () => res(null));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const FILE = path.join(__dirname, "venues.js");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const venues = sandbox.window.WEDDING_VENUES || [];
  const MAX = parseInt(process.env.MAX || "1300", 10), START = parseInt(process.env.START || "0", 10);
  let done = 0, filled = 0;
  for (let i = START; i < venues.length && done < MAX; i++) {
    const v = venues[i]; done++;
    const j = await api(v.name + " 웨딩홀 후기");
    if (j && j.errorCode) { console.log("API 오류: " + j.errorMessage + " (키/한도 확인)"); break; }
    if (!j || !j.items || !j.items.length) { console.log("  [" + i + "] " + v.name + ": 결과 없음"); await sleep(120); continue; }
    const text = j.items.map((it) => stripTags(it.title) + " " + stripTags(it.description)).join("  ");
    const counts = KW.map((k) => { const m = text.match(k.re); return [k.l, m ? m.length : 0]; }).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    if (counts.length) { v.community = counts.slice(0, 6); filled++; console.log("  [" + i + "] " + v.name + " ← " + counts.slice(0, 3).map((x) => x[0] + "(" + x[1] + ")").join(", ")); }
    else { if (v.community) delete v.community; console.log("  [" + i + "] " + v.name + ": 키워드 없음"); }
    await sleep(110); // rate limit
  }
  const header = "/* 전국 예식장 리스트 — 커뮤니티 키워드 집계(" + new Date().toISOString().slice(0, 10) + ") */\n";
  fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
  console.log("처리 " + done + "곳, community 채움 " + filled + "곳");
})();
