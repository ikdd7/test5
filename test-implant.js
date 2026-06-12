/* test-implant.js — implant.js 검증 (node test-implant.js) */
var I = require('./implant.js');
var pass = 0, fail = 0;
function eq(n, g, w) { if (g === w) pass++; else { fail++; console.error('✗ ' + n + ' got ' + g + ' want ' + w); } }
function ok(n, c) { if (c) pass++; else { fail++; console.error('✗ ' + n); } }

// 65세 보험: 일반 30%, 산정액 397900 → 1개 본인부담 119370
var a = I.calcInsurance({ count: 1, coverageType: 'general' });
eq('보험 일반 1개 본인부담', a.perImplant, Math.round(397900 * 0.30));
eq('보험 적용 1개', a.coveredCount, 1);

// 3개 신청 → 2개만 보험, 1개 초과
var b = I.calcInsurance({ count: 3, coverageType: 'general' });
eq('보험 최대 2개', b.coveredCount, 2);
eq('초과 1개 비급여', b.uncoveredCount, 1);

// 의료급여 1종 10%
var c = I.calcInsurance({ count: 1, coverageType: 'medical1' });
eq('의료급여1종 10%', c.perImplant, Math.round(397900 * 0.10));

// 견적 진단
eq('저가', I.diagnoseQuote({ quote: 950000 }).verdict, 'cheap');
eq('적정', I.diagnoseQuote({ quote: 1250000 }).verdict, 'fair');
eq('비쌈', I.diagnoseQuote({ quote: 1800000 }).verdict, 'high');
eq('과다', I.diagnoseQuote({ quote: 3000000 }).verdict, 'overpriced');

// 추가시술 합산
var ad = I.estimateAddons(['bone_graft', 'sinus_lateral']);
eq('추가 low 합', ad.low, 300000 + 1000000);
eq('추가 high 합', ad.high, 1000000 + 1500000);
eq('추가 항목수', ad.items.length, 2);

// 총비용: 비급여 2개 + 추가시술 없음, 견적 150만
var t1 = I.calcTotal({ age65: false, count: 2, quote: 1500000, addonKeys: [] });
eq('비급여 2개 식립', t1.fixtureCost, 3000000);
eq('추가 없으면 low=high', t1.totalLow, t1.totalHigh);

// 총비용: 65세 일반 2개 보험 + 골이식
var t2 = I.calcTotal({ age65: true, coverageType: 'general', count: 2, quote: 1500000, addonKeys: ['bone_graft'] });
eq('보험 2개 식립합', t2.fixtureCost, Math.round(397900 * 0.30) * 2);
ok('추가시술 범위 반영', t2.totalHigh - t2.totalLow === (1000000 - 300000));

// 65세 3개: 2개 보험 + 1개 비급여(견적 150만)
var t3 = I.calcTotal({ age65: true, coverageType: 'general', count: 3, quote: 1500000, addonKeys: [] });
eq('보험2+비급여1 식립', t3.fixtureCost, Math.round(397900 * 0.30) * 2 + 1500000);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
