/* map.js — 풀스크린 지도(식장 위치+가격). Leaflet 사용, 없으면 시도 히트맵으로 폴백. */
(function () {
  "use strict";
  var S = window.Stats, SLUGS = window.REGION_SLUGS || {};
  var won = S.won, manwon = S.manwon;
  var SRC = (window.WEDDING_VENUES && window.WEDDING_VENUES.length) ? window.WEDDING_VENUES : (window.WEDDING_SAMPLE || []);
  // 좌표만 있으면 표시(가격 없어도 OK). 같은 식장은 평균 병합.
  var DATA = S.aggregateByName(SRC.filter(function (d) { return d.lat && d.lng; }));
  var fType = "전체", fSlot = "전체", fVer = false, fPriced = false;
  var map, layer;
  var $ = function (id) { return document.getElementById(id); };
  function hasPrice(d) { return d.meal >= 20000 && d.meal <= 300000; }

  function visible() {
    return DATA.filter(function (d) {
      return (fType === "전체" || d.type === fType) && (fSlot === "전체" || d.slot === fSlot)
        && (!fVer || d.verified) && (!fPriced || hasPrice(d));
    });
  }
  function priceColor(m, lo, hi) { var v = hi > lo ? (m - lo) / (hi - lo) : 0.5; return "hsl(" + Math.round(120 * (1 - v)) + ",70%,46%)"; }

  function renderStats(rows) {
    var priced = rows.filter(hasPrice);
    $("mStatN").textContent = rows.length;
    $("mStatMeal").textContent = priced.length ? won(S.robust(priced.map(function (d) { return d.meal; })).median) : "–";
    var rents = priced.filter(function (d) { return d.rental; }).map(function (d) { return d.rental; });
    $("mStatRent").textContent = rents.length ? won(S.robust(rents).median) : "–";
  }

  function drawMarkers() {
    var rows = visible();
    var pm = DATA.filter(hasPrice).map(function (d) { return d.meal; });
    var lo = pm.length ? Math.min.apply(null, pm) : 40000, hi = pm.length ? Math.max.apply(null, pm) : 200000;
    if (layer) layer.clearLayers();
    rows.forEach(function (d) {
      var slug = SLUGS[d.region], priced = hasPrice(d);
      var mk = priced
        ? L.circleMarker([d.lat, d.lng], { radius: 8, weight: 2, color: "#fff", fillColor: priceColor(d.meal, lo, hi), fillOpacity: .9 })
        : L.circleMarker([d.lat, d.lng], { radius: 6, weight: 2, color: "#9aa4ba", fillColor: "#9aa4ba", fillOpacity: .15 });
      mk.bindTooltip((d.name ? d.name + " " : "") + (priced ? manwon(d.meal) : "가격 미확인"), { direction: "top" });
      var sub = [d.region + (d.district ? " " + d.district : ""), d.type].join(" · ");
      var line3 = [];
      if (d.halls > 1) line3.push("홀 " + d.halls + "개");
      if (d.slot) line3.push(d.slot);
      if (d.guarantee) line3.push("보증 " + d.guarantee + "명");
      if (d.obs >= 3) line3.push("📊평균 " + d.obs + "건");
      else if (d.obs === 2) line3.push("평균 2건");
      if (d.verified) line3.push("✅검증");
      var body = priced
        ? '<div class="big">' + won(d.meal) + " <span>/1인</span></div><div>대관료 " + (d.rental ? won(d.rental) : "정보 없음") + "</div>" +
          (line3.length ? "<div>" + line3.join(" · ") + "</div>" : "")
        : '<div class="big" style="font-size:.95rem;color:#888">가격 정보 수집 중</div><div style="color:#888">아는 가격이 있다면 제보해 주세요 🙏</div>';
      mk.bindPopup('<div class="mpop"><b>' + (d.name || sub) + "</b>" +
        (d.name ? '<div class="msub">' + sub + "</div>" : "") + body +
        (slug ? '<a href="region/' + slug + '.html">' + d.region + " 전체 보기 →</a>" : "") + "</div>");
      layer.addLayer(mk);
    });
    renderStats(rows);
  }

  function chips(elId, vals, cur, on) {
    var el = $(elId); el.innerHTML = "";
    ["전체"].concat(vals).forEach(function (v) {
      var b = document.createElement("button"); b.className = "chip" + (v === cur ? " on" : ""); b.textContent = v;
      b.onclick = function () { on(v); }; el.appendChild(b);
    });
  }
  function buildFilters() {
    var types = {}, slots = {}; DATA.forEach(function (d) { if (d.type) types[d.type] = 1; if (d.slot) slots[d.slot] = 1; });
    chips("fType", Object.keys(types), fType, function (v) { fType = v; buildFilters(); refresh(); });
    chips("fSlot", Object.keys(slots), fSlot, function (v) { fSlot = v; buildFilters(); refresh(); });
    var vb = $("fVer"); vb.className = "chip" + (fVer ? " on" : ""); vb.onclick = function () { fVer = !fVer; buildFilters(); refresh(); };
    var pb = $("fPriced"); if (pb) { pb.className = "chip" + (fPriced ? " on" : ""); pb.onclick = function () { fPriced = !fPriced; buildFilters(); refresh(); }; }
  }
  function refresh() { if (map) drawMarkers(); else renderStats(visible()); }

  function initLeaflet() {
    map = L.map("leaflet", { zoomControl: true }).setView([36.3, 127.8], 7);
    // 깔끔한 미니멀 베이스맵(CartoDB Positron) — 라벨 적어 핀이 잘 보임. 키·도메인 불필요.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO",
    }).addTo(map);
    // 핀이 많으므로 클러스터링(플러그인 있으면), 없으면 일반 레이어
    layer = (typeof L.markerClusterGroup === "function")
      ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 55, spiderfyOnMaxZoom: true, showCoverageOnHover: false })
      : L.layerGroup();
    layer.addTo(map);
    buildFilters(); drawMarkers();
    try { map.fitBounds(L.latLngBounds(DATA.map(function (d) { return [d.lat, d.lng]; })).pad(0.12)); } catch (e) {}
  }
  function initFallback() {
    $("leaflet").style.display = "none";
    $("offlineBanner").style.display = "block";
    var fb = $("mapFallback"); fb.style.display = "flex";
    if (window.KoreaMap) window.KoreaMap.render($("fbMap"), {
      data: DATA, slugs: SLUGS, minPage: 5,
      onPick: function (r, e, slug) { if (e && slug) location.href = "region/" + slug + ".html"; },
    });
    buildFilters(); renderStats(visible());
  }

  if (typeof L !== "undefined") initLeaflet(); else initFallback();
})();
