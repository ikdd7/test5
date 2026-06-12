/*
 * koreamap.js — 전국 시도 스키매틱 히트맵 (의존성 0, 좌표·외부API 불필요)
 * KoreaMap.render(el, { data, slugs, minPage, onPick })
 *   - data: 결혼식장 레코드(region·meal 사용)
 *   - 시도를 지리적 위치대로 배치, 식대 중앙값으로 색칠(저렴 초록 ↔ 비쌈 빨강)
 *   - 데이터 있는 지역 클릭 → onPick(region, eligible, slug)
 */
(function (root) {
  "use strict";
  // [열, 행] — 서해(좌)·동해(우)·제주(하단) 기준 스키매틱 배치
  var POS = {
    "인천": [1, 1], "서울": [2, 1], "경기": [3, 1], "강원": [4, 1],
    "세종": [2, 2], "충북": [3, 2], "경북": [4, 2],
    "충남": [1, 3], "대전": [2, 3], "대구": [4, 3],
    "전북": [2, 4], "울산": [4, 4],
    "광주": [1, 5], "전남": [2, 5], "경남": [3, 5], "부산": [4, 5],
    "제주": [3, 6],
  };

  function render(el, opts) {
    if (!el) return;
    var S = root.Stats;
    var data = opts.data || [], slugs = opts.slugs || {}, MIN = opts.minPage || 5, onPick = opts.onPick;
    var g = {};
    data.forEach(function (d) { if (d && d.region && typeof d.meal === "number") (g[d.region] = g[d.region] || []).push(d.meal); });
    var meds = {}, counts = {}, vals = [];
    Object.keys(g).forEach(function (r) {
      var m = S ? S.robust(g[r]).median : g[r][0];
      meds[r] = m; counts[r] = g[r].length; vals.push(m);
    });
    var min = vals.length ? Math.min.apply(null, vals) : 0;
    var max = vals.length ? Math.max.apply(null, vals) : 1;
    if (min === max) max = min + 1;
    var manwon = S ? S.manwon : function (n) { return Math.round(n / 10000) + "만"; };

    var html = '<div class="kmap">';
    Object.keys(POS).forEach(function (r) {
      var p = POS[r], has = counts[r] > 0, eligible = has && counts[r] >= MIN && slugs[r];
      var style = "grid-column:" + p[0] + ";grid-row:" + p[1] + ";";
      if (has) {
        var v = (meds[r] - min) / (max - min), hue = Math.round(120 * (1 - v));
        style += "background:hsl(" + hue + ",62%,42%);border-color:hsl(" + hue + ",62%,50%);";
      }
      var tip = r + (has ? " · " + counts[r] + "곳 · 중앙값 " + manwon(meds[r]) + "원" + (eligible ? " · 클릭" : " (" + MIN + "곳↑ 시 페이지)") : " · 데이터 수집중");
      html += '<button type="button" class="kmap-cell' + (has ? "" : " empty") + (eligible ? " link" : "") + '"' +
        ' data-r="' + r + '" data-e="' + (eligible ? 1 : 0) + '" style="' + style + '" title="' + tip + '">' +
        "<b>" + r + "</b>" + (has ? "<i>" + manwon(meds[r]) + "</i>" : '<i class="soon">수집중</i>') + "</button>";
    });
    html += "</div>";
    html += '<div class="kmap-legend"><span>저렴</span><span class="bar"></span><span>비쌈</span>' +
      '<span class="grey">▪ 회색=수집중</span></div>';
    el.innerHTML = html;

    Array.prototype.forEach.call(el.querySelectorAll(".kmap-cell"), function (b) {
      b.addEventListener("click", function () {
        var r = b.getAttribute("data-r");
        if (onPick) onPick(r, b.getAttribute("data-e") === "1", slugs[r]);
      });
    });
  }

  root.KoreaMap = { render: render, POS: POS };
})(typeof window !== "undefined" ? window : this);
