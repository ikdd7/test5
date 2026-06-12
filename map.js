/* map.js — 카카오 지도 기반 전국 식장 지도 (클러스터·필터·팝업). SDK 미설정/실패 시 히트맵 폴백. */
(function () {
  "use strict";
  var S = window.Stats, SLUGS = window.REGION_SLUGS || {};
  var won = S.won, manwon = S.manwon;
  var SRC = (window.WEDDING_VENUES && window.WEDDING_VENUES.length) ? window.WEDDING_VENUES : (window.WEDDING_SAMPLE || []);
  var DATA = S.aggregateByName(SRC.filter(function (d) { return d.lat && d.lng; }));
  var fType = "전체", fSlot = "전체", fVer = false, fPriced = false, fFav = false;
  var $ = function (id) { return document.getElementById(id); };
  function hasPrice(d) { return d.meal >= 20000 && d.meal <= 300000; }

  // ── 찜(favorite) ──
  var FAVS = {};
  try { FAVS = JSON.parse(localStorage.getItem("wedding_favs") || "{}"); } catch (e) { FAVS = {}; }
  function favKey(d) { return String(d.name || "").replace(/[^\wㄱ-힣]/g, "") + Math.round(d.lat * 1000); }
  function saveFavs() { try { localStorage.setItem("wedding_favs", JSON.stringify(FAVS)); } catch (e) {} }
  function favCount() { return Object.keys(FAVS).length; }
  function updateFavChip() { var c = $("fFav"); if (c) c.textContent = "💗 찜" + (favCount() ? " (" + favCount() + ")" : ""); }
  window.__toggleFav = function (key, el) {
    if (FAVS[key]) delete FAVS[key]; else FAVS[key] = 1;
    saveFavs();
    if (el) { el.className = "kk-fav" + (FAVS[key] ? " on" : ""); el.textContent = FAVS[key] ? "💗 찜됨" : "🤍 찜하기"; }
    updateFavChip();
    var fn = document.getElementById("favN"); if (fn) fn.textContent = favCount();
    if (panelOpen) renderFavPanel();
    if (fFav && currentRefresh) currentRefresh();
  };
  var currentRefresh = null;

  // ── 하객수 / 메모 / 총비용 ──
  var GUESTS = parseInt(localStorage.getItem("wedding_guests"), 10) || 250;
  function setGuests(n) { GUESTS = n || 0; try { localStorage.setItem("wedding_guests", GUESTS); } catch (e) {} }
  function memoKey(d) { return "wedding_memo_" + favKey(d); }
  function getMemo(d) { try { return localStorage.getItem(memoKey(d)) || ""; } catch (e) { return ""; } }
  function setMemo(d, t) { try { localStorage.setItem(memoKey(d), t); } catch (e) {} }
  function totalCost(d) { return hasPrice(d) ? d.meal * GUESTS + (d.rental || 0) : null; }
  function favList() { return DATA.filter(function (d) { return FAVS[favKey(d)]; }); }

  function visible() {
    return DATA.filter(function (d) {
      return (fType === "전체" || d.type === fType) && (fSlot === "전체" || d.slot === fSlot)
        && (!fVer || d.verified) && (!fPriced || hasPrice(d)) && (!fFav || FAVS[favKey(d)]);
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

  function popupHtml(d) {
    var slug = SLUGS[d.region];
    var sub = [d.region + (d.district ? " " + d.district : ""), d.type].join(" · ");
    var chips = [];
    if (d.halls > 1) chips.push("홀 " + d.halls + "개");
    if (d.nobs > 1) chips.push(d.nobs + "개 소스 평균");
    if (d.slot) chips.push(d.slot);
    if (d.guarantee) chips.push("보증 " + d.guarantee + "명");
    if (d.verified) chips.push("✅ 검증");
    var chipHtml = chips.length ? '<div class="kk-chips">' + chips.map(function (c) { return "<span>" + c + "</span>"; }).join("") + "</div>" : "";
    var body;
    if (hasPrice(d)) {
      body = '<div class="kk-price"><b>' + won(d.meal) + '</b><span>/ 1인 식대</span></div>' +
        '<div class="kk-rent">대관료 ' + (d.rental ? won(d.rental) : "정보 없음") + "</div>" +
        '<div class="kk-total">하객 ' + GUESTS + "명 ≈ <b>" + manwon(totalCost(d)) + "원</b></div>" + chipHtml;
    } else {
      body = '<div class="kk-soon">💬 가격 정보 수집 중</div><div class="kk-soonsub">아는 가격이 있다면 제보해 주세요 🙏</div>' + chipHtml;
    }
    var key = favKey(d), on = !!FAVS[key];
    var fav = '<button class="kk-fav' + (on ? " on" : "") + '" onclick="window.__toggleFav(\'' + key + '\',this)">' +
      (on ? "💗 찜됨" : "🤍 찜하기") + "</button>";
    return '<div class="kkcard">' +
      '<button class="kk-x" onclick="window.__closePop&&window.__closePop()" aria-label="닫기">×</button>' +
      '<div class="kk-name">' + (d.name || sub) + "</div>" +
      '<div class="kk-sub">' + sub + "</div>" +
      body +
      '<div class="kk-actions">' + fav +
      (slug ? '<a class="kk-link" href="region/' + slug + '.html">' + d.region + " 전체 →</a>" : "") + "</div>" +
      '<div class="kk-tail"></div></div>';
  }

  // ── 필터 UI ──
  function chips(elId, vals, cur, on) {
    var el = $(elId); el.innerHTML = "";
    ["전체"].concat(vals).forEach(function (v) {
      var b = document.createElement("button"); b.className = "chip" + (v === cur ? " on" : ""); b.textContent = v;
      b.onclick = function () { on(v); }; el.appendChild(b);
    });
  }
  function buildFilters(onChange) {
    currentRefresh = onChange;
    var types = {}, slots = {}; DATA.forEach(function (d) { if (d.type) types[d.type] = 1; if (d.slot) slots[d.slot] = 1; });
    chips("fType", Object.keys(types), fType, function (v) { fType = v; buildFilters(onChange); onChange(); });
    chips("fSlot", Object.keys(slots), fSlot, function (v) { fSlot = v; buildFilters(onChange); onChange(); });
    var ff = $("fFav"); if (ff) { ff.className = "chip" + (fFav ? " on" : ""); ff.onclick = function () { fFav = !fFav; buildFilters(onChange); onChange(); }; }
    var pb = $("fPriced"); if (pb) { pb.className = "chip" + (fPriced ? " on" : ""); pb.onclick = function () { fPriced = !fPriced; buildFilters(onChange); onChange(); }; }
    var vb = $("fVer"); vb.className = "chip" + (fVer ? " on" : ""); vb.onclick = function () { fVer = !fVer; buildFilters(onChange); onChange(); };
    updateFavChip();
  }

  // ── 카카오 지도 ──
  var map, clusterer, info, imgCache = {};
  function markerImage(d, lo, hi) {
    var priced = hasPrice(d);
    var key = priced ? "p" + Math.round((d.meal - lo) / (hi - lo) * 10) : "g";
    if (imgCache[key]) return imgCache[key];
    var svg, size;
    if (priced) {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="6.5" fill="' + priceColor(d.meal, lo, hi) + '" stroke="#fff" stroke-width="2"/></svg>';
      size = 18;
    } else {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"><circle cx="6.5" cy="6.5" r="4.5" fill="#9aa4ba" fill-opacity="0.25" stroke="#9aa4ba" stroke-width="1.5"/></svg>';
      size = 13;
    }
    var img = new kakao.maps.MarkerImage("data:image/svg+xml;base64," + btoa(svg), new kakao.maps.Size(size, size));
    imgCache[key] = img; return img;
  }
  function drawKakao() {
    var rows = visible();
    var pm = DATA.filter(hasPrice).map(function (d) { return d.meal; });
    var lo = pm.length ? Math.min.apply(null, pm) : 40000, hi = pm.length ? Math.max.apply(null, pm) : 200000;
    clusterer.clear();
    var markers = rows.map(function (d) {
      var mk = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(d.lat, d.lng), image: markerImage(d, lo, hi),
        title: (d.name || "") + (hasPrice(d) ? " " + manwon(d.meal) : ""),
      });
      kakao.maps.event.addListener(mk, "click", function () {
        info.setContent(popupHtml(d));
        info.setPosition(mk.getPosition());
        info.setMap(map);
        map.panTo(mk.getPosition());
      });
      return mk;
    });
    clusterer.addMarkers(markers);
    renderStats(rows);
  }
  function initKakao() {
    map = new kakao.maps.Map($("map"), { center: new kakao.maps.LatLng(36.3, 127.8), level: 13 });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    var cstyle = function (sz, fs) {
      return {
        width: sz + "px", height: sz + "px", background: "rgba(214,51,108,.88)", borderRadius: (sz / 2) + "px",
        color: "#fff", textAlign: "center", lineHeight: sz + "px", fontSize: fs + "px", fontWeight: "700",
        border: "2px solid #fff", boxShadow: "0 3px 12px rgba(214,51,108,.35)",
      };
    };
    clusterer = new kakao.maps.MarkerClusterer({
      map: map, averageCenter: true, minLevel: 7, gridSize: 70, disableClickZoom: false,
      calculator: [10, 30, 100], styles: [cstyle(34, 13), cstyle(40, 14), cstyle(48, 15), cstyle(58, 17)],
    });
    info = new kakao.maps.CustomOverlay({ yAnchor: 1.28, zIndex: 3, clickable: true });
    window.__closePop = function () { info.setMap(null); };
    kakao.maps.event.addListener(map, "click", window.__closePop);
    buildFilters(drawKakao); drawKakao();
    try {
      var b = new kakao.maps.LatLngBounds();
      DATA.forEach(function (d) { b.extend(new kakao.maps.LatLng(d.lat, d.lng)); });
      map.setBounds(b);
    } catch (e) {}
  }

  // ── 폴백(히트맵) ──
  function initFallback() {
    $("map").style.display = "none";
    $("offlineBanner").style.display = "block";
    var fb = $("mapFallback"); fb.style.display = "flex";
    if (window.KoreaMap) window.KoreaMap.render($("fbMap"), {
      data: DATA, slugs: SLUGS, minPage: 3,
      onPick: function (r, e, slug) { if (e && slug) location.href = "region/" + slug + ".html"; },
    });
    buildFilters(function () { renderStats(visible()); }); renderStats(visible());
  }

  // ── 찜 목록·비교 패널 ──
  var panelOpen = false;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function renderFavPanel() {
    var list = favList(), el = $("fpList");
    var fn = $("favN"); if (fn) fn.textContent = favCount();
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="fp-empty">아직 찜한 곳이 없어요.<br>지도 핀을 눌러 🤍 를 탭해보세요 💗</div>'; return; }
    list.sort(function (a, b) { var ta = totalCost(a), tb = totalCost(b); if (ta == null) return 1; if (tb == null) return -1; return ta - tb; });
    el.innerHTML = list.map(function (d, i) {
      var k = favKey(d), t = totalCost(d);
      var cost = hasPrice(d)
        ? '<div class="fp-cost"><span>식대 ' + manwon(d.meal) + " · 대관 " + (d.rental ? manwon(d.rental) : "-") + "</span><b>" + manwon(t) + "원</b></div>"
        : '<div class="fp-cost"><span>가격 미확인</span></div>';
      var rank = (hasPrice(d) && i === 0) ? '<span class="fp-best">최저</span>' : "";
      return '<div class="fp-item"><div class="fp-top"><div><div class="fp-name">' + esc(d.name) + rank +
        '</div><div class="fp-sub">' + esc(d.region + (d.district ? " " + d.district : "") + " · " + d.type) + "</div></div>" +
        "<button class=\"fp-rem\" onclick=\"window.__toggleFav('" + k + "')\">💔</button></div>" + cost +
        '<input class="fp-memo" data-k="' + k + '" placeholder="메모 (예: 토요일 가능? 주차 OK?)" value="' + esc(getMemo(d)) + '"></div>';
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".fp-memo"), function (inp) {
      inp.addEventListener("input", function () { try { localStorage.setItem("wedding_memo_" + inp.getAttribute("data-k"), inp.value); } catch (e) {} });
    });
  }
  function shareFavs() {
    var list = favList();
    if (!list.length) { alert("먼저 마음에 드는 식장을 찜해보세요 💗"); return; }
    list.sort(function (a, b) { var ta = totalCost(a), tb = totalCost(b); if (ta == null) return 1; if (tb == null) return -1; return ta - tb; });
    var lines = list.map(function (d) { var t = totalCost(d); return "· " + d.name + (t != null ? " ≈ " + manwon(t) + "원" : " (가격 미확인)"); });
    var text = "💗 우리 웨딩홀 찜 목록 (하객 " + GUESTS + "명 기준)\n" + lines.join("\n") + "\n\n전국 웨딩홀 지도에서 비교했어요!";
    if (navigator.share) navigator.share({ title: "내 웨딩홀 찜 목록", text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { alert("찜 목록을 복사했어요! 카톡에 붙여넣기 하세요 📋"); });
    else alert(text);
  }
  function initPanel() {
    var openB = $("favOpen"), panel = $("favPanel");
    if (!openB || !panel) return;
    openB.onclick = function () { panelOpen = !panelOpen; panel.classList.toggle("open", panelOpen); if (panelOpen) renderFavPanel(); };
    $("favClose").onclick = function () { panelOpen = false; panel.classList.remove("open"); };
    var gi = $("fpGuests"); gi.value = GUESTS;
    gi.addEventListener("input", function () { setGuests(parseInt(gi.value.replace(/[^0-9]/g, ""), 10) || 0); renderFavPanel(); });
    $("fpShare").onclick = shareFavs;
    var fn = $("favN"); if (fn) fn.textContent = favCount();
  }
  initPanel();

  // ── SDK 로드 ──
  function loadKakaoSDK(ok, fail) {
    var s = document.createElement("script");
    s.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + window.KAKAO_JS_KEY + "&libraries=clusterer&autoload=false";
    s.onload = function () { if (window.kakao && kakao.maps) kakao.maps.load(ok); else fail(); };
    s.onerror = fail;
    document.head.appendChild(s);
    setTimeout(function () { if (!map) { /* 로드 지연/실패 대비 */ } }, 9000);
  }

  if (window.KAKAO_JS_KEY) loadKakaoSDK(initKakao, initFallback);
  else initFallback();
})();
