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
  window.__setGuests = function (v) {
    var n = Math.max(0, Math.min(2000, parseInt(v, 10) || 0));
    setGuests(n);
    if (currentPop) rerenderPanel();
    var gi = document.getElementById("fpGuests"); if (gi) gi.value = GUESTS; // 찜패널 동기화
  };
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
  var KW_EMOJI = {}; KEYWORDS.forEach(function (k) { KW_EMOJI[k[1]] = k[0]; });
  // ── 백엔드(Vercel /api) 연동 + localStorage 폴백 ──
  var API = (location.protocol === "https:" || location.protocol === "http:") ? "/api" : null;
  var apiOK = !!API;
  function clientId() {
    var k = "wedding_cid", v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) { v = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); try { localStorage.setItem(k, v); } catch (e) {} }
    return v;
  }
  // ── 가격 게이팅: 제보 1건 하면 전체 언락 ──
  var UNLOCKED = false, PRICES = null;
  function isPriced(d) { return !!d.p || hasPrice(d); }                 // 가격 존재(잠금 포함)
  function applyPrices() {
    if (!PRICES) return;
    DATA.forEach(function (d) { var p = PRICES[d.name]; if (p) { d.meal = p.m; if (p.r) d.rental = p.r; if (p.g) d.guarantee = p.g; } });
  }
  function fetchPrices(onUnlock) {
    if (!apiOK || UNLOCKED) return;
    fetch(API + "/prices?cid=" + encodeURIComponent(clientId()))
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (j) {
        if (j && j.unlocked && j.prices) { UNLOCKED = true; PRICES = j.prices; applyPrices(); if (onUnlock) onUnlock(); }
      });
  }

  function kwVoteKey(d) { return "wedding_kw_" + favKey(d); }
  function getVotes(d) { try { return JSON.parse(localStorage.getItem(kwVoteKey(d)) || "[]"); } catch (e) { return []; } }
  function setVotes(d, a) { try { localStorage.setItem(kwVoteKey(d), JSON.stringify(a)); } catch (e) {} }
  function myKw(d) { return d._kwsrv ? (d.kwMine || []) : getVotes(d); } // 내가 누른 키워드
  // 후기(서버 로드 시 d._revs, 아니면 이 기기)
  function revKey(d) { return "wedding_rev_" + favKey(d); }
  function getLocalRevs(d) { try { return JSON.parse(localStorage.getItem(revKey(d)) || "[]"); } catch (e) { return []; } }
  function setLocalRevs(d, a) { try { localStorage.setItem(revKey(d), JSON.stringify(a)); } catch (e) {} }
  function getRevs(d) { return d._revsrv ? (d._revs || []) : getLocalRevs(d); }
  function saveLocalReview(d, t, cid, rating) { var a = getLocalRevs(d); a.unshift({ id: Date.now(), t: t, d: Date.now(), cid: cid, rating: rating || null }); setLocalRevs(d, a); }
  var draftRating = 0; // 후기 작성 시 선택한 별점(팝업당)
  window.__setRating = function (n) { draftRating = (draftRating === n) ? 0 : n; rerenderPanel(); };
  var showPriceForm = false, priceThanks = false; // 가격 제보 폼 펼침 / 제보 직후 안내
  window.__togglePriceForm = function () { showPriceForm = !showPriceForm; rerenderPanel(); };
  var showReviews = false; // 후기·평가 영역 펼침(기본 접힘 — 비중 축소)
  window.__toggleReviews = function () { showReviews = !showReviews; rerenderPanel(); };
  function resizeImg(file, cb) { // 견적서 사진 → 1000px·JPEG로 축소한 dataURL
    if (!file) { cb(null); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1000, w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        try { cb(c.toDataURL("image/jpeg", 0.6)); } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }
  window.__submitPrice = function () {
    if (!currentPop) return;
    var d = currentPop, p = panelEl;
    var m = p.querySelector("#prMeal"), r = p.querySelector("#prRent"), f = p.querySelector("#prPhoto");
    var meal = m ? parseInt(m.value, 10) : 0, rent = r && r.value ? parseInt(r.value, 10) : 0;
    var note = (p.querySelector("#prNote") || {}).value || "";
    var qDate = (p.querySelector("#prQDate") || {}).value || "";
    var wDate = (p.querySelector("#prWDate") || {}).value || "";
    var file = f && f.files && f.files[0];
    if (!(meal >= 10000 && meal <= 400000)) { if (m) m.focus(); alert("1인 식대를 원 단위로 입력해 주세요.\n예: 70000  (1만~40만원)"); return; }
    if (rent && !(rent >= 100000 && rent <= 100000000)) { if (r) r.focus(); alert("대관료를 원 단위로 입력해 주세요.\n예: 5000000  (10만원~1억)"); return; }
    if (!file) { if (f) f.click(); alert("가격표·견적서 사진을 첨부해 주세요 📷 (검증용·필수)"); return; }
    var agree = p.querySelector("#prAgree");
    if (!agree || !agree.checked) { if (agree) agree.focus(); alert("개인정보 수집·이용 동의에 체크해 주세요 🙏"); return; }
    if (!apiOK) { alert("가격 제보는 온라인에서만 가능해요 🙏"); return; }
    var btn = p.querySelector(".kk-prsubmit"); if (btn) { btn.disabled = true; btn.textContent = "사진 처리 중…"; }
    resizeImg(file, function (photo) {
      if (!photo) { if (btn) { btn.disabled = false; btn.textContent = "제보 보내기"; } alert("사진을 처리하지 못했어요. 다른 사진으로 시도해 주세요."); return; }
      if (btn) btn.textContent = "제출 중…";
      fetch(API + "/price", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue: favKey(d), name: d.name, meal: meal || null, rental: rent || null, cid: clientId(), photo: photo, note: note, quoteDate: qDate, weddingDate: wDate }) })
        .then(function (x) { return x.ok ? x.json() : Promise.reject(); })
        .then(function (a) { d._pr = a; showPriceForm = false; priceThanks = true; rerenderPanel(); })
        .catch(function () { if (btn) { btn.disabled = false; btn.textContent = "제보 보내기"; } alert("제보 전송에 실패했어요. 잠시 후 다시 시도해 주세요."); });
    });
  };
  window.__prFile = function (input) { var n = input.files && input.files[0]; var el = panelEl && panelEl.querySelector("#prFileName"); if (el) el.textContent = n ? "✓ " + n.name : ""; };
  function revDate(ts) { var d = new Date(ts); return (d.getMonth() + 1) + "." + d.getDate(); }
  // 키워드 카운트: 서버 집계(나 포함) 우선, 없으면 이 기기 투표만
  function kwCount(d, label) {
    if (d._kwsrv) return (d.kw && d.kw[label]) || 0;
    return getVotes(d).indexOf(label) >= 0 ? 1 : 0;
  }
  function kwRanked(d) {
    return KEYWORDS.map(function (k, i) { return { i: i, emoji: k[0], label: k[1], n: kwCount(d, k[1]) }; })
      .filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
  }

  // 현재 열린 팝업(화면 고정 패널 — 지도 움직여도 안 사라짐)
  var currentPop = null, panelEl = null;
  function getPanel() {
    if (!panelEl) {
      panelEl = document.createElement("div"); panelEl.id = "venuePanel"; panelEl.className = "venue-panel";
      document.body.appendChild(panelEl);
      bindSheetGestures(panelEl);
    }
    return panelEl;
  }
  // 펼침 높이 = 헤더(불투명 배경) 아래 경계선까지
  function setSheet(expanded) {
    if (!panelEl) return;
    var card = panelEl.querySelector(".kkcard");
    if (expanded) {
      panelEl.classList.add("expanded");
      var top = document.querySelector(".map-top");
      var b = top ? top.getBoundingClientRect().bottom : 64;
      if (card) card.style.maxHeight = Math.max(180, Math.round(window.innerHeight - b - 4)) + "px";
    } else {
      panelEl.classList.remove("expanded");
      if (card) card.style.maxHeight = ""; // CSS 기본(접힘)
    }
  }
  // 모바일 바텀시트 제스처: 위로 스와이프=펼침↔접힘 토글, 아래로=접힘/닫기
  function bindSheetGestures(el) {
    var sy = 0, handle = false;
    el.addEventListener("touchstart", function (e) {
      var card = el.querySelector(".kkcard"); if (!card) return;
      sy = e.touches[0].clientY;
      handle = (sy - card.getBoundingClientRect().top) < 46; // 카드 상단(핸들) 영역
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (window.innerWidth > 560 || !el.classList.contains("open")) return;
      var card = el.querySelector(".kkcard"), atTop = !card || card.scrollTop <= 1;
      var dy = e.changedTouches[0].clientY - sy, exp = el.classList.contains("expanded");
      if (!exp) {
        // 접힘: 위로 스와이프 → 무조건 먼저 펼침(내용 스크롤 X), 아래로 → 닫기
        if (dy < -20) setSheet(true);
        else if (dy > 45) window.__closePop();
        else if (handle && Math.abs(dy) < 8) setSheet(true);
      } else {
        // 펼침: 내용 스크롤. 맨 위에서 아래로 스와이프(또는 핸들 탭) → 접힘
        if (atTop && dy > 36) setSheet(false);
        else if (handle && Math.abs(dy) < 8) setSheet(false);
      }
    }, { passive: true });
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
  // 식장 타입별 대표 아이콘
  function venueIcon(t) {
    t = String(t || "");
    if (/호텔/.test(t)) return "🏨";
    if (/채플|성당|교회/.test(t)) return "⛪";
    if (/하우스|가든|야외|루프탑/.test(t)) return "🌿";
    if (/컨벤션|타워|플라자|컨벤/.test(t)) return "🏛️";
    return "💒";
  }
  // 사진 칸 HTML: 실제 사진 우선, 없으면 깔끔한 디자인 플레이스홀더
  function photoHtml(d) {
    if (d.photo) return '<img class="kk-photo" src="' + d.photo + '" alt="" onerror="window.__photoErr(this)">';
    return placeholderHtml(d);
  }
  function placeholderHtml(d) {
    var loc = (d.region || "") + (d.district ? " " + d.district : "");
    return '<div class="kk-photo kk-ph kk-ph-' + (venueIcon(d.type) === "🏨" ? "h" : venueIcon(d.type) === "⛪" ? "c" : venueIcon(d.type) === "🌿" ? "g" : venueIcon(d.type) === "🏛️" ? "v" : "w") + '">' +
      '<span class="kk-ph-ic">' + venueIcon(d.type) + '</span>' +
      '<span class="kk-ph-tx">' + esc(d.type || "예식장") + (loc ? ' <i>· ' + esc(loc) + '</i>' : "") + '</span>' +
      '</div>';
  }
  // 팝업 열 때 서버에서 투표·후기 동기화(없으면 폴백 유지)
  function loadServer(d) {
    if (!apiOK) return;
    var key = favKey(d), cid = clientId();
    Promise.all([
      fetch(API + "/votes?venue=" + encodeURIComponent(key) + "&cid=" + encodeURIComponent(cid)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(API + "/reviews?venue=" + encodeURIComponent(key)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(API + "/price?venue=" + encodeURIComponent(key)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ]).then(function (res) {
      if (currentPop !== d) return; // 다른 핀으로 이동했으면 무시
      if (res[0]) { d.kw = res[0].kw || {}; d.kwMine = res[0].mine || []; d._kwsrv = true; }
      if (res[1]) { d._revs = res[1].reviews || []; d._revsrv = true; }
      if (res[2]) { d._pr = res[2]; }
      if (res[0] || res[1] || res[2]) rerenderPanel();
    });
  }
  window.__kwVote = function (idx) {
    if (!currentPop || !KEYWORDS[idx]) return;
    var d = currentPop, label = KEYWORDS[idx][1];
    if (apiOK) {
      d._kwsrv = true; if (!d.kw) d.kw = {}; if (!d.kwMine) d.kwMine = []; // 낙관적 갱신
      var mi = d.kwMine.indexOf(label);
      if (mi >= 0) { d.kwMine.splice(mi, 1); d.kw[label] = Math.max(0, (d.kw[label] || 1) - 1); }
      else { d.kwMine.push(label); d.kw[label] = (d.kw[label] || 0) + 1; }
      rerenderPanel();
      fetch(API + "/votes", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue: favKey(d), keyword: label, cid: clientId() }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (s) { if (currentPop === d) { d.kw = s.kw || {}; d.kwMine = s.mine || []; rerenderPanel(); } })
        .catch(function () {});
    } else {
      var arr = getVotes(d), i = arr.indexOf(label);
      if (i >= 0) arr.splice(i, 1); else arr.push(label);
      setVotes(d, arr); rerenderPanel();
    }
  };
  window.__addReview = function () {
    if (!currentPop || !panelEl) return;
    var d = currentPop, ta = panelEl.querySelector(".kk-cmt textarea"), t = ta ? ta.value.trim() : "";
    if (!t) { if (ta) ta.focus(); return; }
    var cid = clientId(), rating = draftRating || null;
    var clear = function () { draftRating = 0; if (ta) ta.value = ""; rerenderPanel(); };
    if (apiOK) {
      var btn = panelEl.querySelector(".kk-cmtbtn"); if (btn) { btn.disabled = true; btn.textContent = "등록 중…"; }
      fetch(API + "/reviews", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue: favKey(d), name: d.name, text: t, cid: cid, rating: rating }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (row) { if (!d._revs) d._revs = []; d._revs.unshift(row); d._revsrv = true; clear(); })
        .catch(function () { saveLocalReview(d, t, cid, rating); clear(); });
    } else { saveLocalReview(d, t, cid, rating); clear(); }
  };
  window.__delReview = function (id) {
    if (!currentPop) return;
    var d = currentPop;
    if (d._revsrv) {
      d._revs = (d._revs || []).filter(function (r) { return r.id !== id; });
      rerenderPanel();
      if (apiOK) fetch(API + "/reviews?id=" + id + "&cid=" + encodeURIComponent(clientId()), { method: "DELETE" }).catch(function () {});
    } else {
      setLocalRevs(d, getLocalRevs(d).filter(function (r) { return r.id !== id; })); rerenderPanel();
    }
  };
  window.__reportReview = function (id) {
    if (!apiOK) { alert("신고는 온라인에서만 가능해요 🙏"); return; }
    if (!confirm("이 후기를 신고할까요?\n비방·허위·욕설 등은 운영자가 검토 후 조치해요.")) return;
    fetch(API + "/reviews", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report", id: id }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function () { alert("신고가 접수됐어요. 검토 후 조치할게요. 🙏"); })
      .catch(function () { alert("신고 전송에 실패했어요. 잠시 후 다시 시도해 주세요."); });
  };
  window.__closePop = function () {
    if (panelEl) panelEl.classList.remove("open", "expanded"); lockMap(false); currentPop = null;
    if (selectedMarker) { try { selectedMarker.setImage(selectedMarker.__img); selectedMarker.setZIndex(0); } catch (e) {} selectedMarker = null; }
  };
  window.__photoErr = function (img) { // 핫링크 깨지면 디자인 플레이스홀더로 대체
    try { if (currentPop) img.outerHTML = placeholderHtml(currentPop); } catch (e) {}
  };
  function openPop(d) {
    currentPop = d;
    draftRating = 0; showPriceForm = false; priceThanks = false; showReviews = false; // 새 팝업: 별점/제보폼/후기 초기화
    var p = getPanel();
    p.classList.remove("expanded"); // 항상 접힌(peek) 상태로 열기
    p.innerHTML = popupHtml(d);
    p.classList.add("open");
    lockMap(true); // 팝업 동안 지도 고정
    loadServer(d); // 공유 데이터 동기화
  }

  function isOutdoor(d) {
    if (d.type === "야외") return true;
    var s = (d.name || "") + " " + ((d.tags || []).join(" "));
    return /야외|가든|루프탑|테라스|글라스|하우스웨딩/.test(s) || d.type === "하우스웨딩";
  }
  function typeOk(d) {
    if (fType === "전체") return true;
    if (fType === "야외") return isOutdoor(d);
    return d.type === fType;
  }
  function visible() {
    return DATA.filter(function (d) {
      return typeOk(d) && (!fVer || d.verified) && (!fPriced || isPriced(d)) && (!fFav || FAVS[favKey(d)]);
    });
  }
  function priceColor(m, lo, hi, mid) {
    mid = mid || (lo + hi) / 2;
    var v;                                   // 중앙값=0.5(노랑) 기준 piecewise → 흔한 가격대 대비 강화
    if (m <= mid) v = mid > lo ? 0.5 * (m - lo) / (mid - lo) : 0;
    else v = hi > mid ? 0.5 + 0.5 * (m - mid) / (hi - mid) : 1;
    v = Math.max(0, Math.min(1, v));
    return "hsl(" + Math.round(120 * (1 - v)) + ",72%,45%)";
  }

  function renderStats(rows) {
    if (!$("mStatN")) return;                 // 통계박스 제거됨 → 안전 가드
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
      var guarBox = d.guarantee ? '<div class="kk-pb guar"><div class="kk-pblab">보증인원</div><div class="kk-pbval">' + d.guarantee + "명</div></div>" : "";
      body = '<div class="kk-hero">' +
          '<div class="kk-herolab">하객 <input class="kk-guests" type="number" inputmode="numeric" min="0" value="' + GUESTS + '" onchange="window.__setGuests(this.value)" onclick="this.select()">명 기준 예상 총액</div>' +
          '<div class="kk-heroval">' + won(totalCost(d)) + "</div>" +
          '<div class="kk-herosub">식대×하객 + 대관료 추정' + (d.guarantee && d.guarantee > GUESTS ? " · 보증 " + d.guarantee + "명 주의" : "") + "</div>" +
        "</div>" +
        '<div class="kk-pricerow">' +
          '<div class="kk-pb meal"><div class="kk-pblab">식대 (1인)</div><div class="kk-pbval">' + won(d.meal) + "</div></div>" +
          '<div class="kk-pb rent"><div class="kk-pblab">대관료</div><div class="kk-pbval">' +
            (d.rental ? manwon(d.rental) + "원" : "정보없음") + "</div>" +
            (rentNote ? '<div class="kk-pbnote">' + rentNote + "</div>" : "") + "</div>" +
          guarBox +
        "</div>" + chipHtml;
    } else if (isPriced(d)) {
      // 잠김: 더미 금액을 블러로(실제 숫자는 서버만 보유). 제보 1건 시 전체 공개.
      body = '<div class="kk-hero kk-lockhero">' +
          '<div class="kk-herolab">하객 ' + GUESTS + "명 기준 예상 총액</div>" +
          '<div class="kk-heroval kk-blur">00,000,000원</div>' +
          '<div class="kk-herosub">🔒 가격 <b>제보·검증</b> 후 전체 공개</div>' +
        "</div>" +
        '<div class="kk-pricerow">' +
          '<div class="kk-pb meal"><div class="kk-pblab">식대 (1인)</div><div class="kk-pbval kk-blur">00,000원</div></div>' +
          '<div class="kk-pb rent"><div class="kk-pblab">대관료</div><div class="kk-pbval kk-blur">000만원</div></div>' +
        "</div>" + chipHtml;
    } else {
      body = '<div class="kk-soon">💬 가격 정보 수집 중</div><div class="kk-soonsub">아는 가격이 있다면 아래에서 제보해 주세요 🙏</div>' + chipHtml;
    }
    // 사용자 가격 제보(집계 표시 + 입력 폼)
    var pr = d._pr;
    var prInfo = (pr && pr.n) ? '<div class="kk-prinfo">👥 사용자 제보 <b>' + pr.n + "</b>건" +
      (pr.meal ? " · 식대 " + won(pr.meal) : "") + (pr.rental ? " · 대관료 " + manwon(pr.rental) + "원" : "") + "</div>" : "";
    var prForm = showPriceForm
      ? '<div class="kk-prform"><div class="kk-prrow">' +
          '<input id="prMeal" type="number" inputmode="numeric" placeholder="1인 식대 (원) 예:70000" />' +
          '<input id="prRent" type="number" inputmode="numeric" placeholder="대관료 (원, 선택) 예:5000000" />' +
        "</div>" +
        '<div class="kk-prdates">' +
          '<label>견적 받은 날짜<input id="prQDate" type="date" /></label>' +
          '<label>결혼식 날짜<input id="prWDate" type="date" /></label>' +
        "</div>" +
        '<label class="kk-prfile">📷 가격표·견적서 사진 첨부 <span>(필수)</span>' +
          '<input id="prPhoto" type="file" accept="image/*" onchange="window.__prFile(this)" /></label>' +
        '<div id="prFileName" class="kk-prfname"></div>' +
        '<div class="kk-prmask">🙈 이름·연락처 등 개인정보는 <b>가린</b> 견적서만 올려주세요</div>' +
        '<input id="prNote" class="kk-prnote" maxlength="200" placeholder="검증용 메모 (연락처·인스타·카톡 등, 선택)" />' +
        '<label class="kk-prconsent"><input id="prAgree" type="checkbox" />' +
          '<span>본인이 공개 가능한 정보만 제보하며, <a href="/privacy.html" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의해요.</span></label>' +
        '<button class="kk-prsubmit" onclick="window.__submitPrice()">제보 보내기</button>' +
        '<div class="kk-prhint">견적서 사진으로 검증 후 반영돼요. 사진·메모는 운영자만 봐요.</div></div>'
      : "";
    var priceReport = priceThanks
      ? '<div class="kk-pr"><div class="kk-prthx">✅ 제보 감사합니다!<br><span>운영자 검증 후 가격이 공개돼요</span></div></div>'
      : '<div class="kk-pr' + (hasPrice(d) ? "" : " soon") + '">' + prInfo +
        '<button class="kk-prbtn" onclick="window.__togglePriceForm()">💰 가격 ' + (showPriceForm ? "제보 닫기" : "제보하기") + "</button>" + prForm + "</div>";
    var tagsBlock = (d.tags && d.tags.length) ? '<div class="kk-chips feat">' +
      d.tags.slice(0, 8).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "";
    var pros = (d.pros && d.pros.length) ? '<div class="kk-pc good">👍 ' + d.pros.slice(0, 5).map(esc).join(" · ") + "</div>" : "";
    var cons = (d.cons && d.cons.length) ? '<div class="kk-pc bad">👎 ' + d.cons.slice(0, 5).map(esc).join(" · ") + "</div>" : "";
    var featBody = tagsBlock + pros + cons;
    // 특징·장단점: 데이터 없어도 자리 유지(빈 placeholder) → 팝업 크기 일정
    var feat = '<div class="kk-feat"><div class="kk-feattitle">✨ 특징 · 장단점</div>' +
      (featBody ? featBody + ((pros || cons) ? '<div class="kk-pcsrc">※ 예신 커뮤니티 후기 참고 (검증 전)</div>' : "")
        : '<div class="kk-featempty">아직 등록된 특징·장단점이 없어요</div>') + "</div>";
    // 커뮤니티(블로그) 후기에서 자주 나온 키워드 — 언급 빈도 기반
    var comm = (d.community && d.community.length)
      ? '<div class="kk-feat kk-comm"><div class="kk-feattitle">💬 커뮤니티에서 자주 나온 얘기</div>' +
        '<div class="kk-chips feat">' + d.community.slice(0, 6).map(function (c) {
          return "<span>" + (KW_EMOJI[c[0]] || "") + " " + esc(c[0]) + " <em>" + c[1] + "</em></span>";
        }).join("") + '</div><div class="kk-pcsrc">※ 블로그 후기 언급 빈도 기반 (검증 전)</div></div>'
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
    var myVotes = myKw(d);
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
    // ── 후기 목록·작성(별점 포함) ──
    var revs = getRevs(d), cid = apiOK ? clientId() : null;
    var rated = revs.filter(function (r) { return r.rating; });
    var avg = rated.length ? (rated.reduce(function (s, r) { return s + r.rating; }, 0) / rated.length) : 0;
    function starStr(n) { n = Math.round(n); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
    var revList = revs.length ? '<div class="kk-revs">' + revs.map(function (r) {
      var own = (r.cid == null) || (cid != null && r.cid === cid);
      return '<div class="kk-rev">' +
        (r.rating ? '<div class="kk-revstars">' + starStr(r.rating) + "</div>" : "") +
        '<div class="kk-revtxt">' + esc(r.t) + "</div>" +
        '<div class="kk-revmeta"><span>' + revDate(r.d) + (own ? " · 내 후기" : "") + "</span>" +
        (own ? '<button class="kk-revdel" onclick="window.__delReview(' + r.id + ')">삭제</button>'
             : '<button class="kk-revrep" onclick="window.__reportReview(' + r.id + ')">🚩 신고</button>') + "</div></div>";
    }).join("") + "</div>" : "";
    // 별점 매기기 UX (후기 남기기 ↔ 등록 사이)
    var starSel = '<div class="kk-rate"><div class="kk-ratel">별점</div><div class="kk-stars">' +
      [1, 2, 3, 4, 5].map(function (n) {
        return '<button class="kk-star' + (n <= draftRating ? " on" : "") + '" onclick="window.__setRating(' + n + ')" aria-label="' + n + '점">★</button>';
      }).join("") +
      '<span class="kk-ratenum">' + (draftRating ? draftRating + ".0" : (avg ? "평균 " + avg.toFixed(1) : "")) + "</span></div></div>";
    var cmt = '<div class="kk-cmt"><div class="kk-cmth">📝 후기 ' + (revs.length ? "<b>" + revs.length + "</b>개" + (avg ? ' <span class="kk-cmtavg">★ ' + avg.toFixed(1) + "</span>" : "") : "남기기") + "</div>" +
      starSel +
      '<textarea maxlength="300" placeholder="다녀온 후기를 남겨보세요"></textarea>' +
      '<button class="kk-cmtbtn" onclick="window.__addReview()">후기 등록</button>' + revList + "</div>";
    // ── 후기·평가: 기본 접힘(비중 축소). 한 줄 요약 + 펼치기 토글 ──
    var revMeta = [];
    if (revs.length) revMeta.push("후기 " + revs.length + "개" + (avg ? " ★" + avg.toFixed(1) : ""));
    if (total) revMeta.push("평가 " + total + "명");
    var revSummary = revMeta.length ? revMeta.join(" · ") : "아직 후기·평가가 없어요";
    var reviewSec = '<div class="kk-revsec' + (showReviews ? " open" : "") + '">' +
      '<button class="kk-revtoggle" onclick="window.__toggleReviews()">' +
        '<span class="kk-revtl">📝 후기 · 평가</span>' +
        '<span class="kk-revtsum">' + revSummary + '</span>' +
        '<span class="kk-revtarr">' + (showReviews ? "▴" : "▾") + "</span>" +
      "</button>" +
      (showReviews ? '<div class="kk-revbody">' + kwGrid + cmt + "</div>" : "") + "</div>";

    var key = favKey(d), on = !!FAVS[key];
    var fav = '<button class="kk-fav' + (on ? " on" : "") + '" onclick="window.__toggleFav(\'' + key + '\',this)">' +
      (on ? "💗 찜됨" : "🤍 찜하기") + "</button>";
    return '<div class="kkcard">' +
      photoHtml(d) +
      '<button class="kk-x" onclick="window.__closePop&&window.__closePop()" aria-label="닫기">×</button>' +
      '<div class="kk-name">' + (d.name || sub) + "</div>" +
      '<div class="kk-sub">' + sub + "</div>" +
      feat + comm + '<div class="kk-pricesec">' + body + "</div>" + priceReport + reviewSec +
      '<div class="kk-actions">' + fav + "</div>" +
      '<div class="kk-prdisc">가격은 제보·공개정보 기반 추정치로 실제와 다를 수 있어요.</div>' +
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
  var TYPE_CHIPS = ["컨벤션", "호텔", "하우스웨딩", "야외", "일반예식장"];
  function buildFilters(onChange) {
    currentRefresh = onChange;
    chips("fType", TYPE_CHIPS, fType, function (v) { fType = v; buildFilters(onChange); onChange(); });
    var ff = $("fFav"); if (ff) { ff.className = "chip" + (fFav ? " on" : ""); ff.onclick = function () { fFav = !fFav; buildFilters(onChange); onChange(); }; }
    var pb = $("fPriced"); if (pb) { pb.className = "chip" + (fPriced ? " on" : ""); pb.onclick = function () { fPriced = !fPriced; buildFilters(onChange); onChange(); }; }
    var vb = $("fVer"); vb.className = "chip" + (fVer ? " on" : ""); vb.onclick = function () { fVer = !fVer; buildFilters(onChange); onChange(); };
    // 드롭다운 토글(한 번만 바인딩) + 선택요약
    var tog = $("filterToggle"), pan = $("filterPanel");
    if (tog && !tog.__b) {
      tog.__b = true;
      tog.onclick = function () { if (pan) { var open = pan.classList.toggle("open"); tog.classList.toggle("on", open); } };
    }
    updateFilterSummary();
    updateFavChip();
  }
  function updateFilterSummary() {
    var el = $("filterSummary"); if (!el) return;
    var a = [];
    if (fType !== "전체") a.push(fType);
    if (fFav) a.push("💗 찜");
    if (fPriced) a.push("💰 가격");
    if (fVer) a.push("✅ 검증");
    el.innerHTML = a.length
      ? a.map(function (x) { return '<span class="sumchip">' + x + "</span>"; }).join("")
      : '<span class="sumchip muted">전체 보기</span>';
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
  var map, clusterer, imgCache = {}, selectedMarker = null, myDot = null;
  function showMyDot(here) {
    if (myDot) { try { myDot.setMap(null); } catch (e) {} }
    myDot = new kakao.maps.Circle({ map: map, center: here, radius: 90, strokeWeight: 2, strokeColor: "#2b7cff", strokeOpacity: 0.9, fillColor: "#2b7cff", fillOpacity: 0.35 });
  }
  // 좌하단 플로팅 버튼 핸들러
  window.__recenterMe = function () {
    if (!navigator.geolocation || !map) { return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) { alert("현재 위치가 국내 서비스 지역 밖이에요."); return; }
      var here = new kakao.maps.LatLng(lat, lng);
      map.setLevel(6); map.panTo(here); showMyDot(here);
    }, function () { alert("위치 권한이 필요해요. 브라우저 설정에서 허용해 주세요 🙏"); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  };
  // 홀타입 → 이모지
  function typeEmoji(t) {
    return t === "호텔" ? "🏨" : t === "컨벤션" ? "🏢" : t === "하우스웨딩" ? "🏡"
      : t === "야외" ? "🌳" : t === "채플/성당" ? "⛪" : t === "일반예식장" ? "💒" : "💍";
  }
  // 거지맵식 가격 알약(pill). 줄마다 아이콘(💒 대관료 / 🍽️ 식대) + 값. 좌우 여백 동일.
  var PILL_PAD = 12, PILL_ICON = 20;
  function xmlEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function strW(s) { var w = 0; for (var i = 0; i < s.length; i++) { var c = s[i]; w += /[0-9]/.test(c) ? 7.6 : c === " " ? 4 : c === "/" ? 5 : c === "." ? 4 : 12; } return w; }
  function lineValW(l) {
    if (l.bar != null) return l.bar + 4 + strW(l.unit);
    if (l.num != null) return strW(l.num) + 2 + strW(l.unit);
    return strW(l.v);
  }
  function pillWidth(lines, sel) {
    var hasIcon = lines.some(function (l) { return l.ic; });
    var mv = 0; lines.forEach(function (l) { mv = Math.max(mv, lineValW(l)); });
    return Math.round(PILL_PAD + (hasIcon ? PILL_ICON : 0) + mv + PILL_PAD + (sel ? 22 : 0));
  }
  function pillSVG(lines, color, sel, w, blur) {
    var n = lines.length, h = 8 + n * 16, th = h + 8, cx = w / 2;
    var bg = sel ? "#2b2b3a" : "#ffffff", bd = sel ? "#2b2b3a" : color, val = sel ? "#ffffff" : "#16203a";
    var FONT = ' font-family="-apple-system,sans-serif" font-size="13" font-weight="800" fill="' + val + '"';
    function row(line, i) {
      var y = 16 + i * 16, vx = line.ic ? PILL_PAD + PILL_ICON : PILL_PAD;
      var ic = line.ic ? '<text x="' + PILL_PAD + '" y="' + y + '" font-size="12.5">' + line.ic + '</text>' : "";
      if (line.bar != null) { // 가림 막대(redacted) + 단위 선명
        return ic + '<rect x="' + vx + '" y="' + (y - 10) + '" width="' + line.bar + '" height="11" rx="3" fill="#d6dae2"/>' +
          '<text x="' + (vx + line.bar + 4) + '" y="' + y + '"' + FONT + '>' + xmlEsc(line.unit) + '</text>';
      }
      if (line.num != null) { // 숫자만 블러, 단위(만원)는 선명
        return ic + '<text x="' + vx + '" y="' + y + '"' + FONT + (blur ? ' filter="url(#bl)"' : "") + '>' + xmlEsc(line.num) + '</text>' +
          '<text x="' + (vx + strW(line.num) + 2) + '" y="' + y + '"' + FONT + '>' + xmlEsc(line.unit) + '</text>';
      }
      return ic + '<text x="' + vx + '" y="' + y + '"' + FONT + '>' + xmlEsc(line.v) + '</text>';
    }
    var body = lines.map(function (l, i) { return row(l, i); }).join("");
    var x = sel ? '<text x="' + (w - 14) + '" y="' + (h / 2 + 5.5) + '" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="16" font-weight="600" fill="#fff" opacity="0.85">×</text>' : "";
    var defs = blur ? '<defs><filter id="bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.5"/></filter></defs>' : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + th + '">' + defs +
      '<path d="M' + (cx - 6) + ' ' + (h - 1) + ' L' + cx + ' ' + (th - 1) + ' L' + (cx + 6) + ' ' + (h - 1) + ' Z" fill="' + bg + '" stroke="' + bd + '" stroke-width="2"/>' +
      '<rect x="1.5" y="1.5" rx="12" ry="12" width="' + (w - 3) + '" height="' + (h - 3) + '" fill="' + bg + '" stroke="' + bd + '" stroke-width="2"/>' +
      body + x + '</svg>';
  }
  function markerImage(d, lo, hi, mid, sel) {
    var priced = hasPrice(d), locked = !priced && isPriced(d), color, lines, blur = false;
    if (priced) {
      color = priceColor(d.meal, lo, hi, mid);
      lines = [];
      if (d.rental) lines.push({ ic: "💒", v: manwon(d.rental) + "원" });
      lines.push({ ic: "🍽️", v: manwon(d.meal) + "원" });
    } else if (locked) { // 대관료+식대 2줄, 숫자 자리는 가림 막대(redacted)
      color = "#c7b6d6";
      lines = [{ ic: "💒", bar: 30, unit: "만원" }, { ic: "🍽️", bar: 24, unit: "만원" }];
    } else { color = "#aeb6c2"; lines = [{ v: "정보없음" }]; }
    var key = (priced ? "p|" : locked ? "l|" : "g|") + (sel ? "s|" : "") + lines.map(function (l) { return (l.ic || "") + (l.bar != null ? "bar" + l.bar + l.unit : l.num != null ? l.num + l.unit : l.v); }).join("~") + "|" + color;
    if (imgCache[key]) return imgCache[key];
    var w = pillWidth(lines, sel), th = 8 + lines.length * 16 + 8;
    var img = new kakao.maps.MarkerImage("data:image/svg+xml," + encodeURIComponent(pillSVG(lines, color, sel, w, blur)),
      new kakao.maps.Size(w, th), { offset: new kakao.maps.Point(w / 2, th) });
    imgCache[key] = img; return img;
  }
  function drawKakao() {
    var rows = visible();
    var pm = DATA.filter(hasPrice).map(function (d) { return d.meal; });
    var lo = pm.length ? Math.min.apply(null, pm) : 40000, hi = pm.length ? Math.max.apply(null, pm) : 200000;
    var sm = pm.slice().sort(function (a, b) { return a - b; });
    var mid = sm.length ? sm[Math.floor(sm.length / 2)] : (lo + hi) / 2; // 중앙값(색 대비 기준)
    clusterer.clear();
    selectedMarker = null; // 재그리기 시 선택 해제
    var markers = rows.map(function (d) {
      var normal = markerImage(d, lo, hi, mid, false);
      var mk = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(d.lat, d.lng), image: normal,
        title: (d.name || "") + (hasPrice(d) ? " " + manwon(d.meal) : ""),
      });
      mk.__img = normal;
      mk.__selImg = markerImage(d, lo, hi, mid, true);
      kakao.maps.event.addListener(mk, "click", function () {
        if (selectedMarker === mk) { window.__closePop(); return; } // 선택된 핀 다시 누르면 닫기(× 토글)
        if (selectedMarker) { try { selectedMarker.setImage(selectedMarker.__img); selectedMarker.setZIndex(0); } catch (e) {} }
        if (mk.__selImg) { mk.setImage(mk.__selImg); mk.setZIndex(10000); selectedMarker = mk; }
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
    fetchPrices(function () { drawKakao(); if (currentPop) rerenderPanel(); }); // 언락 상태면 가격 적용
    try {
      var b = new kakao.maps.LatLngBounds();
      DATA.forEach(function (d) { b.extend(new kakao.maps.LatLng(d.lat, d.lng)); });
      map.setBounds(b);
    } catch (e) {}
    locateUser(); // 첫 진입 시 GPS로 내 위치 주변으로 이동(허용 시)
  }

  // 첫 진입 시 현재 위치로 이동 — 사용자가 먼저 조작/팝업 열면 양보
  function locateUser() {
    if (!navigator.geolocation || !map) return;
    var moved = false;
    kakao.maps.event.addListener(map, "dragstart", function () { moved = true; });
    kakao.maps.event.addListener(map, "zoom_start", function () { moved = true; });
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (moved || currentPop) return;                 // 이미 조작 중이면 중심 안 옮김
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) return; // 한반도 밖이면 전국뷰 유지
      var here = new kakao.maps.LatLng(lat, lng);
      map.setLevel(6); map.setCenter(here); showMyDot(here); // 내 위치 파란 점
    }, function () {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
  }

  // ── 폴백(히트맵) ──
  function initFallback() {
    $("map").style.display = "none";
    var ms = $("msearch"); if (ms) ms.style.display = "none";
    var fabs = $("mapFabs"); if (fabs) fabs.style.display = "none"; // 히트맵 폴백에선 숨김
    $("offlineBanner").style.display = "block";
    var fb = $("mapFallback"); fb.style.display = "flex";
    var renderHeat = function () {
      if (window.KoreaMap) window.KoreaMap.render($("fbMap"), {
        data: DATA, slugs: SLUGS, minPage: 3,
        onPick: function (r, e, slug) { if (e && slug) location.href = "region/" + slug + ".html"; },
      });
    };
    renderHeat();
    buildFilters(function () { renderStats(visible()); }); renderStats(visible());
    fetchPrices(function () { renderHeat(); }); // 언락 시 히트맵 가격 반영
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
