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
const SLOTS = ["주말 점심", "주말 저녁", "평일 저녁", "토요일", "일요일"];

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
  const meal = range(spec.meal, m);
  const rental = range(spec.rental, 1) === 0 ? 0 : range(spec.rental, m);
  const guar = Math.round((spec.guar[0] + rnd() * (spec.guar[1] - spec.guar[0])) / 10) * 10;
  rows.push({
    id: "ex" + (i + 1),
    region: r, type: t,
    meal: meal,                 // 1인 식대(원)
    rental: rnd() < 0.25 ? 0 : rental, // 일부는 보증인원 충족 시 무료대관
    guarantee: guar,            // 보증인원(명)
    slot: pick(SLOTS),
    month: "2025-" + String(1 + Math.floor(rnd() * 11)).padStart(2, "0"),
    sample: true,
  });
}

const out =
  "/* 자동 생성 — wedding-data.gen.js (예시/합성 데이터, 실제 식장 아님) */\n" +
  "window.WEDDING_SAMPLE = " + JSON.stringify(rows, null, 0) + ";\n";
fs.writeFileSync(__dirname + "/wedding-data.js", out, "utf8");
console.log("wedding-data.js 생성: 예시 표본 " + rows.length + "건");
