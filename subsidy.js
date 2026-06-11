/*
 * subsidy.js — 보청기 정부지원금 + 실부담금 + 견적 적정성 계산 엔진
 *
 * 페이지(index.html)와 테스트(test.js)가 공유하는 단일 소스.
 * 브라우저(<script>)와 Node(require) 양쪽에서 동작한다.
 *
 * ── 근거(2026 기준, 건강보험 보장구[보청기] 급여) ──────────────────
 *  · 청각장애로 등록된 사람이 5년에 1회, 편측(한쪽) 기준으로 지원.
 *  · 기준액 131만원 = 제품구입비(최대 91만) + 적합관리비(최대 40만).
 *  · 일반 건강보험 가입자: 기준액의 90% → 최대 117.9만원(본인부담 10%).
 *  · 차상위계층 / 기초생활수급자: 100% → 최대 131만원.
 *  · 만 19세 미만: 양측(양쪽) 지원 가능.
 *  수치는 제도 변경 시 아래 SUBSIDY 상수만 고치면 전체 반영된다.
 *  (정확한 최종 금액은 공단/센터 확인 필요 — 화면에 고지함)
 * ──────────────────────────────────────────────────────────────
 */

(function (root) {
  'use strict';

  // 지원금 기준 상수 (제도 바뀌면 여기만 수정)
  var SUBSIDY = {
    baseAmount: 1310000,   // 기준액(제품+적합관리)
    generalMax: 1179000,   // 일반 건강보험 가입자 최대 지원(90%)
    lowIncomeMax: 1310000, // 차상위·기초수급 최대 지원(100%)
    generalRate: 0.9,
    cycleYears: 5,
    minorAgeLimit: 19,     // 만 19세 미만 양측 지원
  };

  // 브랜드/등급별 1대(편측) 시중가 범위 — 콜드스타트 골조(seed).
  // 실제 결제가가 제보로 쌓이면 이 범위를 보정한다.
  var GRADES = [
    { key: 'economy',  label: '경제형 (3~4채널)',     min: 800000,  max: 1100000 },
    { key: 'standard', label: '일반형 (6~8채널)',     min: 1100000, max: 2000000 },
    { key: 'premium',  label: '고급형 (10~16채널)',   min: 2000000, max: 3000000 },
    { key: 'flagship', label: '최고급형 (20채널+)',   min: 3000000, max: 4500000 },
  ];

  function getGrade(key) {
    for (var i = 0; i < GRADES.length; i++) {
      if (GRADES[i].key === key) return GRADES[i];
    }
    return null;
  }

  /**
   * 지원금 계산
   * @param {Object} p
   *   registered {boolean}  청각장애 등록 여부
   *   incomeType {string}   'general' | 'lowincome'  (차상위·수급은 lowincome)
   *   age        {number}   만 나이 (선택; 19세 미만이면 양측)
   *   bothEars   {boolean}  양쪽 구매 여부
   * @returns {Object} { eligible, perEar, ears, total, note }
   */
  function calcSubsidy(p) {
    p = p || {};
    if (!p.registered) {
      return {
        eligible: false,
        perEar: 0,
        ears: 0,
        total: 0,
        note: '청각장애 등록(청각장애 진단) 후에만 지원됩니다.',
      };
    }
    var perEar = p.incomeType === 'lowincome'
      ? SUBSIDY.lowIncomeMax
      : SUBSIDY.generalMax;

    // 만 19세 미만이거나 양쪽 구매 선택 시 양측, 그 외 편측
    var isMinor = typeof p.age === 'number' && p.age < SUBSIDY.minorAgeLimit;
    var ears = (isMinor || p.bothEars) ? 2 : 1;

    return {
      eligible: true,
      perEar: perEar,
      ears: ears,
      total: perEar * ears,
      note: '5년에 1회 기준. ' + (ears === 2 ? '양측' : '편측(한쪽)') + ' 지원.',
    };
  }

  /**
   * 견적 적정성 진단
   * @param {Object} p
   *   quote      {number}  센터에서 받은 견적가(편측 1대, 원)
   *   gradeKey   {string}  등급 key
   *   subsidy    {number}  적용 가능한 지원금(편측, 원)
   * @returns {Object} { verdict, ratio, fairLow, fairHigh, midPrice, outOfPocket, savingVsHigh }
   */
  function diagnoseQuote(p) {
    p = p || {};
    var g = getGrade(p.gradeKey) || GRADES[1];
    var quote = Number(p.quote) || 0;
    var subsidy = Number(p.subsidy) || 0;
    var mid = Math.round((g.min + g.max) / 2);

    var verdict, ratio = quote > 0 ? quote / mid : 0;
    if (quote <= 0) {
      verdict = 'unknown';
    } else if (quote <= g.min * 1.02) {
      verdict = 'cheap';      // 평균 이하 — 잘 받음
    } else if (quote <= mid) {
      verdict = 'fair';       // 적정 범위
    } else if (quote <= g.max) {
      verdict = 'high';       // 비싼 편
    } else {
      verdict = 'overpriced'; // 정가 범위 초과 — 과다
    }

    return {
      verdict: verdict,
      grade: g,
      ratio: ratio,
      fairLow: g.min,
      fairHigh: g.max,
      midPrice: mid,
      // 지원금 차감 후 실제 내 돈(편측)
      outOfPocket: Math.max(0, quote - subsidy),
      // 같은 등급 최고가 대비 아낄 수 있는 금액
      savingVsHigh: Math.max(0, quote - mid),
    };
  }

  var api = {
    SUBSIDY: SUBSIDY,
    GRADES: GRADES,
    getGrade: getGrade,
    calcSubsidy: calcSubsidy,
    diagnoseQuote: diagnoseQuote,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Subsidy = api;
  }
})(typeof window !== 'undefined' ? window : this);
