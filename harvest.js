/*
 * harvest.js — 카카오 장소검색으로 전국 웨딩홀/예식장 수확 → venues.js 병합
 *
 * 실행:  KAKAO_REST_KEY=발급키 node harvest.js
 * (또는 GitHub Actions "Harvest venues" 워크플로로 실행)
 *
 * 동작:
 *  - 전국 시도·주요 시군구 × ("웨딩홀","예식장") 키워드 검색 (페이지당 15 × 3페이지)
 *  - 예식장 카테고리/이름 필터 → 중복 제거(카카오 place id + 이름 정규화)
 *  - 기존 venues.js와 병합: 기존 항목(가격 보유)은 유지, 새 식장은 meal:null로 추가
 *  - 좌표는 카카오 제공값(정확) 사용
 * 무료 한도(일 30만 건) 내에서 ~400회 호출.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const https = require("https");

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) { console.error("❌ KAKAO_REST_KEY 환경변수가 필요합니다."); process.exit(1); }

const FILE = path.join(__dirname, "venues.js");

// ── 검색 지역: 시도 전체 + 인구 많은 시군구(커버리지 보강) ──
const AREAS = [
  // 서울 25개 구
  ...["강남구","서초구","송파구","강동구","마포구","영등포구","구로구","금천구","관악구","동작구","강서구","양천구","용산구","중구","종로구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구","노원구","은평구","서대문구"].map(d => "서울 " + d),
  // 경기 주요 시
  ...["수원","성남","고양","용인","부천","안양","안산","남양주","화성","평택","의정부","파주","김포","광명","군포","하남","구리","시흥","오산","이천","안성","양주","포천","동두천","의왕","여주","광주시"].map(d => "경기 " + d),
  // 인천
  ...["연수구","남동구","부평구","계양구","서구","미추홀구","중구"].map(d => "인천 " + d),
  // 부산
  ...["해운대구","부산진구","동래구","남구","북구","사상구","사하구","금정구","연제구","수영구","강서구","기장군","중구","서구","동구","영도구"].map(d => "부산 " + d),
  // 대구
  ...["수성구","달서구","동구","서구","남구","북구","중구","달성군"].map(d => "대구 " + d),
  // 광주·대전·울산·세종
  ...["동구","서구","남구","북구","광산구"].map(d => "광주 " + d),
  ...["유성구","서구","중구","동구","대덕구"].map(d => "대전 " + d),
  ...["남구","중구","동구","북구","울주군"].map(d => "울산 " + d),
  "세종",
  // 강원
  ...["춘천","원주","강릉","동해","속초","삼척","태백"].map(d => "강원 " + d),
  // 충북·충남
  ...["청주","충주","제천","음성","진천"].map(d => "충북 " + d),
  ...["천안","아산","서산","당진","공주","논산","홍성","예산","보령"].map(d => "충남 " + d),
  // 전북·전남
  ...["전주","익산","군산","정읍","김제","완주"].map(d => "전북 " + d),
  ...["목포","여수","순천","광양","나주","무안","해남"].map(d => "전남 " + d),
  // 경북·경남
  ...["포항","구미","경주","안동","김천","영주","상주","경산","칠곡"].map(d => "경북 " + d),
  ...["창원","김해","진주","양산","거제","통영","사천","밀양"].map(d => "경남 " + d),
  // 제주
  "제주시", "서귀포시",
];
const KEYWORDS = ["웨딩홀", "예식장"];

const REGION_MAP = { "서울": "서울", "경기": "경기", "인천": "인천", "부산": "부산", "대구": "대구", "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종", "강원": "강원", "충북": "충북", "충남": "충남", "전북": "전북", "전남": "전남", "경북": "경북", "경남": "경남", "제주": "제주" };
function regionOf(addr) {
  if (!addr) return null;
  const t = addr.split(" ")[0];
  for (const k in REGION_MAP) if (t.startsWith(k)) return REGION_MAP[k];
  // 풀네임 (서울특별시, 전라남도 등)
  if (t.startsWith("전라남")) return "전남"; if (t.startsWith("전라북")) return "전북";
  if (t.startsWith("경상남")) return "경남"; if (t.startsWith("경상북")) return "경북";
  if (t.startsWith("충청남")) return "충남"; if (t.startsWith("충청북")) return "충북";
  return null;
}
function districtOf(addr) { const p = (addr || "").split(" "); return p.length > 1 ? p[1] : ""; }
function typeOf(name) {
  if (/호텔|리조트/.test(name)) return "호텔";
  if (/컨벤션/.test(name)) return "컨벤션";
  if (/채플|성당|교회/.test(name)) return "채플/성당";
  if (/하우스|가든|garden/i.test(name)) return "하우스웨딩";
  return "일반예식장";
}
const norm = (s) => String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase();

function req(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { Authorization: "KakaoAK " + KEY } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 기존 venues 로드
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  const existing = sandbox.window.WEDDING_VENUES || [];
  const seen = new Set(existing.map((v) => norm(v.name)));
  const byId = new Set();
  const added = [];
  let calls = 0;

  for (const area of AREAS) {
    for (const kw of KEYWORDS) {
      for (let page = 1; page <= 3; page++) {
        let j;
        try {
          j = await req("https://dapi.kakao.com/v2/local/search/keyword.json?size=15&page=" + page +
            "&query=" + encodeURIComponent(area + " " + kw));
          calls++;
        } catch (e) { break; }
        const docs = (j && j.documents) || [];
        for (const d of docs) {
          // 예식장 카테고리 또는 이름 패턴만
          const isWed = /예식장/.test(d.category_name || "") || /(웨딩|예식|컨벤션)/.test(d.place_name || "");
          if (!isWed) continue;
          if (/(스튜디오|드레스|메이크업|플래너|박람회|사진|촬영)/.test(d.place_name)) continue; // 스드메 업체 제외
          if (byId.has(d.id) || seen.has(norm(d.place_name))) continue;
          const region = regionOf(d.address_name || d.road_address_name);
          if (!region) continue;
          const lat = +(+d.y).toFixed(6), lng = +(+d.x).toFixed(6);
          if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) continue;
          byId.add(d.id); seen.add(norm(d.place_name));
          added.push({
            name: d.place_name, region: region, district: districtOf(d.address_name),
            type: typeOf(d.place_name + " " + (d.category_name || "")),
            meal: null, lat: lat, lng: lng, verified: false, source: "kakao/" + d.id,
          });
        }
        if (!j || !j.meta || j.meta.is_end) break;
        await sleep(120);
      }
    }
  }

  const { dedupeVenues } = require("./dedupe.js");
  const all = dedupeVenues(existing.concat(added)); // 같은 식장 다른 홀 병합
  const header = "/* 전국 예식장 리스트 — 카카오 수확+중복병합(" + new Date().toISOString().slice(0, 10) + ", " + all.length + "곳) */\n";
  const body = "window.WEDDING_VENUES = [\n" + all.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n";
  fs.writeFileSync(FILE, header + body, "utf8");

  const byRegion = {};
  all.forEach((v) => (byRegion[v.region] = (byRegion[v.region] || 0) + 1));
  console.log("✅ 신규 " + added.length + "곳 추가 (API 호출 " + calls + "회) → 총 " + all.length + "곳");
  console.log("지역 분포:", JSON.stringify(byRegion));
})();
