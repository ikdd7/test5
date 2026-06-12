/*
 * implant.js — 임플란트 비용 계산 엔진
 *   ① 만 65세 이상 건강보험(평생 2개) 본인부담 계산
 *   ② 비급여 견적 적정성 진단(심평원 평균 대비)
 *   ③ 추가시술(골이식·상악동거상술) + 보철 예상비용 합산
 * 페이지(implant.html)·테스트(test-implant.js) 공유. 브라우저/Node 양용.
 *
 * ── 근거(2026) ─────────────────────────────────────────────
 *  · 비급여 임플란트 1개 평균 약 120~139만원, 치과별 최저 100만~최고 458만(4.6배).
 *  · 만 65세 이상 부분무치악: 평생 2개 건강보험. 공단 산정액 ≈ 397,900원/개.
 *    본인부담 일반 30%(≈38만/개), 의료급여 1종 10%, 2종 20%.
 *    2025~ 보험 크라운 재료가 지르코니아까지 확대. 완전무치악은 틀니 대상(임플란트 X).
 *  · 골이식·상악동거상술은 보험 적용 시에도 비급여로 별도 발생.
 *    상악동거상술 수직(폐쇄) 50~100만, 측방(개방) 100~150만. 지르코니아 보철 +20~50만.
 *  수치는 IMPLANT 상수에서 일괄 수정. 최종 금액은 치과/심평원 확인 고지.
 * ──────────────────────────────────────────────────────────
 */
(function (root) {
  'use strict';

  var IMPLANT = {
    avg: 1300000,        // 비급여 1개 평균(심평원 종합)
    fairLow: 1000000,    // 적정 하단(국산 픽스처)
    fairHigh: 2000000,   // 적정 상단(수입/프리미엄)
    insurance: {
      standardAmount: 397900, // 공단 산정액/개
      maxCount: 2,            // 평생 2개
      rates: { general: 0.30, medical1: 0.10, medical2: 0.20 },
    },
  };

  // 추가시술·보철 예상 비용(비급여, 1회/1개 기준)
  var ADDONS = [
    { key: 'bone_graft',     label: '골이식(뼈이식)',          low: 300000,  high: 1000000 },
    { key: 'sinus_vertical', label: '상악동거상술(수직/폐쇄)', low: 500000,  high: 1000000 },
    { key: 'sinus_lateral',  label: '상악동거상술(측방/개방)', low: 1000000, high: 1500000 },
    { key: 'zirconia',       label: '지르코니아 보철 추가',     low: 200000,  high: 500000  },
  ];

  function getAddon(key) {
    for (var i = 0; i < ADDONS.length; i++) if (ADDONS[i].key === key) return ADDONS[i];
    return null;
  }

  /**
   * 만 65세 이상 건강보험 본인부담 계산
   * @param {Object} p  count {number}, coverageType {'general'|'medical1'|'medical2'}
   * @returns {Object} { coveredCount, perImplant, total, uncoveredCount }
   */
  function calcInsurance(p) {
    p = p || {};
    var rate = IMPLANT.insurance.rates[p.coverageType] || IMPLANT.insurance.rates.general;
    var count = Math.max(0, Number(p.count) || 0);
    var covered = Math.min(count, IMPLANT.insurance.maxCount);
    var perImplant = Math.round(IMPLANT.insurance.standardAmount * rate);
    return {
      coveredCount: covered,
      uncoveredCount: Math.max(0, count - covered),
      perImplant: perImplant,
      total: perImplant * covered,
      rate: rate,
    };
  }

  /**
   * 비급여 견적 적정성 진단 (1개 기준)
   * @param {Object} p  quote {number}
   * @returns {Object} { verdict, avg, fairLow, fairHigh, diffFromAvg }
   */
  function diagnoseQuote(p) {
    p = p || {};
    var q = Number(p.quote) || 0;
    var verdict;
    if (q <= 0) verdict = 'unknown';
    else if (q <= IMPLANT.fairLow * 1.02) verdict = 'cheap';
    else if (q <= IMPLANT.avg) verdict = 'fair';
    else if (q <= IMPLANT.fairHigh) verdict = 'high';
    else verdict = 'overpriced';
    return {
      verdict: verdict,
      avg: IMPLANT.avg,
      fairLow: IMPLANT.fairLow,
      fairHigh: IMPLANT.fairHigh,
      diffFromAvg: q > 0 ? q - IMPLANT.avg : 0,
    };
  }

  /**
   * 추가시술·보철 예상 합계
   * @param {string[]} keys  선택한 addon key 목록
   * @returns {Object} { items:[{label,low,high}], low, high }
   */
  function estimateAddons(keys) {
    keys = keys || [];
    var items = [], low = 0, high = 0;
    keys.forEach(function (k) {
      var a = getAddon(k);
      if (a) { items.push(a); low += a.low; high += a.high; }
    });
    return { items: items, low: low, high: high };
  }

  /**
   * 총 예상 비용 (식립 + 추가시술), 보험/비급여 통합
   * @param {Object} p
   *   age65 {boolean}, coverageType {string}, count {number},
   *   quote {number}  비급여 1개 견적(없으면 평균 사용),
   *   addonKeys {string[]}
   * @returns {Object} 종합 결과
   */
  function calcTotal(p) {
    p = p || {};
    var count = Math.max(1, Number(p.count) || 1);
    var perImplant = Number(p.quote) > 0 ? Number(p.quote) : IMPLANT.avg;
    var addons = estimateAddons(p.addonKeys);

    var ins = null, fixtureCost, coveredNote = '';
    if (p.age65) {
      ins = calcInsurance({ count: count, coverageType: p.coverageType });
      // 보험 적용분(본인부담) + 초과분(비급여)
      fixtureCost = ins.total + perImplant * ins.uncoveredCount;
      coveredNote = '만 65세 보험 ' + ins.coveredCount + '개 적용(본인부담 '
        + Math.round(ins.rate * 100) + '%), 나머지 ' + ins.uncoveredCount + '개 비급여.';
    } else {
      fixtureCost = perImplant * count;
    }

    return {
      count: count,
      insurance: ins,
      perImplant: perImplant,
      fixtureCost: fixtureCost,             // 식립(보철 포함 견적) 합계
      addons: addons,
      totalLow: fixtureCost + addons.low,   // 추가시술 최소 가정
      totalHigh: fixtureCost + addons.high, // 추가시술 최대 가정
      coveredNote: coveredNote,
      diagnosis: diagnoseQuote({ quote: perImplant }),
    };
  }

  var api = {
    IMPLANT: IMPLANT, ADDONS: ADDONS, getAddon: getAddon,
    calcInsurance: calcInsurance, diagnoseQuote: diagnoseQuote,
    estimateAddons: estimateAddons, calcTotal: calcTotal,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Implant = api;
})(typeof window !== 'undefined' ? window : this);
