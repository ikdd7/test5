/*
 * apply-prices.js — 검색으로 찾은 가격을 venues.js의 기존(회색) 식장에 채움
 *   이름 매칭으로 meal/rental을 채우고(이미 가격 있으면 건드리지 않음), 못 찾으면 리포트.
 * 실행:  node apply-prices.js
 * PRICES 배열만 채워서 돌리면 됨(매 검색 라운드마다 갱신).
 */
const fs = require("fs"), path = require("path"), vm = require("vm");

// 이번 라운드 수집(출처: 스마트웨딩 등 공개 가격정보)
const PRICES = [
  { name: "크레스트72", region: "서울", meal: 66000, rental: 7700000, source: "smartwedding/Crust72" },
  { name: "그레이스파티 인천", region: "인천", meal: 65000, rental: 6500000, source: "smartwedding/graceparty" },
];

const norm = (s) => String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase();
function match(venue, p) {
  if (p.region && venue.region && venue.region !== p.region) return false;
  const a = norm(venue.name), b = norm(p.name);
  return a === b || (a.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
}

const FILE = path.join(__dirname, "venues.js");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
const venues = sandbox.window.WEDDING_VENUES || [];

let filled = 0; const missed = [];
PRICES.forEach((p) => {
  const v = venues.find((x) => match(x, p) && !(typeof x.meal === "number" && x.meal));
  if (v) {
    v.meal = p.meal; if (p.rental) v.rental = p.rental; v.source = p.source; v.verified = false;
    filled++;
  } else {
    const exists = venues.find((x) => match(x, p));
    missed.push(p.name + (exists ? " (이미 가격 있음)" : " (지도에 없음)"));
  }
});

const header = "/* 전국 예식장 리스트 — 가격 채움(" + new Date().toISOString().slice(0, 10) + ", 가격 " + venues.filter((v) => v.meal).length + "곳) */\n";
const body = "window.WEDDING_VENUES = [\n" + venues.map((v) => "  " + JSON.stringify(v)).join(",\n") + "\n];\n";
fs.writeFileSync(FILE, header + body, "utf8");
console.log("가격 채움: " + filled + "곳" + (missed.length ? " / 미매칭: " + missed.join(", ") : ""));
console.log("총 가격 보유: " + venues.filter((v) => v.meal).length + "곳");
