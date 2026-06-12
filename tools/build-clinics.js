/*
 * build-clinics.js — 심평원 비급여 공개데이터(CSV) → clinics.json 변환기
 *
 * 사용:
 *   node tools/build-clinics.js <심평원CSV경로> [좌표캐시.json]
 *
 * 왜 좌표캐시가 필요한가:
 *   심평원 데이터에는 '요양기관소재지(주소)'만 있고 위/경도가 없다.
 *   지도에 찍으려면 주소→좌표(지오코딩)가 필요하다. 외부 지오코딩 API
 *   (카카오/네이버/구글)로 한 번 변환해 { "주소": {lat,lng} } 형태의
 *   캐시 파일을 만들어 두고 여기에 넘기면 된다. 캐시에 없는 주소는 건너뛴다.
 *
 * 데이터 받는 곳:
 *   · 공공데이터포털 건강보험심사평가원_비급여진료비정보조회서비스
 *     https://www.data.go.kr/data/15001700/openapi.do  (발급키 필요)
 *   · 또는 심평원 보건의료빅데이터개방시스템 opendata.hira.or.kr 파일 다운로드
 *   주의: OpenAPI는 '병원급 이상'이 기본이라, 치과'의원' 임플란트가 필요하면
 *        의원급 비급여 공개 파일(심평원 npay)을 받아야 한다.
 *
 * 컬럼 매핑은 파일 헤더에 맞춰 COLS에서 조정한다.
 */
'use strict';
var fs = require('fs');

// ── 헤더명 매핑(파일에 맞게 수정) ──────────────────────────
var COLS = {
  name:   ['병원명', '요양기관명', '요양기관'],
  addr:   ['요양기관소재지', '주소', '소재지'],
  item:   ['비급여항목명', '항목명', '비급여명칭'],
  code:   ['비급여코드', '코드'],
  priceMin: ['최소가격', '최저가격', '금액', '가격'],
  priceMax: ['최대비용', '최대가격'],
};
var IMPLANT_KEYWORD = '임플란트'; // 항목명 필터
var PRICE_USE = 'min';            // 대표가격: 'min' | 'max'

function parseCSV(text) {
  // 큰따옴표 지원 최소 CSV 파서
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
  for (var i = 0; i < names.length; i++) {
    var idx = header.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function regionOf(addr) {
  var p = (addr || '').trim().split(/\s+/);
  return p.slice(0, 2).join(' ');
}

function main() {
  var csvPath = process.argv[2];
  var cachePath = process.argv[3];
  if (!csvPath) {
    console.error('사용법: node tools/build-clinics.js <심평원CSV> [좌표캐시.json]');
    process.exit(1);
  }
  var text = fs.readFileSync(csvPath, 'utf8');
  var rows = parseCSV(text).filter(function (r) { return r.length > 1; });
  var header = rows.shift().map(function (h) { return h.trim(); });

  var iName = pick(header, COLS.name);
  var iAddr = pick(header, COLS.addr);
  var iItem = pick(header, COLS.item);
  var iMin = pick(header, COLS.priceMin);
  var iMax = pick(header, COLS.priceMax);
  if (iName < 0 || iAddr < 0) {
    console.error('필수 컬럼(병원명/주소)을 못 찾음. 헤더:', header.join(' | '));
    process.exit(1);
  }

  var cache = {};
  if (cachePath && fs.existsSync(cachePath)) cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  var items = [], skipped = 0, noGeo = 0;
  rows.forEach(function (r) {
    var item = (iItem >= 0 ? r[iItem] : '') || '';
    if (IMPLANT_KEYWORD && item.indexOf(IMPLANT_KEYWORD) === -1) { skipped++; return; }
    var addr = (r[iAddr] || '').trim();
    var priceStr = (PRICE_USE === 'max' && iMax >= 0 ? r[iMax] : r[iMin]) || '';
    var price = parseInt(priceStr.replace(/[^0-9]/g, ''), 10);
    if (!addr || !price) { skipped++; return; }
    var geo = cache[addr];
    if (!geo) { noGeo++; return; }
    items.push({
      name: (r[iName] || '').trim(),
      region: regionOf(addr),
      addr: addr,
      lat: geo.lat, lng: geo.lng,
      implant: price,
      material: '',
      sample: false,
    });
  });

  var out = {
    asOf: new Date().toISOString().slice(0, 10),
    source: '심평원 비급여 진료비용 공개데이터 변환',
    priceField: '임플란트 ' + PRICE_USE + ' 가격',
    items: items,
  };
  fs.writeFileSync('clinics.json', JSON.stringify(out, null, 2));
  console.log('생성: clinics.json · 항목 ' + items.length
    + '건 (필터제외 ' + skipped + ', 좌표없음 ' + noGeo + ')');
  if (noGeo) console.log('※ 좌표 없는 ' + noGeo + '건은 제외됨 — 좌표캐시(주소→lat/lng)를 보강하세요.');
}

main();
