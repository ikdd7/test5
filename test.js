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

// ── 9. 대출 이자 계산기 ──
{
  // 원리금균등: 매월 동일, 총상환>원금, 총이자>0
  const a = C.loanPayment({ principal: 100000000, annualRate: 4.5, months: 360, method: "equalPI" });
  ok(a.monthly > 0, "원리금균등 월상환>0");
  ok(a.totalPayment > a.principal, "총상환 > 원금");
  ok(a.totalInterest > 0, "총이자 > 0");
  ok(Math.abs(a.totalPayment - a.principal - a.totalInterest) <= 2, "총상환=원금+총이자");
  // 원금균등: 첫 달 > 마지막 달, 총이자 < 원리금균등
  const b = C.loanPayment({ principal: 100000000, annualRate: 4.5, months: 360, method: "equalP" });
  ok(b.monthlyFirst > b.monthlyLast, "원금균등 첫달>마지막달");
  ok(b.totalInterest < a.totalInterest, "원금균등 총이자 < 원리금균등");
  // 만기일시: 총이자 가장 큼
  const c = C.loanPayment({ principal: 100000000, annualRate: 4.5, months: 360, method: "bullet" });
  ok(c.totalInterest >= a.totalInterest, "만기일시 총이자 최대");
  ok(c.monthlyInterest === Math.floor(100000000 * (0.045/12)), "만기일시 월이자 정확");
  // 금리 0%면 이자 0
  ok(C.loanPayment({ principal: 12000000, annualRate: 0, months: 12, method: "equalPI" }).totalInterest === 0, "금리0 → 이자0");
  // 빈 입력 방어
  ok(C.loanPayment({ principal: 0, annualRate: 4, months: 12 }).totalPayment === 0, "원금0 방어");
  ok(C.loanPayment({ principal: 1000000, annualRate: 4, months: 0 }).totalPayment === 0, "기간0 방어");
  // 단조성: 금리↑ → 총이자↑ (원리금균등)
  let prevInt = -1;
  for (let rate = 1; rate <= 12; rate += 0.5) {
    const r = C.loanPayment({ principal: 50000000, annualRate: rate, months: 120, method: "equalPI" });
    ok(r.totalInterest >= prevInt, `대출 금리↑→총이자↑ (${rate}%)`);
    prevInt = r.totalInterest;
  }
}

// ── 10. 만 나이 계산기 ──
{
  ok(C.koreanAge("2000-01-01", "2026-01-01").man === 26, "만나이 생일당일 +1");
  ok(C.koreanAge("2000-06-15", "2026-06-14").man === 25, "만나이 생일 하루전");
  ok(C.koreanAge("2000-06-15", "2026-06-15").man === 26, "만나이 생일 당일");
  ok(C.koreanAge("2000-06-15", "2026-06-16").man === 26, "만나이 생일 다음날");
  ok(C.koreanAge("2000-01-01", "2026-06-01").counting === 27, "세는나이 = 연도차+1");
  ok(C.koreanAge("2000-01-01", "2026-06-01").yearAge === 26, "연나이 = 연도차");
  ok(C.koreanAge("not-a-date") === null, "잘못된 날짜 방어");
  // 단조성: 기준일 늦을수록 만나이 비감소
  let prevAge = -1;
  for (let y = 2010; y <= 2030; y++) {
    const m = C.koreanAge("2000-03-10", y + "-07-01").man;
    ok(m >= prevAge, `만나이 단조 (${y})`);
    prevAge = m;
  }
}

// ── 11. 평수 변환 ──
{
  ok(Math.abs(C.pyeongToM2(1) - 3.31) < 0.01, "1평 ≈ 3.31㎡");
  ok(Math.abs(C.m2ToPyeong(3.3058) - 1) < 0.01, "3.3058㎡ ≈ 1평");
  // 왕복 변환 오차 작음 (1~200평)
  for (let p = 1; p <= 200; p++) {
    const back = C.m2ToPyeong(C.pyeongToM2(p));
    ok(Math.abs(back - p) < 0.05, `평수 왕복변환 오차작음 (${p}평)`);
  }
  ok(C.pyeongToM2(0) === 0 && C.m2ToPyeong(0) === 0, "0 입력 방어");
  ok(C.pyeongToM2(-5) === 0, "음수 입력 방어");
}

