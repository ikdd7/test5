/* region.js — 지역 랜딩 페이지 클라이언트 (차트·백분위 비교·소프트 게이트) */
(function () {
  "use strict";
  var S = window.Stats, C = window.Charts;
  var D = window.REGION_DATA || [], NAME = window.REGION_NAME || "";
  var won = S.won, manwon = S.manwon;
  var $ = function (id) { return document.getElementById(id); };
  var meals = D.map(function (d) { return d.meal; });

  function groupMedian(rows, key, valKey) {
    var g = {}; rows.forEach(function (d) { (g[d[key]] = g[d[key]] || []).push(d[valKey]); });
    return Object.keys(g).map(function (k) { var r = S.robust(g[k]); return { label: k, value: r.median, n: r.n, dropped: r.dropped }; })
      .sort(function (a, b) { return b.value - a.value; });
  }
  function bd(stats) {
    return stats.map(function (d) { return { label: d.label, value: d.value, sub: "n=" + d.n + (d.dropped ? " (이상치" + d.dropped + "제외)" : "") }; });
  }

  C.bars($("cType"), { data: bd(groupMedian(D, "type", "meal")) });
  C.bars($("cSlot"), { data: bd(groupMedian(D, "slot", "rental")) });

  // 식대 분포(1만원 구간)
  var buckets = {};
  meals.forEach(function (m) { var b = Math.floor(m / 10000) * 10000; buckets[b] = (buckets[b] || 0) + 1; });
  var dist = Object.keys(buckets).sort(function (a, b) { return a - b; })
    .map(function (b) { return { label: manwon(+b) + "원", value: buckets[b] }; });
  C.bars($("cDist"), { data: dist, fmt: function (v) { return v + "곳"; } });

  // 백분위 비교
  var gI = $("mG"), mI = $("mM"), rI = $("mR"), last = null;
  function intn(el) { return parseInt(String(el.value).replace(/[^0-9]/g, ""), 10) || 0; }
  function comma(el) { var v = intn(el); el.value = v ? v.toLocaleString("ko-KR") : ""; }
  function calc() {
    var g = intn(gI), m = intn(mI), rt = intn(rI);
    if (!g || !m) { $("pRes").textContent = "–"; $("pVer").textContent = ""; last = null; return; }
    var total = m * g + rt;
    $("pRes").textContent = won(total);
    var pct = S.percentileBelow(meals, m), top = 100 - pct;
    var v = $("pVer");
    if (top <= 50) { v.className = "verdict exp"; v.textContent = "💸 " + NAME + " 식대 중 상위 " + Math.max(1, top) + "% (비싼 편)"; }
    else { v.className = "verdict cheap"; v.textContent = "✅ " + NAME + " 식대 중 하위 " + pct + "% (저렴한 편)"; }
    last = { total: total, guests: g, meal: m, rental: rt, pct: pct, top: top };
  }
  [gI, mI, rI].forEach(function (el) { el.addEventListener("input", function () { comma(el); calc(); }); });

  window.ShareCard.mount($("share"), function () {
    if (!last) return null;
    return {
      title: NAME + " 웨딩홀, 내 견적은?", big: won(last.total), ratio: "9:16", theme: "wedding",
      fileName: NAME + "_웨딩견적",
      lines: [
        { k: "1인 식대", v: won(last.meal) },
        { k: "하객", v: last.guests + "명" },
        { k: NAME + " 식대 순위", v: last.top <= 50 ? "상위 " + Math.max(1, last.top) + "%" : "하위 " + last.pct + "%" },
      ],
      site: "결혼식장 가격 · 계산기허브", cta: "우리 지역 평균 보러가기 →",
    };
  });

  // 소프트 게이트
  var unlocked = false; try { unlocked = localStorage.getItem("wedding_unlock") === "1"; } catch (e) {}
  function applyGate() { var el = $("gate"); if (el) el.classList.toggle("locked", !unlocked); var o = document.querySelector(".gateover"); if (o) o.style.display = unlocked ? "none" : ""; }
  var gb = $("gateBtn");
  if (gb) gb.addEventListener("click", function () {
    if (window.REPORT_FORM_URL) window.open(window.REPORT_FORM_URL, "_blank", "noopener");
    try { localStorage.setItem("wedding_unlock", "1"); } catch (e) {}
    unlocked = true; applyGate();
  });
  applyGate();

  // 초기값
  if (mI) { mI.value = S.median(meals).toLocaleString("ko-KR"); gI.value = "250"; rI.value = "0"; calc(); }
  if ($("yr")) $("yr").textContent = new Date().getFullYear();
})();
