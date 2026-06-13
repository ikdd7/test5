/*
 * apply-reviews.js — 커뮤니티/후기에서 모은 장단점(pros/cons)을 venue에 채움
 *   이름 매칭으로 v.pros / v.cons 설정. 실행: node apply-reviews.js
 *   ⚠️ 단점(cons)은 명예훼손 위험이 있으니 "일부 후기" 수준의 사실·완곡 표현만.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");

// 공개 커뮤니티 언급 기반(검증 전, 의견). 단점은 완곡하게.
const REVIEWS = [
  { name: "엘타워", region: "서울", pros: ["역세권(양재역)", "넓은 규모·주차"], cons: ["가격대 높음", "동시예식 규모감"] },
  { name: "더라움", region: "서울", pros: ["고급스러운 분위기", "음식 만족도 높음"], cons: ["가격대 높음"] },
  { name: "빌라드지디 수서", region: "서울", pros: ["하우스 분위기", "단독 느낌"], cons: ["보증인원 높은 편"] },
  { name: "아펠가모", region: "서울", pros: ["식사(밥 맛집) 평 좋음"], cons: [] },
  { name: "그랜드하얏트 서울", region: "서울", pros: ["호텔 품격·뷰"], cons: ["식대 높음"] },
];

const norm = (s) => String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase();
function match(v, p) {
  if (p.region && v.region && v.region !== p.region) return false;
  const a = norm(v.name), b = norm(p.name);
  return a === b || (a.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
}

const FILE = path.join(__dirname, "venues.js");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
const venues = sandbox.window.WEDDING_VENUES || [];

let applied = 0; const missed = [];
REVIEWS.forEach((r) => {
  const v = venues.find((x) => match(x, r));
  if (v) {
    if (r.pros && r.pros.length) v.pros = r.pros;
    if (r.cons && r.cons.length) v.cons = r.cons;
    applied++;
  } else missed.push(r.name);
});

const header = "/* 전국 예식장 리스트 — 장단점 반영(" + new Date().toISOString().slice(0, 10) + ") */\n";
fs.writeFileSync(FILE, header + "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n", "utf8");
console.log("장단점 적용: " + applied + "곳" + (missed.length ? " / 미매칭: " + missed.join(", ") : ""));
