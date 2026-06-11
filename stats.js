/*
 * stats.js — 강건 통계 엔진 (Node + 브라우저 겸용, 의존성 0)
 * build.js(지역 페이지 생성)·지역 페이지·studio가 같은 코드를 씁니다 → 수치 일관성.
 */
(function (root) {
  "use strict";

  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function quantile(arr, q) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (x, y) { return x - y; }), pos = (s.length - 1) * q, b = Math.floor(pos), r = pos - b;
    return s[b + 1] !== undefined ? s[b] + r * (s[b + 1] - s[b]) : s[b];
  }
  // IQR 1.5배 밖 이상치 제외 후 중앙값 + 제외건수
  function robust(vals) {
    if (!vals.length) return { median: 0, n: 0, kept: 0, dropped: 0, q1: 0, q3: 0 };
    var q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75), iqr = q3 - q1;
    var lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    var kept = vals.filter(function (v) { return v >= lo && v <= hi; });
    if (!kept.length) kept = vals.slice();
    return { median: median(kept), n: vals.length, kept: kept.length, dropped: vals.length - kept.length, q1: q1, q3: q3 };
  }
  // 1차 방어: 명백한 비상식값 제거(단위실수·장난)
  function plausible(d) {
    if (!(d.meal >= 20000 && d.meal <= 300000)) return false;
    if (d.guarantee && (d.guarantee < 50 || d.guarantee > 600)) return false;
    if (d.rental < 0 || d.rental > 100000000) return false;
    return true;
  }
  // x가 vals 중 몇 퍼센타일인지(이하 비율, 0~100)
  function percentileBelow(vals, x) {
    if (!vals.length) return null;
    var below = 0, eq = 0;
    vals.forEach(function (v) { if (v < x) below++; else if (v === x) eq++; });
    return Math.round((below + eq / 2) / vals.length * 100);
  }
  function won(n) { return Math.round(n || 0).toLocaleString("ko-KR") + "원"; }
  function manwon(n) { // 만원 축약 (6.8만 형태)
    var v = (n || 0) / 10000;
    return (Math.round(v * 10) / 10).toLocaleString("ko-KR") + "만";
  }

  root.Stats = {
    median: median, quantile: quantile, robust: robust, plausible: plausible,
    percentileBelow: percentileBelow, won: won, manwon: manwon,
  };
})(typeof window !== "undefined" ? window : this);
