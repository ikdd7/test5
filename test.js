/*
 * test.js — 계산 엔진 + 페이지 자동 검증
 * 실행:  node test.js
 * 같은 calc.js를 페이지와 공유하므로, 여기서 통과하면 페이지도 동일하게 동작합니다.
 */
const fs = require("fs");
const path = require("path");
const C = require("./calc.js");

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

console.log("=".repeat(60));
console.log("  연봉 실수령액 계산기 — 자동 검증");
console.log("=".repeat(60));

// ── 1. 불변식(Property) 테스트: 1,200만 ~ 3억, 100만 단위 ──
let prevNet = -1, prevTaxBase = -1;
let propCount = 0;
for (let annual = 12000000; annual <= 300000000; annual += 1000000) {
  const r = C.netSalary({ annualSalary: annual, dependents: 1, children: 0 });
  const b = r.breakdown;
  propCount++;

  ok(r.netMonthly > 0, `실수령>0 (연봉 ${annual})`);
  ok(r.netMonthly < r.monthlyGross, `실수령<총급여 (연봉 ${annual})`);
  ok(b.nationalPension >= 0 && b.healthInsurance >= 0 && b.longTermCare >= 0 &&
     b.employment >= 0 && b.incomeTax >= 0 && b.localTax >= 0, `공제항목 음수없음 (연봉 ${annual})`);
  // 국민연금 상한: 상한소득 × 4.5% 초과 불가
  ok(b.nationalPension <= Math.ceil(C.RATES.nationalPension.baseMax * C.RATES.nationalPension.rate),
     `국민연금 상한 준수 (연봉 ${annual})`);
  // 지방세 = 소득세 × 10% (절사 오차 1원 허용)
  ok(approx(b.localTax, Math.floor(b.incomeTax * 0.1), 1), `지방세=소득세×10% (연봉 ${annual})`);
  // 단조성: 연봉↑ → 실수령액↑, 과세표준↑(비감소)
  ok(r.netMonthly >= prevNet, `실수령 단조증가 (연봉 ${annual})`);
  ok(r.taxBase >= prevTaxBase, `과세표준 비감소 (연봉 ${annual})`);
  prevNet = r.netMonthly; prevTaxBase = r.taxBase;
}
console.log(`▸ 불변식 테스트: ${propCount}개 연봉 구간 검사 완료`);

// ── 2. 합계 정합성: 총급여 = 실수령 + 공제합계 (절사오차 허용) ──
for (let annual = 20000000; annual <= 150000000; annual += 7000000) {
  const r = C.netSalary({ annualSalary: annual });
  const b = r.breakdown;
  const sumDed = b.nationalPension + b.healthInsurance + b.longTermCare + b.employment + b.incomeTax + b.localTax;
  ok(approx(r.monthlyGross - r.netMonthly, sumDed, 2), `총급여-실수령=공제합 (연봉 ${annual})`);
}

// ── 3. 부양가족/자녀 공제 방향성: 공제 늘면 세금 감소(실수령 증가) ──
{
  const base = C.netSalary({ annualSalary: 60000000, dependents: 1, children: 0 });
  const moreDep = C.netSalary({ annualSalary: 60000000, dependents: 3, children: 0 });
  const moreKid = C.netSalary({ annualSalary: 60000000, dependents: 3, children: 2 });
  ok(moreDep.netMonthly >= base.netMonthly, "부양가족 많으면 실수령 ↑");
  ok(moreKid.netMonthly >= moreDep.netMonthly, "자녀공제 있으면 실수령 ↑");
}

// ── 4. 4대보험 요율 타당성(과세월급 300만 기준) ──
{
  const taxable = 3000000;
  ok(C._internal.nationalPension(taxable) === Math.floor(taxable * 0.045), "국민연금 4.5%");
  ok(C._internal.healthInsurance(taxable) === Math.floor(taxable * 0.03545), "건강보험 3.545%");
  ok(C._internal.employmentInsurance(taxable) === Math.floor(taxable * 0.009), "고용보험 0.9%");
  const hi = C._internal.healthInsurance(taxable);
  ok(C._internal.longTermCare(hi) === Math.floor(hi * 0.1295), "장기요양 건강보험료×12.95%");
}

