/* map.js — 풀스크린 지도(식장 위치+가격). Leaflet 사용, 없으면 시도 히트맵으로 폴백. */
(function () {
  "use strict";
  var S = window.Stats, SLUGS = window.REGION_SLUGS || {};
  var won = S.won, manwon = S.manwon;
  var SRC = (window.WEDDING_VENUES && window.WEDDING_VENUES.length) ? window.WEDDING_VENUES : (window.WEDDING_SAMPLE || []);
  var DATA = SRC.filter(function (d) { return d.lat && d.lng && S.plausible(d); });
  var fType = "전체", fSlot = "전체", fVer = false;
  var map, layer;
  var $ = function (id) { return document.getElementById(id); };

  function visible() {
    return DATA.filter(function (d) {
      return (fType === "전체" || d.type === fType) && (fSlot === "전체" || d.slot === fSlot) && (!fVer || d.verified);
    });
  }
  function priceColor(m, lo, hi) { var v = hi > lo ? (m - lo) / (hi - lo) : 0.5; return "hsl(" + Math.round(120 * (1 - v)) + ",70%,46%)"; }

  function renderStats(rows) {
    $("mStatN").textContent = rows.length;
    $("mStatMeal").textContent = rows.length ? won(S.robust(rows.map(function (d) { return d.meal; })).median) : "–";
    $("mStatRent").textContent = rows.length ? won(S.robust(rows.map(function (d) { return d.rental; })).median) : "–";
  }

  function drawMarkers() {
    var rows = visible(), meals = DATA.map(function (d) { return d.meal; });
    var lo = Math.min.apply(null, meals), hi = Math.max.apply(null, meals);
    if (layer) layer.clearLayers();
    rows.forEach(function (d) {
      var slug = SLUGS[d.region];
      var mk = L.circleMarker([d.lat, d.lng], { radius: 8, weight: 2, color: "#fff", fillColor: priceColor(d.meal, lo, hi), fillOpacity: .9 });
      mk.bindTooltip((d.name ? d.name + " " : "") + manwon(d.meal), { direction: "top" });
      var sub = [d.region + (d.district ? " " + d.district : ""), d.type].join(" · ");
      var line3 = [];
      if (d.slot) line3.push(d.slot);
      if (d.guarantee) line3.push("보증 " + d.guarantee + "명");
      if (d.verified) line3.push("✅검증");
      mk.bindPopup('<div class="mpop">' + (d.name ? "<b>" + d.name + "</b>" : "<b>" + sub + "</b>") +
        (d.name ? '<div class="msub">' + sub + "</div>" : "") +
        '<div class="big">' + won(d.meal) + " <span>/1인</span></div>" +
        "<div>대관료 " + (d.rental ? won(d.rental) : "정보 없음") + "</div>" +
        (line3.length ? "<div>" + line3.join(" · ") + "</div>" : "") +
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
  }
  function refresh() { if (map) drawMarkers(); else renderStats(visible()); }

  function initLeaflet() {
    map = L.map("leaflet", { zoomControl: true }).setView([36.3, 127.8], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
    layer = L.layerGroup().addTo(map);
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