// ── 11.5 실업급여(구직급여) 계산기 ──
{
  const r = C.unemploymentBenefit({ monthlyWage: 3000000, age: 35, insuredYears: 2 });
  ok(r.totalBenefit === r.dailyBenefit * r.payDays, "총수령=일액×일수");
  ok(r.payDays === 150, "35세·1~3년 → 150일");
  ok(C.unemploymentBenefit({ monthlyWage: 3000000, age: 55, insuredYears: 2 }).payDays === 180, "55세·1~3년 → 180일");
  ok(C.unemploymentBenefit({ monthlyWage: 3000000, age: 35, insuredYears: 0.5 }).payDays === 120, "1년미만 → 120일");
  ok(C.unemploymentBenefit({ monthlyWage: 3000000, age: 55, insuredYears: 12 }).payDays === 270, "55세·10년+ → 270일(최대)");
  ok(C.unemploymentBenefit({ monthlyWage: 0, age: 35, insuredYears: 5 }).totalBenefit === 0, "월급0 방어");
  // 일액 상·하한 적용
  const hi = C.unemploymentBenefit({ monthlyWage: 100000000, age: 40, insuredYears: 5 });
  ok(hi.dailyBenefit <= hi.dailyUpper, "일액 상한 준수");
  const lo = C.unemploymentBenefit({ monthlyWage: 1000000, age: 40, insuredYears: 5 });
  ok(lo.dailyBenefit >= Math.min(lo.dailyLower, lo.dailyUpper), "일액 하한 준수");
  // 월급↑ → 총수령 비감소(상한 전까지)
  let prevT = -1;
  for (let m = 1500000; m <= 6000000; m += 250000) {
    const x = C.unemploymentBenefit({ monthlyWage: m, age: 30, insuredYears: 4 });
    ok(x.totalBenefit >= prevT, `실업급여 월급↑→총수령↑ (${m})`);
    prevT = x.totalBenefit;
  }
}

// ── 11.6 결혼식장 예시 데이터 검증 ──
{
  const raw = fs.readFileSync(path.join(__dirname, "wedding-data.js"), "utf8");
  const json = raw.slice(raw.indexOf("=") + 1, raw.lastIndexOf(";")).trim();
  let recs = [];
  try { recs = JSON.parse(json); } catch (e) { ok(false, "wedding-data.js JSON 파싱"); }
  ok(recs.length >= 40, `결혼식장 표본 충분(${recs.length}건)`);
  const TYPES = ["일반예식장", "컨벤션", "호텔", "하우스웨딩", "채플/성당"];
  const SLOTS = ["토요일 낮", "토요일 저녁", "일요일", "평일"];
  recs.forEach((r, i) => {
    ok(SLOTS.includes(r.slot), `표본#${i} 시간대 정규값`);
    ok(typeof r.region === "string" && r.region, `표본#${i} 지역`);
    ok(TYPES.includes(r.type), `표본#${i} 홀타입 유효`);
    ok(r.meal >= 30000 && r.meal <= 300000, `표본#${i} 식대 현실범위`);
    ok(r.rental >= 0, `표본#${i} 대관료 음수아님`);
    ok(r.guarantee >= 50 && r.guarantee <= 500, `표본#${i} 보증인원 범위`);
    ok(r.sample === true, `표본#${i} 예시표시(sample=true)`);
  });
  // 홀타입별 평균 식대 순서 상식 검증(호텔 > 일반예식장)
  const byType = {};
  recs.forEach((r) => (byType[r.type] = byType[r.type] || []).push(r.meal));
  const m = (t) => byType[t] ? byType[t].reduce((s, x) => s + x, 0) / byType[t].length : 0;
  if (byType["호텔"] && byType["일반예식장"]) ok(m("호텔") > m("일반예식장"), "호텔 식대 > 일반예식장");
}

// ── 12. HTML 페이지 구조 검증 (전 페이지) ──
const pages = ["index.html", "silup.html", "wedding.html", "daechul.html", "man-nai.html", "pyeong.html"];
const calcPages = pages.filter((p) => p !== "wedding.html"); // wedding은 charts.js 사용
["share.js", "style.css", "calc.js", "charts.js", "wedding-data.js"].forEach((f) =>
  ok(fs.existsSync(path.join(__dirname, f)), `${f} 존재`));
pages.forEach((page) => {
  const p = path.join(__dirname, page);
  if (!fs.existsSync(p)) { ok(false, `${page} 존재`); return; }
  const h = fs.readFileSync(p, "utf8");
  [
    ["<!DOCTYPE html>", "DOCTYPE"],
    ['lang="ko"', "한국어 lang"],
    ['name="viewport"', "viewport"],
    ['name="description"', "description"],
    ['property="og:title"', "OG"],
    ['rel="canonical"', "canonical"],
    ['"style.css"', "style.css 연결"],
    ['class="sitenav"', "허브 네비"],
    ["ADSENSE_CLIENT", "애드센스 지점"],
    ["</html>", "html 닫힘"],
  ].forEach(([needle, name]) => ok(h.includes(needle), `${page}: ${name}`));
  ok(calcPages.includes(page) ? h.includes('"calc.js"') : h.includes('"charts.js"'),
    `${page}: 엔진 스크립트 연결`);
  // script 태그 짝
  ok((h.match(/<script/g)||[]).length === (h.match(/<\/script>/g)||[]).length, `${page}: script 짝`);
  // 허브 교차링크: 4개 페이지 모두 링크
  pages.forEach((other) => ok(h.includes(`href="${other}"`), `${page}: ${other} 링크`));
  // 내부 앵커 유효성
  const anchors = [...h.matchAll(/href="#([\w-]+)"/g)].map(m => m[1]).filter(Boolean);
  const ids = new Set([...h.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
  anchors.forEach(a => ok(ids.has(a), `${page}: 내부링크 #${a}`));
});
// style.css 중괄호 균형
{
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
  ok((css.match(/{/g)||[]).length === (css.match(/}/g)||[]).length, "style.css 중괄호 균형");
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
