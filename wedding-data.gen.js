/*
 * wedding-data.gen.js — 결혼식장 비용 "예시" 데이터 생성기
 * 실행:  node wedding-data.gen.js  →  wedding-data.js 생성
 *
 * ⚠️ 여기서 만드는 데이터는 실제 식장이 아닌 합성(예시) 데이터입니다.
 *    실제 식장명/가격을 임의로 게시하면 허위사실·명예훼손 위험이 있어,
 *    익명·합성 표본만 시드로 두고 실제 값은 사용자 제보(구글폼)로 대체합니다.
 */
const fs = require("fs");

const TYPES = {
  "일반예식장": { meal: [52000, 68000], rental: [0, 1500000], guar: [200, 300] },
  "컨벤션":     { meal: [58000, 82000], rental: [500000, 2800000], guar: [200, 350] },
  "호텔":       { meal: [95000, 165000], rental: [3000000, 16000000], guar: [150, 250] },
  "하우스웨딩":  { meal: [66000, 92000], rental: [5000000, 22000000], guar: [90, 200] },
  "채플/성당":   { meal: [55000, 78000], rental: [1000000, 4500000], guar: [150, 250] },
};
const REGIONS = { "서울": 1.15, "경기": 1.0, "인천": 0.95, "부산": 0.96, "대구": 0.9, "대전": 0.9, "광주": 0.88, "제주": 1.06 };
// 정규 시간대 체계 — 토요일 낮이 프라임(대관료 비쌈), 평일이 가장 쌈
const SLOTS = [
  { name: "토요일 낮", rentalMul: 1.2, w: 0.4 },
  { name: "토요일 저녁", rentalMul: 1.0, w: 0.25 },
  { name: "일요일", rentalMul: 0.92, w: 0.25 },
  { name: "평일", rentalMul: 0.75, w: 0.1 },
];
function pickSlot() {
  var r = rnd(), acc = 0;
  for (var i = 0; i < SLOTS.length; i++) { acc += SLOTS[i].w; if (r <= acc) return SLOTS[i]; }
  return SLOTS[0];
}

// 재현 가능한 의사난수(시드 고정)
let seed = 20260610;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function range(a, m) { return Math.round((a[0] + rnd() * (a[1] - a[0])) * m / 500) * 500; }

const rows = [];
const typeNames = Object.keys(TYPES), regionNames = Object.keys(REGIONS);
const N = 64;
for (let i = 0; i < N; i++) {
  const t = pick(typeNames), r = pick(regionNames), spec = TYPES[t], m = REGIONS[r];
  const slot = pickSlot();
  const meal = range(spec.meal, m);
  const rental = range(spec.rental, 1) === 0 ? 0 : range(spec.rental, m * slot.rentalMul);
  const guar = Math.round((spec.guar[0] + rnd() * (spec.guar[1] - spec.guar[0])) / 10) * 10;
  rows.push({
    id: "ex" + (i + 1),
    region: r, type: t,
    meal: meal,                 // 1인 식대(원, 부가세 포함가로 통일)
    rental: rnd() < 0.25 ? 0 : rental, // 일부는 보증인원 충족 시 무료대관
    guarantee: guar,            // 보증인원(명)
    slot: slot.name,            // 정규 시간대(토요일 낮/토요일 저녁/일요일/평일)
    month: "2025-" + String(1 + Math.floor(rnd() * 11)).padStart(2, "0"),
    verified: rnd() < 0.55,     // 견적서 사진 등으로 검증된 제보 여부
    sample: true,
  });
}

// 강건 통계 시연용: 의도적 이상치(저격성 허위) 2건 — IQR 필터/미검증 처리로 걸러져야 함
rows.push({ id: "ex_out1", region: "서울", type: "호텔", meal: 30000, rental: 0, guarantee: 200, slot: "평일", month: "2025-03", verified: false, sample: true });
rows.push({ id: "ex_out2", region: "경기", type: "일반예식장", meal: 250000, rental: 0, guarantee: 200, slot: "토요일 낮", month: "2025-08", verified: false, sample: true });

const out =
  "/* 자동 생성 — wedding-data.gen.js (예시/합성 데이터, 실제 식장 아님) */\n" +
  "window.WEDDING_SAMPLE = " + JSON.stringify(rows, null, 0) + ";\n";
fs.writeFileSync(__dirname + "/wedding-data.js", out, "utf8");
console.log("wedding-data.js 생성: 예시 표본 " + rows.length + "건");
