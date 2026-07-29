/* ===========================================================================
 * ch06-create.js — 6장 "배열을 만드는 여러 방법"
 * 노트북 셀 57~89 대응: 생성 함수(arange·linspace·zeros·ones·full·empty·
 * *_like·identity·eye·diag) + 난수 표본추출 + 합치기/쪼개기.
 * 모든 숫자는 ND 엔진이 그 자리에서 계산한다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* ------------------------------------------------------------- 소도구 */

  var DT_PY = { float64: 'float', int64: 'int', int32: 'np.int32', bool: 'bool' };

  /** dtype 인자를 파이썬 코드 문자열로 */
  function dtArg(v) { return (v && v !== 'auto') ? ', dtype=' + (DT_PY[v] || v) : ''; }
  /** 'auto' 를 엔진용 undefined 로 */
  function dtOf(v) { return v === 'auto' ? undefined : v; }

  var DT_OPTIONS = [
    { value: 'auto', label: '지정 안 함' },
    { value: 'float64', label: 'float' },
    { value: 'int64', label: 'int' },
    { value: 'int32', label: 'np.int32' },
    { value: 'bool', label: 'bool' }
  ];

  /** 제목 붙은 칸 (panel-t 색: a 파랑 / b 주황 / r 초록) */
  function panel(title, cls, kids) {
    return el('div', null, [el('div', { class: 'panel-t' + (cls ? ' ' + cls : ''), text: title })]
      .concat(Array.isArray(kids) ? kids : [kids]));
  }

  /** 파이썬 리스트 리터럴 문자열 */
  function pyLit(a) {
    return JSON.stringify(a.toNested()).replace(/,/g, ', ');
  }

  /** 예외를 학생이 볼 그대로 보여 준다 */
  function errOf(e) {
    var msg = (e && e.message) ? e.message : String(e);
    var kind = /out of bounds for array of dimension/.test(msg) ? 'AxisError' : null;
    return UI.errBlock(msg, kind);
  }

  /** 결과 격자 + shape 배지 + print 출력 한 묶음 */
  function resultBlock(a, hl) {
    return el('div', null, [
      UI.grid(a, { highlight: hl || function () { return 'r'; }, axisLabels: a.ndim === 2 }),
      UI.shapeBadge(a),
      UI.out(ND.format(a))
    ]);
  }

  /** 재현 가능한 의사난수 생성기(mulberry32). NumPy 의 MT19937 과는 다른 알고리즘이다. */
  function rngOf(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 표준정규 난수 (Box–Muller) */
  function normalPair(r) {
    var u = 1 - r(), v = r();
    var m = Math.sqrt(-2 * Math.log(u));
    return [m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)];
  }

  /** 오차함수 근사 (Abramowitz & Stegun 7.1.26) — 이론 분포 곡선용 */
  function erf(x) {
    var sign = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  /* --------------------------------------------------- np.split 계열 구현 */

  /** 축 axis 를 n 조각으로. even=true 면 np.split(균등 필수), false 면 np.array_split */
  function splitParts(a, n, axis, even) {
    var L = a.shape[axis], sizes = [], i;
    if (even) {
      if (L % n !== 0) {
        throw new ND.NDError('array split does not result in an equal division');
      }
      for (i = 0; i < n; i++) sizes.push(L / n);
    } else {
      var q = Math.floor(L / n), r = L % n;
      for (i = 0; i < n; i++) sizes.push(q + (i < r ? 1 : 0));
    }
    var out = [], start = 0;
    for (var k = 0; k < n; k++) {
      var spec = [];
      for (var d = 0; d < a.ndim; d++) {
        if (d === axis) spec.push({ k: 's', start: start, stop: start + sizes[k], step: null });
        else spec.push({ k: 's', start: null, stop: null, step: null });
      }
      out.push(a.index(spec));
      start += sizes[k];
    }
    return out;
  }

  /* ======================================================================
   *  본문
   * ==================================================================== */

  Lab.register({
    id: 'create',
    n: '6',
    title: '배열을 만드는 여러 방법',
    blurb: '값을 하나하나 적지 않고 배열을 만든다 — 규칙적인 수열, 0/1 로 채운 그릇, 단위행렬, 난수. 그리고 만든 배열을 붙이고 쪼갠다.',
    sim: '생성 함수 갤러리 · 난수 실험실 · 합치기 시각화 · 쪼개기 시각화',

    render: function (root) {

      root.appendChild(el('p', null, [
        '지금까지는 ', el('code', { text: 'np.array([1, 2, 3])' }),
        ' 처럼 값을 직접 적어서 배열을 만들었다. 하지만 실제 계산에서 필요한 배열은 원소가 수천 개다. ',
        'NumPy 는 ', el('b', { text: '규칙만 알려 주면 배열을 만들어 주는 함수' }),
        ' 들을 갖고 있다.'
      ]));

      root.appendChild(UI.callout('why',
        'NumPy 배열은 <b>만들 때 크기가 정해지고, 그 뒤로는 늘어나지 않는다.</b> ' +
        '파이썬 list 처럼 <code>append</code> 로 하나씩 붙여 나가는 방식이 아니다. ' +
        '그래서 NumPy 로 계산할 때는 <b>결과를 담을 그릇을 먼저 만들어 두고</b> 그 안을 채우는 순서로 짠다. ' +
        '이 장의 <code>zeros</code>·<code>ones</code>·<code>empty</code>·<code>*_like</code> 가 모두 그 "그릇"을 만드는 함수다.'));

      /* ================================================================
       * 1. 생성 함수 갤러리
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '생성 함수 갤러리' }));

      root.appendChild(el('p', null, [
        '함수를 고르면 그 함수에 맞는 조절기가 나타난다. 값을 움직이면 코드와 결과가 함께 바뀐다. ',
        '외우려 하지 말고 ', el('b', { text: '무엇이 입력이고 무엇이 결정되는지' }), ' 를 보라.'
      ]));

      root.appendChild(buildGallery());

      /* ================================================================
       * 2. arange vs linspace
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: 'arange 와 linspace 는 정반대다' }));
      root.appendChild(buildRangeCompare());

      /* ================================================================
       * 3. 난수 실험실
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '난수 실험실' }));

      root.appendChild(el('p', null, [
        '난수는 장난이 아니라 도구다. ',
        el('b', { text: '신경망의 가중치 초기화' }), '(모든 가중치가 0이면 학습이 시작되지 않는다), ',
        el('b', { text: '시뮬레이션' }), '(주사위·대기행렬·몬테카를로), ',
        el('b', { text: '데이터 섞기와 표본 추출' }), '(학습/검증 데이터 분리)에 반드시 쓰인다.'
      ]));

      root.appendChild(buildRandomLab());
      root.appendChild(buildSeedDemo());
      root.appendChild(buildRandomTable());

      /* ================================================================
       * 4. 합치기
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '배열 합치기' }));
      root.appendChild(buildJoinSim());

      /* ================================================================
       * 5. 쪼개기
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '배열 쪼개기' }));
      root.appendChild(buildSplitSim());
      root.appendChild(buildInflammationSplit());

      /* ================================================================
       * 6. 배열은 크기가 고정되어 있다
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '배열은 크기가 고정되어 있다' }));
      root.appendChild(buildGrowCost());

      /* ================================================================
       * 7. 확인 문제
       * ============================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
      root.appendChild(buildQuiz());
    }
  });

  /* ======================================================================
   * 시뮬레이터 ① 생성 함수 갤러리
   * ==================================================================== */

  var FN_WHEN = {
    arange: '언제 쓰는가 — 인덱스, 시간축, 테스트용 데이터처럼 <b>일정한 간격으로 증가하는 수열</b>이 필요할 때.',
    linspace: '언제 쓰는가 — 구간을 <b>정해진 개수로 균등하게 자를 때</b>. 그래프의 x축은 거의 항상 linspace 다.',
    fill: '언제 쓰는가 — 계산 결과를 담을 <b>그릇을 미리 만들 때</b>. 0·1·특정 값으로 초기화해 둔다.',
    empty: '언제 쓰는가 — 어차피 곧바로 전부 덮어쓸 예정이라 초기화가 낭비일 때. 아주 큰 배열에서 조금 빠르다.',
    like: '언제 쓰는가 — 이미 있는 배열과 <b>똑같은 모양·타입의 그릇</b>이 필요할 때. shape 를 손으로 옮겨 적지 않아도 된다.',
    eye: '언제 쓰는가 — 단위행렬이 필요할 때. 역행렬 검산(<code>A @ A⁻¹ = I</code>), 원-핫 인코딩.',
    diag: '언제 쓰는가 — 행렬의 <b>대각 성분만 뽑을 때</b>, 또는 주어진 수들로 <b>대각 행렬을 만들 때</b>.'
  };

  function buildGallery() {
    var st = {
      fn: 'arange',
      ar: { start: 0, stop: 10, step: 1, rs: '없음' },
      ls: { start: 0, stop: 1, num: 5, endpoint: 'True' },
      fl: { which: 'zeros', ndim: '2', rows: 2, cols: 5, val: 7, dt: 'auto' },
      em: { rows: 3, cols: 5, dt: 'int64', tick: 0 },
      lk: { which: 'ones_like', src: 'int', val: 9 },
      ey: { which: 'eye', N: 3, M: 5, k: 0, dt: 'int64' },
      dg: { dir: '2to1', n: 3, k: 0 }
    };

    var ctlHost = el('div');
    var outHost = el('div');
    var whenHost = el('div', { class: 'small muted', style: { margin: '.2rem 0 .8rem' } });

    var fnSel = UI.select({
      label: '생성 함수',
      value: st.fn,
      options: [
        { value: 'arange', label: 'np.arange — 간격을 지정' },
        { value: 'linspace', label: 'np.linspace — 개수를 지정' },
        { value: 'fill', label: 'np.zeros / ones / full — 같은 값으로 채우기' },
        { value: 'empty', label: 'np.empty — 초기화하지 않음' },
        { value: 'like', label: 'np.*_like — 남의 shape·dtype 물려받기' },
        { value: 'eye', label: 'np.identity / np.eye — 단위행렬' },
        { value: 'diag', label: 'np.diag — 대각선' }
      ],
      onChange: function (v) { st.fn = v; rebuildCtl(); }
    });

    function rebuildCtl() {
      UI.clear(ctlHost);
      UI.clear(whenHost);
      whenHost.appendChild(el('span', { html: FN_WHEN[st.fn] || '' }));
      ctlHost.appendChild(CTL[st.fn]());
      draw();
    }

    function draw() {
      UI.clear(outHost);
      try { outHost.appendChild(VIEW[st.fn]()); }
      catch (e) { outHost.appendChild(errOf(e)); }
    }

    /* ---------------- 각 함수의 조절기 ---------------- */

    var CTL = {
      arange: function () {
        var a = st.ar;
        return el('div', null, [
          UI.controls([
            UI.slider({ label: 'start', min: -5, max: 10, step: 1, value: a.start,
              onChange: function (v) { a.start = v; draw(); } }),
            UI.slider({ label: 'stop', min: -5, max: 20, step: 1, value: a.stop,
              onChange: function (v) { a.stop = v; draw(); } }),
            UI.slider({ label: 'step', min: 0.25, max: 3, step: 0.25, value: a.step,
              onChange: function (v) { a.step = v; draw(); } }),
            UI.seg({ label: 'reshape 붙이기', value: a.rs,
              options: ['없음', '(-1, 6)', '(-1, 3)'],
              onChange: function (v) { a.rs = v; draw(); } })
          ])
        ]);
      },
      linspace: function () {
        var a = st.ls;
        return UI.controls([
          UI.slider({ label: 'start', min: -5, max: 5, step: 1, value: a.start,
            onChange: function (v) { a.start = v; draw(); } }),
          UI.slider({ label: 'stop', min: -5, max: 10, step: 1, value: a.stop,
            onChange: function (v) { a.stop = v; draw(); } }),
          UI.slider({ label: 'num (원소 개수)', min: 2, max: 12, step: 1, value: a.num,
            onChange: function (v) { a.num = v; draw(); } }),
          UI.seg({ label: 'endpoint', value: a.endpoint, options: ['True', 'False'],
            onChange: function (v) { a.endpoint = v; draw(); } })
        ]);
      },
      fill: function () {
        var a = st.fl;
        var items = [
          UI.seg({ label: '함수', value: a.which, options: ['zeros', 'ones', 'full'],
            onChange: function (v) { a.which = v; rebuildCtl(); } }),
          UI.seg({ label: '차원', value: a.ndim,
            options: [{ value: '1', label: '1차원' }, { value: '2', label: '2차원' }],
            onChange: function (v) { a.ndim = v; rebuildCtl(); } })
        ];
        if (a.ndim === '2') {
          items.push(UI.slider({ label: '행', min: 1, max: 4, step: 1, value: a.rows,
            onChange: function (v) { a.rows = v; draw(); } }));
        }
        items.push(UI.slider({ label: a.ndim === '2' ? '열' : '길이', min: 1, max: 8, step: 1, value: a.cols,
          onChange: function (v) { a.cols = v; draw(); } }));
        if (a.which === 'full') {
          items.push(UI.slider({ label: 'fill_value', min: -5, max: 9, step: 0.5, value: a.val,
            onChange: function (v) { a.val = v; draw(); } }));
        }
        items.push(UI.select({ label: 'dtype', value: a.dt, options: DT_OPTIONS,
          onChange: function (v) { a.dt = v; draw(); } }));
        return UI.controls(items);
      },
      empty: function () {
        var a = st.em;
        return UI.controls([
          UI.slider({ label: '행', min: 1, max: 4, step: 1, value: a.rows,
            onChange: function (v) { a.rows = v; draw(); } }),
          UI.slider({ label: '열', min: 1, max: 6, step: 1, value: a.cols,
            onChange: function (v) { a.cols = v; draw(); } }),
          UI.select({ label: 'dtype', value: a.dt, options: DT_OPTIONS,
            onChange: function (v) { a.dt = v; draw(); } }),
          UI.btn('다시 뽑기', function () { a.tick++; draw(); }, { primary: true })
        ]);
      },
      like: function () {
        var a = st.lk;
        var items = [
          UI.seg({ label: '함수', value: a.which,
            options: ['zeros_like', 'ones_like', 'empty_like', 'full_like'],
            onChange: function (v) { a.which = v; rebuildCtl(); } }),
          UI.seg({ label: '원본 배열', value: a.src,
            options: [{ value: 'int', label: 'arange(30).reshape(5, 6) — int64' },
                      { value: 'float', label: 'linspace(0, 1, 6).reshape(2, 3) — float64' }],
            onChange: function (v) { a.src = v; draw(); } })
        ];
        if (a.which === 'full_like') {
          items.push(UI.slider({ label: 'fill_value', min: -5, max: 9, step: 0.5, value: a.val,
            onChange: function (v) { a.val = v; draw(); } }));
        }
        return UI.controls(items);
      },
      eye: function () {
        var a = st.ey;
        var items = [
          UI.seg({ label: '함수', value: a.which, options: ['identity', 'eye'],
            onChange: function (v) { a.which = v; rebuildCtl(); } }),
          UI.slider({ label: 'N (행)', min: 1, max: 6, step: 1, value: a.N,
            onChange: function (v) { a.N = v; draw(); } })
        ];
        if (a.which === 'eye') {
          items.push(UI.slider({ label: 'M (열)', min: 1, max: 8, step: 1, value: a.M,
            onChange: function (v) { a.M = v; draw(); } }));
          items.push(UI.slider({ label: 'k (대각선 이동)', min: -5, max: 5, step: 1, value: a.k,
            onChange: function (v) { a.k = v; draw(); } }));
        }
        items.push(UI.select({ label: 'dtype', value: a.dt, options: DT_OPTIONS,
          onChange: function (v) { a.dt = v; draw(); } }));
        return el('div', null, [
          UI.controls(items),
          UI.chips([
            { value: 'c75', label: '셀 75: np.eye(N=3, M=5, dtype=int)' },
            { value: 'c76', label: '셀 76: np.eye(3)' },
            { value: 'c77', label: '셀 77: np.eye(3, 5, k=2)' },
            { value: 'c73', label: '셀 73: np.identity(n=3, dtype=int)' }
          ], function (v) {
            if (v === 'c75') { a.which = 'eye'; a.N = 3; a.M = 5; a.k = 0; a.dt = 'int64'; }
            if (v === 'c76') { a.which = 'eye'; a.N = 3; a.M = 3; a.k = 0; a.dt = 'auto'; }
            if (v === 'c77') { a.which = 'eye'; a.N = 3; a.M = 5; a.k = 2; a.dt = 'auto'; }
            if (v === 'c73') { a.which = 'identity'; a.N = 3; a.dt = 'int64'; }
            rebuildCtl();
          })
        ]);
      },
      diag: function () {
        var a = st.dg;
        return UI.controls([
          UI.seg({ label: '입력 차원', value: a.dir,
            options: [{ value: '2to1', label: '2차원 넣기 → 대각 추출(1차원)' },
                      { value: '1to2', label: '1차원 넣기 → 대각 행렬 생성(2차원)' }],
            onChange: function (v) { a.dir = v; draw(); } }),
          UI.slider({ label: a.dir === '2to1' ? '행렬 크기 n' : '값의 개수 n', min: 2, max: 6, step: 1, value: a.n,
            onChange: function (v) { a.n = v; draw(); } }),
          UI.slider({ label: 'k (대각선 이동)', min: -3, max: 3, step: 1, value: a.k,
            onChange: function (v) { a.k = v; draw(); } })
        ]);
      }
    };

    /* ---------------- 각 함수의 결과 화면 ---------------- */

    var VIEW = {
      arange: function () {
        var a = st.ar;
        var isFloatStep = !Number.isInteger(a.step);
        var res = ND.arange(a.start, a.stop, a.step);
        var codeStr = 'np.arange(' + a.start + ', ' + a.stop + ', ' + a.step + ')';
        var shown = res, rsErr = null;
        if (a.rs !== '없음') {
          codeStr += '.reshape' + a.rs.replace(/ /g, '');
          var target = a.rs === '(-1, 6)' ? [-1, 6] : [-1, 3];
          try { shown = res.reshape(target); } catch (e) { rsErr = e; }
        }
        var n = res.size;
        var kids = [UI.code(codeStr)];
        if (rsErr) {
          kids.push(errOf(rsErr));
          kids.push(el('p', { class: 'small', html:
            'reshape 는 <b>size 가 나누어떨어질 때만</b> 된다. arange 가 만든 원소 개수는 ' + n + ' 개다.' }));
        } else {
          kids.push(resultBlock(shown));
        }
        kids.push(el('p', { class: 'small', html:
          '원소 개수 = <b>ceil((stop − start) / step)</b> = ceil((' + a.stop + ' − ' + a.start + ') / ' +
          a.step + ') = <b>' + n + '</b> 개. ' +
          'stop(' + a.stop + ') 은 결과에 <b>들어가지 않는다</b> — 파이썬 <code>range</code> 와 같은 규칙이다.' }));
        if (isFloatStep) {
          kids.push(el('div', null, [
            el('p', { class: 'small', html: '지금 step 이 실수(' + a.step + ')다. 같은 일을 파이썬 내장 <code>range</code> 로 하면:' }),
            UI.code('list(range(' + a.start + ', ' + a.stop + ', ' + a.step + '))'),
            UI.errBlock("'float' object cannot be interpreted as an integer", 'TypeError'),
            el('p', { class: 'small', html:
              '<code>range</code> 는 정수 간격만 허용한다. <b>실수 간격이 되는 것이 np.arange 의 장점</b>이다(셀 60).' })
          ]));
        }
        return el('div', null, kids);
      },

      linspace: function () {
        var a = st.ls;
        var ep = a.endpoint === 'True';
        var res = ND.linspace(a.start, a.stop, a.num, ep);
        var codeStr = 'np.linspace(' + a.start + ', ' + a.stop + ', ' + a.num +
          (ep ? '' : ', endpoint=False') + ')';
        var div = ep ? (a.num - 1) : a.num;
        var gap = (a.stop - a.start) / (div || 1);
        var last = res.size ? res.get([res.size - 1]) : NaN;
        return el('div', null, [
          UI.code(codeStr),
          resultBlock(res, function (idx) { return idx[0] === a.num - 1 ? 'x' : 'r'; }),
          el('p', { class: 'small', html:
            '간격 = (stop − start) / ' + (ep ? '(num − 1)' : 'num') + ' = <b>' + UI.round2(gap) + '</b>. ' +
            '마지막 원소(노랑)는 <b>' + ND.fmtScalar(last, 'float64') + '</b> — endpoint=' + a.endpoint +
            ' 이므로 stop(' + a.stop + ') 이 ' + (ep ? '<b>포함된다</b>' : '<b>제외된다</b>') + '.' }),
          UI.callout('tip',
            'linspace 는 <b>개수</b>를 주고 간격을 계산하게 한다. arange 는 <b>간격</b>을 주고 개수를 계산하게 한다. ' +
            '그래프를 그릴 때 "점 200개로 부드럽게" 가 필요하면 linspace 다.')
        ]);
      },

      fill: function () {
        var a = st.fl;
        var shape = a.ndim === '2' ? [a.rows, a.cols] : [a.cols];
        var shStr = ND.shapeStr(shape);
        var res, codeStr;
        if (a.which === 'zeros') { res = ND.zeros(shape, dtOf(a.dt)); codeStr = 'np.zeros(' + shStr + dtArg(a.dt) + ')'; }
        else if (a.which === 'ones') { res = ND.ones(shape, dtOf(a.dt)); codeStr = 'np.ones(' + shStr + dtArg(a.dt) + ')'; }
        else {
          var v = a.val;
          res = ND.full(shape, v, dtOf(a.dt));
          codeStr = 'np.full(' + shStr + ', ' + v + dtArg(a.dt) + ')';
        }
        var kids = [UI.code(codeStr), resultBlock(res)];
        kids.push(el('p', { class: 'small', html:
          'dtype 은 <b>' + res.dtype + '</b> 이고 원소 하나가 ' + res.itemsize + ' 바이트, 전체 ' +
          res.nbytes + ' 바이트를 쓴다.' }));
        if (a.dt === 'auto' && (a.which === 'zeros' || a.which === 'ones')) {
          kids.push(UI.callout('trap',
            'dtype 을 지정하지 않은 <code>np.zeros</code>·<code>np.ones</code> 는 <b>float64</b> 다. ' +
            '그래서 출력이 <code>0</code> 이 아니라 <b><code>0.</code></b> (점이 붙은 실수)로 나온다. ' +
            '정수 배열이 필요하면 <code>dtype=int</code> 를 반드시 써야 한다(셀 63·64).'));
        }
        if (a.which === 'full' && a.dt === 'auto') {
          kids.push(el('p', { class: 'small', html:
            '<code>np.full</code> 은 dtype 을 지정하지 않으면 <b>넣은 값에서 추론</b>한다 — ' +
            'fill_value 가 ' + a.val + ' 이므로 ' + res.dtype + ' 이 되었다. 값을 ' +
            (Number.isInteger(a.val) ? '실수로 바꿔 보라' : '정수로 바꿔 보라') + '.' }));
        }
        return el('div', null, kids);
      },

      empty: function () {
        var a = st.em;
        var res = ND.empty([a.rows, a.cols], dtOf(a.dt));
        var zeroCount = ND.sum(ND.ops.eq(res, 0)).toNested();
        return el('div', null, [
          UI.code('np.empty((' + a.rows + ', ' + a.cols + ')' + dtArg(a.dt) + ')'),
          resultBlock(res),
          el('p', { class: 'small', html:
            '<b>다시 뽑기</b> 를 눌러 보라. shape 와 dtype 은 그대로인데 <b>값은 달라진다.</b> ' +
            '지금 이 배열에서 0 인 칸은 ' + zeroCount + '개 / 전체 ' + res.size + '개다 — ' +
            '이 숫자도 누를 때마다 바뀐다.' }),
          UI.callout('trap',
            '<code>np.empty</code> 는 메모리를 <b>확보만 하고 초기화하지 않는다.</b> ' +
            '거기 남아 있던 값이 그대로 보인다. 우연히 전부 0 이 나올 때도 많아서 ' +
            '"0 으로 채우는 함수" 로 오해하기 쉽지만 <b>어떤 값이 나올지는 보장되지 않는다.</b> ' +
            '값을 믿고 쓰면 안 되고, 반드시 전부 덮어쓸 때만 쓴다. 0 이 필요하면 <code>np.zeros</code> 를 써라.')
        ]);
      },

      like: function () {
        var a = st.lk;
        var src = a.src === 'int'
          ? ND.arange(30).reshape([5, 6])
          : ND.linspace(0, 1, 6).reshape([2, 3]);
        var srcCode = a.src === 'int'
          ? 'arr3 = np.arange(30).reshape(5, 6)'
          : 'arr3 = np.linspace(0, 1, 6).reshape(2, 3)';
        var res, codeStr = 'np.' + a.which + '(arr3' + (a.which === 'full_like' ? ', ' + a.val : '') + ')';
        if (a.which === 'zeros_like') res = ND.zerosLike(src);
        else if (a.which === 'ones_like') res = ND.onesLike(src);
        else if (a.which === 'full_like') res = ND.fullLike(src, a.val);
        else res = ND.empty(src.shape, src.dtype);

        var plain = ND.ones(src.shape);           // np.ones(arr3.shape) — dtype 을 물려받지 않는다
        var kids = [
          UI.code(srcCode + '\n' + codeStr),
          el('div', { class: 'flow' }, [
            panel('원본 arr3', 'a', [UI.grid(src, { highlight: function () { return 'a'; } }), UI.shapeBadge(src)]),
            el('span', { class: 'op', text: '→' }),
            panel('결과 ' + a.which, 'r', [UI.grid(res, { highlight: function () { return 'r'; } }), UI.shapeBadge(res)])
          ]),
          UI.out(ND.format(res)),
          el('p', { class: 'small', html:
            '<code>' + a.which + '</code> 은 shape ' + ND.shapeStr(src.shape) + ' 뿐 아니라 ' +
            '<b>dtype(' + src.dtype + ') 까지 물려받는다.</b> 그래서 결과 dtype 도 ' + res.dtype + ' 이다.' })
        ];
        if (a.which === 'ones_like') {
          kids.push(el('div', { class: 'stack-2' }, [
            panel('np.ones_like(arr3)', 'r', [UI.out(ND.format(res), { label: 'dtype ' + res.dtype })]),
            panel('np.ones(arr3.shape)', null, [UI.out(ND.format(plain), { label: 'dtype ' + plain.dtype })])
          ]));
          kids.push(UI.callout('why',
            '같은 shape 인데 출력이 다르다. <code>ones_like</code> 는 원본의 dtype(' + src.dtype + ')을 물려받아 ' +
            (src.dtype === 'int64' ? '<b>정수 1</b> 을 만들고' : '<b>실수 1.</b> 을 만들고') +
            ', <code>np.ones(shape)</code> 는 dtype 을 모르니 기본값 float64 를 써서 <b>1.</b> 을 만든다. ' +
            '셀 70 에서 <code>np.ones_like(arr3)</code> 가 <code>1.</code> 이 아니라 <code>1</code> 로 찍히는 이유다.'));
        }
        if (a.which === 'empty_like') {
          kids.push(UI.callout('trap',
            '<code>empty_like</code> 도 <b>초기화하지 않는다.</b> shape 와 dtype 만 원본에서 가져온다. ' +
            '함수를 다시 골라 보면 값이 달라진다.'));
        }
        return el('div', null, kids);
      },

      eye: function () {
        var a = st.ey;
        var res, codeStr;
        if (a.which === 'identity') {
          res = ND.identity(a.N, dtOf(a.dt));
          codeStr = 'np.identity(n=' + a.N + dtArg(a.dt) + ')';
        } else {
          res = ND.eye(a.N, a.M, a.k, dtOf(a.dt));
          codeStr = 'np.eye(' + a.N + ', ' + a.M + (a.k ? ', k=' + a.k : '') + dtArg(a.dt) + ')';
        }
        var ones = ND.sum(res).toNested();
        return el('div', null, [
          UI.code(codeStr),
          UI.grid(res, {
            axisLabels: true,
            highlight: function (idx, v) { return v ? 'x' : 'dim'; }
          }),
          UI.shapeBadge(res),
          UI.out(ND.format(res)),
          el('p', { class: 'small', html:
            '1 인 칸(노랑)은 <b>' + ones + '</b> 개다. ' +
            (a.which === 'eye'
              ? 'k=' + a.k + ' 이므로 <b>j = i + (' + a.k + ')</b> 인 칸이 1 이 된다. ' +
                'k 를 키우면 대각선이 <b>오른쪽 위로</b>, 줄이면 <b>왼쪽 아래로</b> 움직인다. ' +
                '대각선이 배열 밖으로 나가면 1 이 하나도 없는 배열이 된다 — k 를 끝까지 밀어 보라.'
              : 'identity 는 <b>i = j</b> 인 칸만 1 이다. k 를 지정할 수 없다.') }),
          UI.callout('tip',
            '<b>identity(n)</b> 은 항상 n×n 정사각이고 대각선이 고정이다. ' +
            '<b>eye(N, M, k)</b> 는 직사각형도 되고 <code>k</code> 로 대각선을 옮길 수도 있다. ' +
            'identity 는 eye 의 <code>k=0</code>, <code>M=N</code> 인 특수한 경우다.')
        ]);
      },

      diag: function () {
        var a = st.dg;
        if (a.dir === '2to1') {
          var src = ND.arange(a.n * a.n).reshape([a.n, a.n]);
          var res = ND.diag(src, a.k);
          return el('div', null, [
            UI.code('arr4 = np.arange(' + (a.n * a.n) + ').reshape(' + a.n + ', ' + a.n + ')\n' +
              'np.diag(arr4' + (a.k ? ', k=' + a.k : '') + ')'),
            el('div', { class: 'flow' }, [
              panel('입력 (2차원)', 'a', [
                UI.grid(src, {
                  axisLabels: true,
                  highlight: function (idx) { return idx[1] === idx[0] + a.k ? 'x' : 'a'; }
                }),
                UI.shapeBadge(src)
              ]),
              el('span', { class: 'op', text: '→' }),
              panel('결과 (1차원)', 'r', [
                UI.grid(res, { highlight: function () { return 'r'; } }),
                UI.shapeBadge(res)
              ])
            ]),
            UI.out(ND.format(res)),
            el('p', { class: 'small', html:
              '노랑 칸(<b>j = i + ' + a.k + '</b>)만 순서대로 뽑아 1차원으로 돌려준다. ' +
              '2차원 → 1차원, 차원이 <b>줄어든다</b>. 뽑힌 개수는 ' + res.size + ' 개다.' })
          ]);
        }
        var v = ND.arange(1, a.n + 1);
        var m = ND.diag(v, a.k);
        return el('div', null, [
          UI.code('np.diag(np.arange(1, ' + (a.n + 1) + ')' + (a.k ? ', k=' + a.k : '') + ')'),
          el('div', { class: 'flow' }, [
            panel('입력 (1차원)', 'a', [
              UI.grid(v, { highlight: function () { return 'a'; } }), UI.shapeBadge(v)
            ]),
            el('span', { class: 'op', text: '→' }),
            panel('결과 (2차원)', 'r', [
              UI.grid(m, {
                axisLabels: true,
                highlight: function (idx, val) { return val ? 'x' : 'r'; }
              }),
              UI.shapeBadge(m)
            ])
          ]),
          UI.out(ND.format(m)),
          el('p', { class: 'small', html:
            '1차원 → 2차원, 차원이 <b>늘어난다</b>. 결과는 (' + m.shape[0] + ', ' + m.shape[1] + ') 정사각이고 ' +
            'k=' + a.k + ' 만큼 밀린 대각선(노랑)에 값이 놓인다. 나머지는 모두 0 이다.' }),
          UI.callout('why',
            '<code>np.diag</code> 는 <b>같은 이름의 함수가 입력 차원에 따라 정반대로 동작</b>한다. ' +
            '2차원을 넣으면 <b>추출</b>(뽑아서 1차원), 1차원을 넣으면 <b>생성</b>(펼쳐서 2차원). ' +
            '3차원을 넣으면 <code>ValueError: Input must be 1- or 2-d.</code> 가 난다.')
        ]);
      }
    };

    rebuildCtl();

    return UI.card({
      kicker: '시뮬레이터',
      title: '생성 함수 갤러리',
      note: '함수를 고르고 값을 움직여라. 코드·격자·<code>print</code> 출력이 모두 실제 계산 결과다.',
      body: [UI.controls([fnSel]), whenHost, ctlHost, outHost]
    });
  }

  /* ======================================================================
   * arange 와 linspace 비교
   * ==================================================================== */

  function buildRangeCompare() {
    var st = { lo: 0, hi: 1, n: 5 };
    var host = el('div');

    function rebuild() {
      UI.clear(host);
      var lin = ND.linspace(st.lo, st.hi, st.n);
      var gap = (st.hi - st.lo) / (st.n - 1);
      var ar = ND.arange(st.lo, st.hi, gap);
      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('np.linspace(' + st.lo + ', ' + st.hi + ', ' + st.n + ')', 'a', [
          UI.grid(lin, { highlight: function (idx) { return idx[0] === lin.size - 1 ? 'x' : 'a'; } }),
          UI.shapeBadge(lin),
          el('p', { class: 'small', html: '개수를 <b>' + st.n + '</b> 로 지정했다 → 간격 ' +
            UI.round2(gap) + ' 이 계산되어 나온다. 끝값 ' + st.hi + ' 이 <b>들어 있다</b>(노랑).' })
        ]),
        panel('np.arange(' + st.lo + ', ' + st.hi + ', ' + UI.round2(gap) + ')', 'b', [
          UI.grid(ar, { highlight: function () { return 'b'; } }),
          UI.shapeBadge(ar),
          el('p', { class: 'small', html: '같은 간격을 지정했는데 개수가 <b>' + ar.size + '</b> 다 → ' +
            '끝값 ' + st.hi + ' 이 <b>빠졌다</b>. stop 은 포함되지 않기 때문이다.' })
        ])
      ]));
      host.appendChild(UI.out('linspace 개수 ' + lin.size + '  vs  arange 개수 ' + ar.size,
        { label: '개수 비교' }));
    }

    var ctl = UI.controls([
      UI.slider({ label: 'start', min: -3, max: 3, step: 1, value: st.lo,
        onChange: function (v) { st.lo = v; rebuild(); } }),
      UI.slider({ label: 'stop', min: 1, max: 10, step: 1, value: st.hi,
        onChange: function (v) { st.hi = v; rebuild(); } }),
      UI.slider({ label: 'num', min: 3, max: 11, step: 1, value: st.n,
        onChange: function (v) { st.n = v; rebuild(); } })
    ]);
    rebuild();

    return el('div', null, [
      UI.card({
        kicker: '시각화',
        title: '같은 구간, 다른 결과',
        note: '같은 구간 [start, stop] 을 같은 간격으로 자르는데 왜 개수가 다른가.',
        body: [ctl, host]
      }),
      UI.callout('tip',
        '<b>arange</b>: 간격을 내가 정한다 → 개수는 계산되어 나온다. stop 미포함. 실수 간격에서는 부동소수점 오차 때문에 ' +
        '개수가 예상과 어긋날 수 있다.<br>' +
        '<b>linspace</b>: 개수를 내가 정한다 → 간격이 계산되어 나온다. 기본으로 끝값 포함. ' +
        '그래서 <b>그래프의 x축을 만들 때는 linspace</b> 가 표준이다.')
    ]);
  }

  /* ======================================================================
   * 시뮬레이터 ② 난수 실험실
   * ==================================================================== */

  var N_SIZES = [12, 60, 300, 1200, 4000];

  function buildRandomLab() {
    var st = { dist: 'normal', lo: 0, hi: 1, loc: 0, scale: 1, ni: 2, seed: 0, fixed: 'on', tick: 0 };

    var ctlHost = el('div');
    var outHost = el('div');

    function rebuildCtl() {
      UI.clear(ctlHost);
      var items = [
        UI.seg({ label: '분포', value: st.dist,
          options: [{ value: 'uniform', label: '균등분포 uniform' }, { value: 'normal', label: '정규분포 normal' }],
          onChange: function (v) { st.dist = v; rebuildCtl(); } })
      ];
      if (st.dist === 'uniform') {
        items.push(UI.slider({ label: 'low', min: -3, max: 3, step: 1, value: st.lo,
          onChange: function (v) { st.lo = v; draw(); } }));
        items.push(UI.slider({ label: 'high', min: -2, max: 6, step: 1, value: st.hi,
          onChange: function (v) { st.hi = v; draw(); } }));
      } else {
        items.push(UI.slider({ label: 'loc (평균)', min: -5, max: 5, step: 0.5, value: st.loc,
          onChange: function (v) { st.loc = v; draw(); } }));
        items.push(UI.slider({ label: 'scale (표준편차)', min: 0.5, max: 4, step: 0.5, value: st.scale,
          onChange: function (v) { st.scale = v; draw(); } }));
      }
      items.push(UI.slider({ label: 'size (표본 개수)', min: 0, max: N_SIZES.length - 1, step: 1, value: st.ni,
        format: function (v) { return String(N_SIZES[v]); },
        onChange: function (v) { st.ni = v; draw(); } }));
      items.push(UI.seg({ label: 'seed 고정', value: st.fixed,
        options: [{ value: 'on', label: '고정' }, { value: 'off', label: '고정 안 함' }],
        onChange: function (v) { st.fixed = v; rebuildCtl(); } }));
      if (st.fixed === 'on') {
        items.push(UI.slider({ label: 'seed', min: 0, max: 9, step: 1, value: st.seed,
          onChange: function (v) { st.seed = v; draw(); } }));
      }
      items.push(UI.btn('다시 뽑기', function () { st.tick++; draw(); }, { primary: true }));
      ctlHost.appendChild(UI.controls(items));
      draw();
    }

    function draw() {
      UI.clear(outHost);
      var n = N_SIZES[st.ni];
      var r = rngOf(st.fixed === 'on' ? st.seed : ((Math.random() * 1e9) | 0) ^ st.tick);
      var vals = new Array(n), i;
      if (st.dist === 'uniform') {
        for (i = 0; i < n; i++) vals[i] = st.lo + (st.hi - st.lo) * r();
      } else {
        for (i = 0; i < n; i += 2) {
          var p = normalPair(r);
          vals[i] = st.loc + st.scale * p[0];
          if (i + 1 < n) vals[i + 1] = st.loc + st.scale * p[1];
        }
      }
      var arr = ND.array(vals, 'float64');

      /* 코드 */
      var codeStr = st.dist === 'uniform'
        ? 'np.random.uniform(' + st.lo + ', ' + st.hi + ', ' + n + ')'
        : 'np.random.normal(' + st.loc + ', ' + st.scale + ', ' + n + ')';
      if (st.fixed === 'on') codeStr = 'np.random.seed(' + st.seed + ')\n' + codeStr;
      outHost.appendChild(UI.code(codeStr + (n === 12 ? '.reshape(-1, 3)' : '')));

      /* 앞 12개를 (-1, 3) 으로 (셀 82·84) */
      var head = ND.array(vals.slice(0, Math.min(12, n)), 'float64');
      var headM = head.size % 3 === 0 ? head.reshape([-1, 3]) : head;
      outHost.appendChild(panel(n === 12 ? '뽑은 값 전체 — reshape(-1, 3)' : '앞 12개만 — reshape(-1, 3)', 'r', [
        UI.grid(headM, { highlight: function () { return 'r'; }, cellSize: 56 }),
        UI.shapeBadge(headM)
      ]));

      /* 실제 통계 */
      var mean = ND.mean(arr).toNested();
      var sd = ND.std(arr, null, 0).toNested();
      var mn = ND.min(arr).toNested(), mx = ND.max(arr).toNested();
      var neg = ND.sum(ND.ops.lt(arr, 0)).toNested();
      var over1 = ND.sum(ND.ops.gt(arr, 1)).toNested();
      outHost.appendChild(UI.statRow([
        { k: '표본 개수', v: String(n) },
        { k: '표본 평균', v: UI.round2(mean), sub: st.dist === 'normal' ? 'loc = ' + st.loc : '이론값 ' + UI.round2((st.lo + st.hi) / 2) },
        { k: '표본 표준편차', v: UI.round2(sd), sub: st.dist === 'normal' ? 'scale = ' + st.scale : 'ddof=0' },
        { k: '최소 / 최대', v: UI.round2(mn) + ' / ' + UI.round2(mx) },
        { k: '음수 개수', v: String(neg) },
        { k: '1 초과 개수', v: String(over1) }
      ]));

      /* 히스토그램: 표본 비율 vs 이론 확률 */
      var nb, lo, hi;
      if (st.dist === 'uniform') { nb = 10; lo = Math.min(st.lo, st.hi); hi = Math.max(st.lo, st.hi); }
      else { nb = 16; lo = st.loc - 4 * st.scale; hi = st.loc + 4 * st.scale; }
      if (hi === lo) hi = lo + 1;
      var w = (hi - lo) / nb;
      var counts = new Array(nb).fill(0);
      for (i = 0; i < n; i++) {
        var b = Math.floor((vals[i] - lo) / w);
        if (b < 0) b = 0; if (b >= nb) b = nb - 1;
        counts[b]++;
      }
      var xs = [], obs = [], thr = [];
      for (b = 0; b < nb; b++) {
        xs.push(+(lo + (b + 0.5) * w).toFixed(2));
        obs.push(counts[b] / n);
        if (st.dist === 'uniform') thr.push(1 / nb);
        else {
          var z0 = (lo + b * w - st.loc) / st.scale, z1 = (lo + (b + 1) * w - st.loc) / st.scale;
          var p = Phi(z1) - Phi(z0);
          if (b === 0) p = Phi(z1);
          if (b === nb - 1) p = 1 - Phi(z0);
          thr.push(p);
        }
      }
      outHost.appendChild(el('div', { class: 'panel-t', text: '계급별 비율 — 표본 vs 이론' }));
      outHost.appendChild(UI.lineChart({
        series: [
          { name: '뽑은 표본의 비율', values: obs, color: 'var(--s1)' },
          { name: '이론 확률', values: thr, color: 'var(--s2)' }
        ],
        x: xs, xLabel: '값', yLabel: '비율', height: 230, yMin: 0,
        fmtY: function (v) { return (v * 100).toFixed(1) + '%'; }
      }));
      outHost.appendChild(el('p', { class: 'small', html:
        '<b>size 슬라이더를 오른쪽으로 밀어 보라.</b> 표본이 12개일 때는 파랑(표본)이 주황(이론)과 전혀 안 맞지만, ' +
        '수천 개가 되면 두 선이 겹친다. 이것이 "많이 뽑으면 분포 모양이 드러난다" 는 뜻이다.' }));

      if (st.dist === 'normal') {
        outHost.appendChild(UI.callout('ver',
          '수업자료에는 "정규분포: <b>0~1 사이</b>의 각 숫자가 나타날 확률이 종모양" 이라고 적혀 있다. 이는 부정확하다. ' +
          '표준정규분포는 0~1 에 갇히지 않는다 — 지금 뽑은 ' + n + '개 중 <b>음수가 ' + neg + '개</b>, ' +
          '<b>1 을 넘는 값이 ' + over1 + '개</b> 나왔고 최소는 ' + UI.round2(mn) + ', 최대는 ' + UI.round2(mx) +
          ' 다. 정규분포의 이론상 범위는 −∞ ~ +∞ 이며, <code>loc</code> 는 평균, <code>scale</code> 는 표준편차다. ' +
          '0~1 로 제한된 것은 <code>np.random.uniform(0, 1, …)</code> 또는 <code>np.random.rand</code> 쪽이다.'));
      }
      outHost.appendChild(el('p', { class: 'small muted', html:
        st.fixed === 'on'
          ? 'seed 를 고정했으므로 <b>다시 뽑기</b> 를 눌러도 같은 값이 나온다.'
          : 'seed 를 고정하지 않았으므로 <b>실행할 때마다 값이 다르다.</b> 이 페이지에 적힌 어떤 난수도 "정답" 이 아니다.' }));
    }

    rebuildCtl();

    return UI.card({
      kicker: '시뮬레이터',
      title: '난수 실험실',
      note: '<code>np.random.uniform(low, high, size)</code> 와 <code>np.random.normal(loc, scale, size)</code> 로 ' +
        '표본을 뽑아 히스토그램을 그린다. 표본 개수를 늘리면 이론 분포에 가까워지는지 직접 확인하라. ' +
        '(주의: 이 페이지의 난수 엔진은 NumPy 의 MT19937 과 다른 알고리즘이므로 <b>값 자체는 실제 NumPy 와 다르다.</b> ' +
        '분포의 성질과 재현성만 같다.)',
      body: [ctlHost, outHost]
    });
  }

  /* -------------------------------------------------- seed / 재현성 데모 */

  function buildSeedDemo() {
    var st = { seed: 0, mode: 'on' };
    var host = el('div');

    function four(r) {
      var v = []; for (var i = 0; i < 4; i++) v.push(r());
      return ND.array(v, 'float64');
    }

    function rebuild() {
      UI.clear(host);
      var fixed = st.mode === 'on';
      var r1 = fixed ? rngOf(st.seed) : rngOf((Math.random() * 1e9) | 0);
      var r2 = fixed ? rngOf(st.seed) : rngOf((Math.random() * 1e9) | 0);
      var a1 = four(r1), a2 = four(r2);
      var same = ND.all(ND.ops.eq(a1, a2)).toNested();
      host.appendChild(UI.code(
        (fixed ? 'np.random.seed(' + st.seed + ')\n' : '') + 'first  = np.random.rand(4)\n' +
        (fixed ? 'np.random.seed(' + st.seed + ')\n' : '') + 'second = np.random.rand(4)\n' +
        'np.array_equal(first, second)'));
      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('first', 'a', [UI.grid(a1, { highlight: function () { return 'a'; }, cellSize: 58 })]),
        panel('second', 'b', [UI.grid(a2, { highlight: function () { return 'b'; }, cellSize: 58 })])
      ]));
      host.appendChild(UI.out(same ? 'True' : 'False'));
      host.appendChild(el('p', { class: 'small', html: same
        ? '두 번 뽑았는데 <b>완전히 같다.</b> 컴퓨터의 난수는 진짜 무작위가 아니라 시드에서 출발해 ' +
          '정해진 규칙으로 계산되는 <b>의사난수(pseudo-random)</b> 이기 때문이다.'
        : '두 번 뽑으니 <b>다르다.</b> 시드를 지정하지 않으면 시작점이 매번 달라진다. ' +
          '실험을 남에게 재현시켜야 한다면 반드시 시드를 고정해야 한다.' }));
    }

    var ctl = UI.controls([
      UI.seg({ label: '시드', value: st.mode,
        options: [{ value: 'on', label: 'seed 고정' }, { value: 'off', label: '고정 안 함' }],
        onChange: function (v) { st.mode = v; rebuild(); } }),
      UI.slider({ label: 'seed 값', min: 0, max: 9, step: 1, value: st.seed,
        onChange: function (v) { st.seed = v; rebuild(); } }),
      UI.btn('다시 실행', rebuild)
    ]);
    rebuild();

    return el('div', null, [
      UI.card({
        kicker: '시뮬레이터',
        title: '같은 결과를 다시 얻기 — np.random.seed',
        note: '난수를 쓰는 실험은 "결과를 재현할 수 있는가" 가 늘 문제다. 시드를 고정하면 같은 값이 다시 나온다.',
        body: [ctl, host]
      }),
      UI.callout('ver',
        '<code>np.random.seed(0)</code> 와 <code>np.random.rand</code> 같은 옛 방식은 NumPy 2.x 에서도 그대로 동작한다. ' +
        '다만 지금 <b>권장되는 방식은 생성기 객체</b>다:<br>' +
        '<code>rng = np.random.default_rng(0)</code> → <code>rng.random(4)</code>, <code>rng.normal(0, 1, 12)</code>, ' +
        '<code>rng.integers(0, 10, 5)</code>.<br>' +
        '전역 상태를 건드리지 않아서 여러 실험이 서로 간섭하지 않는다. 새 코드를 쓸 때는 이쪽을 쓰라.')
    ]);
  }

  function buildRandomTable() {
    var rows = [
      { f: 'np.random.rand(3, 2)', d: '0 이상 1 미만 균등분포. shape 를 콤마로 나열해서 넘긴다', r: 'uniform(0, 1, …) 과 같다' },
      { f: 'np.random.randn(3, 2)', d: '표준정규분포(평균 0, 표준편차 1)', r: 'normal(0, 1, …) 과 같다' },
      { f: 'np.random.randint(1, 7, 10)', d: '1 이상 7 미만 정수 10개 — 주사위 10번', r: 'high 는 포함되지 않는다' },
      { f: 'np.random.choice(arr, 3)', d: '배열에서 3개를 뽑는다', r: 'replace=False 로 중복 없이' },
      { f: 'np.random.shuffle(arr)', d: '배열을 제자리에서 섞는다', r: '원본을 바꾼다. 반환값은 None' },
      { f: 'np.random.permutation(arr)', d: '섞은 새 배열을 돌려준다', r: '원본은 그대로' },
      { f: 'np.random.uniform(0, 1, 12)', d: '균등분포 표본 12개 (셀 82)', r: 'low·high·size' },
      { f: 'np.random.normal(0, 1, 12)', d: '정규분포 표본 12개 (셀 84)', r: 'loc·scale·size' }
    ];
    return el('div', null, [
      UI.table([
        { k: 'f', label: '함수' }, { k: 'd', label: '하는 일' }, { k: 'r', label: '알아둘 점' }
      ], rows),
      UI.callout('trap',
        '<code>shuffle</code> 은 원본을 제자리에서 섞고 <b>None 을 돌려준다.</b> ' +
        '<code>arr = np.random.shuffle(arr)</code> 라고 쓰면 arr 이 None 이 되어 버린다. ' +
        '새 배열이 필요하면 <code>permutation</code> 을 쓰라.')
    ]);
  }

  /* ======================================================================
   * 시뮬레이터 ③ 합치기
   * ==================================================================== */

  var OP_DESC = {
    vstack: 'vstack 은 <b>위아래로</b> 쌓는다(vertical). 1차원 배열을 주면 각각을 (1, n) 짜리 행으로 <b>자동 승격</b>시켜 준다.',
    hstack: 'hstack 은 <b>좌우로</b> 붙인다(horizontal). 1차원끼리는 그냥 이어 붙이고, 2차원이면 열 방향(axis=1)으로 붙인다.',
    concatenate: 'concatenate 는 <b>붙일 축을 직접 지정</b>한다. 2차원에서 axis=0 은 vstack, axis=1 은 hstack 과 같은 결과다. 자동 승격은 해 주지 않는다.',
    stack: 'stack 은 기존 축에 붙이는 것이 아니라 <b>새 축을 하나 만든다.</b> 그래서 결과의 ndim 이 1 늘어난다.'
  };

  function buildJoinSim() {
    var st = { mode: '1d', op: 'vstack', axis: 0, lenA: 3, lenB: 3, rA: 3, cA: 1, rB: 3, cB: 1, color: 'origin' };

    var ctlHost = el('div');
    var outHost = el('div');

    function makeA() {
      if (st.mode === '1d') return ND.arange(1, 1 + st.lenA);
      return ND.arange(1, 1 + st.rA * st.cA).reshape([st.rA, st.cA]);
    }
    function makeB() {
      if (st.mode === '1d') return ND.arange(2, 2 + st.lenB);
      return ND.arange(2, 2 + st.rB * st.cB).reshape([st.rB, st.cB]);
    }
    function maxAxis(nd) { return st.op === 'stack' ? nd : nd - 1; }

    function rebuildCtl() {
      UI.clear(ctlHost);
      var nd = st.mode === '1d' ? 1 : 2;
      if (st.axis > maxAxis(nd)) st.axis = maxAxis(nd);
      var items = [
        UI.seg({ label: '함수', value: st.op,
          options: ['vstack', 'hstack', 'concatenate', 'stack'],
          onChange: function (v) { st.op = v; rebuildCtl(); } }),
        UI.seg({ label: '배열 차원', value: st.mode,
          options: [{ value: '1d', label: '1차원' }, { value: '2d', label: '2차원' }],
          onChange: function (v) { st.mode = v; rebuildCtl(); } })
      ];
      if (st.op === 'concatenate' || st.op === 'stack') {
        items.push(UI.slider({ label: 'axis', min: 0, max: maxAxis(nd), step: 1, value: st.axis,
          onChange: function (v) { st.axis = v; draw(); } }));
      }
      if (st.mode === '1d') {
        items.push(UI.slider({ label: 'a 길이', min: 1, max: 5, step: 1, value: st.lenA,
          onChange: function (v) { st.lenA = v; draw(); } }));
        items.push(UI.slider({ label: 'b 길이', min: 1, max: 5, step: 1, value: st.lenB,
          onChange: function (v) { st.lenB = v; draw(); } }));
      } else {
        items.push(UI.slider({ label: 'a 행', min: 1, max: 4, step: 1, value: st.rA,
          onChange: function (v) { st.rA = v; draw(); } }));
        items.push(UI.slider({ label: 'a 열', min: 1, max: 4, step: 1, value: st.cA,
          onChange: function (v) { st.cA = v; draw(); } }));
        items.push(UI.slider({ label: 'b 행', min: 1, max: 4, step: 1, value: st.rB,
          onChange: function (v) { st.rB = v; draw(); } }));
        items.push(UI.slider({ label: 'b 열', min: 1, max: 4, step: 1, value: st.cB,
          onChange: function (v) { st.cB = v; draw(); } }));
      }
      items.push(UI.seg({ label: '결과 칸 색', value: st.color,
        options: [{ value: 'origin', label: '출처별 (A 파랑 / B 주황)' }, { value: 'plain', label: '결과 초록' }],
        onChange: function (v) { st.color = v; draw(); } }));
      ctlHost.appendChild(UI.controls(items));
      ctlHost.appendChild(UI.chips([
        { value: 'c86', label: '셀 86: 1차원 두 개를 vstack' },
        { value: 'c87', label: '셀 87: 열벡터 두 개를 hstack' },
        { value: 'c89', label: '셀 89: concatenate 기본(axis=0)' },
        { value: 'err', label: '1차원에 axis=1 → 에러' },
        { value: 'sh', label: 'shape 가 안 맞으면 → 에러' },
        { value: 'stk', label: 'stack 은 새 축을 만든다' }
      ], function (v) {
        if (v === 'c86') { st.mode = '1d'; st.lenA = 3; st.lenB = 3; st.op = 'vstack'; }
        if (v === 'c87') { st.mode = '2d'; st.rA = 3; st.cA = 1; st.rB = 3; st.cB = 1; st.op = 'hstack'; }
        if (v === 'c89') { st.mode = '1d'; st.lenA = 3; st.lenB = 3; st.op = 'concatenate'; st.axis = 0; }
        if (v === 'err') { st.mode = '1d'; st.lenA = 3; st.lenB = 3; st.op = 'concatenate'; st.axis = 1; }
        if (v === 'sh') { st.mode = '2d'; st.rA = 2; st.cA = 3; st.rB = 2; st.cB = 2; st.op = 'vstack'; }
        if (v === 'stk') { st.mode = '1d'; st.lenA = 3; st.lenB = 3; st.op = 'stack'; st.axis = 0; }
        rebuildCtl();
      }));
      draw();
    }

    function codeFor(a, b) {
      var head = 'a = np.array(' + pyLit(a) + ')\nb = np.array(' + pyLit(b) + ')\n';
      if (st.op === 'vstack') return head + 'np.vstack((a, b))';
      if (st.op === 'hstack') return head + 'np.hstack((a, b))';
      if (st.op === 'concatenate') return head + 'np.concatenate((a, b), axis=' + st.axis + ')';
      return head + 'np.stack((a, b), axis=' + st.axis + ')';
    }

    function draw() {
      UI.clear(outHost);
      var a = makeA(), b = makeB();
      outHost.appendChild(UI.code(codeFor(a, b)));

      var res = null, err = null, joinAxis = 0, splitAt = 0, madeNewAxis = false;
      try {
        if (st.op === 'vstack') {
          res = ND.vstack([a, b]);
          joinAxis = 0;
          splitAt = a.ndim === 1 ? 1 : a.shape[0];
        } else if (st.op === 'hstack') {
          joinAxis = a.ndim === 1 ? 0 : 1;
          splitAt = a.shape[joinAxis];
          res = ND.hstack([a, b]);
        } else if (st.op === 'concatenate') {
          joinAxis = st.axis;
          splitAt = st.axis < a.ndim ? a.shape[st.axis] : 0;
          res = ND.concatenate([a, b], st.axis);
        } else {
          if (a.ndim !== b.ndim || String(a.shape) !== String(b.shape)) {
            throw new ND.NDError('all input arrays must have the same shape');
          }
          if (st.axis > a.ndim) throw new ND.NDError('axis ' + st.axis + ' is out of bounds for array of dimension ' + (a.ndim + 1));
          joinAxis = st.axis; splitAt = 1; madeNewAxis = true;
          res = ND.stack([a, b], st.axis);
        }
      } catch (e) { err = e; }

      /* 피연산자: 붙는 방향대로 배치한다 */
      var vertical = (joinAxis === 0 && (st.op !== 'stack'));
      var opnd = el('div', {
        style: { display: 'flex', flexDirection: vertical ? 'column' : 'row',
                 gap: '.55rem', alignItems: vertical ? 'flex-start' : 'center' }
      }, [
        panel('a', 'a', [UI.grid(a, { highlight: function () { return 'a'; } }), UI.shapeBadge(a)]),
        panel('b', 'b', [UI.grid(b, { highlight: function () { return 'b'; } }), UI.shapeBadge(b)])
      ]);

      var right;
      if (err) right = errOf(err);
      else {
        right = panel('결과', 'r', [
          UI.grid(res, {
            axisLabels: res.ndim >= 2,
            highlight: function (idx) {
              if (st.color === 'plain') return 'r';
              var pos = idx[joinAxis];
              return pos < splitAt ? 'a' : 'b';
            }
          }),
          UI.shapeBadge(res)
        ]);
      }

      outHost.appendChild(el('div', { class: 'flow' }, [
        opnd, el('span', { class: 'op', text: '→' }), right
      ]));

      if (err) {
        var msg = (err.message || '');
        if (/out of bounds for array of dimension/.test(msg)) {
          outHost.appendChild(el('p', { class: 'small', html:
            '1차원 배열에는 <b>축이 하나뿐</b>이다(axis=0). 없는 축을 지정했으니 <code>AxisError</code> 다. ' +
            '같은 상황에서 <code>np.vstack</code> 은 1차원을 (1, n) 짜리 2차원으로 <b>자동 승격</b>시켜 주기 때문에 에러가 나지 않는다. ' +
            '함수를 vstack 으로 바꿔 확인해 보라.' }));
        } else {
          outHost.appendChild(el('p', { class: 'small', html:
            '<b>붙이는 축을 제외한 나머지 shape 가 모두 같아야</b> 합칠 수 있다. ' +
            'a 는 ' + ND.shapeStr(a.shape) + ', b 는 ' + ND.shapeStr(b.shape) + ' 다. ' +
            '슬라이더로 어긋난 축을 맞춰 보라.' }));
        }
      } else {
        outHost.appendChild(UI.out(ND.format(res)));
        var line = '붙인 축: <b>axis=' + joinAxis + '</b>' +
          (madeNewAxis ? ' (새로 만든 축)' : (joinAxis === 0 ? ' (위아래 ↓)' : ' (좌우 →)')) + '. ' +
          'ndim ' + a.ndim + ' → <b>' + res.ndim + '</b>, shape ' + ND.shapeStr(a.shape) + ' + ' +
          ND.shapeStr(b.shape) + ' → <b>' + ND.shapeStr(res.shape) + '</b>.';
        if (madeNewAxis) {
          line += ' stack 은 축이 <b>하나 늘어난다</b> — 이것이 concatenate 와의 결정적 차이다.';
        }
        outHost.appendChild(el('p', { class: 'small', html: line }));
      }
      outHost.appendChild(el('p', { class: 'small', html: OP_DESC[st.op] }));

      /* concatenate vs stack 직접 비교 (같은 입력으로) */
      if (st.op === 'stack' || st.op === 'concatenate') {
        var cmp = el('div', { class: 'stack-2' });
        [['concatenate', 0], ['stack', 0]].forEach(function (pair) {
          try {
            var out2 = pair[0] === 'concatenate' ? ND.concatenate([a, b], 0) : ND.stack([a, b], 0);
            cmp.appendChild(panel('np.' + pair[0] + '((a, b))  →  ' + ND.shapeStr(out2.shape),
              pair[0] === 'stack' ? 'r' : null,
              [UI.out(ND.format(out2), { label: 'ndim ' + out2.ndim })]));
          } catch (e2) {
            cmp.appendChild(panel('np.' + pair[0] + '((a, b))', null, [errOf(e2)]));
          }
        });
        outHost.appendChild(el('div', null, [
          el('div', { class: 'panel-t', text: '같은 a, b 로 axis=0 비교' }), cmp,
          el('p', { class: 'small', html:
            'concatenate 는 <b>있는 축을 길게</b> 만들고, stack 은 <b>축을 새로</b> 만든다. ' +
            '원소 개수는 둘 다 같지만 shape 가 다르다.' })
        ]));
      }
    }

    rebuildCtl();

    return el('div', null, [
      UI.card({
        kicker: '시뮬레이터',
        title: '합치기 — vstack · hstack · concatenate · stack',
        note: 'a(파랑)와 b(주황)가 <b>어느 방향으로</b> 붙어 결과가 되는지 본다. ' +
          '결과 칸의 색은 그 값이 a 에서 왔는지 b 에서 왔는지를 나타낸다(초록 제목이 결과 배열이다).',
        body: [ctlHost, outHost]
      }),
      buildExtraJoin()
    ]);
  }

  /** column_stack · dstack · tile · repeat 짧게 (실제 계산) */
  function buildExtraJoin() {
    var a = ND.array([1, 2, 3]), b = ND.array([2, 3, 4]);
    var cs = ND.stack([a, b], 1);                                  // column_stack
    var ds = ND.stack([a.reshape([1, 3]), b.reshape([1, 3])], 2);   // dstack
    var av = a.flatValues();
    var rep = ND.array(av.reduce(function (acc, v) { return acc.concat([v, v]); }, []));
    var til = ND.array(av.concat(av));

    function cell(nd) { return UI.out(ND.format(nd), { label: ND.shapeStr(nd.shape) }); }

    return UI.fold('그 밖의 합치기 함수 — column_stack · dstack · tile · repeat', el('div', null, [
      UI.code('a = np.array([1, 2, 3])\nb = np.array([2, 3, 4])'),
      UI.table([
        { k: 'f', label: '함수' }, { k: 'd', label: '하는 일' }, { k: 'v', label: '결과', raw: true }
      ], [
        { f: 'np.column_stack((a, b))', d: '1차원들을 각각 열로 세워 붙인다', v: cell(cs) },
        { f: 'np.dstack((a, b))', d: '세 번째 축(깊이) 방향으로 붙인다', v: cell(ds) },
        { f: 'np.repeat(a, 2)', d: '각 원소를 그 자리에서 2번 반복', v: cell(rep) },
        { f: 'np.tile(a, 2)', d: '배열 전체를 2번 이어 붙인다', v: cell(til) }
      ]),
      el('p', { class: 'small', html:
        '<code>repeat</code> 과 <code>tile</code> 의 차이를 위 결과에서 비교하라. ' +
        'repeat 은 <b>원소 단위</b>로, tile 은 <b>배열 단위</b>로 반복한다.' })
    ]));
  }

  /* ======================================================================
   * 시뮬레이터 ④ 쪼개기
   * ==================================================================== */

  function buildSplitSim() {
    var st = { mode: '1d', fn: 'split', n: 3, axis: 0, len: 12 };
    var ctlHost = el('div');
    var outHost = el('div');

    function rebuildCtl() {
      UI.clear(ctlHost);
      var nd = st.mode === '1d' ? 1 : 2;
      if (st.axis > nd - 1) st.axis = nd - 1;
      var items = [
        UI.seg({ label: '함수', value: st.fn,
          options: [{ value: 'split', label: 'np.split — 균등 분할만' },
                    { value: 'array_split', label: 'np.array_split — 안 맞아도 나눔' }],
          onChange: function (v) { st.fn = v; draw(); } }),
        UI.seg({ label: '배열 차원', value: st.mode,
          options: [{ value: '1d', label: '1차원' }, { value: '2d', label: '2차원 (3, 8)' }],
          onChange: function (v) { st.mode = v; rebuildCtl(); } }),
        UI.slider({ label: '조각 수', min: 2, max: 5, step: 1, value: st.n,
          onChange: function (v) { st.n = v; draw(); } })
      ];
      if (st.mode === '1d') {
        items.push(UI.slider({ label: '배열 길이', min: 6, max: 12, step: 1, value: st.len,
          onChange: function (v) { st.len = v; draw(); } }));
      } else {
        items.push(UI.slider({ label: 'axis', min: 0, max: 1, step: 1, value: st.axis,
          format: function (v) { return v + (+v === 0 ? ' (행 방향 = vsplit)' : ' (열 방향 = hsplit)'); },
          onChange: function (v) { st.axis = v; draw(); } }));
      }
      ctlHost.appendChild(UI.controls(items));
      draw();
    }

    function draw() {
      UI.clear(outHost);
      var a = st.mode === '1d' ? ND.arange(st.len) : ND.arange(24).reshape([3, 8]);
      var axis = st.mode === '1d' ? 0 : st.axis;
      var codeStr = (st.mode === '1d'
        ? 'a = np.arange(' + st.len + ')\n'
        : 'a = np.arange(24).reshape(3, 8)\n') +
        'np.' + st.fn + '(a, ' + st.n + (st.mode === '1d' ? '' : ', axis=' + axis) + ')';
      outHost.appendChild(UI.code(codeStr));

      var parts = null, err = null;
      try { parts = splitParts(a, st.n, axis, st.fn === 'split'); }
      catch (e) { err = e; }

      /* 원본: 조각별로 색을 번갈아 */
      var owner = {};
      if (parts) {
        parts.forEach(function (p, pi) {
          p.flatBufIndices().forEach(function (bi) { owner[bi] = pi; });
        });
      }
      outHost.appendChild(panel('원본 a', 'a', [
        UI.grid(a, {
          axisLabels: a.ndim === 2,
          highlight: function (idx) {
            if (!parts) return 'a';
            var o = owner[a.bufIndex(idx)];
            return o === undefined ? 'dim' : (o % 2 === 0 ? 'a' : 'b');
          }
        }),
        UI.shapeBadge(a)
      ]));

      if (err) {
        outHost.appendChild(errOf(err));
        outHost.appendChild(el('p', { class: 'small', html:
          'axis=' + axis + ' 의 길이 ' + a.shape[axis] + ' 를 ' + st.n + ' 로 <b>나누어떨어지게 자를 수 없다.</b> ' +
          '<code>np.split</code> 은 균등 분할만 허용한다. ' +
          '<code>np.array_split</code> 로 바꾸면 앞쪽 조각을 하나씩 크게 만들어 나눠 준다.' }));
        return;
      }

      var row = el('div', { class: 'flow' });
      parts.forEach(function (p, pi) {
        row.appendChild(panel('조각 ' + pi + '  ' + ND.shapeStr(p.shape), pi % 2 === 0 ? 'a' : 'b', [
          UI.grid(p, { highlight: function () { return pi % 2 === 0 ? 'a' : 'b'; } })
        ]));
      });
      outHost.appendChild(row);
      outHost.appendChild(el('p', { class: 'small', html:
        '조각 크기: <b>' + parts.map(function (p) { return p.shape[axis]; }).join(' + ') + ' = ' +
        a.shape[axis] + '</b> (axis=' + axis + ' 기준). ' +
        (st.mode === '2d'
          ? 'axis=0 으로 자르는 것이 <code>np.vsplit</code>, axis=1 로 자르는 것이 <code>np.hsplit</code> 이다.'
          : '1차원에는 축이 하나뿐이라 axis 를 지정할 필요가 없다.') }));
      outHost.appendChild(el('p', { class: 'small muted', html:
        'split 이 돌려주는 조각은 <b>뷰(view)</b> 다 — 원본과 메모리를 공유한다. ' +
        '조각을 고치면 원본도 바뀐다(5장에서 다룬 내용).' }));
    }

    rebuildCtl();

    return UI.card({
      kicker: '시뮬레이터',
      title: '쪼개기 — split · array_split · hsplit · vsplit',
      note: '합치기의 반대다. 원본 격자의 칸 색이 <b>어느 조각에 속하는지</b>를 나타낸다(파랑·주황 번갈아).',
      body: [ctlHost, outHost]
    });
  }

  /* -------------------------------- 관절염 데이터 앞 20일 / 뒤 20일 */

  function buildInflammationSplit() {
    if (!D || !D.inflammation) {
      return UI.callout('tip', '관절염 데이터가 이 빌드에 들어 있지 않아 실용 예제를 생략한다.');
    }
    var data = D.nd('inflammation');
    var halves = splitParts(data, 2, 1, true);      // hsplit(data, 2)
    var first = halves[0], second = halves[1];
    var m1 = ND.mean(first).toNested(), m2 = ND.mean(second).toNested();
    var d1 = ND.mean(first, 0).flatValues();       // 앞 20일의 날짜별 평균
    var d2 = ND.mean(second, 0).flatValues();
    var xs = []; for (var i = 0; i < 20; i++) xs.push(i);

    return el('div', null, [
      el('p', null, [
        '실제로 써 보자. 관절염 데이터는 ', el('b', { text: ND.shapeStr(data.shape) }),
        ' (환자 60명 × 40일)이다. 이것을 앞 20일과 뒤 20일로 나눠 비교한다.'
      ]),
      UI.code("data = np.loadtxt('lab_inflammation-01.csv', delimiter=',')\n" +
        'first20, last20 = np.hsplit(data, 2)      # 열(날짜)을 반으로\n' +
        'first20.shape, last20.shape\n' +
        'first20.mean(), last20.mean()'),
      UI.statRow([
        { k: 'first20.shape', v: ND.shapeStr(first.shape), sub: '앞 20일' },
        { k: 'last20.shape', v: ND.shapeStr(second.shape), sub: '뒤 20일' },
        { k: '앞 20일 평균', v: UI.round2(m1), sub: '염증 수치' },
        { k: '뒤 20일 평균', v: UI.round2(m2), sub: '염증 수치' }
      ]),
      UI.lineChart({
        series: [
          { name: '앞 20일 (day 0~19)', values: d1, color: 'var(--s1)' },
          { name: '뒤 20일 (day 20~39)', values: d2, color: 'var(--s2)' }
        ],
        x: xs, xLabel: '나눈 뒤의 열 번호', yLabel: '환자 60명 평균 염증', height: 240, yMin: 0
      }),
      el('p', { class: 'small', html:
        '두 조각을 같은 x축(0~19)에 겹쳐 놓으니 모양이 완전히 다르다. ' +
        '앞 20일은 계속 올라가고, 뒤 20일은 처음부터 높다가 내려온다. ' +
        '<b>쪼개기는 데이터를 구간별로 비교할 때 쓴다</b> — 학습/검증 데이터 분리도 같은 원리다.' })
    ]);
  }

  /* ======================================================================
   * 배열은 크기가 고정되어 있다
   * ==================================================================== */

  function buildGrowCost() {
    var st = { n: 1000 };
    var host = el('div');

    function rebuild() {
      UI.clear(host);
      var n = st.n;
      var copied = ND.sum(ND.arange(1, n + 1)).toNested();   // 1+2+…+n
      var ratio = copied / n;
      host.appendChild(UI.statRow([
        { k: '원소 수 n', v: String(n) },
        { k: 'concatenate 로 하나씩', v: copied.toLocaleString('en-US'), sub: '복사한 원소 총합 1+2+…+n' },
        { k: '미리 만들고 채우기', v: n.toLocaleString('en-US'), sub: '복사 없음' },
        { k: '낭비 배수', v: '×' + UI.round2(ratio) }
      ]));
      host.appendChild(el('p', { class: 'small', html:
        'n 을 두 배로 늘리면 낭비 배수도 <b>두 배</b>가 된다. 즉 이 방식의 비용은 n² 에 비례한다. ' +
        'n = ' + n + ' 이면 벌써 ' + UI.round2(ratio) + ' 배다.' }));
    }

    var ctl = UI.controls([
      UI.slider({ label: '늘려 갈 원소 수 n', min: 100, max: 3000, step: 100, value: st.n,
        onChange: function (v) { st.n = v; rebuild(); } })
    ]);
    rebuild();

    return el('div', null, [
      UI.callout('trap',
        '반복문 안에서 <code>np.concatenate</code> 나 <code>np.append</code> 로 배열을 늘리는 것. ' +
        'NumPy 배열은 <b>크기가 고정</b>이라 늘릴 수가 없다. 그래서 이 함수들은 매번 ' +
        '<b>새 배열을 만들고 전체를 복사</b>한다. list 의 <code>append</code> 처럼 싼 연산이 아니다.'),
      el('div', { class: 'stack-2' }, [
        panel('나쁜 방식 — 매번 전체 복사', null, [
          UI.code('result = np.array([])\nfor i in range(n):\n' +
            '    result = np.append(result, i)   # 매번 새 배열!')
        ]),
        panel('좋은 방식 — 그릇을 먼저 만든다', 'r', [
          UI.code('result = np.zeros(n)\nfor i in range(n):\n    result[i] = i\n\n' +
            '# 또는: 리스트에 모았다가 마지막에 한 번\nresult = np.array([i for i in range(n)])')
        ])
      ]),
      UI.card({
        kicker: '계산기',
        title: '얼마나 낭비인가',
        note: '하나씩 붙이면 i번째에 i개를 복사한다. 전부 더하면 1+2+⋯+n 이다. 엔진이 실제로 합을 계산한다.',
        body: [ctl, host]
      }),
      UI.callout('tip',
        '정리하면 <b>"먼저 그릇, 그 다음 채우기"</b> 다. 이 장의 <code>zeros</code>·<code>ones</code>·' +
        '<code>empty</code>·<code>*_like</code> 가 존재하는 이유가 바로 이것이다.')
    ]);
  }

  /* ======================================================================
   * 확인 문제
   * ==================================================================== */

  function buildQuiz() {
    return UI.quiz([
      {
        q: '<code>np.arange(0, 1, 0.25)</code> 와 <code>np.linspace(0, 1, 5)</code> 를 각각 실행했다. ' +
           '두 배열의 <b>마지막 원소</b>는?',
        choices: [
          '둘 다 1.0 — 같은 구간이니 끝값도 같다',
          'arange 는 0.75, linspace 는 1.0',
          'arange 는 1.0, linspace 는 0.75',
          '둘 다 0.75'
        ],
        answer: 1,
        explain: 'arange 는 파이썬 range 처럼 <b>stop 을 포함하지 않는다</b> → 0, 0.25, 0.5, 0.75 (4개). ' +
          'linspace 는 기본이 endpoint=True 라서 <b>끝값을 포함</b>한다 → 0, 0.25, 0.5, 0.75, 1.0 (5개). ' +
          '개수도 4개와 5개로 다르다.'
      },
      {
        q: '<code>arr3 = np.arange(30).reshape(5, 6)</code> 일 때 <code>print(np.ones_like(arr3))</code> ' +
           '가 찍는 값은?',
        choices: [
          '<code>1.</code> — ones 계열은 항상 float64 다',
          '<code>1</code> — arr3 의 dtype(int64)을 물려받는다',
          'arr3 이 정수라서 TypeError 가 난다',
          '<code>0</code> — like 계열은 값을 물려받지 않으므로 0 이다'
        ],
        answer: 1,
        explain: '<code>*_like</code> 함수는 shape 뿐 아니라 <b>dtype 까지 물려받는다</b>. arr3 이 int64 이므로 ' +
          '결과도 int64 이고 <code>1</code> 로 찍힌다. 반면 <code>np.ones(arr3.shape)</code> 는 dtype 을 ' +
          '물려받을 원본이 없어서 기본값 float64 → <code>1.</code> 이 된다.'
      },
      {
        q: '<code>a</code>, <code>b</code> 가 각각 shape <code>(3,)</code> 인 1차원 배열이다. ' +
           '<code>np.concatenate((a, b))</code> 와 <code>np.stack((a, b))</code> 의 shape 는?',
        choices: [
          '(6,) 와 (2, 3)',
          '(2, 3) 와 (6,)',
          '둘 다 (6,)',
          '둘 다 (2, 3)'
        ],
        answer: 0,
        explain: 'concatenate 는 <b>있는 축(axis=0)을 길게</b> 이어 붙인다 → (6,), ndim 은 그대로 1. ' +
          'stack 은 <b>새 축을 만든다</b> → (2, 3), ndim 이 2 로 늘어난다. ' +
          '원소 개수는 둘 다 6개인데 모양이 다르다.'
      },
      {
        q: '<code>np.empty((2, 3))</code> 를 실행했더니 출력이 전부 <code>0.</code> 이었다. ' +
           '이 결과로부터 옳게 말한 것은?',
        choices: [
          'empty 는 0 으로 채우는 함수다 — zeros 와 같다',
          '그 메모리에 우연히 0 이 남아 있었을 뿐이고, 어떤 값이 나올지는 보장되지 않는다',
          'shape 가 작을 때만 0 이 나오고 크면 쓰레기 값이 나온다',
          'dtype 이 float64 라서 항상 0. 이 나온다'
        ],
        answer: 1,
        explain: '<code>np.empty</code> 는 메모리를 확보만 하고 <b>초기화하지 않는다</b>. ' +
          '따라서 이전에 그 자리에 있던 값이 그대로 보이며, 0 이 나오는 것은 우연일 뿐 보장이 아니다. ' +
          '0 이 필요하면 <code>np.zeros</code> 를 써야 한다. 크기와도 상관없다.'
      }
    ], { id: 'create' });
  }

})();
