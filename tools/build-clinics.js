/*
 * build-clinics.js — 심평원 비급여 공개데이터(CSV) → clinics.json 변환 + 카카오 지오코딩
 *
 * 사용:
 *   KAKAO_REST_KEY=발급키 node tools/build-clinics.js <심평원CSV경로> [좌표캐시.json]
 *
 *   · 심평원 데이터엔 주소만 있고 좌표가 없다. KAKAO_REST_KEY 가 있으면 주소를
 *     카카오 로컬 API로 자동 지오코딩한다. 결과는 좌표캐시(기본 tools/geocache.json)에
 *     저장돼 다음 실행 때 재사용(호출 절약)된다.
 *   · KAKAO_REST_KEY 없이 실행하면 캐시에 있는 주소만 좌표가 채워지고 나머지는 제외된다.
 *
 * 카카오 REST 키: https://developers.kakao.com → 내 애플리케이션 → REST API 키.
 * 데이터: 공공데이터포털 15001700(병원급 이상) 또는 심평원 의원급 비급여 공개 파일.
 *
 * 컬럼 매핑은 파일 헤더에 맞춰 COLS에서 조정한다.
 */
'use strict';
var fs = require('fs');
var https = require('https');

var COLS = {
  name:   ['병원명', '요양기관명', '요양기관'],
  addr:   ['요양기관소재지', '주소', '소재지'],
  item:   ['비급여항목명', '항목명', '비급여명칭'],
  priceMin: ['최소가격', '최저가격', '금액', '가격'],
  priceMax: ['최대비용', '최대가격'],
};
var IMPLANT_KEYWORD = '임플란트';
var PRICE_USE = 'min'; // 'min' | 'max'
var KAKAO_REST_KEY = process.env.KAKAO_REST_KEY || '';

function parseCSV(text) {
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function pick(header, names) {
  for (var i = 0; i < names.length; i++) { var idx = header.indexOf(names[i]); if (idx !== -1) return idx; }
  return -1;
}
function regionOf(addr) { return (addr || '').trim().split(/\s+/).slice(0, 2).join(' '); }

// 카카오 주소 → 좌표 (주소검색 실패 시 키워드검색 폴백)
function kakaoGeocode(addr) {
  return new Promise(function (resolve) {
    function call(path, parse) {
      var opts = {
        host: 'dapi.kakao.com', path: path,
        headers: { Authorization: 'KakaoAK ' + KAKAO_REST_KEY },
      };
      https.get(opts, function (res) {
        var body = '';
        res.on('data', function (d) { body += d; });
        res.on('end', function () {
          try { resolve(parse(JSON.parse(body))); }
          catch (e) { resolve(null); }
        });
      }).on('error', function () { resolve(null); });
    }
    var q = encodeURIComponent(addr);
    call('/v2/local/search/address.json?query=' + q, function (j) {
      var d = j.documents && j.documents[0];
      if (d) return { lat: parseFloat(d.y), lng: parseFloat(d.x) };
      return '__fallback__';
    });
  }).then(function (r) {
    if (r !== '__fallback__') return r;
    // 키워드 검색 폴백
    return new Promise(function (resolve) {
      var opts = {
        host: 'dapi.kakao.com',
        path: '/v2/local/search/keyword.json?query=' + encodeURIComponent(addr),
        headers: { Authorization: 'KakaoAK ' + KAKAO_REST_KEY },
      };
      https.get(opts, function (res) {
        var body = ''; res.on('data', function (d) { body += d; });
        res.on('end', function () {
          try {
            var j = JSON.parse(body), d = j.documents && j.documents[0];
            resolve(d ? { lat: parseFloat(d.y), lng: parseFloat(d.x) } : null);
          } catch (e) { resolve(null); }
        });
      }).on('error', function () { resolve(null); });
    });
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var csvPath = process.argv[2];
  var cachePath = process.argv[3] || 'tools/geocache.json';
  if (!csvPath) {
    console.error('사용법: KAKAO_REST_KEY=키 node tools/build-clinics.js <심평원CSV> [좌표캐시.json]');
    process.exit(1);
  }
  var text = fs.readFileSync(csvPath, 'utf8');
  var rows = parseCSV(text).filter(function (r) { return r.length > 1; });
  var header = rows.shift().map(function (h) { return h.trim(); });
  var iName = pick(header, COLS.name), iAddr = pick(header, COLS.addr),
      iItem = pick(header, COLS.item), iMin = pick(header, COLS.priceMin), iMax = pick(header, COLS.priceMax);
  if (iName < 0 || iAddr < 0) {
    console.error('필수 컬럼(병원명/주소)을 못 찾음. 헤더:', header.join(' | ')); process.exit(1);
  }

  var cache = {};
  if (fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {} }

  var items = [], skipped = 0, geocoded = 0, noGeo = 0;
  for (var k = 0; k < rows.length; k++) {
    var r = rows[k];
    var item = (iItem >= 0 ? r[iItem] : '') || '';
    if (IMPLANT_KEYWORD && item.indexOf(IMPLANT_KEYWORD) === -1) { skipped++; continue; }
    var addr = (r[iAddr] || '').trim();
    var priceStr = (PRICE_USE === 'max' && iMax >= 0 ? r[iMax] : r[iMin]) || '';
    var price = parseInt(priceStr.replace(/[^0-9]/g, ''), 10);
    if (!addr || !price) { skipped++; continue; }

    var geo = cache[addr];
    if (!geo && KAKAO_REST_KEY) {
      geo = await kakaoGeocode(addr);
      if (geo) { cache[addr] = geo; geocoded++; await sleep(50); }
    }
    if (!geo) { noGeo++; continue; }
    items.push({
      name: (r[iName] || '').trim(), region: regionOf(addr), addr: addr,
      lat: geo.lat, lng: geo.lng, implant: price, material: '', sample: false,
    });
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  fs.writeFileSync('clinics.json', JSON.stringify({
    asOf: new Date().toISOString().slice(0, 10),
    source: '심평원 비급여 진료비용 공개데이터 변환',
    priceField: '임플란트 ' + PRICE_USE + ' 가격',
    items: items,
  }, null, 2));

  console.log('생성: clinics.json · ' + items.length + '건 (신규 지오코딩 ' + geocoded
    + ', 필터제외 ' + skipped + ', 좌표실패 ' + noGeo + ')');
  if (noGeo && !KAKAO_REST_KEY) console.log('※ KAKAO_REST_KEY를 설정하면 좌표를 자동 변환합니다.');
}

main();
