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

  // ── 키워드 후기(네이버 플레이스식) ──
  // 사람들이 식장에서 가장 많이 따지는 항목으로 압축. [이모지, 문구]
  var KEYWORDS = [
    ["🍽️", "음식이 맛있어요"], ["✨", "인테리어가 예뻐요"], ["🏛️", "홀이 넓어요"],
    ["🙂", "응대가 친절해요"], ["💰", "가성비가 좋아요"], ["🅿️", "주차가 편해요"],
    ["🚇", "교통이 편해요"], ["🌿", "분위기가 좋아요"], ["🧹", "깨끗해요"],
    ["👥", "하객 수용이 좋아요"],
  ];
  function kwVoteKey(d) { return "wedding_kw_" + favKey(d); }
  function getVotes(d) { try { return JSON.parse(localStorage.getItem(kwVoteKey(d)) || "[]"); } catch (e) { return []; } }
  function setVotes(d, a) { try { localStorage.setItem(kwVoteKey(d), JSON.stringify(a)); } catch (e) {} }
  // 후기(여러 개 목록 저장 — 이 기기)
  function revKey(d) { return "wedding_rev_" + favKey(d); }
  function getRevs(d) { try { return JSON.parse(localStorage.getItem(revKey(d)) || "[]"); } catch (e) { return []; } }
  function setRevs(d, a) { try { localStorage.setItem(revKey(d), JSON.stringify(a)); } catch (e) {} }
  function revDate(ts) { var d = new Date(ts); return (d.getMonth() + 1) + "." + d.getDate(); }
  // 키워드 카운트 = 공개 집계(d.kw) + 내 투표(이 기기). 데이터 없으면 0에서 시작.
  function kwCount(d, label) {
    var base = (d.kw && d.kw[label]) ? d.kw[label] : 0;
    return base + (getVotes(d).indexOf(label) >= 0 ? 1 : 0);
  }
  function kwRanked(d) {
    return KEYWORDS.map(function (k, i) { return { i: i, emoji: k[0], label: k[1], n: kwCount(d, k[1]) }; })
      .filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
  }

  // 현재 열린 팝업(화면 고정 패널 — 지도 움직여도 안 사라짐)
  var currentPop = null, panelEl = null;
  function getPanel() {
    if (!panelEl) { panelEl = document.createElement("div"); panelEl.id = "venuePanel"; panelEl.className = "venue-panel"; document.body.appendChild(panelEl); }
    return panelEl;
  }
  function lockMap(on) { if (map) { try { map.setDraggable(!on); map.setZoomable(!on); } catch (e) {} } }
  function rerenderPanel() { // 갱신 시 스크롤 위치 + 작성중인 후기 초안 유지
    if (!panelEl || !currentPop) return;
    var card = panelEl.querySelector(".kkcard"), st = card ? card.scrollTop : 0;
    var ta = panelEl.querySelector(".kk-cmt textarea"), draft = ta ? ta.value : null;
    panelEl.innerHTML = popupHtml(currentPop);
    var nc = panelEl.querySelector(".kkcard"); if (nc) nc.scrollTop = st;
    var nta = panelEl.querySelector(".kk-cmt textarea"); if (nta && draft != null) nta.value = draft;
  }
  window.__kwVote = function (idx) {
    if (!currentPop || !KEYWORDS[idx]) return;
    var label = KEYWORDS[idx][1], arr = getVotes(currentPop), i = arr.indexOf(label);
    if (i >= 0) arr.splice(i, 1); else arr.push(label);
    setVotes(currentPop, arr);
    rerenderPanel();
  };
  window.__addReview = function () {
    if (!currentPop || !panelEl) return;
    var ta = panelEl.querySelector(".kk-cmt textarea"), t = ta ? ta.value.trim() : "";
    if (!t) { if (ta) ta.focus(); return; }
    var arr = getRevs(currentPop); arr.unshift({ t: t, d: Date.now() });
    setRevs(currentPop, arr);
    if (ta) ta.value = ""; // 초안 비우고 목록 갱신
    rerenderPanel();
  };
  window.__delReview = function (i) {
    if (!currentPop) return;
    var arr = getRevs(currentPop); arr.splice(i, 1); setRevs(currentPop, arr); rerenderPanel();
  };
  window.__closePop = function () { if (panelEl) panelEl.classList.remove("open"); lockMap(false); currentPop = null; };
  function openPop(d) {
    currentPop = d;
    var p = getPanel();
    p.innerHTML = popupHtml(d);
    p.classList.add("open");
    lockMap(true); // 팝업 동안 지도 고정
  }

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
    if (d.nobs > 1) chips.push(d.nobs + "개 소스 평균");
    if (d.slot) chips.push(d.slot);
    if (d.guarantee) chips.push("보증 " + d.guarantee + "명");
    if (d.verified) chips.push("✅ 검증");
    var chipHtml = chips.length ? '<div class="kk-chips">' + chips.map(function (c) { return "<span>" + c + "</span>"; }).join("") + "</div>" : "";
    var body;
    if (hasPrice(d)) {
      // 대관료는 홀마다 다름 → 여러 홀이면 안내 문구
      var rentNote = (d.halls > 1) ? "홀 " + d.halls + "개 · 홀마다 달라요" : (d.nobs > 1 ? "소스 평균" : "");
      body = '<div class="kk-pricerow">' +
          '<div class="kk-pb meal"><div class="kk-pblab">1인 식대</div><div class="kk-pbval">' + won(d.meal) + "</div></div>" +
          '<div class="kk-pb rent"><div class="kk-pblab">대관료</div><div class="kk-pbval">' +
            (d.rental ? manwon(d.rental) + "원" : "정보 없음") + "</div>" +
            (rentNote ? '<div class="kk-pbnote">' + rentNote + "</div>" : "") + "</div>" +
        "</div>" +
        '<div class="kk-total">하객 ' + GUESTS + "명 예상 총액 ≈ <b>" + manwon(totalCost(d)) + "원</b></div>" + chipHtml;
    } else {
      body = '<div class="kk-soon">💬 가격 정보 수집 중</div><div class="kk-soonsub">아는 가격이 있다면 제보해 주세요 🙏</div>' + chipHtml;
    }
    var tagsBlock = (d.tags && d.tags.length) ? '<div class="kk-chips feat">' +
      d.tags.slice(0, 8).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "";
    var pros = (d.pros && d.pros.length) ? '<div class="kk-pc good">👍 ' + d.pros.slice(0, 5).map(esc).join(" · ") + "</div>" : "";
    var cons = (d.cons && d.cons.length) ? '<div class="kk-pc bad">👎 ' + d.cons.slice(0, 5).map(esc).join(" · ") + "</div>" : "";
    // 특징·장단점은 실제 데이터가 있을 때만(빈 "정보 수집 중" 자리 제거)
    var feat = (tagsBlock || pros || cons)
      ? '<div class="kk-feat"><div class="kk-feattitle">✨ 특징 · 장단점</div>' + tagsBlock + pros + cons +
        ((pros || cons) ? '<div class="kk-pcsrc">※ 예신 커뮤니티 후기 참고 (검증 전)</div>' : "") + "</div>"
      : "";
    // ── 키워드 비율(%) 계산: 각 키워드 / 전체 선택 합 ──
    var counts = KEYWORDS.map(function (k) { return kwCount(d, k[1]); });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    function pct(n) { return total ? Math.round(n / total * 100) : 0; }
    var ranked = kwRanked(d);
    // ── 사용자 평가 점수 기반 요약(항상 표시) ──
    var summary = ranked.length
      ? '<div class="kk-sum"><div class="kk-sumt">😊 여기는 이런 점이 좋아요 <span class="kk-sumn">' + total + "명 평가</span></div><div class=\"kk-sumchips\">" +
        ranked.slice(0, 4).map(function (x) { return "<span>" + x.emoji + " " + esc(x.label) + " <em>" + pct(x.n) + "%</em></span>"; }).join("") +
        "</div></div>"
      : '<div class="kk-sum empty"><div class="kk-sumt">아직 평가가 없어요</div>' +
        '<div class="kk-sumemp">아래에서 이 식장의 좋았던 점을 평가해 주세요 🙏</div></div>';
    // ── 키워드 투표 그리드(비율 막대바) ──
    var myVotes = getVotes(d);
    var kwGrid = '<div class="kk-kw"><div class="kk-kwt">이 식장, 어떤 점이 좋았나요? ' +
      (total ? '<span class="kk-kwn">(' + total + '명 평가)</span>' : '<span class="kk-kwn">첫 평가를 남겨주세요</span>') +
      '</div><div class="kk-kwgrid">' +
      KEYWORDS.map(function (k, i) {
        var n = counts[i], p = pct(n), mine = myVotes.indexOf(k[1]) >= 0;
        return '<button class="kk-kwb' + (mine ? " on" : "") + '" onclick="window.__kwVote(' + i + ')">' +
          (total ? '<span class="kk-kwbar" style="width:' + p + '%"></span>' : "") +
          '<span class="kk-kwlab">' + k[0] + " " + esc(k[1]) + "</span>" +
          (total ? '<em class="kk-kwpct">' + p + "%</em>" : "") + "</button>";
      }).join("") + "</div></div>";
    // ── 댓글칸(이 기기 저장) ──
    var revs = getRevs(d);
    var revList = revs.length ? '<div class="kk-revs">' + revs.map(function (r, i) {
      return '<div class="kk-rev"><div class="kk-revtxt">' + esc(r.t) + "</div>" +
        '<div class="kk-revmeta"><span>' + revDate(r.d) + " · 내 후기</span>" +
        '<button class="kk-revdel" onclick="window.__delReview(' + i + ')">삭제</button></div></div>';
    }).join("") + "</div>" : "";
    var cmt = '<div class="kk-cmt"><div class="kk-cmth">📝 후기 ' + (revs.length ? "<b>" + revs.length + "</b>개" : "남기기") + "</div>" +
      '<textarea maxlength="300" placeholder="다녀온 후기를 남겨보세요 (이 기기에 저장돼요)"></textarea>' +
      '<button class="kk-cmtbtn" onclick="window.__addReview()">후기 등록</button>' + revList + "</div>";

    var key = favKey(d), on = !!FAVS[key];
    var fav = '<button class="kk-fav' + (on ? " on" : "") + '" onclick="window.__toggleFav(\'' + key + '\',this)">' +
      (on ? "💗 찜됨" : "🤍 찜하기") + "</button>";
    return '<div class="kkcard">' +
      (d.photo ? '<img class="kk-photo" src="' + d.photo + '" alt="" onerror="this.style.display=\'none\'">' : "") +
      '<button class="kk-x" onclick="window.__closePop&&window.__closePop()" aria-label="닫기">×</button>' +
      '<div class="kk-name">' + (d.name || sub) + "</div>" +
      '<div class="kk-sub">' + sub + "</div>" +
      summary + body + feat + kwGrid + cmt +
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

  // ── 검색(식장·지역) ──
  function goToVenue(d) {
    if (!map) return;
    var pos = new kakao.maps.LatLng(d.lat, d.lng);
    map.setLevel(3); map.setCenter(pos);
    openPop(d, pos);
  }
  function setupSearch() {
    var inp = $("qInput"), box = $("qResults");
    if (!inp) return;
    var current = [];
    function close() { box.innerHTML = ""; box.style.display = "none"; }
    inp.addEventListener("input", function () {
      var q = inp.value.replace(/\s/g, "").toLowerCase();
      if (q.length < 1) { close(); return; }
      current = DATA.filter(function (d) {
        var hay = ((d.name || "") + (d.region || "") + (d.district || "")).replace(/\s/g, "").toLowerCase();
        return hay.indexOf(q) >= 0;
      }).sort(function (a, b) { return (hasPrice(b) ? 1 : 0) - (hasPrice(a) ? 1 : 0); }).slice(0, 10);
      if (!current.length) { box.innerHTML = '<div class="qempty">검색 결과 없음</div>'; box.style.display = "block"; return; }
      box.innerHTML = current.map(function (d, i) {
        return '<button class="qitem" data-i="' + i + '"><b>' + esc(d.name || "") + "</b><small>" +
          esc(d.region + (d.district ? " " + d.district : "") + " · " + d.type) + (hasPrice(d) ? " · " + manwon(d.meal) + "원" : " · 가격 미확인") + "</small></button>";
      }).join("");
      box.style.display = "block";
      Array.prototype.forEach.call(box.querySelectorAll(".qitem"), function (b) {
        b.addEventListener("click", function () { var d = current[+b.getAttribute("data-i")]; inp.value = d.name || ""; close(); goToVenue(d); });
      });
    });
    inp.addEventListener("blur", function () { setTimeout(close, 200); });
  }

  // ── 카카오 지도 ──
  var map, clusterer, imgCache = {};
  function markerImage(d, lo, hi) {
    var priced = hasPrice(d);
    var key = priced ? "p" + Math.round((d.meal - lo) / (hi - lo) * 10) : "g";
    if (imgCache[key]) return imgCache[key];
    var size, svg;
    if (priced) {
      size = 36;
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="13" fill="' + priceColor(d.meal, lo, hi) + '" stroke="#fff" stroke-width="4"/></svg>';
    } else {
      size = 26;
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="8" fill="#9aa4ba" fill-opacity="0.32" stroke="#9aa4ba" stroke-width="2.5"/></svg>';
    }
    var img = new kakao.maps.MarkerImage("data:image/svg+xml;base64," + btoa(svg), new kakao.maps.Size(size, size),
      { offset: new kakao.maps.Point(size / 2, size / 2) });
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
        openPop(d, mk.getPosition());
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
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") window.__closePop(); });
    buildFilters(drawKakao); drawKakao(); setupSearch();
    try {
      var b = new kakao.maps.LatLngBounds();
      DATA.forEach(function (d) { b.extend(new kakao.maps.LatLng(d.lat, d.lng)); });
      map.setBounds(b);
    } catch (e) {}
  }

  // ── 폴백(히트맵) ──
  function initFallback() {
    $("map").style.display = "none";
    var ms = $("msearch"); if (ms) ms.style.display = "none";
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
