/*
 * implant-app.js — 임플란트 진단기 UI. implant.js(window.Implant) 의존.
 */
(function () {
  'use strict';

  var REPORT_FORM_URL = ''; // 운영자: 구글폼 주소 입력

  var I = window.Implant;
  var $ = function (s) { return document.querySelector(s); };
  var state = { age65: null, coverage: 'general', count: 1, quote: 0, addons: [] };

  // 추가시술 체크박스 생성
  (function fillAddons() {
    var box = $('#addons');
    I.ADDONS.forEach(function (a) {
      var lab = document.createElement('label');
      lab.innerHTML = '<input type="checkbox" value="' + a.key + '"> '
        + a.label + ' <span style="color:var(--muted);margin-left:auto;font-variant-numeric:tabular-nums">'
        + won(a.low) + '~' + won(a.high) + '</span>';
      box.appendChild(lab);
    });
    box.addEventListener('change', function () {
      state.addons = Array.prototype.slice.call(box.querySelectorAll('input:checked'))
        .map(function (c) { return c.value; });
    });
  })();

  document.querySelectorAll('.seg').forEach(function (seg) {
    var group = seg.getAttribute('data-group');
    seg.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        var v = btn.getAttribute('data-val');
        if (group === 'age65') {
          state.age65 = (v === 'yes');
          $('#coverageField').style.display = state.age65 ? 'block' : 'none';
        }
        if (group === 'coverage') state.coverage = v;
      });
    });
  });

  $('#count').addEventListener('input', function (e) { state.count = Number(e.target.value) || 1; });
  $('#quote').addEventListener('input', function (e) { state.quote = Number(e.target.value) || 0; });

  function won(n) { return (Math.round(n) || 0).toLocaleString('ko-KR') + '원'; }

  $('#run').addEventListener('click', function () {
    if (state.age65 === null) { alert('만 65세 이상 여부를 선택해주세요.'); return; }

    var r = I.calcTotal({
      age65: state.age65, coverageType: state.coverage,
      count: state.count, quote: state.quote, addonKeys: state.addons,
    });

    var rows = $('#rows'); rows.innerHTML = '';
    var dx = state.quote > 0 ? r.diagnosis : null;

    $('#verdictBox').className = 'verdict ' + verdictClass(dx);
    $('#verdictLabel').textContent = dx ? '내 견적 진단' : '예상 총비용';
    $('#verdictBig').textContent = verdictBig(dx, r);
    $('#verdictSub').textContent = verdictSub(dx, r);

    // 식립
    if (r.insurance && r.insurance.coveredCount > 0) {
      addRow(rows, '보험 적용 ' + r.insurance.coveredCount + '개 (본인부담)', won(r.insurance.total));
      if (r.insurance.uncoveredCount > 0) {
        addRow(rows, '비급여 ' + r.insurance.uncoveredCount + '개', won(r.perImplant * r.insurance.uncoveredCount));
      }
    } else {
      addRow(rows, '식립·보철 ' + r.count + '개', won(r.fixtureCost));
    }
    // 추가시술
    r.addons.items.forEach(function (a) {
      addRow(rows, a.label, won(a.low) + '~' + won(a.high));
    });
    // 총계
    if (r.totalLow === r.totalHigh) {
      addRow(rows, '예상 총비용', won(r.totalLow), true);
    } else {
      addRow(rows, '예상 총비용', won(r.totalLow) + '~' + won(r.totalHigh), true);
    }

    // 적정성 막대
    var barWrap = $('#barWrap');
    if (dx) {
      barWrap.style.display = 'block';
      var span = dx.fairHigh - dx.fairLow;
      var pos = span > 0 ? (state.quote - dx.fairLow) / span : 0.5;
      pos = Math.max(0, Math.min(1, pos));
      $('#barPin').style.left = (pos * 100) + '%';
      $('#barLow').textContent = won(dx.fairLow);
      $('#barHigh').textContent = won(dx.fairHigh);
      $('#barNote').textContent = '심평원 평균 ' + won(dx.avg) + ' 기준 내 견적의 위치예요.';
    } else { barWrap.style.display = 'none'; }

    $('#resultNote').textContent = r.coveredNote || '추가시술 필요 여부는 치과 검진(CT)으로 확정돼요.';
    var res = $('#result'); res.classList.add('show');
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function addRow(tb, label, val, total) {
    var tr = document.createElement('tr'); if (total) tr.className = 'total';
    var a = document.createElement('td'); a.textContent = label;
    var b = document.createElement('td'); b.textContent = val;
    tr.appendChild(a); tr.appendChild(b); tb.appendChild(tr);
  }

  function verdictClass(dx) {
    if (!dx) return 'info';
    if (dx.verdict === 'cheap' || dx.verdict === 'fair') return 'cheap';
    if (dx.verdict === 'high') return 'high';
    if (dx.verdict === 'overpriced') return 'overpriced';
    return 'info';
  }
  function verdictBig(dx, r) {
    if (dx) return ({ cheap: '잘 받으셨어요 👍', fair: '적정 가격이에요',
      high: '다소 비싼 편 ⚠️', overpriced: '과다 청구 의심 🚨' })[dx.verdict] || '';
    return r.totalLow === r.totalHigh ? won(r.totalLow) : won(r.totalLow) + '~' + won(r.totalHigh);
  }
  function verdictSub(dx, r) {
    if (dx) {
      var d = dx.diffFromAvg;
      if (d > 0) return '심평원 평균보다 1개당 ' + won(d) + ' 높아요.';
      return '심평원 평균(' + won(dx.avg) + ') 이하예요.';
    }
    return '견적가를 넣으면 비싼지까지 진단해드려요.';
  }

  // 공유 카드
  $('#share').addEventListener('click', function () {
    var c = document.createElement('canvas'); c.width = 800; c.height = 800;
    var x = c.getContext('2d');
    x.fillStyle = '#1657c0'; x.fillRect(0, 0, 800, 800);
    x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif';
    x.fillText('임플란트 진단 결과', 60, 110);
    x.font = '28px sans-serif'; x.fillStyle = 'rgba(255,255,255,.92)';
    x.fillText($('#verdictBig').textContent, 60, 190);
    x.font = '22px sans-serif';
    var y = 300;
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      var td = tr.querySelectorAll('td');
      x.fillStyle = 'rgba(255,255,255,.85)'; x.textAlign = 'left'; x.fillText(td[0].textContent, 60, y);
      x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.textAlign = 'right'; x.fillText(td[1].textContent, 740, y);
      x.font = '22px sans-serif'; y += 54;
    });
    x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '18px sans-serif';
    x.fillText('임플란트 견적·추가비용 1분 진단', 60, 750);
    c.toBlob(function (blob) {
      var file = new File([blob], 'implant-result.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '임플란트 진단 결과' }).catch(function () {});
      } else {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'implant-result.png'; a.click();
      }
    });
  });

  $('#reportBtn').addEventListener('click', function (e) {
    if (REPORT_FORM_URL) { this.setAttribute('href', REPORT_FORM_URL); return; }
    e.preventDefault();
    alert('제보 폼 준비 중이에요. 곧 열립니다! (운영자: implant-app.js의 REPORT_FORM_URL을 채워주세요)');
  });
})();
