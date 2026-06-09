/*
 * calc.js — 한국 급여/세금 계산 엔진 (2026 기준)
 * 브라우저(<script>)와 Node(require) 양쪽에서 동일하게 동작합니다.
 *  ⇒ 페이지와 테스트가 같은 코드를 사용 = 검증의 신뢰성 확보.
 *
 * ⚠️ 요율/세율은 아래 RATES 한 곳에서 수정하세요.
 *    값은 2025년 확정 기준(2026년 잠정)이며, 매년 초 고시 후 갱신 권장.
 */
(function (root) {
  "use strict";

  // ───────────────────────── 설정(요율/세율) ─────────────────────────
  var RATES = {
    year: 2026,

    // 4대보험 (근로자 본인 부담분)
    nationalPension: { rate: 0.045, baseMax: 6370000, baseMin: 400000 }, // 국민연금
    healthInsurance: { rate: 0.03545 },        // 건강보험 (전체 7.09%의 근로자 1/2)
    longTermCare:    { ofHealth: 0.1295 },     // 장기요양 = 건강보험료 × 12.95%
    employment:      { rate: 0.009 },          // 고용보험(실업급여분) 근로자

    nonTaxMonthlyDefault: 200000, // 식대 등 비과세 기본값(월) — 2024년~ 식대 한도 20만

    // 근로소득공제 구간 [상한, 기본공제액, 초과분 공제율]
    earnedIncomeDeduction: [
      [5000000,        0,    0.70],
      [15000000,  3500000,   0.40],
      [45000000,  7500000,   0.15],
      [100000000,12000000,   0.05],
      [Infinity, 14750000,   0.02],
    ],

    // 종합소득세 과세표준 누진 구간 [상한, 누진공제 방식 대신 (세율, 누진공제액)]
    incomeTaxBrackets: [
      [14000000, 0.06,        0],
      [50000000, 0.15,  1260000],
      [88000000, 0.24,  5760000],
      [150000000,0.35, 15440000],
      [300000000,0.38, 19940000],
      [500000000,0.40, 25940000],
      [1000000000,0.42,35940000],
      [Infinity, 0.45, 65940000],
    ],

    personalDeductionPerHead: 1500000, // 인적공제 1인당 150만
    localTaxRate: 0.10,                // 지방소득세 = 소득세 × 10%

    minWageHourly: 10320, // 2026년 최저시급(잠정) — 고시 확인 후 수정
    weeklyStdHours: 40,   // 주 소정근로 기준
  };

  function won(n) { return Math.floor(n); } // 원 단위 절사
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ───────────────────────── 4대보험 ─────────────────────────
  function nationalPension(monthlyTaxable) {
    var base = clamp(monthlyTaxable, RATES.nationalPension.baseMin, RATES.nationalPension.baseMax);
    return won(base * RATES.nationalPension.rate);
  }
  function healthInsurance(monthlyTaxable) {
    return won(monthlyTaxable * RATES.healthInsurance.rate);
  }
  function longTermCare(healthFee) {
    return won(healthFee * RATES.longTermCare.ofHealth);
  }
  function employmentInsurance(monthlyTaxable) {
    return won(monthlyTaxable * RATES.employment.rate);
  }

  // ───────────────────────── 소득세(연간 추정) ─────────────────────────
  function earnedIncomeDeduction(grossAnnual) {
    var prevCap = 0;
    for (var i = 0; i < RATES.earnedIncomeDeduction.length; i++) {
      var cap = RATES.earnedIncomeDeduction[i][0];
      var base = RATES.earnedIncomeDeduction[i][1];
      var rate = RATES.earnedIncomeDeduction[i][2];
      if (grossAnnual <= cap) {
        var ded = base + (grossAnnual - prevCap) * rate;
        return Math.min(won(ded), 20000000); // 근로소득공제 한도 2천만
      }
      prevCap = cap;
    }
    return 20000000;
  }

  function progressiveTax(taxBase) {
    if (taxBase <= 0) return 0;
    for (var i = 0; i < RATES.incomeTaxBrackets.length; i++) {
      var cap = RATES.incomeTaxBrackets[i][0];
      var rate = RATES.incomeTaxBrackets[i][1];
      var quickDed = RATES.incomeTaxBrackets[i][2];
      if (taxBase <= cap) return won(taxBase * rate - quickDed);
    }
    return 0;
  }

  // 근로소득세액공제 (산출세액 기준 + 총급여 한도)
  function earnedTaxCredit(calcTax, grossAnnual) {
    var credit = calcTax <= 1300000
      ? calcTax * 0.55
      : 1300000 * 0.55 + (calcTax - 1300000) * 0.30;
    var limit;
    if (grossAnnual <= 33000000) limit = 740000;
    else if (grossAnnual <= 70000000) limit = Math.max(740000 - (grossAnnual - 33000000) * 0.008, 660000);
    else if (grossAnnual <= 120000000) limit = Math.max(660000 - (grossAnnual - 70000000) * 0.5, 500000);
    else limit = Math.max(500000 - (grossAnnual - 120000000) * 0.5, 200000);
    return won(Math.min(credit, limit));
  }

  // 자녀세액공제 (8~20세 자녀, 2025 개정 기준)
  function childTaxCredit(children) {
    var c = Math.max(0, children | 0);
    if (c === 0) return 0;
    if (c === 1) return 250000;
    if (c === 2) return 550000;
    return 550000 + (c - 2) * 400000;
  }

  /**
   * 연봉 실수령액 계산
   * @param {Object} o
   *   annualSalary: 연봉(원, 세전, 비과세 포함 총액)
   *   dependents: 본인 포함 부양가족 수 (기본 1)
   *   children: 8~20세 자녀 수 (기본 0)
   *   nonTaxMonthly: 월 비과세액(식대 등, 기본 20만)
   *   severanceIncluded: 퇴직금 별도(false) / 연봉에 포함(true)
   */
  function netSalary(o) {
    o = o || {};
    var annual = Math.max(0, o.annualSalary || 0);
    if (o.severanceIncluded) annual = annual * 12 / 13; // 13분의 1이 퇴직금이라 가정
    var dependents = Math.max(1, o.dependents == null ? 1 : o.dependents);
    var children = Math.max(0, o.children || 0);
    var nonTaxMonthly = o.nonTaxMonthly == null ? RATES.nonTaxMonthlyDefault : Math.max(0, o.nonTaxMonthly);

    var monthlyGross = annual / 12;                         // 월 총지급액(비과세 포함)
    var monthlyTaxable = Math.max(0, monthlyGross - nonTaxMonthly); // 보수월액(과세)
    var grossAnnualTaxable = monthlyTaxable * 12;           // 연간 과세 총급여

    // 4대보험(월)
    var np = nationalPension(monthlyTaxable);
    var hi = healthInsurance(monthlyTaxable);
    var ltc = longTermCare(hi);
    var ei = employmentInsurance(monthlyTaxable);
    var insMonthly = np + hi + ltc + ei;

    // 소득세(연간 → 월)
    var eid = earnedIncomeDeduction(grossAnnualTaxable);
    var earnedIncome = Math.max(0, grossAnnualTaxable - eid);
    var personalDed = RATES.personalDeductionPerHead * dependents;
    var pensionDed = np * 12;            // 연금보험료공제(전액)
    var insDed = (hi + ltc + ei) * 12;   // 보험료 특별소득공제(전액)
    var taxBase = Math.max(0, earnedIncome - personalDed - pensionDed - insDed);

    var calcTax = progressiveTax(taxBase);
    var afterCredit = Math.max(0, calcTax - earnedTaxCredit(calcTax, grossAnnualTaxable) - childTaxCredit(children));
    var incomeTaxMonthly = won(afterCredit / 12);
    var localTaxMonthly = won(incomeTaxMonthly * RATES.localTaxRate);

    var deductionMonthly = insMonthly + incomeTaxMonthly + localTaxMonthly;
    var netMonthly = won(monthlyGross - deductionMonthly);

    return {
      year: RATES.year,
      monthlyGross: won(monthlyGross),
      netMonthly: netMonthly,
      netAnnual: netMonthly * 12,
      deductionMonthly: deductionMonthly,
      breakdown: {
        nationalPension: np,
        healthInsurance: hi,
        longTermCare: ltc,
        employment: ei,
        incomeTax: incomeTaxMonthly,
        localTax: localTaxMonthly,
      },
      annualIncomeTax: afterCredit,
      taxBase: taxBase,
    };
  }

  // ───────────────────────── 퇴직금 ─────────────────────────
  /** avgMonthlyWage: 퇴직 전 3개월 평균 월급여, days: 총 재직일수 */
  function severancePay(avgMonthlyWage, days) {
    avgMonthlyWage = Math.max(0, avgMonthlyWage || 0);
    days = Math.max(0, days || 0);
    var dailyWage = avgMonthlyWage * 3 / 91; // 평균임금(1일)
    return won(dailyWage * 30 * (days / 365));
  }

  // ───────────────────────── 시급/주휴수당 ─────────────────────────
  /** hourly: 시급, weeklyHours: 주당 근로시간 */
  function weeklyHolidayPay(hourly, weeklyHours) {
    hourly = Math.max(0, hourly || 0);
    weeklyHours = Math.max(0, weeklyHours || 0);
    // 주 15시간 이상 근무 시 주휴수당 발생: (주근로시간/40)*8*시급, 최대 8시간분
    var holidayHours = weeklyHours >= 15 ? Math.min((weeklyHours / 40) * 8, 8) : 0;
    var weeklyBase = hourly * weeklyHours;
    var weeklyHoliday = won(hourly * holidayHours);
    var weeklyTotal = weeklyBase + weeklyHoliday;
    var monthlyTotal = won(weeklyTotal * 4.345); // 월 평균 주수 ≈ 4.345
    return {
      hourly: won(hourly),
      effectiveHourly: weeklyHours > 0 ? won(weeklyTotal / weeklyHours) : 0,
      weeklyBase: won(weeklyBase),
      weeklyHoliday: weeklyHoliday,
      weeklyTotal: won(weeklyTotal),
      monthlyTotal: monthlyTotal,
      belowMinWage: hourly < RATES.minWageHourly,
      minWage: RATES.minWageHourly,
    };
  }

  var API = {
    RATES: RATES,
    netSalary: netSalary,
    severancePay: severancePay,
    weeklyHolidayPay: weeklyHolidayPay,
    // 내부 함수도 테스트용으로 노출
    _internal: {
      nationalPension: nationalPension, healthInsurance: healthInsurance,
      longTermCare: longTermCare, employmentInsurance: employmentInsurance,
      earnedIncomeDeduction: earnedIncomeDeduction, progressiveTax: progressiveTax,
      earnedTaxCredit: earnedTaxCredit, childTaxCredit: childTaxCredit,
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SalaryCalc = API;
})(typeof window !== "undefined" ? window : this);
