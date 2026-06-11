/*
 * test.js — subsidy.js 계산 로직 검증 (Node로 실행: `node test.js`)
 * 의존성 0. 실패 시 비정상 종료.
 */
var S = require('./subsidy.js');

var pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.error('✗ ' + name + ' → got ' + got + ', want ' + want); }
}
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.error('✗ ' + name); }
}

// ── 지원금 ──────────────────────────────────────────────
var a = S.calcSubsidy({ registered: true, incomeType: 'general', bothEars: false });
eq('일반·편측 지원금', a.total, 1179000);
eq('일반·편측 ears', a.ears, 1);
ok('일반·편측 eligible', a.eligible === true);

var b = S.calcSubsidy({ registered: true, incomeType: 'lowincome', bothEars: false });
eq('수급·편측 지원금', b.total, 1310000);

var c = S.calcSubsidy({ registered: true, incomeType: 'general', bothEars: true });
eq('일반·양측 지원금', c.total, 1179000 * 2);
eq('일반·양측 ears', c.ears, 2);

var d = S.calcSubsidy({ registered: true, incomeType: 'general', age: 10 });
eq('미성년 자동 양측', d.ears, 2);

var e = S.calcSubsidy({ registered: false, incomeType: 'general' });
ok('미등록 비자격', e.eligible === false);
eq('미등록 지원금 0', e.total, 0);

// ── 견적 진단 ───────────────────────────────────────────
// 일반형(110만~200만, 평균 155만)
var g1 = S.diagnoseQuote({ quote: 900000, gradeKey: 'standard', subsidy: 1179000 });
eq('저가 견적 verdict', g1.verdict, 'cheap');

var g2 = S.diagnoseQuote({ quote: 1500000, gradeKey: 'standard', subsidy: 1179000 });
eq('적정 견적 verdict', g2.verdict, 'fair');

var g3 = S.diagnoseQuote({ quote: 1900000, gradeKey: 'standard', subsidy: 1179000 });
eq('비싼 견적 verdict', g3.verdict, 'high');

var g4 = S.diagnoseQuote({ quote: 2500000, gradeKey: 'standard', subsidy: 1179000 });
eq('과다 견적 verdict', g4.verdict, 'overpriced');

// 실부담금 = 견적 - 지원금
var g5 = S.diagnoseQuote({ quote: 1800000, gradeKey: 'standard', subsidy: 1179000 });
eq('실부담금 계산', g5.outOfPocket, 1800000 - 1179000);

// 지원금이 견적보다 크면 실부담 0 (음수 방지)
var g6 = S.diagnoseQuote({ quote: 900000, gradeKey: 'economy', subsidy: 1179000 });
eq('실부담 음수 방지', g6.outOfPocket, 0);

// 단조성: 견적이 오르면 실부담도 (지원금 고정 시) 오른다
var lo = S.diagnoseQuote({ quote: 1300000, gradeKey: 'standard', subsidy: 1179000 }).outOfPocket;
var hi = S.diagnoseQuote({ quote: 2000000, gradeKey: 'standard', subsidy: 1179000 }).outOfPocket;
ok('실부담 단조 증가', hi > lo);

// 등급 범위 정합성
S.GRADES.forEach(function (g) {
  ok('등급 범위 ' + g.key + ' min<max', g.min < g.max);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
