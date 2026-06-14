/*
 * pricemerge.js — 식장에 가격을 더할 때, 다른 소스면 평균 / 같은 소스면 스킵
 *   addPrice(venue, {meal, rental, source, slot?, guarantee?})
 *   반환: 'filled'(처음) | 'averaged'(다른 소스 평균) | 'dup'(같은 소스) | 'invalid'
 *   누적 정보: venue.nobs(관측 수), venue.priceSources(소스 목록 '|' 구분)
 */
function addPrice(v, p) {
  if (!(p.meal >= 20000 && p.meal <= 300000)) return "invalid";
  var existing = v.priceSources || (v.meal ? v.source : "") || "";
  var srcs = existing.split("|").filter(Boolean);
  var has = typeof v.meal === "number" && v.meal > 0;

  if (has) {
    if (p.source && srcs.indexOf(p.source) >= 0) return "dup"; // 같은 소스 → 스킵
    var n = v.nobs || 1;
    v.meal = Math.round((v.meal * n + p.meal) / (n + 1));
    if (p.rental) v.rental = v.rental ? Math.round((v.rental * n + p.rental) / (n + 1)) : p.rental;
    v.nobs = n + 1;
    v.priceSources = srcs.concat(p.source ? [p.source] : []).join("|");
    return "averaged";
  } else {
    v.meal = p.meal;
    if (p.rental) v.rental = p.rental;
    if (p.slot && !v.slot) v.slot = p.slot;
    if (p.guarantee && !v.guarantee) v.guarantee = p.guarantee;
    v.nobs = 1;
    v.priceSources = p.source || "";
    v.source = p.source || v.source;
    v.verified = false;
    return "filled";
  }
}
module.exports = { addPrice: addPrice };

// ── 이름 매칭 + 신규 식장 삽입(스크래퍼 공용) ──
var norm = function (s) { return String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase(); };

// og:image가 실제 사진인지 가벼운 검증(https + 로고/공유카드/배너/기본이미지 제외)
function okPhoto(url) {
  if (!url || !/^https:\/\//i.test(url)) return false; // 혼합콘텐츠 방지: https만
  if (/(logo|sprite|blank|spacer|1x1|icon|favicon|sns|share|symbol|banner|ci[-_]|bi[-_]|default|no[-_]?img|noimage|placeholder|common|opengraph)/i.test(url)) return false;
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url) || /(upload|photo|image|img|thumb|file)/i.test(url);
}

// 정규화 이름의 포함관계(짧은 쪽이 4자 이상). 브랜드/지점명 변형을 폭넓게 잡되 과매칭 방지.
function nameOverlap(an, bn) {
  var a = norm(an), b = norm(bn);
  if (!a || !b) return false;
  if (a === b) return true;
  var sh = a.length <= b.length ? a : b, lo = a.length <= b.length ? b : a;
  return sh.length >= 4 && lo.indexOf(sh) >= 0;
}

// 가격을 채울 대상 매칭: 이름 일치/포함 + 지역 호환(단, 이름 완전일치는 지역 무시).
function matchVenue(v, p) {
  var a = norm(v.name), b = norm(p.name);
  if (!a || !b) return false;
  if (a === b) return true;                                  // 완전일치 → 지역 무관
  if (p.region && v.region && v.region !== p.region) return false;
  var sh = a.length <= b.length ? a : b, lo = a.length <= b.length ? b : a;
  return sh.length >= 4 && lo.indexOf(sh) >= 0;              // 포함 매칭(접두/접미/중간)
}

// 잡음(비-식장) 이름 컷 — dedupe.js와 동일 기준
var JUNK = /(수산|축산|농산|주차|충전소|홀딩스|부동산|공인중개|중개사|주유소|정비소|세차장|편의점|약국|치과|한의원|독서실|고시원|찜질|사우나|노래방|pc방|당구|볼링장|네일|세탁소)/i;

function inferType(p) {
  var s = String(p.name || "") + " " + ((p.tags || []).join(" "));
  if (/호텔|hotel/i.test(s)) return "호텔";
  if (/채플|성당|교회/.test(s)) return "채플/성당";
  if (/하우스|house|가든|루프탑|빌라|글라스/i.test(s)) return "하우스웨딩";
  if (/컨벤션|컨벤|convention|타워|플라자|파티움/i.test(s)) return "컨벤션";
  return "일반예식장";
}

// 좌표 없이 신규 식장 생성(이후 geocode가 name+region으로 좌표 채움). map.js는 좌표 없으면 핀 미표시 → 안전.
function makeVenue(p) {
  var v = { name: p.name, region: p.region, type: p.type || inferType(p), meal: null, verified: false, source: p.source, inserted: true };
  if (p.district) v.district = p.district;
  addPrice(v, { meal: p.meal, rental: p.rental, source: p.source });
  if (p.slot) v.slot = p.slot;
  if (p.guarantee) v.guarantee = p.guarantee;
  if (p.tags && p.tags.length) v.tags = p.tags.slice(0, 8);
  if (okPhoto(p.photo)) v.photo = p.photo;
  return v;
}

// 스크랩 결과 1건을 venues에 반영. fill(기존 채움)/insert(신규)/skip(모호)/junk 자동 판단.
// 반환: { status, venue }  status: filled|averaged|dup|invalid|inserted|ambiguous|junk|noregion
function applyScrape(venues, p) {
  if (!p.name || !(p.meal > 0)) return { status: "invalid", venue: null };
  var hit = venues.find(function (v) { return matchVenue(v, p); });
  if (hit) {
    var res = addPrice(hit, { meal: p.meal, rental: p.rental, source: p.source, slot: p.slot, guarantee: p.guarantee });
    if (okPhoto(p.photo) && !hit.photo) hit.photo = p.photo;
    if (p.tags && p.tags.length && !(hit.tags && hit.tags.length)) hit.tags = p.tags.slice(0, 8);
    return { status: res, venue: hit };
  }
  // 매칭 실패 → 지역 무관 이름겹침이 있으면 동일 식장일 수 있어 보류(중복/오기입 방지)
  if (venues.some(function (v) { return nameOverlap(v.name, p.name); })) return { status: "ambiguous", venue: null };
  if (norm(p.name).length < 3 || JUNK.test(p.name)) return { status: "junk", venue: null };
  if (!p.region) return { status: "noregion", venue: null };   // 지역 없으면 지오코딩/집계 불가 → 보류
  var nv = makeVenue(p);
  venues.push(nv);
  return { status: "inserted", venue: nv };
}

// 매칭되는 기존 식장에 "사진만" 채움(가격 없어도). status: photo|had|nomatch|skip
function fillPhoto(venues, p) {
  if (!p.name || !okPhoto(p.photo)) return { status: "skip", venue: null };
  var hit = venues.find(function (v) { return matchVenue(v, { name: p.name, region: p.region }); });
  if (!hit) return { status: "nomatch", venue: null };
  if (hit.photo) return { status: "had", venue: hit };
  hit.photo = p.photo;
  return { status: "photo", venue: hit };
}

module.exports.matchVenue = matchVenue;
module.exports.nameOverlap = nameOverlap;
module.exports.applyScrape = applyScrape;
module.exports.makeVenue = makeVenue;
module.exports.okPhoto = okPhoto;
module.exports.fillPhoto = fillPhoto;
