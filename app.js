/*
 * app.js — 진단기 UI 로직 (입력 수집 → subsidy.js 계산 → 결과 렌더 → 공유/제보)
 * 의존성 0. subsidy.js 가 먼저 로드되어 window.Subsidy 를 제공해야 한다.
 */
(function () {
  'use strict';

  // ── 운영자가 채울 값 ────────────────────────────────────────────
  //  구글폼(제보) 주소. 비워두면 버튼이 안내 문구를 띄운다.
  //  give-to-get: 폼에 견적/결제 내역을 받고, 응답 시트를 실결제가 데이터로 사용.
  var REPORT_FORM_URL = ''; // 예: 'https://forms.gle/xxxxxxxx'
  // ────────────────────────────────────────────────────────────

  var S = window.Subsidy;
  var $ = function (sel) { return document.querySelector(sel); };

  var state = { registered: null, income: null, ears: null, grade: '', quote: 0 };

  // 등급 셀렉트 채우기
  (function fillGrades() {
    var sel = $('#grade');
    S.GRADES.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.key;
      o.textContent = g.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.grade = sel.value; });
  })();

  // 세그먼트 버튼 토글
  document.querySelectorAll('.seg').forEach(function (seg) {
    var group = seg.getAttribute('data-group');
    seg.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        var v = btn.getAttribute('data-val');
        if (group === 'registered') state.registered = (v === 'yes');
        if (group === 'income') state.income = v;
        if (group === 'ears') state.ears = v;
      });
    });
  });

  $('#quote').addEventListener('input', function (e) {
    state.quote = Number(e.target.value) || 0;
  });

  function won(n) {
    return (Math.round(n) || 0).toLocaleString('ko-KR') + '원';
  }

  // 진단 실행
  $('#run').addEventListener('click', function () {
    if (state.registered === null) { alert('청각장애 등록 여부를 선택해주세요.'); return; }
    if (!state.income) { alert('건강보험 자격 구분을 선택해주세요.'); return; }
    if (!state.ears) { alert('구매 형태(한쪽/양쪽)를 선택해주세요.'); return; }

    var sub = S.calcSubsidy({
      registered: state.registered,
      incomeType: state.income,
      bothEars: state.ears === 'both',
    });

    var rows = $('#rows');
    rows.innerHTML = '';

    var verdictBox = $('#verdictBox');
    var barWrap = $('#barWrap');
    barWrap.style.display = 'none';

    // 견적 진단 (견적 입력 시)
    var dx = null;
    if (state.quote > 0) {
      dx = S.diagnoseQuote({
        quote: state.quote,
        gradeKey: state.grade || 'standard',
        subsidy: sub.perEar,
      });
    }

    // 상단 verdict
    verdictBox.className = 'verdict ' + verdictClass(dx, sub);
    $('#verdictLabel').textContent = verdictLabel(dx, sub);
    $('#verdictBig').textContent = verdictBig(dx, sub);
    $('#verdictSub').textContent = verdictSub(dx, sub);

    // 금액 표
    if (sub.eligible) {
      addRow(rows, '받을 수 있는 지원금 (' + (sub.ears === 2 ? '양측' : '편측') + ')', won(sub.total));
    } else {
      addRow(rows, '정부지원금', '청각장애 등록 후 가능');
    }
    if (state.quote > 0) {
      var ears = sub.ears || (state.ears === 'both' ? 2 : 1);
      var totalQuote = state.quote * ears;
      addRow(rows, '내 견적 (' + (ears === 2 ? '양측' : '편측') + ')', won(totalQuote));
      var oop = Math.max(0, totalQuote - sub.total);
      addRow(rows, '실제 내야 할 돈', won(oop), true);
    }

    // 적정성 막대
    if (dx) {
      barWrap.style.display = 'block';
      var span = dx.fairHigh - dx.fairLow;
      var pos = span > 0 ? (state.quote - dx.fairLow) / span : 0.5;
      pos = Math.max(0, Math.min(1, pos));
      $('#barPin').style.left = (pos * 100) + '%';
      $('#barLow').textContent = won(dx.fairLow);
      $('#barHigh').textContent = won(dx.fairHigh);
      $('#barNote').textContent = dx.grade.label + ' 시중가 범위 안에서 내 견적의 위치예요.';
    }

    $('#resultNote').textContent = sub.note || '';
    var res = $('#result');
    res.classList.add('show');
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function addRow(tbody, label, val, isTotal) {
    var tr = document.createElement('tr');
    if (isTotal) tr.className = 'total';
    var td1 = document.createElement('td'); td1.textContent = label;
    var td2 = document.createElement('td'); td2.textContent = val;
    tr.appendChild(td1); tr.appendChild(td2);
    tbody.appendChild(tr);
  }

  function verdictClass(dx, sub) {
    if (dx) {
      if (dx.verdict === 'cheap' || dx.verdict === 'fair') return 'cheap';
      if (dx.verdict === 'high') return 'high';
      if (dx.verdict === 'overpriced') return 'overpriced';
    }
    return 'info';
  }
  function verdictLabel(dx, sub) {
    if (dx) return '내 견적 진단';
    return sub.eligible ? '받을 수 있는 지원금' : '지원 자격 안내';
  }
  function verdictBig(dx, sub) {
    if (dx) {
      return ({
        cheap: '잘 받으셨어요 👍',
        fair: '적정 가격이에요',
        high: '다소 비싼 편 ⚠️',
        overpriced: '과다 청구 의심 🚨',
      })[dx.verdict] || '';
    }
    if (sub.eligible) return won(sub.total);
    return '먼저 등록이 필요해요';
  }
  function verdictSub(dx, sub) {
    if (dx) {
      if (dx.verdict === 'overpriced' || dx.verdict === 'high') {
        return '같은 등급 평균(' + won(dx.midPrice) + ')보다 ' + won(dx.savingVsHigh) + ' 높아요.';
      }
      return '같은 등급 평균 ' + won(dx.midPrice) + ' 수준 이하예요.';
    }
    if (sub.eligible) return '실제 견적가를 넣으면 비싼지까지 알려드려요.';
    return '청각장애 진단 → 등록 후 5년에 1회 지원받을 수 있어요.';
  }

  // 결과 카드 공유 (캔버스 → 이미지)
  $('#share').addEventListener('click', function () {
    var canvas = buildShareCard();
    canvas.toBlob(function (blob) {
      var file = new File([blob], 'hearing-aid-result.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '보청기 진단 결과' }).catch(function () {});
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'hearing-aid-result.png';
        a.click();
      }
    });
  });

  function buildShareCard() {
    var c = document.createElement('canvas');
    c.width = 800; c.height = 800;
    var x = c.getContext('2d');
    x.fillStyle = '#1657c0'; x.fillRect(0, 0, 800, 800);
    x.fillStyle = '#ffffff';
    x.font = 'bold 40px sans-serif';
    x.fillText('보청기 진단 결과', 60, 110);
    x.font = '26px sans-serif';
    x.fillStyle = 'rgba(255,255,255,.9)';
    wrap(x, $('#verdictBig').textContent, 60, 200, 680, 40);
    x.fillStyle = '#ffffff';
    x.font = '22px sans-serif';
    var rows = document.querySelectorAll('#rows tr');
    var y = 320;
    rows.forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      x.fillStyle = 'rgba(255,255,255,.85)';
      x.fillText(tds[0].textContent, 60, y);
      x.fillStyle = '#ffffff'; x.font = 'bold 22px sans-serif';
      x.textAlign = 'right'; x.fillText(tds[1].textContent, 740, y);
      x.textAlign = 'left'; x.font = '22px sans-serif';
      y += 56;
    });
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.font = '18px sans-serif';
    x.fillText('지원금·실부담금 1분 진단', 60, 740);
    return c;
  }
  function wrap(ctx, text, x0, y0, maxw, lh) {
    var words = (text || '').split(''), line = '', y = y0;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i];
      if (ctx.measureText(test).width > maxw) { ctx.fillText(line, x0, y); line = words[i]; y += lh; }
      else line = test;
    }
    ctx.fillText(line, x0, y);
  }

  // 제보 버튼
  $('#reportBtn').addEventListener('click', function (e) {
    if (REPORT_FORM_URL) {
      this.setAttribute('href', REPORT_FORM_URL);
      return; // 새 탭으로 폼 열림
    }
    e.preventDefault();
    alert('제보 폼 준비 중이에요. 곧 열립니다! (운영자: app.js의 REPORT_FORM_URL을 채워주세요)');
  });

  $('#aboutLink').addEventListener('click', function (e) {
    e.preventDefault();
    alert('계산 근거: 건강보험 보장구(보청기) 급여 기준\n· 청각장애 등록자, 5년 1회\n· 편측 기준액 131만원\n· 일반 117.9만원(90%) / 차상위·수급 131만원(100%)\n· 만 19세 미만 양측\n수치는 제도 변경 시 갱신됩니다.');
  });
})();