// ── 5. 누진세 구간 경계 정확성 ──
{
  ok(C._internal.progressiveTax(0) === 0, "과세표준0 → 세금0");
  ok(C._internal.progressiveTax(14000000) === Math.floor(14000000 * 0.06), "1400만 경계 6%");
  ok(C._internal.progressiveTax(50000000) === Math.floor(50000000 * 0.15 - 1260000), "5000만 경계 15%");
  ok(C._internal.progressiveTax(-100) === 0, "음수 과세표준 방어");
}

// ── 6. 레퍼런스 스팟체크(현실적 범위) — 연봉 3600만, 부양1 ──
{
  const r = C.netSalary({ annualSalary: 36000000, dependents: 1, children: 0 });
  // 월 실수령은 대략 월급(300만)의 88~92% 수준이어야 함
  ok(r.netMonthly > 2600000 && r.netMonthly < 2900000, `연봉3600 실수령 타당범위 (${r.netMonthly})`);
}

// ── 7. 퇴직금 ──
{
  const s = C.severancePay(3000000, 365);   // 월 300, 1년
  ok(s > 2900000 && s < 3100000, `퇴직금 1년≈1개월급 (${s})`);
  ok(C.severancePay(3000000, 0) === 0, "재직0일 → 퇴직금0");
  ok(C.severancePay(0, 365) === 0, "임금0 → 퇴직금0");
  ok(C.severancePay(3000000, 730) > s, "근속 길수록 퇴직금↑");
}

// ── 8. 시급/주휴수당 ──
{
  const w = C.weeklyHolidayPay(10000, 40);
  ok(w.weeklyHoliday > 0, "주40시간 주휴수당 발생");
  ok(w.effectiveHourly > 10000, "주휴 포함 실질시급 > 시급");
  const w2 = C.weeklyHolidayPay(10000, 10);
  ok(w2.weeklyHoliday === 0, "주15시간 미만 주휴 없음");
  ok(C.weeklyHolidayPay(9000, 40).belowMinWage === true, "최저임금 미만 감지");
  ok(C.weeklyHolidayPay(20000, 40).belowMinWage === false, "최저임금 이상 정상");
}

// ── 9. index.html 구조 검증 ──
const htmlPath = path.join(__dirname, "index.html");
if (fs.existsSync(htmlPath)) {
  const h = fs.readFileSync(htmlPath, "utf8");
  const checks = [
    ["<!DOCTYPE html>", "DOCTYPE"],
    ['lang="ko"', "한국어 lang"],
    ['name="viewport"', "모바일 viewport"],
    ['name="description"', "SEO description"],
    ['property="og:title"', "OG 제목"],
    ['"calc.js"', "calc.js 연결"],
    ["실수령", "실수령 키워드"],
    ["@media", "반응형"],
    ["ADSENSE_CLIENT", "애드센스 설정 지점"],
    ["AFFILIATE", "제휴 링크 설정 지점"],
    ["</html>", "html 닫힘"],
  ];
  checks.forEach(([needle, name]) =>
    ok(h.includes(needle), `HTML: ${name}`));
  // style 중괄호 균형
  const sm = h.match(/<style>([\s\S]*?)<\/style>/);
  if (sm) ok((sm[1].match(/{/g)||[]).length === (sm[1].match(/}/g)||[]).length, "CSS 중괄호 균형");
  // script 태그 짝
  ok((h.match(/<script/g)||[]).length === (h.match(/<\/script>/g)||[]).length, "script 태그 짝");
  // 내부 앵커 유효성
  const anchors = [...h.matchAll(/href="#([\w-]+)"/g)].map(m => m[1]).filter(Boolean);
  const ids = new Set([...h.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
  anchors.forEach(a => ok(ids.has(a), `내부링크 #${a} 대상존재`));
} else {
  ok(false, "index.html 존재");
}

// ── 결과 ──
console.log(`\n✅ 통과: ${pass}   ❌ 실패: ${fail}   (총 ${pass + fail} 검증)\n`);
if (fail) {
  console.log("— 실패 항목 —");
  fails.slice(0, 20).forEach(f => console.log("  ❌", f));
  process.exit(1);
} else {
  console.log("모든 검증 통과 🎉  배포 준비 완료!");
  process.exit(0);
}
