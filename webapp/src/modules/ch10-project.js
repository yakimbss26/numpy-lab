/* ===========================================================================
 * ch10-project.js — 10장 종합 실습: 관절염 데이터 분석
 * 실습 과제 2번 전체를 살아 있는 대시보드로 만든다.
 * 화면의 모든 숫자는 D.nd('inflammation') 을 ND 엔진으로 그 자리에서 계산한 값이다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* 색 배정 — 모든 장 공통 */
  var C_A = 'var(--s1)';          // 주 계열 / 선택된 것
  var C_B = 'var(--s2)';          // 두 번째 계열
  var C_R = 'var(--s3)';          // 결과
  var C_REF = 'var(--ink-muted)'; // 참고용 배경 계열

  /* ------------------------------------------------------------ 작은 도구 */

  function sc(nd) { return nd.toNested(); }                 // 0차원 ND → 숫자
  function py(v) { return ND.fmtScalar(v, 'float64'); }     // 파이썬 float 표기: 18.0
  function fx(v, n) { return Number(v).toFixed(n === undefined ? 2 : n); }
  function ivals(nd) { return nd.toNested(); }              // 1차원 ND → JS 배열

  /** np.round — 은행가 반올림(round half to even) */
  function npRound(v, dec) {
    dec = dec || 0;
    var f = Math.pow(10, dec), x = v * f;
    var fl = Math.floor(x), diff = x - fl, r;
    if (diff === 0.5) r = (fl % 2 === 0) ? fl : fl + 1;
    else r = Math.round(x);
    return r / f;
  }

  /** 학교에서 배운 반올림(0.5 는 무조건 올림) */
  function schoolRound(v, dec) {
    dec = dec || 0;
    var f = Math.pow(10, dec);
    return Math.floor(v * f + 0.5) / f;
  }

  /** 0~n-1 정수 배열 */
  function seq(n) { var a = [], i; for (i = 0; i < n; i++) a.push(i); return a; }

  /** 1차원 배열을 한 줄 격자로 */
  function rowGrid(nd, opts) {
    opts = opts || {};
    return UI.grid(nd, {
      axisLabels: opts.axisLabels !== false,
      cellSize: opts.cellSize || 28,
      highlight: opts.highlight,
      label: opts.label
    });
  }

  /** 문자열을 정해진 폭으로 (아스키 정렬용) */
  function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function padR(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }
  function bar(n) { var s = ''; while (s.length < n) s += '█'; return s; }

  /** 엔진이 던지는 에러를 학생에게 그대로 보여 준다 */
  function tryBlock(fn) {
    try { return fn(); } catch (e) { return UI.errBlock(e.message); }
  }

  /* ================================================================ 등록 */

  Lab.register({
    id: 'project',
    n: '10',
    title: '종합 실습 — 관절염 데이터 분석',
    blurb: '환자 60명 × 40일의 실제 염증 데이터를 히트맵·곡선·축 비교기로 파헤치고, 첫째 날 평균이 0.0 이라는 사실에서 데이터를 의심하는 법까지 배운다.',
    sim: '전체 히트맵 · 날짜별 평균 곡선 · 환자 탐색기 · 축 방향 비교기',

    render: function (root) {

      /* ---------------------------------------------------------- 데이터 */

      var data = (D && D.nd) ? D.nd('inflammation') : null;
      if (!data) {
        root.appendChild(UI.errBlock(
          '관절염 데이터를 불러오지 못했다. 수업자료/lab_inflammation-01.csv 를 두고 다시 빌드하라.',
          'DataError'));
        return;
      }
      var meta = (D && D.inflammationMeta) || {};
      var nP = data.shape[0], nD = data.shape[1];
      var days = seq(nD), pats = seq(nP);

      /* 자주 쓰는 집계 — 한 번만 계산해 둔다 */
      var gMax = sc(ND.max(data)), gMin = sc(ND.min(data));
      var gMean = sc(ND.mean(data)), gStd = sc(ND.std(data)), gStd1 = sc(ND.std(data, null, 1));
      var dayMean = ND.mean(data, 0), dayMin = ND.min(data, 0), dayMax = ND.max(data, 0);
      var dayMeanV = ivals(dayMean), dayMinV = ivals(dayMin), dayMaxV = ivals(dayMax);
      var patMean = ND.mean(data, 1), patMax = ND.max(data, 1), patStd = ND.std(data, 1);
      var patMeanV = ivals(patMean), patMaxV = ivals(patMax);
      var argDay = ND.argmax(data, 1);              // 각 환자의 최고 염증 날짜
      var peakDay = sc(ND.argmax(dayMean));         // 평균이 가장 높은 날
      var flatArg = sc(ND.argmax(data));            // axis 없는 argmax → 평평한 인덱스
      var flatIdx = data.unravel(flatArg);
      var bestP = sc(ND.argmax(patMean));           // 평균이 가장 높은 환자
      var worstP = sc(ND.argmin(patMean));          // 평균이 가장 낮은 환자
      var top20 = ivals(ND.whereIdx(ND.ops.eq(patMax, gMax)));   // 전체 최댓값을 기록한 환자들

      /* ------------------------------------------------------------ 도입 */

      root.appendChild(el('p', { html:
        '이 장에서는 앞의 아홉 장에서 배운 것을 <b>실제 데이터 하나</b>에 모두 쏟아붓는다. ' +
        '데이터는 관절염 환자에게 신약을 투여한 뒤 기록한 염증 수치다. ' +
        '<b>행이 환자, 열이 날짜</b>이고 헤더 줄이 없다. ' +
        '아래의 모든 숫자·그림은 이 페이지가 방금 계산한 것이므로, 슬라이더를 움직이면 값도 함께 움직인다.' }));

      root.appendChild(UI.table(
        [{ k: 'k', label: '항목' }, { k: 'v', label: '값' }],
        [
          { k: '파일', v: meta.file || 'lab_inflammation-01.csv' },
          { k: '구분자', v: '콤마 (,)' },
          { k: '헤더', v: meta.header ? '있다' : '없다 → skiprows 가 필요 없다' },
          { k: '행 = ' + (meta.rowMeaning || '환자'), v: nP + '명' },
          { k: '열 = ' + (meta.colMeaning || '날짜(day)'), v: nD + '일' }
        ]
      ));

      /* ====================================================== 10.1 히트맵 */

      var h101 = el('h2', { class: 'h-sec', text: '10.1 데이터 한눈에 보기 — 히트맵' });
      root.appendChild(h101);
      root.appendChild(el('p', { html:
        '2400개의 숫자를 눈으로 훑어서는 아무것도 알 수 없다. ' +
        '값의 크기를 <b>색의 진하기</b>로 바꾸면 전체를 한 장의 그림으로 볼 수 있다. ' +
        '아래 히트맵의 한 줄이 환자 한 명의 40일이다. 칸에 마우스를 올리면 정확한 값이 나온다.' }));

      root.appendChild(UI.statRow([
        { k: 'shape', v: ND.shapeStr(data.shape), sub: '환자 × 날짜' },
        { k: 'ndim / size', v: data.ndim + ' / ' + data.size, sub: data.dtype },
        { k: '최댓값', v: py(gMax), sub: 'data.max()' },
        { k: '최솟값', v: py(gMin), sub: 'data.min()' },
        { k: '평균', v: py(gMean), sub: 'data.mean()' },
        { k: '표준편차', v: fx(gStd, 4), sub: 'data.std()  ddof=0' }
      ]));

      var heatBox = UI.heatmap(data, {
        vmin: 0, vmax: 20, rowLabel: '환자', colLabel: 'day', unit: '',
        highlight: function (idx) { return idx[0] === 4; }   // 시작값: 5번째 환자
      });
      root.appendChild(el('div', { style: { maxWidth: '640px' } }, [heatBox]));

      root.appendChild(UI.callout('why',
        '왼쪽 끝(초기)이 하얗고, 가운데(day 20 부근)가 가장 진하고, 오른쪽 끝이 다시 하얘진다. ' +
        '염증이 <b>올랐다가 정점을 지나 가라앉는</b> 것이다. ' +
        '세로로 봐도 무늬가 거의 같다 — 60명이 서로 비슷한 궤적을 그린다는 뜻이다. ' +
        '그리고 <b>맨 왼쪽 한 줄은 60명 전원이 완전히 하얗다</b>. 이 사실은 10.2 의 마지막 문제에서 다시 다룬다.'));

      root.appendChild(UI.callout('tip',
        '히트맵은 "대충 보는 그림"이 아니라 <b>데이터 검사 도구</b>다. 줄무늬·빈 줄·갑작스러운 경계가 보이면 ' +
        '측정이 잘못됐거나 데이터가 인공적으로 만들어졌다는 신호다. 아래 <b>표로 보기</b>를 열면 같은 값을 숫자로 확인할 수 있다.'));

      /* ================================================= 10.2 과제 2번 풀기 */

      root.appendChild(el('h2', { class: 'h-sec', text: '10.2 과제 2번 — 직접 풀어 보기' }));
      root.appendChild(el('p', { html:
        '아래 카드는 과제 2번을 순서대로 따라간다. 각 카드의 <b>문제를 읽고 코드를 먼저 스스로 써 본 다음</b> ' +
        '펼쳐진 코드와 결과를 비교하라. 결과 블록의 숫자는 미리 적어 둔 값이 아니라 이 페이지가 계산한 값이다.' }));

      /* ---------------------------------------------------- 2-1 데이터 로딩 */

      root.appendChild(UI.card({
        kicker: '과제 2-1',
        title: '데이터 로딩',
        note: '문제: 파일 <code>lab_inflammation-01.csv</code> 를 프로그램에 로딩하시오. ' +
              '— 먼저 스스로 써 보라. <b>구분자는 무엇이고 헤더는 몇 줄인가?</b>',
        body: [
          UI.code(
            'import numpy as np\n\n' +
            "data = np.loadtxt('수업자료/lab_inflammation-01.csv', delimiter=',')\n\n" +
            'print(type(data))\n' +
            'print(data.dtype, data.shape)'),
          UI.out("<class 'numpy.ndarray'>\n" + data.dtype + ' ' + ND.shapeStr(data.shape)),
          el('p', { html:
            '<b>delimiter=\',\' 를 빼면 안 된다.</b> 기본 구분자는 공백이므로, 콤마로 붙어 있는 한 줄 전체를 ' +
            '하나의 수로 읽으려다 실패한다. 이 파일은 <b>첫 줄부터 이미 데이터</b>여서 <code>skiprows</code> 가 필요 없다.' }),
          UI.code("print(data[0, :8])   # 첫 줄이 정말 데이터인지 확인"),
          UI.out(ND.format(data.idx('0, :8'))),
          el('p', { html:
            '<code>np.loadtxt</code> 의 기본 <code>dtype</code> 은 <b>float</b> 이다. 파일에 정수만 적혀 있어도 ' +
            '<code>float64</code> 로 읽히므로 0 이 <code>0.</code> 으로 나온다. 정수로 받고 싶으면 ' +
            '<code>dtype=int</code> 를 직접 지정한다.' }),
          UI.callout('ver',
            '수업 노트북 셀 156 은 <code>np.loadtxt(\'ratings.csv\', delimiter=\',\', skiprows=1)</code> 로 되어 있지만 ' +
            '실제 파일명은 <code>ra.csv</code> 다. 그 파일은 첫 줄이 열 이름' +
            '(<code>' + UI.esc((D.ratingsMeta && D.ratingsMeta.header) || 'userId,movieId,rating,timestamp') + '</code>)이라 ' +
            '<code>skiprows=1</code> 이 반드시 필요하다. 반대로 <b>이 관절염 파일에 skiprows=1 을 쓰면 0번 환자가 사라져</b> ' +
            'shape 가 ' + ND.shapeStr(data.shape) + ' 이 아니라 ' + ND.shapeStr(data.idx('1:').shape) + ' 이 된다. ' +
            '파일을 열어 첫 줄을 눈으로 확인하는 습관이 답이다.')
        ]
      }));

      /* ---------------------------------------------------- 2-2 형태 확인 */

      var first5 = data.idx(':5');
      var lastRow = data.idx('-1');
      var sameLast = sc(ND.all(ND.ops.eq(lastRow, data.idx('-1, :')))) ? 'True' : 'False';

      root.appendChild(UI.card({
        kicker: '과제 2-2',
        title: '데이터의 형태 확인 — shape, 처음 5행, 마지막 행',
        note: '문제: ① shape 를 확인하고 ② 처음 5행을 출력하고 ③ 맨 마지막 행을 출력하시오. ' +
              '과제 원본에는 <code>data[-1,]</code> 라고 적혀 있다. <b>뒤의 콤마는 무슨 뜻일까?</b>',
        body: [
          UI.code(
            'print(data.shape)     # 형태\n' +
            'print(data[:5])       # 처음 5행\n' +
            'print(data[-1])       # 마지막 행\n' +
            'print(data[-1,])      # 위와 완전히 같다'),
          UI.out(ND.shapeStr(data.shape)),
          UI.shapeBadge(data),

          el('h3', { class: 'h-sub', text: '처음 5행 — data[:5]' }),
          el('p', { class: 'small', html:
            '환자 0~4 의 40일. 왼쪽·오른쪽 끝이 작고 가운데가 큰 것이 숫자로도 보인다. ' +
            '(격자는 좌우로 밀어서 볼 수 있다)' }),
          UI.grid(first5, { axisLabels: true, cellSize: 26,
            highlight: function () { return 'a'; } }),
          UI.shapeBadge(first5),
          UI.code('print(data[:5, :8])   # 40열 전부는 너무 길다 — 앞 8일만'),
          UI.out(ND.format(data.idx(':5, :8'))),

          el('h3', { class: 'h-sub', text: '마지막 행 — data[-1]' }),
          rowGrid(lastRow, { highlight: function () { return 'a'; } }),
          UI.shapeBadge(lastRow),
          UI.code('print(np.array_equal(data[-1], data[-1,]))'),
          UI.out(sameLast),
          el('p', { html:
            '대괄호 안의 <code>-1,</code> 는 파이썬에서 <b>원소가 하나인 튜플</b> <code>(-1,)</code> 이다. ' +
            '<code>data[-1]</code> 도 내부에서 똑같이 <code>(-1,)</code> 로 감싸지므로 두 표기는 완전히 같다. ' +
            '즉 뒤의 콤마는 아무 일도 하지 않는다. 헷갈리니 <code>data[-1]</code> 로 쓰자.' }),

          UI.callout('why',
            '<code>data[:5]</code> 는 shape ' + ND.shapeStr(first5.shape) + ' 로 <b>2차원</b>이고, ' +
            '<code>data[-1]</code> 은 shape ' + ND.shapeStr(lastRow.shape) + ' 로 <b>1차원</b>이다. ' +
            '슬라이스(<code>:5</code>)는 축을 남기고, 정수(<code>-1</code>)는 축을 없앤다. ' +
            '이 차이는 5장에서 다룬 그대로다. 결과를 다시 인덱싱할 때 반드시 걸리는 지점이다.'),

          el('h3', { class: 'h-sub', text: '보너스: 범위를 넘어가면?' }),
          UI.code('print(data[60:].shape)   # 슬라이싱: 에러가 아니다\nprint(data[60])          # 정수 인덱싱: 에러'),
          UI.out(ND.shapeStr(data.idx('60:').shape), { label: 'data[60:] 의 shape' }),
          tryBlock(function () { return UI.out(ND.format(data.idx('60'))); }),
          el('p', { class: 'small', html:
            '환자가 60명이니 마지막 인덱스는 59 다. <b>슬라이싱은 넘쳐도 빈 배열</b>을 주고, ' +
            '<b>정수 인덱싱은 IndexError</b> 를 낸다. 빈 배열이 조용히 지나가는 쪽이 더 위험하다.' })
        ]
      }));

      /* ------------------------------------------------- 2-2-4 전체 2배 */

      var dbl = ND.ops.mul(data, 2);
      var shareDbl = ND.sharesMemory(data, dbl) ? 'True' : 'False';
      var shareView = ND.sharesMemory(data, data.idx(':5')) ? 'True' : 'False';

      root.appendChild(UI.card({
        kicker: '과제 2-2-4',
        title: '모든 값을 2배로 — 그리고 "5번째 환자"',
        note: '문제: 모든 값을 2배로 만든 데이터를 <code>double_data</code> 에 저장한 뒤 ' +
              '<b>5번째 환자</b>의 데이터를 출력하시오. — 5번째 환자의 인덱스는 몇 번인가?',
        body: [
          UI.code(
            'double_data = data * 2          # 반복문 없이 2400개가 한 번에\n' +
            'print(double_data[4])           # 5번째 환자 = 인덱스 4\n' +
            'print(double_data.shape, double_data.dtype)'),
          UI.out(ND.format(dbl.idx('4, :10')) + '   ...(앞 10일만)\n' +
                 ND.shapeStr(dbl.shape) + ' ' + dbl.dtype),

          el('p', { class: 'small', html: '<b>data[4]</b> (원본, 파랑) 과 <b>double_data[4]</b> (결과, 초록)' }),
          rowGrid(data.idx('4'), { highlight: function () { return 'a'; } }),
          rowGrid(dbl.idx('4'), { highlight: function () { return 'r'; }, axisLabels: false }),

          UI.callout('trap',
            '<b>"5번째 환자"는 <code>data[5]</code> 가 아니다.</b> 사람은 1부터 세지만 인덱스는 0부터 센다. ' +
            '1번째 환자 = <code>data[0]</code>, … , 5번째 환자 = <code>data[4]</code>. ' +
            '이 한 칸 차이로 과제의 답이 통째로 달라진다. 문제에 "몇 번째"라는 말이 나오면 반드시 1을 빼라.'),

          UI.table(
            [{ k: 'e', label: '식' }, { k: 'm', label: '뜻' }, { k: 'v', label: '앞 6일 값' }],
            [
              { e: 'data[4]', m: '5번째 환자 ← 정답', v: ND.format(data.idx('4, :6')) },
              { e: 'data[5]', m: '6번째 환자 ← 흔한 오답', v: ND.format(data.idx('5, :6')) }
            ]
          ),

          UI.callout('tip',
            '<code>data * 2</code> 는 원본을 고치지 않고 <b>새 배열</b>을 만든다: ' +
            '<code>np.shares_memory(data, double_data)</code> → <b>' + shareDbl + '</b>. ' +
            '반면 <code>data[:5]</code> 는 슬라이싱이므로 <b>뷰</b>다: ' +
            '<code>np.shares_memory(data, data[:5])</code> → <b>' + shareView + '</b>. ' +
            '뷰를 고치면 원본이 함께 바뀐다.')
        ]
      }));

      /* --------------------------------------------------- 2-2-5 루트 값 */

      var sq4 = ND.unop(data.idx('4'), Math.sqrt);
      var sq4r = ND.unop(data.idx('4, :10'), function (v) { return npRound(Math.sqrt(v), 2); });
      var roundRows = [0.5, 1.5, 2.5, 3.5].map(function (v) {
        return { v: py(v), np: py(npRound(v, 0)), s: py(schoolRound(v, 0)) };
      });
      roundRows.push({ v: '2.675 (소수 2자리)', np: fx(npRound(2.675, 2), 2), s: fx(schoolRound(2.675, 2), 2) });

      root.appendChild(UI.card({
        kicker: '과제 2-2-5',
        title: '루트 값 — 그리고 출력이 너무 길 때',
        note: '문제: 각 데이터의 루트 값을 계산하고 5번째 환자의 데이터를 출력하시오. ' +
              '— <code>np.sqrt</code> 결과는 소수점이 길다. 어떻게 읽기 좋게 만들까?',
        body: [
          UI.code(
            'sqrt_data = np.sqrt(data)                 # 2400개 전부 한 번에\n' +
            'print(np.round(sqrt_data[4, :10], 2))     # 소수 2자리로 반올림\n\n' +
            'np.set_printoptions(precision=2)          # 출력 형식만 바꾸는 방법\n' +
            'print(sqrt_data[4, :10])'),
          UI.out(ND.format(sq4r)),
          el('p', { class: 'small', html:
            '5번째 환자의 40일 루트 값 (소수 2자리로 표시). 첫 칸은 <b>√0 = 0</b> 이다.' }),
          rowGrid(sq4, {
            cellSize: 32,
            highlight: function (idx, v) { return v === 0 ? 'x' : 'r'; },
            label: function (idx, v) { return fx(v, 2); }
          }),
          el('p', { html:
            '<code>np.round</code> 는 <b>값을 실제로 바꾼</b> 새 배열을 만든다. ' +
            '<code>np.set_printoptions(precision=2)</code> 는 <b>보이는 모습만</b> 바꾸고 값은 그대로 둔다. ' +
            '계산에 쓸 값이라면 반올림하지 말고 출력 옵션만 바꾸는 것이 안전하다.' }),
          UI.callout('ver',
            '<b><code>np.round</code> 는 학교에서 배운 반올림이 아니다.</b> 정확히 .5 일 때 ' +
            '<b>가까운 짝수</b>로 보낸다(round half to even). 아래 표를 보라. ' +
            '통계에서 반올림 편향을 없애기 위한 규칙이고, NumPy 2.x 에서도 그대로다. ' +
            '맨 아래 줄은 다른 이유다 — 2.675 는 2진 소수로 정확히 표현되지 않아 실제로는 2.675 보다 살짝 작다.'),
          UI.table(
            [{ k: 'v', label: '값' }, { k: 'np', label: 'np.round', num: true },
             { k: 's', label: '학교 반올림(.5 는 올림)', num: true }],
            roundRows
          )
        ]
      }));

      /* --------------------------------------------------- 2-3-1 통계값 */

      var statFns = [
        { f: 'data.max()', d: '최댓값', v: py(gMax) },
        { f: 'data.min()', d: '최솟값', v: py(gMin) },
        { f: 'data.mean()', d: '평균', v: py(gMean) },
        { f: 'data.std()', d: '표준편차 (ddof=0)', v: String(gStd) },
        { f: 'data.std(ddof=1)', d: '표본표준편차', v: String(gStd1) },
        { f: 'data.var()', d: '분산', v: String(sc(ND.variance(data))) },
        { f: 'np.median(data)', d: '중앙값', v: py(sc(ND.median(data))) },
        { f: 'np.percentile(data, 25)', d: '1사분위수', v: py(sc(ND.percentile(data, 25))) },
        { f: 'np.percentile(data, 75)', d: '3사분위수', v: py(sc(ND.percentile(data, 75))) },
        { f: 'np.ptp(data)', d: '최댓값 − 최솟값', v: py(sc(ND.ptp(data))) }
      ];

      root.appendChild(UI.card({
        kicker: '과제 2-3-1',
        title: '전체 데이터의 통계값',
        note: '문제: 모든 데이터를 대상으로 최댓값·최솟값·표준편차를 출력하시오. ' +
              '— f-string 으로 라벨과 값을 함께 찍어 보라.',
        body: [
          UI.code(
            "print(f'최대값: {data.max()}')\n" +
            "print(f'최소값: {data.min()}')\n" +
            "print(f'표준편차: {data.std()}')\n" +
            "print(f'평균: {data.mean()}')"),
          UI.out(
            '최대값: ' + py(gMax) + '\n' +
            '최소값: ' + py(gMin) + '\n' +
            '표준편차: ' + String(gStd) + '\n' +
            '평균: ' + py(gMean)),
          el('p', { html:
            '중앙값이 ' + py(sc(ND.median(data))) + ' 인데 평균이 ' + py(gMean) + ' 다. ' +
            '평균이 중앙값보다 크면 <b>큰 값 쪽으로 꼬리가 긴</b> 분포다 — 대부분의 칸은 작은 값이고, ' +
            '정점 부근의 큰 값들이 평균을 끌어올린다. 히트맵의 하얀 면적이 넓었던 것과 같은 이야기다.' }),
          UI.table(
            [{ k: 'f', label: '함수' }, { k: 'd', label: '뜻' }, { k: 'v', label: '값', num: true }],
            statFns),
          UI.callout('ver',
            '<b><code>np.std</code> 의 기본은 <code>ddof=0</code></b> — 모표준편차다(' + fx(gStd, 4) + '). ' +
            '통계 시간에 배운 표본표준편차는 <code>data.std(ddof=1)</code>(' + fx(gStd1, 4) + ') 로, ' +
            'n 대신 n−1 로 나눈다. 값이 조금 다르니 과제에 어느 쪽을 썼는지 밝혀 두어라.<br>' +
            '또 NumPy 2.0 부터 셀 마지막 줄에 <code>data.max()</code> 만 두면 <code>np.float64(20.0)</code> 처럼 보인다. ' +
            '<code>print()</code> 나 f-string 을 쓰면 <code>20.0</code> 으로 나온다 — 값이 달라진 게 아니라 표기만 바뀐 것이다.')
        ]
      }));

      /* ---------------------------------------- 2-3-2 첫 번째 환자의 최댓값 */

      var p0 = data.idx('0');
      var p0max = sc(ND.max(p0)), p0arg = sc(ND.argmax(p0));
      var axis1max = ND.max(data, 1), axis0max = ND.max(data, 0);

      root.appendChild(UI.card({
        kicker: '과제 2-3-2',
        title: '첫 번째 환자의 최대 염증 수치',
        note: '문제: 첫 번째 환자(patient 0)의 염증 수치 최댓값을 출력하시오. ' +
              '— 방법이 두 가지 있다. 그리고 <b>비슷하게 생겼지만 완전히 틀린 방법</b>도 있다.',
        body: [
          UI.code(
            "print(f'첫번째 환자(patient 0)의 최대 염증수치: {data[0].max()}')\n" +
            'print(data.max(axis=1)[0])   # 같은 값\n' +
            'print(data.max(axis=0)[0])   # 전혀 다른 값!'),
          UI.out(
            '첫번째 환자(patient 0)의 최대 염증수치: ' + py(p0max) + '\n' +
            py(sc(axis1max.idx('0'))) + '\n' +
            py(sc(axis0max.idx('0')))),
          el('p', { class: 'small', html:
            '0번 환자의 40일. 최댓값 <b>' + py(p0max) + '</b> 이 나온 날은 <b>day ' + p0arg + '</b> 다(노란 칸).' }),
          rowGrid(p0, {
            cellSize: 30,
            highlight: function (idx, v) { return idx[0] === p0arg ? 'x' : 'a'; }
          }),
          UI.callout('why',
            '<code>data.max(axis=1)</code> 은 <b>각 행을 하나로 줄인다</b> → shape ' +
            ND.shapeStr(axis1max.shape) + ' (환자마다 하나). 그 0번은 "환자 0의 최댓값" = ' + py(p0max) + '.<br>' +
            '<code>data.max(axis=0)</code> 은 <b>각 열을 하나로 줄인다</b> → shape ' +
            ND.shapeStr(axis0max.shape) + ' (날짜마다 하나). 그 0번은 "첫째 날의 최댓값" = ' +
            py(sc(axis0max.idx('0'))) + ' — 환자와는 아무 상관이 없다.<br>' +
            '<b>결과의 shape 를 보면 어느 쪽인지 즉시 알 수 있다.</b> 60 이면 환자별, 40 이면 날짜별이다(8장).')
        ]
      }));

      /* ------------------------------------- 2-3-3 각 환자의 최고 염증 날짜 */

      var whereTop = ND.whereIdx(ND.ops.eq(patMax, gMax));

      root.appendChild(UI.card({
        kicker: '과제 2-3-3',
        title: '각 환자가 가장 아팠던 날짜',
        note: '문제: 각 환자에 대해 가장 높은 염증 수치를 기록한 날을 찾으시오. ' +
              '— 과제 힌트에는 <code>np.argmax(data)</code> 라고 적혀 있다. <b>그대로 쓰면 함정이다.</b>',
        body: [
          UI.code(
            'days = data.argmax(axis=1)   # 환자마다 최댓값이 나온 열(날짜) 번호\n' +
            'print(days.shape)\n' +
            'print(days[:12])'),
          UI.out(ND.shapeStr(argDay.shape) + '\n' + ND.format(argDay.idx(':12'))),
          el('p', { class: 'small', html:
            '환자 60명 각각의 "가장 아팠던 날". 위 숫자는 환자 번호, 칸 안 숫자는 날짜다. ' +
            '대부분 day 18~22 에 몰려 있다 — 히트맵에서 가운데가 진했던 그 구간이다.' }),
          rowGrid(argDay, { cellSize: 30, highlight: function () { return 'r'; } }),

          UI.callout('trap',
            '<b><code>np.argmax(data)</code> 를 axis 없이 쓰면 안 된다.</b> ' +
            'axis 를 주지 않으면 NumPy 는 2차원 배열을 <b>한 줄로 평평하게 펴서</b> 센 인덱스 하나를 돌려준다. ' +
            '여기서는 <b>' + flatArg + '</b> 이 나온다. 이것은 환자 번호도, 날짜도, 염증 수치도 아니다. ' +
            '"60개의 답"이 필요한 문제인데 값이 하나만 나왔다면 그 순간 잘못된 것이다.'),
          UI.code(
            'print(np.argmax(data))                                  # 평평한 인덱스\n' +
            'print(np.unravel_index(np.argmax(data), data.shape))    # (행, 열) 로 되돌리기\n' +
            'print(data[' + flatIdx[0] + ', ' + flatIdx[1] + '])'),
          UI.out(
            String(flatArg) + '\n' +
            '(' + flatIdx[0] + ', ' + flatIdx[1] + ')\n' +
            py(data.get(flatIdx))),
          el('p', { html:
            '평평한 인덱스 ' + flatArg + ' = ' + flatIdx[0] + ' × ' + nD + ' + ' + flatIdx[1] + ' 이므로 ' +
            '<code>np.unravel_index</code> 를 쓰면 <b>환자 ' + flatIdx[0] + ', day ' + flatIdx[1] + '</b> 로 되돌아온다. ' +
            '거기 값은 전체 최댓값 ' + py(gMax) + ' 다. 즉 axis 없는 argmax 는 "<b>전체에서 가장 큰 칸 하나</b>"를 찾는 도구다.' }),
          UI.callout('tip',
            'argmax 는 최댓값이 여러 번 나와도 <b>가장 먼저 나온 위치만</b> 알려 준다. ' +
            '실제로 ' + py(gMax) + ' 을 기록한 환자는 ' + top20.length + '명(' + top20.join(', ') + ')인데 ' +
            'argmax 는 ' + flatIdx[0] + '번만 말해 준다. 전부 찾으려면 <code>np.where</code> 를 쓴다.'),
          UI.code('print(np.where(data.max(axis=1) == data.max())[0])'),
          UI.out(ND.format(whereTop))
        ]
      }));

      /* ----------------------------------- 2-3-4 첫째 날 평균 = 데이터 의심 */

      var col0 = data.idx(':, 0');
      var col0mean = sc(ND.mean(col0));
      var allZero = sc(ND.all(ND.ops.eq(col0, 0))) ? 'True' : 'False';
      var earlyRows = [];
      for (var dd = 0; dd < 10; dd++) {
        earlyRows.push({
          d: dd,
          mn: py(dayMinV[dd]), mx: py(dayMaxV[dd]), av: fx(dayMeanV[dd], 3)
        });
      }

      root.appendChild(UI.card({
        kicker: '과제 2-3-4',
        title: '첫째 날 모든 환자의 평균 — 그리고 데이터를 의심하기',
        note: '문제: 첫째 날 모든 환자의 염증 수치 평균을 구하시오. ' +
              '— 값을 구한 뒤 <b>그 값을 믿을 수 있는지</b> 한 번 더 생각해 보라.',
        body: [
          UI.code(
            "print(f'첫째날 모든 환자의 염증수치 평균: {data[:, 0].mean()}')\n" +
            'print(np.all(data[:, 0] == 0))     # 정말 전원이 0인가?'),
          UI.out(
            '첫째날 모든 환자의 염증수치 평균: ' + py(col0mean) + '\n' + allZero),
          el('p', { class: 'small', html:
            '0번 열 전체 — 환자 ' + nP + '명의 첫째 날 값이다. 예외가 <b>하나도</b> 없다.' }),
          rowGrid(col0, { cellSize: 26, highlight: function () { return 'x'; } }),

          UI.callout('why',
            '평균이 0.0 인 이유는 간단하다. <b>' + nP + '명 전원이 정확히 0</b> 이기 때문이다. ' +
            '그런데 실제 임상 데이터에서 이런 일은 거의 불가능하다. 환자마다 체질과 상태가 달라 ' +
            '투여 직전의 기준선도 흩어져 있어야 한다. 60명이 한 명도 빠짐없이 소수점까지 정확히 0 이라면, ' +
            '측정값이 아니라 <b>누군가 0에서 시작하도록 만든 값</b>이다.'),
          el('p', { html:
            '증거를 하나 더 보자. 날짜별 최솟값·최댓값을 앞 10일만 늘어놓으면, ' +
            '<b>최댓값이 날짜 번호와 정확히 같다</b>. 자연에서 이런 계단은 나오지 않는다.' }),
          UI.table(
            [{ k: 'd', label: 'day', num: true }, { k: 'mn', label: '최솟값', num: true },
             { k: 'mx', label: '최댓값', num: true }, { k: 'av', label: '평균', num: true }],
            earlyRows),
          UI.callout('trap',
            '이 데이터로 "신약이 효과가 있다"고 결론 내릴 수 없다. ' +
            '비교할 <b>대조군</b>이 없고, 곡선이 올랐다 내려오는 모양도 약 때문인지 병의 자연 경과인지 구분할 수 없다. ' +
            '게다가 첫째 날이 전원 0 이라는 것은 이 파일이 <b>교육용 합성(synthetic) 데이터</b>라는 강한 단서다.'),
          UI.callout('tip',
            '<b>데이터를 의심하라.</b> 분석의 첫 단계는 평균을 구하는 것이 아니라 ' +
            '"이 숫자는 어디서 어떻게 왔는가"를 확인하는 것이다. ' +
            '이상하게 깔끔한 값(전원 0, 정확한 계단, 딱 떨어지는 최댓값)은 계산을 잘한 신호가 아니라 ' +
            '<b>데이터를 다시 보라는 신호</b>다. 이 습관이 분석 기술보다 먼저다.', '이 장의 결론')
        ]
      }));

      /* ============================================ 시뮬레이터 ① 평균 곡선 */

      root.appendChild(el('h2', { class: 'h-sec', text: '시뮬레이터 ① 날짜별 평균 곡선' }));

      var sim1 = { band: 'off', day: peakDay };
      var s1Chart = el('div');
      var s1Day = el('div');

      function s1RebuildChart() {
        UI.clear(s1Chart);
        var series = [{ name: '날짜별 평균  mean(axis=0)', values: dayMeanV, color: C_A }];
        if (sim1.band === 'on') {
          series.push({ name: '날짜별 최댓값  max(axis=0)', values: dayMaxV, color: C_B });
          series.push({ name: '날짜별 최솟값  min(axis=0)', values: dayMinV, color: C_R });
        }
        s1Chart.appendChild(UI.lineChart({
          series: series, x: days, xLabel: 'day', yLabel: '평균 염증',
          height: 260, yMin: 0, markMax: sim1.band === 'off',
          fmtY: function (v) { return fx(v, 1); }
        }));
      }

      function s1RebuildDay() {
        UI.clear(s1Day);
        var d = sim1.day;
        var col = data.idx(':, ' + d);
        var n15 = sc(ND.sum(ND.ops.ge(col, 15)));
        s1Day.appendChild(UI.statRow([
          { k: '고른 날짜', v: 'day ' + d, sub: 'data[:, ' + d + ']' },
          { k: '평균', v: fx(dayMeanV[d], 3), sub: nP + '명 평균' },
          { k: '최솟값 / 최댓값', v: py(dayMinV[d]) + ' / ' + py(dayMaxV[d]), sub: 'min / max' },
          { k: '15 이상인 환자', v: n15 + '명', sub: '(data[:, ' + d + '] >= 15).sum()' }
        ]));
        s1Day.appendChild(el('p', { class: 'small', html:
          'day ' + d + ' 의 환자 ' + nP + '명 값. <b>15 이상</b>인 칸을 노랑으로 표시했다.' }));
        s1Day.appendChild(rowGrid(col, {
          cellSize: 26,
          highlight: function (idx, v) { return v >= 15 ? 'x' : 'a'; }
        }));
      }

      root.appendChild(UI.card({
        kicker: '시뮬레이터',
        title: '하루씩 들여다보는 평균 곡선',
        note: '<code>data.mean(axis=0)</code> 은 <b>날짜마다 60명의 평균</b>을 낸다 → 길이 ' + nD + ' 곡선. ' +
              '밴드를 켜면 같은 날짜의 최솟값·최댓값이 함께 나온다. 슬라이더로 날짜를 골라 그날 60명을 직접 보라.',
        body: [
          UI.code(
            'day_mean = data.mean(axis=0)    # shape (' + nD + ',)  ← 날짜별\n' +
            'day_min  = data.min(axis=0)\n' +
            'day_max  = data.max(axis=0)'),
          UI.controls([
            UI.seg({
              label: '보기', value: 'off',
              options: [{ value: 'off', label: '평균만' }, { value: 'on', label: '최소·최대 밴드까지' }],
              onChange: function (v) { sim1.band = v; s1RebuildChart(); }
            }),
            UI.slider({
              label: '날짜', min: 0, max: nD - 1, step: 1, value: peakDay,
              format: function (v) { return 'day ' + v; },
              onChange: function (v) { sim1.day = v; s1RebuildDay(); }
            })
          ]),
          s1Chart,
          el('p', { html:
            '곡선은 day 0 의 ' + py(dayMeanV[0]) + ' 에서 시작해 <b>day ' + peakDay + ' 에서 ' +
            fx(dayMeanV[peakDay], 3) + ' 로 정점</b>을 찍고, 마지막 날 ' + fx(dayMeanV[nD - 1], 3) +
            ' 까지 내려온다. 신약을 투여한 뒤 염증이 올랐다가 가라앉는 모양으로 읽힌다. ' +
            '다만 10.2 에서 봤듯이 이 데이터는 합성일 가능성이 크므로 <b>모양은 읽고 결론은 아껴 두자.</b>' }),
          s1Day
        ]
      }));

      s1RebuildChart();
      s1RebuildDay();

      /* ========================================== 시뮬레이터 ② 환자 탐색기 */

      root.appendChild(el('h2', { class: 'h-sec', text: '시뮬레이터 ② 환자 탐색기' }));

      var sim2 = { p: 4 };
      var s2Host = el('div');
      var heatMarked = 4;

      function markHeatRow(p) {
        var i, cells = heatBox.querySelectorAll('.heat-c[data-r="' + heatMarked + '"]');
        for (i = 0; i < cells.length; i++) {
          cells[i].style.outline = '';
          cells[i].style.outlineOffset = '';
          cells[i].style.zIndex = '';
          cells[i].style.position = '';
        }
        cells = heatBox.querySelectorAll('.heat-c[data-r="' + p + '"]');
        for (i = 0; i < cells.length; i++) {
          cells[i].style.outline = '2px solid var(--s2)';
          cells[i].style.outlineOffset = '-1px';
          cells[i].style.zIndex = '2';
          cells[i].style.position = 'relative';
        }
        heatMarked = p;
      }

      function s2Rebuild() {
        UI.clear(s2Host);
        var p = sim2.p;
        var row = data.idx(String(p));
        var vals = ivals(row);
        var mx = sc(ND.max(row)), am = sc(ND.argmax(row));
        var mean = sc(ND.mean(row)), std = sc(ND.std(row));
        var n15 = sc(ND.sum(ND.ops.ge(row, 15)));

        s2Host.appendChild(UI.statRow([
          { k: '환자', v: 'data[' + p + ']', sub: (p + 1) + '번째 환자' },
          { k: '최고 염증', v: py(mx), sub: 'day ' + am + ' (argmax)' },
          { k: '40일 평균', v: fx(mean, 3), sub: '전체 평균 ' + fx(gMean, 3) },
          { k: '표준편차', v: fx(std, 3), sub: 'ddof=0' },
          { k: '15 이상인 날', v: n15 + '일', sub: '(row >= 15).sum()' }
        ]));

        s2Host.appendChild(el('p', { class: 'small', html:
          '이 환자의 40일을 히트맵 한 줄로 — 10.1 의 큰 히트맵에서 뽑아낸 그 줄이다.' }));
        s2Host.appendChild(el('div', { style: { maxWidth: '640px' } }, [
          UI.heatmap(data.idx(p + ':' + (p + 1)), {
            vmin: 0, vmax: 20, rowLabel: '환자 ' + p, colLabel: 'day', tableView: false
          })
        ]));

        s2Host.appendChild(UI.lineChart({
          series: [
            { name: '환자 ' + p, values: vals, color: C_A },
            { name: '전체 평균(참고)', values: dayMeanV, color: C_REF }
          ],
          x: days, xLabel: 'day', yLabel: '염증',
          height: 240, yMin: 0, yMax: 20,
          fmtY: function (v) { return fx(v, 1); }
        }));

        s2Host.appendChild(el('p', { class: 'small', html:
          '원본 40개 값. <b>최댓값 칸(day ' + am + ')</b> 을 노랑으로 표시했다.' }));
        s2Host.appendChild(rowGrid(row, {
          cellSize: 30,
          highlight: function (idx, v) { return idx[0] === am ? 'x' : 'a'; }
        }));

        markHeatRow(p);
      }

      var pSlider = UI.slider({
        label: '환자', min: 0, max: nP - 1, step: 1, value: 4,
        format: function (v) { return 'data[' + v + ']'; },
        onChange: function (v) { sim2.p = v; s2Rebuild(); }
      });

      root.appendChild(UI.card({
        kicker: '시뮬레이터',
        title: '환자 한 명을 골라 보기',
        note: '환자를 고르면 그 사람의 40일 곡선과 통계가 다시 계산된다. ' +
              '<b>y축은 0~20 으로 고정</b>했다 — 환자를 바꿔도 눈금이 그대로여서 서로 직접 비교할 수 있다. ' +
              '눈금이 매번 달라지는 그래프는 비교에 쓸 수 없다.',
        body: [
          UI.controls([pSlider]),
          UI.chips([
            { value: '4', label: '5번째 환자 = data[4]' },
            { value: '0', label: '첫 번째 환자 = data[0]' },
            { value: String(bestP), label: '평균이 가장 높은 환자 = data[' + bestP + ']' },
            { value: String(worstP), label: '평균이 가장 낮은 환자 = data[' + worstP + ']' },
            { value: String(flatIdx[0]), label: '전체 최댓값을 기록한 환자 = data[' + flatIdx[0] + ']' }
          ], function (v) {
            sim2.p = parseInt(v, 10);
            pSlider.setValue(sim2.p);
            s2Rebuild();
          }),
          UI.callout('trap',
            '프리셋 첫 버튼을 다시 보라. <b>"5번째 환자"는 <code>data[4]</code></b> 다. ' +
            '슬라이더 라벨이 <code>data[4]</code> 인데 통계 카드에는 "5번째 환자"라고 적힌다 — ' +
            '이 두 표기를 나란히 두고 익숙해져라.'),
          UI.code(
            'row = data[p]                 # p번 환자의 40일, shape (' + nD + ',)\n' +
            'row.max(), row.argmax()       # 최고 염증과 그 날짜\n' +
            'row.mean(), row.std()\n' +
            '(row >= 15).sum()             # 15 이상인 날 수'),
          s2Host,
          UI.btn('10.1 히트맵에서 이 환자 줄 보기', function () {
            heatBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          })
        ]
      }));

      s2Rebuild();

      /* ========================================= 시뮬레이터 ③ 축 방향 비교 */

      root.appendChild(el('h2', { class: 'h-sec', text: '시뮬레이터 ③ 축 방향 비교기 (axis=0 vs axis=1)' }));

      var AXIS_FN = {
        mean: { label: '평균 mean', call: function (a, ax) { return ND.mean(a, ax); },
          i0: '그 날짜에 모인 ' + nP + '명의 평균 염증', i1: '그 환자의 ' + nD + '일 평균 염증' },
        max: { label: '최댓값 max', call: function (a, ax) { return ND.max(a, ax); },
          i0: '그 날짜에 가장 높았던 값', i1: '그 환자가 기록한 최고 염증' },
        std: { label: '표준편차 std', call: function (a, ax) { return ND.std(a, ax); },
          i0: '그 날짜에 환자들이 얼마나 흩어져 있었나', i1: '그 환자의 40일이 얼마나 출렁였나' },
        argmax: { label: '최댓값의 위치 argmax', call: function (a, ax) { return ND.argmax(a, ax); },
          i0: '그 날짜에 가장 높았던 <b>환자 번호</b>', i1: '그 환자가 가장 아팠던 <b>날짜</b>' }
      };

      var sim3 = { fn: 'mean' };
      var s3Host = el('div');

      function axisPanel(ax, spec) {
        var r = spec.call(data, ax);
        var vals = ivals(r);
        var head = ax === 0
          ? 'axis=0 — 행(환자)을 뭉갠다 → 날짜별'
          : 'axis=1 — 열(날짜)을 뭉갠다 → 환자별';
        return el('div', { style: {
          border: '1px solid var(--border)', borderRadius: '10px', padding: '.9rem 1rem'
        } }, [
          el('div', { class: 'card-title', text: head }),
          UI.code('r = data.' + (sim3.fn === 'argmax' ? 'argmax' : sim3.fn) + '(axis=' + ax + ')\nr.shape'),
          UI.shapeBadge(r),
          el('p', { class: 'small', html:
            '<b>결과 길이 ' + r.shape[0] + '</b> — 한 칸의 뜻: ' + (ax === 0 ? spec.i0 : spec.i1) }),
          el('p', { class: 'small', html:
            '앞 6개: <code>' + UI.esc(ND.format(r.idx(':6'))) + '</code>' })
        ]);
      }

      function s3Rebuild() {
        UI.clear(s3Host);
        var spec = AXIS_FN[sim3.fn];
        var r0 = spec.call(data, 0), r1 = spec.call(data, 1);

        s3Host.appendChild(el('div', { style: {
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.9rem'
        } }, [axisPanel(0, spec), axisPanel(1, spec)]));

        s3Host.appendChild(el('h3', { class: 'h-sub',
          text: 'axis=0 → 길이 ' + r0.shape[0] + ' (날짜별)' }));
        s3Host.appendChild(UI.lineChart({
          series: [{ name: spec.label + ' · axis=0', values: ivals(r0), color: C_A }],
          x: days, xLabel: 'day', yLabel: spec.label, height: 200, yMin: 0
        }));

        s3Host.appendChild(el('h3', { class: 'h-sub',
          text: 'axis=1 → 길이 ' + r1.shape[0] + ' (환자별)' }));
        s3Host.appendChild(UI.lineChart({
          series: [{ name: spec.label + ' · axis=1', values: ivals(r1), color: C_B }],
          x: pats, xLabel: '환자', yLabel: spec.label, height: 200, yMin: 0
        }));
      }

      root.appendChild(UI.card({
        kicker: '시뮬레이터',
        title: '같은 데이터, 같은 함수, 다른 축',
        note: '함수를 바꿔 보라. <b>어느 축을 지웠는지</b>에 따라 결과의 길이와 뜻이 완전히 달라진다. ' +
              '두 곡선의 모양이 닮은 데가 하나도 없다는 것을 눈으로 확인하라.',
        body: [
          UI.controls([
            UI.select({
              label: '함수', value: 'mean',
              options: Object.keys(AXIS_FN).map(function (k) {
                return { value: k, label: AXIS_FN[k].label };
              }),
              onChange: function (v) { sim3.fn = v; s3Rebuild(); }
            })
          ]),
          s3Host,
          UI.callout('why',
            '<b>축을 지정하면 그 축이 사라진다.</b> ' + ND.shapeStr(data.shape) + ' 에서 ' +
            'axis=0 을 지우면 (' + nD + ',) 가 남고, axis=1 을 지우면 (' + nP + ',) 가 남는다. ' +
            '그래서 결과의 shape 만 보면 "날짜별인가 환자별인가"를 바로 판단할 수 있다. ' +
            '축 번호를 외우려 하지 말고 <b>결과 길이가 ' + nD + '이냐 ' + nP + '이냐</b>로 확인하는 습관을 들여라(8장).'),
          el('p', { html: '없는 축을 지우려 하면 어떻게 되는지도 보자. 2차원 배열의 축은 0 과 1 뿐이다.' }),
          UI.code('data.mean(axis=2)'),
          tryBlock(function () { return UI.out(ND.format(ND.mean(data, 2))); })
        ]
      }));

      s3Rebuild();

      /* ================================================ 10.3 스스로 해 보기 */

      root.appendChild(el('h2', { class: 'h-sec', text: '10.3 스스로 해 보기' }));
      root.appendChild(el('p', { html:
        '과제에 없는 질문 다섯 개다. <b>먼저 스스로 코드를 써 본 다음</b> 제목을 눌러 풀이를 펼쳐라. ' +
        '숫자는 모두 이 페이지가 계산한 값이니, 네 결과와 다르면 어느 쪽이 틀렸는지 따져 보면 된다.' }));

      /* ① 환자별 평균으로 정규화 */
      var rowMeanK = ND.reduce(data, { op: 'mean', axis: 1, keepdims: true });
      var norm = ND.ops.sub(data, rowMeanK);
      var normRowMeanMax = 0;
      (function () {
        var v = ivals(ND.mean(norm, 1)), i;
        for (i = 0; i < v.length; i++) normRowMeanMax = Math.max(normRowMeanMax, Math.abs(v[i]));
      })();

      root.appendChild(UI.fold(
        '① 각 환자의 평균을 0으로 맞추기 (정규화) — data - data.mean(axis=1, keepdims=True)',
        el('div', null, [
          el('p', { html:
            '환자마다 체질이 달라 기준선이 다르다면, 각자의 평균을 빼서 <b>변화만</b> 남기는 것이 공정하다. ' +
            '먼저 <code>keepdims</code> 없이 해 보면 왜 필요한지 알 수 있다.' }),
          UI.code('data - data.mean(axis=1)      # 이게 될까?'),
          tryBlock(function () { return UI.out(ND.format(ND.ops.sub(data, ND.mean(data, 1)))); }),
          el('p', { html:
            '<code>data.mean(axis=1)</code> 의 shape 는 ' + ND.shapeStr(ND.mean(data, 1).shape) + ' 다. ' +
            '브로드캐스팅은 shape 를 <b>오른쪽부터</b> 맞추므로 (' + nP + ',) 는 (1, ' + nP + ') 로 취급된다. ' +
            '그러면 열 개수가 ' + nD + ' 대 ' + nP + ' 로 어긋나 실패한다(7장).' }),
          UI.code(
            'rm = data.mean(axis=1, keepdims=True)   # shape ' + ND.shapeStr(rowMeanK.shape) + '\n' +
            'norm = data - rm                        # (' + nP + ', ' + nD + ') - (' + nP + ', 1)\n' +
            'print(rm.shape, norm.shape)'),
          UI.out(ND.shapeStr(rowMeanK.shape) + ' ' + ND.shapeStr(norm.shape)),
          el('p', { html:
            '<code>keepdims=True</code> 가 축을 <b>길이 1로 남겨</b> ' + ND.shapeStr(rowMeanK.shape) + ' 를 만든다. ' +
            '길이 1인 축은 브로드캐스팅이 늘려 주므로 각 행에 그 행의 평균이 빠진다.' }),
          el('p', { class: 'small', html:
            '0번 환자의 정규화 결과. 음수(평균보다 낮은 날)와 양수(높은 날)로 갈린다.' }),
          rowGrid(norm.idx('0'), {
            cellSize: 34,
            highlight: function (idx, v) { return v >= 0 ? 'r' : 'dim'; },
            label: function (idx, v) { return fx(v, 1); }
          }),
          UI.code('print(np.abs(norm.mean(axis=1)).max())   # 모든 행의 평균이 0인가?'),
          UI.out(String(normRowMeanMax)),
          UI.callout('tip',
            '정확히 0 이 아니라 ' + normRowMeanMax.toExponential(2) + ' 같은 아주 작은 수가 나온다. ' +
            '실수를 2진수로 저장하는 컴퓨터에서는 이 정도 오차가 정상이다. ' +
            '<b>부동소수점 값을 <code>== 0</code> 으로 비교하지 마라.</b> ' +
            '<code>np.allclose(norm.mean(axis=1), 0)</code> 처럼 "충분히 가까운가"를 물어야 한다.')
        ])
      ));

      /* ② 심한 환자 세기 */
      var any15 = ND.any(ND.ops.ge(data, 15), 1);
      var n15p = sc(ND.sum(any15));
      var nCell15 = sc(ND.sum(ND.ops.ge(data, 15)));
      var nMax20 = sc(ND.sum(ND.ops.eq(patMax, gMax)));
      var noneOver = ivals(ND.whereIdx(ND.ops.not(any15)));

      root.appendChild(UI.fold(
        '② 염증이 15 이상 기록된 환자는 몇 명인가? 최댓값이 20인 환자는?',
        el('div', null, [
          UI.code(
            'mask = data >= 15                  # (' + nP + ', ' + nD + ') 불리언 배열\n' +
            'print(mask.sum())                  # 15 이상인 칸의 개수\n' +
            'print(mask.any(axis=1).sum())      # 그런 날이 한 번이라도 있는 환자 수\n' +
            'print((data.max(axis=1) == 20).sum())   # 최댓값이 20인 환자 수'),
          UI.out(String(nCell15) + '\n' + String(n15p) + '\n' + String(nMax20)),
          el('p', { html:
            '<b>불리언 배열의 <code>sum()</code> 은 True 의 개수</b>다(True=1, False=0). ' +
            '<code>any(axis=1)</code> 을 먼저 걸면 "환자 단위"로 줄어들어 ' + nP + '명 중 <b>' + n15p + '명</b>이 남는다. ' +
            'axis 를 빼고 <code>mask.sum()</code> 만 하면 칸 개수 ' + nCell15 + ' 가 나와 질문과 다른 답이 된다.' }),
          UI.code('print(np.where(~(data >= 15).any(axis=1))[0])   # 15 이상이 한 번도 없던 환자'),
          UI.out(ND.format(ND.whereIdx(ND.ops.not(any15)))),
          el('p', { html:
            (noneOver.length === 1
              ? '단 한 명(' + noneOver[0] + '번 환자)만 40일 동안 15 이상을 기록하지 않았다. '
              : noneOver.length + '명이 15 이상을 기록하지 않았다. ') +
            '전체 최댓값 ' + py(gMax) + ' 을 찍은 환자는 ' + nMax20 + '명(' + top20.join(', ') + ')이다. ' +
            '<b>"심한 환자"의 기준을 무엇으로 잡느냐에 따라 답이 달라진다</b>는 것이 요점이다.' })
        ])
      ));

      /* ③ 앞 20일 vs 뒤 20일 */
      var half = Math.floor(nD / 2);
      var firstH = data.idx(':, 0:' + half), secondH = data.idx(':, ' + half + ':' + nD);
      var m1 = sc(ND.mean(firstH)), m2 = sc(ND.mean(secondH));

      root.appendChild(UI.fold(
        '③ 앞 ' + half + '일과 뒤 ' + half + '일의 평균을 비교하라 (np.hsplit 또는 슬라이싱)',
        el('div', null, [
          UI.code(
            'first, second = np.hsplit(data, 2)     # 열을 반으로 쪼갠다\n' +
            '# 슬라이싱으로 똑같이:\n' +
            'first  = data[:, :' + half + ']\n' +
            'second = data[:, ' + half + ':]\n' +
            'print(first.shape, second.shape)\n' +
            'print(first.mean(), second.mean())'),
          UI.out(
            ND.shapeStr(firstH.shape) + ' ' + ND.shapeStr(secondH.shape) + '\n' +
            String(m1) + ' ' + String(m2)),
          el('p', { html:
            '뒤 ' + half + '일 평균(' + fx(m2, 4) + ')이 앞 ' + half + '일(' + fx(m1, 4) + ')보다 ' +
            fx(m2 - m1, 4) + ' 만큼 높다. 차이가 작아서 "뒤쪽이 더 심하다"고 말하기 어렵다 — ' +
            '<b>정점(day ' + peakDay + ')이 뒤쪽 구간의 맨 앞에 걸려 있기 때문</b>이다. ' +
            '구간을 어디서 자르느냐가 결론을 바꾼다는 뜻이고, 이런 자르기는 항상 근거를 밝혀야 한다.' }),
          UI.callout('tip',
            '<code>np.hsplit(data, 2)</code> 는 <b>사본이 아니라 뷰</b>를 준다. ' +
            '쪼갠 조각을 고치면 원본이 바뀐다. 안전하게 만지려면 <code>.copy()</code> 를 붙여라.')
        ])
      ));

      /* ④ 환자별 평균의 분포 */
      var pmMin = Math.min.apply(null, patMeanV), pmMax = Math.max.apply(null, patMeanV);
      var binW = 0.25;
      var lo = Math.floor(pmMin / binW) * binW, hi = Math.ceil(pmMax / binW) * binW;
      var nb = Math.round((hi - lo) / binW);
      var counts = new Array(nb);
      (function () {
        var i, b;
        for (i = 0; i < nb; i++) counts[i] = 0;
        for (i = 0; i < patMeanV.length; i++) {
          b = Math.floor((patMeanV[i] - lo) / binW);
          if (b < 0) b = 0;
          if (b >= nb) b = nb - 1;
          counts[b]++;
        }
      })();
      var histText = (function () {
        var lines = [], i;
        lines.push(padR('구간', 14) + '│ 환자 수');
        lines.push('──────────────┼' + '──────────────────────');
        for (i = 0; i < nb; i++) {
          lines.push(padL(fx(lo + i * binW, 2), 5) + ' ~ ' + padL(fx(lo + (i + 1) * binW, 2), 5) +
            ' │ ' + padR(bar(counts[i]), 18) + padL(counts[i], 2) + '명');
        }
        return lines.join('\n');
      })();
      var meanOfMeans = sc(ND.mean(patMean));

      root.appendChild(UI.fold(
        '④ 환자별 평균은 어떻게 흩어져 있나? (히스토그램)',
        el('div', null, [
          UI.code(
            'pm = data.mean(axis=1)          # 환자별 40일 평균, shape (' + nP + ',)\n' +
            'print(pm.min(), pm.max())\n' +
            'print(pm.mean(), data.mean())   # 두 값이 같은 이유를 생각해 보라\n' +
            'counts, edges = np.histogram(pm, bins=np.arange(' + fx(lo, 2) + ', ' +
              fx(hi + binW, 2) + ', ' + binW + '))'),
          UI.out(
            String(pmMin) + ' ' + String(pmMax) + '\n' +
            String(meanOfMeans) + ' ' + String(gMean)),
          UI.ascii(histText),
          el('p', { html:
            '환자 ' + nP + '명의 평균이 <b>' + fx(pmMin, 3) + ' ~ ' + fx(pmMax, 3) +
            '</b> 안에만 들어 있다. 개인차라기엔 너무 좁다 — 10.2 에서 얻은 "합성 데이터" 심증을 하나 더 뒷받침한다. ' +
            '그리고 <code>pm.mean()</code> 과 <code>data.mean()</code> 이 같은 이유는 ' +
            '<b>모든 환자의 관측 일수가 똑같이 ' + nD + '일</b>이기 때문이다. ' +
            '환자마다 일수가 달랐다면 "평균의 평균"은 전체 평균과 달라진다.' }),
          UI.callout('ver',
            '실제 데이터라면 결측치가 섞여 있다. NumPy 에서 결측치는 <code>np.nan</code> 으로 표시하고 ' +
            '<code>np.nanmean</code>·<code>np.nanmax</code> 처럼 nan 을 건너뛰는 함수를 쓴다. ' +
            '이때 <b>NumPy 2.0 에서 <code>np.NaN</code>, <code>np.Inf</code>, <code>np.float_</code>, ' +
            '<code>np.int</code> 는 삭제됐다.</b> 옛 자료의 <code>np.NaN</code> 을 그대로 실행하면 ' +
            '<code>AttributeError</code> 가 난다 — 소문자 <code>np.nan</code>, <code>np.inf</code> 를 써라. ' +
            '참고로 <code>nan</code> 은 자기 자신과도 같지 않아서 <code>np.nan == np.nan</code> 이 False 다. ' +
            '반드시 <code>np.isnan</code> 으로 검사한다.')
        ])
      ));

      /* ⑤ 가장 심했던 / 가벼웠던 환자 */
      var bestByMax = sc(ND.argmax(patMax));

      root.appendChild(UI.fold(
        '⑤ 가장 심했던 환자와 가장 가벼웠던 환자를 찾아라',
        el('div', null, [
          UI.code(
            'pm = data.mean(axis=1)\n' +
            "print('평균 최고:', pm.argmax(), pm.max())\n" +
            "print('평균 최저:', pm.argmin(), pm.min())\n" +
            "print('최댓값 기준 1등:', data.max(axis=1).argmax())"),
          UI.out(
            '평균 최고: ' + bestP + ' ' + String(patMeanV[bestP]) + '\n' +
            '평균 최저: ' + worstP + ' ' + String(patMeanV[worstP]) + '\n' +
            '최댓값 기준 1등: ' + bestByMax),
          UI.lineChart({
            series: [
              { name: '환자 ' + bestP + ' (평균 ' + fx(patMeanV[bestP], 3) + ')', values: ivals(data.idx(String(bestP))), color: C_A },
              { name: '환자 ' + worstP + ' (평균 ' + fx(patMeanV[worstP], 3) + ')', values: ivals(data.idx(String(worstP))), color: C_B }
            ],
            x: days, xLabel: 'day', yLabel: '염증', height: 240, yMin: 0, yMax: 20,
            fmtY: function (v) { return fx(v, 1); }
          }),
          el('p', { html:
            '<b>"가장 심한"은 기준을 정하지 않으면 답이 없다.</b> ' +
            '40일 평균으로 재면 ' + bestP + '번 환자, 최고 기록 하나로 재면 ' + bestByMax + '번 환자다. ' +
            '두 곡선을 보면 평균 1등과 최저가 그렇게까지 다르지도 않다 — 차이가 ' +
            fx(patMeanV[bestP] - patMeanV[worstP], 3) + ' 뿐이다. ' +
            '분석에서 먼저 할 일은 계산이 아니라 <b>"무엇을 기준으로 삼을지 정하고 그것을 밝히는 것"</b>이다.' }),
          UI.callout('tip',
            '합계로 순위를 매기면 평균과 순위가 같다 — 모든 환자가 같은 ' + nD + '일이라 ' +
            '합계는 평균에 ' + nD + '를 곱한 것뿐이기 때문이다. ' +
            '일수가 다른 데이터에서는 <b>합계 순위와 평균 순위가 달라진다.</b>')
        ])
      ));

      /* ================================================ 10.4 과제 체크리스트 */

      root.appendChild(el('h2', { class: 'h-sec', text: '10.4 과제 체크리스트' }));
      root.appendChild(el('p', { html:
        '제출 전에 스스로 점검하라. 막히는 항목이 있으면 오른쪽에 적힌 장으로 돌아가면 된다. ' +
        '장 번호는 왼쪽 목록과 대조해 보라.' }));

      root.appendChild(UI.table(
        [{ k: 'q', label: '과제' }, { k: 'c', label: '점검 항목' }, { k: 'ch', label: '다시 볼 곳' }],
        [
          { q: '1. 속도', c: 'for 루프 · 리스트 컴프리헨션 · NumPy 세 가지를 모두 %timeit 으로 재고 결과를 함께 적었는가', ch: '1장' },
          { q: '1. 속도', c: 'list(range(n)) 만들기를 %timeit 밖으로 빼서, 리스트 생성 시간이 측정에 섞이지 않게 했는가', ch: '1장' },
          { q: '1. 속도', c: 'NumPy 가 빠른 이유를 "한 dtype · 연속 메모리 · C 안에서 도는 루프"로 설명했는가', ch: '1장' },
          { q: '2-1 로딩', c: "delimiter=',' 를 주었고, 헤더가 없으므로 skiprows 를 쓰지 않았는가", ch: '이 장 10.2' },
          { q: '2-2 형태', c: 'shape · 처음 5행 · 마지막 행을 출력했고, 정수 인덱싱은 축을 없애고 슬라이싱은 남긴다는 것을 아는가', ch: '5장' },
          { q: '2-2-4', c: '"5번째 환자"를 data[5] 가 아니라 data[4] 로 썼는가', ch: '5장' },
          { q: '2-2-5', c: 'np.sqrt 결과를 np.round 나 set_printoptions 로 읽기 좋게 만들었는가', ch: '이 장 10.2' },
          { q: '2-3-1 통계', c: '최댓값 · 최솟값 · 표준편차 · 평균을 f-string 으로 출력했고, std 의 ddof 를 확인했는가', ch: '8장' },
          { q: '2-3-2', c: 'data[0].max() 와 data.max(axis=1)[0] 이 같고 data.max(axis=0)[0] 은 다르다는 것을 아는가', ch: '8장' },
          { q: '2-3-3', c: 'argmax 에 axis=1 을 주었는가 (axis 없이 쓰면 평평한 인덱스 하나가 나온다)', ch: '8장' },
          { q: '2-3-4', c: '첫째 날 평균 0.0 을 그냥 적지 않고, 데이터가 합성일 가능성을 함께 적었는가', ch: '이 장 10.2' },
          { q: '추가', c: 'keepdims=True 로 (' + nP + ', 1) 을 만들어 브로드캐스팅했는가', ch: '7장' },
          { q: '3. 수학 함수', c: '함수 5개를 골라 각각 예제 코드와 결과를 붙였는가', ch: '8장' },
          { q: '3. 수학 함수', c: 'np.NaN 처럼 NumPy 2.0 에서 삭제된 이름을 쓰지 않았는가', ch: '이 장 10.3' }
        ]
      ));

      root.appendChild(UI.fold('과제 1 — 속도 비교, 이렇게 쓰면 된다',
        el('div', null, [
          UI.code(
            'import numpy as np\n\n' +
            'iteration = 1000000\n' +
            'scalar = 2\n\n' +
            'def loops(scalar, vector):\n' +
            '    result = []\n' +
            '    for value in vector:\n' +
            '        result.append(value * scalar)\n' +
            '    return result\n\n' +
            'vector = list(range(iteration))   # 측정 밖에서 미리 만든다\n' +
            'arr = np.arange(iteration)\n\n' +
            '%timeit loops(scalar, vector)\n' +
            '%timeit [value * scalar for value in vector]\n' +
            '%timeit arr * scalar'),
          el('p', { html:
            '과제 원본은 <code>%timeit loops(scalar, list(range(iteration)))</code> 로 되어 있다. ' +
            '이러면 <b>리스트 100만 개를 만드는 시간까지</b> 함께 재게 되어 세 방법을 공정하게 비교할 수 없다. ' +
            '재고 싶은 것만 측정 안에 넣어라.' }),
          UI.callout('why',
            'NumPy 가 빠른 이유는 세 가지다. ① 모든 값이 <b>같은 dtype</b> 이라 원소마다 타입을 확인하지 않는다. ' +
            '② 값이 <b>연속된 메모리</b>에 붙어 있어 CPU 가 한꺼번에 읽는다. ' +
            '③ 반복이 파이썬이 아니라 <b>C 안에서</b> 돈다. ' +
            '파이썬 리스트는 원소마다 객체를 따로 두고, 루프마다 타입을 확인하고 객체를 새로 만든다.'),
          UI.callout('trap',
            '배열이 작으면 NumPy 가 오히려 느릴 수 있다. 배열을 만들고 함수를 호출하는 고정 비용이 있기 때문이다. ' +
            '"NumPy 는 항상 빠르다"가 아니라 <b>"데이터가 클 때 압도적으로 빠르다"</b>가 맞는 문장이다.')
        ])
      ));

      var mathBase = ND.arange(1, 7).reshape([2, 3]);
      root.appendChild(UI.fold('과제 3 — 수학 함수 5개, 예제 만들어 보기',
        el('div', null, [
          el('p', { html:
            '<code>a = np.arange(1, 7).reshape(2, 3)</code> 하나로 다섯 개를 보인다. ' +
            '아래는 예시일 뿐이니 <b>다른 함수를 직접 골라</b> 문서에서 찾아 써라 — ' +
            '<code>np.clip</code>, <code>np.abs</code>, <code>np.sign</code>, <code>np.floor</code>, ' +
            '<code>np.ceil</code>, <code>np.prod</code>, <code>np.diff</code>, <code>np.hypot</code> 등이 있다.' }),
          UI.out(ND.format(mathBase), { label: 'a' }),
          UI.table(
            [{ k: 'f', label: '함수' }, { k: 'd', label: '뜻' }, { k: 'v', label: '결과' }],
            [
              { f: 'np.exp(a)', d: 'e의 거듭제곱', v: UI.out(ND.format(ND.unop(mathBase, Math.exp), { precision: 3 }), { label: false }) },
              { f: 'np.log(a)', d: '자연로그', v: UI.out(ND.format(ND.unop(mathBase, Math.log), { precision: 3 }), { label: false }) },
              { f: 'np.sqrt(a)', d: '제곱근', v: UI.out(ND.format(ND.unop(mathBase, Math.sqrt), { precision: 3 }), { label: false }) },
              { f: 'np.power(a, 2)', d: '거듭제곱', v: UI.out(ND.format(ND.ops.pow(mathBase, 2)), { label: false }) },
              { f: 'np.cumsum(a)', d: '누적합(평평하게 펴서)', v: UI.out(ND.format(ND.cumsum(mathBase)), { label: false }) }
            ]
          ),
          UI.callout('tip',
            '<code>np.log(0)</code> 은 에러가 아니라 <code>-inf</code> 를 주고 경고만 띄운다. ' +
            '관절염 데이터에는 0 이 많으니 <code>np.log(data)</code> 를 그대로 쓰면 <code>-inf</code> 가 섞인다. ' +
            '이럴 때는 <code>np.log1p(data)</code>(= log(1+x))를 쓴다.')
        ])
      ));

      /* ==================================================== 마무리 + 퀴즈 */

      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
      root.appendChild(UI.quiz([
        {
          q: '<code>data.argmax(axis=1)</code> 의 결과 shape 는? (data 는 ' +
             ND.shapeStr(data.shape) + ', 행=환자, 열=날짜)',
          choices: [
            '(' + nD + ',) — 날짜마다 하나',
            '(' + nP + ',) — 환자마다 하나',
            '(' + nP + ', ' + nD + ') — 원본과 같다',
            '스칼라 하나'
          ],
          answer: 1,
          explain: '지정한 축이 사라진다. axis=1(날짜 축)을 지우면 (' + nP + ',) 가 남아 <b>환자마다 하나</b>씩 ' +
                   '"가장 아팠던 날짜"가 나온다. (' + nD + ',) 가 나오는 것은 axis=0 이다. ' +
                   '결과 길이가 ' + nP + '이냐 ' + nD + '이냐로 확인하는 습관을 들여라.'
        },
        {
          q: '<code>np.argmax(data)</code> 를 axis 없이 실행하니 <b>' + flatArg +
             '</b> 이 나왔다. 이 값의 정체는?',
          choices: [
            '염증 수치의 최댓값',
            '가장 아팠던 환자의 번호',
            '배열을 한 줄로 펼쳤을 때의 인덱스 — np.unravel_index 로 (' + flatIdx[0] + ', ' + flatIdx[1] + ') 이 된다',
            '15 이상을 기록한 칸의 개수'
          ],
          answer: 2,
          explain: 'axis 를 주지 않으면 배열을 평평하게 펴서 센다. ' + flatArg + ' = ' + flatIdx[0] +
                   ' × ' + nD + ' + ' + flatIdx[1] + ' 이므로 <code>np.unravel_index(' + flatArg +
                   ', data.shape)</code> → (' + flatIdx[0] + ', ' + flatIdx[1] + ') 이고 그 값은 전체 최댓값 ' +
                   py(gMax) + ' 이다. 환자별 답 ' + nP + '개가 필요하면 <code>axis=1</code> 을 반드시 준다.'
        },
        {
          q: '<code>data[:, 0].mean()</code> 이 <b>' + py(col0mean) + '</b> 로 나왔다. 가장 타당한 해석은?',
          choices: [
            '신약이 첫날부터 염증을 완전히 없앴다',
            '' + nP + '명 전원이 정확히 0에서 시작하도록 만들어진 값 — 합성 데이터일 가능성이 높다',
            '첫째 날 데이터가 비어 있어서 NaN 이 0으로 계산됐다',
            'mean 이 axis 를 잘못 받아 계산이 틀렸다'
          ],
          answer: 1,
          explain: '<code>np.all(data[:, 0] == 0)</code> 이 True 다. 실제 임상 데이터에서 60명의 기준선이 ' +
                   '한 명도 예외 없이 정확히 0 일 수는 없다. 날짜별 최댓값이 0,1,2,…,9 로 날짜 번호와 같은 것도 ' +
                   '같은 단서다. 비어 있었다면 loadtxt 단계에서 걸리고, 계산이 틀린 것도 아니다. ' +
                   '<b>깔끔한 숫자를 만나면 먼저 데이터를 의심하라.</b>'
        },
        {
          q: '다음 중 <b>원본 <code>data</code> 가 함께 바뀌는</b> 것은?',
          choices: [
            '<code>double_data = data * 2</code> 를 만든 뒤 <code>double_data[0, 0] = 99</code>',
            '<code>first5 = data[:5]</code> 를 만든 뒤 <code>first5[0, 0] = 99</code>',
            '<code>c = data.copy()</code> 를 만든 뒤 <code>c[0, 0] = 99</code>',
            '<code>s = np.sqrt(data)</code> 를 만든 뒤 <code>s[0, 0] = 99</code>'
          ],
          answer: 1,
          explain: '슬라이싱 <code>data[:5]</code> 는 <b>뷰</b>다 — 같은 메모리를 다른 눈으로 보는 것이라 ' +
                   '고치면 원본도 바뀐다(<code>np.shares_memory</code> → True). ' +
                   '반면 <code>data * 2</code>, <code>np.sqrt(data)</code>, <code>.copy()</code> 는 모두 ' +
                   '<b>새 메모리에 결과를 담은 사본</b>이라 원본과 무관하다. ' +
                   '"연산 결과는 사본, 슬라이싱은 뷰"로 기억하라.'
        }
      ], { id: 'project' }));
    }
  });
})();
