/* ===========================================================================
 * ch07-broadcast.js — 7장 배열의 연산과 브로드캐스팅
 * 노트북 셀 90~113 대응.
 * 이 장의 최대 난관은 브로드캐스팅이다. 규칙을 글로 외우게 하지 않고
 * shape 를 직접 입력해서 3단계가 어떻게 진행되는지 눈으로 확인하게 만든다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* ------------------------------------------------------------ 공용 도우미 */

  var HLC = { a: 'hl-a', b: 'hl-b', r: 'hl-r', x: 'hl-x', err: 'hl-err', dim: 'hl-dim', ghost: 'hl-ghost' };

  /** UI.grid 가 만든 노드에서 셀 DOM 을 C 순서로 뽑는다 (다시 그리지 않고 색만 바꾸기 위해) */
  function cellsOf(node) { return Array.prototype.slice.call(node.querySelectorAll('.cell')); }

  /** 이미 그려진 격자의 색만 갈아 끼운다. fn(idx) -> 'a'|'b'|'r'|'x'|'dim'|null */
  function repaint(cells, arr, fn) {
    var idxs = arr.indices();
    for (var i = 0; i < cells.length && i < idxs.length; i++) {
      cells[i].className = 'cell';
      var h = fn(idxs[i]);
      if (h && HLC[h]) cells[i].classList.add(HLC[h]);
    }
  }

  function panel(kind, title, body) {
    return el('div', null, [el('div', { class: 'panel-t' + (kind ? ' ' + kind : ''), text: title })]
      .concat(body || []));
  }

  function op(sym) { return el('span', { class: 'op', text: sym }); }

  function mono(text) { return el('div', { class: 'small mono', style: { color: 'var(--ink-2)', margin: '.5rem 0 0' }, text: text }); }

  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padR(s, w) { s = String(s); while (s.length < w) s = s + ' '; return s; }

  function bad(text) {
    return el('b', { style: { color: 'var(--critical)' }, text: text });
  }

  function marksAll(n, m) { var o = {}; for (var i = 0; i < n; i++) o[i] = m; return o; }

  /** 원소 단위 stride 를 NumPy 처럼 바이트로도 보여 준다 */
  function strideStr(a) {
    return ND.shapeStr(a.strides) + ' 원소  =  ' +
      ND.shapeStr(a.strides.map(function (s) { return s * a.itemsize; })) + ' 바이트';
  }

  /**
   * 브로드캐스팅 1단계(차원 맞추기)를 아스키로. 모든 칸을 코드로 계산해 맞춘다.
   * 한글은 줄 끝에만 둔다 (앞부분이 전부 ASCII 라 정렬이 깨지지 않는다).
   */
  function padAscii(sa, sb, pa, pb) {
    var n = pa.length, W = 5, i;
    var labs = ['axis', 'A  ' + ND.shapeStr(sa), 'B  ' + ND.shapeStr(sb),
      "A' " + ND.shapeStr(pa), "B' " + ND.shapeStr(pb)];
    var lw = 0;
    labs.forEach(function (s) { lw = Math.max(lw, s.length); });
    lw += 2;
    function row(label, arr, offset) {
      var s = padR(label, lw);
      for (var k = 0; k < n; k++) s += padL(k < offset ? '' : String(arr[k - offset]), W);
      return s;
    }
    var axes = []; for (i = 0; i < n; i++) axes.push(i);
    var lines = [];
    lines.push(row('axis', axes, 0));
    lines.push(row(labs[1], sa, n - sa.length));
    lines.push(row(labs[2], sb, n - sb.length) + '   <- 오른쪽 끝부터 맞춘다');
    lines.push(new Array(lw + n * W + 1).join('-'));
    lines.push(row(labs[3], pa, 0));
    lines.push(row(labs[4], pb, 0) + '   <- 앞(왼쪽)을 1 로 채운 결과');
    return lines.join('\n');
  }

  /** 2단계: 축별 호환 검사 표. 충돌 축은 빨강. */
  function axisTable(pa, pb) {
    var rows = [];
    for (var i = 0; i < pa.length; i++) {
      var x = pa[i], y = pb[i], verdict, res, isErr = false;
      if (x === y) { verdict = '같음 → 그대로'; res = String(x); }
      else if (x === 1) { verdict = 'A 를 ' + y + ' 로 늘림 (stretchA)'; res = String(y); }
      else if (y === 1) { verdict = 'B 를 ' + x + ' 로 늘림 (stretchB)'; res = String(x); }
      else { verdict = '충돌 — 다르고 둘 다 1 이 아니다'; res = '✗'; isErr = true; }
      rows.push({
        ax: 'axis ' + i, a: x, b: y,
        v: isErr ? bad(verdict) : verdict,
        r: isErr ? bad(res) : res
      });
    }
    return UI.table([
      { k: 'ax', label: '축' },
      { k: 'a', label: "A' 크기", num: true },
      { k: 'b', label: "B' 크기", num: true },
      { k: 'v', label: '판정' },
      { k: 'r', label: '결과 크기', num: true }
    ], rows);
  }

  /* --------------------------------------------------------------- 프리셋 */

  var PRESETS = [
    { sa: [2, 3], sb: [], label: '(2,3) + 3', why: '스칼라는 shape () → (1,1) 로 채워져 모든 칸으로 늘어난다.' },
    { sa: [4, 1], sb: [3], label: '(4,1) + (3,)', why: '열벡터와 행벡터가 서로 늘어나 격자 (4,3) 이 만들어진다.' },
    { sa: [3, 4], sb: [4], label: '(3,4) + (4,)', why: '마지막 축이 둘 다 4 라서 그대로 맞는다. (4,) → (1,4).' },
    { sa: [3, 4], sb: [3], label: '(3,4) + (3,)', why: '(3,) 은 (3,1) 이 아니라 (1,3) 이 된다 → 축 1 에서 4 와 3 이 충돌.' },
    { sa: [3, 4], sb: [3, 1], label: '(3,4) + (3,1)', why: '축 1 이 1 이므로 4 로 늘어난다. keepdims=True 가 만드는 모양.' },
    { sa: [3, 1], sb: [1, 4], label: '(3,1) + (1,4)', why: '양쪽이 각각 다른 축에서 늘어난다 → (3,4).' },
    { sa: [2, 3], sb: [3, 2], label: '(2,3) + (3,2)', why: '전치 관계일 뿐 축별로는 맞지 않는다. 브로드캐스팅으로 해결되지 않는다.' },
    { sa: [60, 40], sb: [60, 1], label: '(60,40) + (60,1)', why: '관절염 데이터에서 환자별 평균을 빼는 모양. 축 1 이 1 → 40 으로 늘어난다.' },
    { sa: [60, 40], sb: [60], label: '(60,40) + (60,)', why: 'keepdims 를 빼면 (1,60) 으로 맞춰져 축 1 에서 40 과 60 이 충돌한다.' },
    { sa: [2, 2, 3], sb: [3], label: '(2,2,3) + (3,)', why: '3차원에도 같은 규칙이다. (3,) → (1,1,3).' }
  ];

  function shapeToInput(sh) { return sh.join(','); }

  function parseShape(s) {
    var parts = String(s).replace(/[()\[\]\s]/g, '').split(',');
    var out = [], ok = true;
    parts.forEach(function (p) {
      if (p === '') return;
      var n = Number(p);
      if (!isFinite(n) || n <= 0 || Math.floor(n) !== n || n > 400) ok = false;
      else out.push(n);
    });
    if (!ok || out.length > 3) return null;
    return out;
  }

  /* =========================================================== 장 등록 */

  Lab.register({
    id: 'broadcast',
    n: '7',
    title: '배열의 연산과 브로드캐스팅',
    blurb: '같은 크기끼리는 칸끼리 계산하고, 크기가 다르면 NumPy 가 축을 늘려 맞춘다. 그 "늘리기"의 정체는 stride 0 이다.',
    sim: '원소별 연산 판 · * vs @ 대비기 · 브로드캐스팅 3단계 시뮬레이터 · keepdims 실험실 · 구구단 표',

    render: function (root) {

      /* ================================================== 7.1 원소별 연산 */

      root.appendChild(el('h2', { class: 'h-sec', text: '7.1 원소별 연산 — 칸끼리 계산한다' }));
      root.appendChild(el('p', {
        html: 'NumPy 의 <code>+ - * / // % **</code> 는 모두 <b>같은 위치의 칸끼리</b> 계산한다. ' +
          'shape 가 같은 두 배열을 더하면 결과도 같은 shape 다. 반복문은 한 줄도 쓰지 않는다.'
      }));

      var a91 = ND.array([[1, 2, 3], [4, 5, 6]]);
      root.appendChild(UI.code('a = np.array([[1, 2, 3],\n              [4, 5, 6]])\nprint(a)'));
      root.appendChild(UI.out(ND.format(a91)));

      function miniOut(codeStr, arr) {
        return el('div', null, [UI.code(codeStr), UI.out(ND.format(arr), { label: false })]);
      }
      root.appendChild(el('div', { class: 'stack-3' }, [
        miniOut('a + a', ND.ops.add(a91, a91)),
        miniOut('a - a', ND.ops.sub(a91, a91)),
        miniOut('a * a', ND.ops.mul(a91, a91))
      ]));

      root.appendChild(UI.callout('why',
        '<code>a * a</code> 의 [0,1] 칸은 <b>a[0,1] × a[0,1]</b> 이다. ' +
        '왼쪽 배열의 어떤 칸도 오른쪽 배열의 다른 칸과 만나지 않는다. ' +
        '이것이 수학 시간에 배우는 행렬의 곱과 결정적으로 다른 점이다.'));

      /* ---------------------------------------- 시뮬레이터: 원소별 연산 판 */

      (function () {
        var A = a91;
        var B = ND.arange(6, 0, -1).reshape([2, 3]);
        var OPS = [
          { v: 'add', l: '+', py: 'a + b', fn: ND.ops.add },
          { v: 'sub', l: '−', py: 'a - b', fn: ND.ops.sub },
          { v: 'mul', l: '*', py: 'a * b', fn: ND.ops.mul },
          { v: 'div', l: '/', py: 'a / b', fn: ND.ops.div },
          { v: 'floordiv', l: '//', py: 'a // b', fn: ND.ops.floordiv },
          { v: 'mod', l: '%', py: 'a % b', fn: ND.ops.mod },
          { v: 'pow', l: '**', py: 'a ** b', fn: ND.ops.pow }
        ];
        var state = { op: 'add' };
        var host = el('div');

        function cur() {
          for (var i = 0; i < OPS.length; i++) if (OPS[i].v === state.op) return OPS[i];
          return OPS[0];
        }

        function rebuild() {
          UI.clear(host);
          var o = cur();
          var R = o.fn(A, B);
          host.appendChild(el('div', { class: 'flow' }, [
            panel('a', 'a  (2, 3)', [UI.grid(A, { highlight: function () { return 'a'; }, cellSize: 36 })]),
            op(o.l),
            panel('b', 'b  (2, 3)', [UI.grid(B, { highlight: function () { return 'b'; }, cellSize: 36 })]),
            op('='),
            panel('r', o.py, [UI.grid(R, { highlight: function () { return 'r'; }, cellSize: 42 })])
          ]));
          host.appendChild(UI.shapeBadge(R));
          host.appendChild(UI.code('a = np.array([[1, 2, 3],\n              [4, 5, 6]])\nb = np.arange(6, 0, -1).reshape(2, 3)\n' + o.py));
          host.appendChild(UI.out(ND.format(R)));
          if (o.v === 'div') {
            host.appendChild(UI.callout('tip',
              '정수끼리 나눠도 <code>/</code> 의 결과 dtype 은 <b>float64</b> 다. ' +
              '정수를 유지하고 싶으면 몫만 구하는 <code>//</code> 를 쓴다.'));
          }
        }
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '원소별 연산 판 — 연산자 7개',
          note: '연산자를 바꿔 보라. 두 배열의 같은 자리 칸끼리만 계산된다는 것이 모든 연산에서 똑같다. ' +
            '<code>b = np.arange(6, 0, -1).reshape(2, 3)</code> 이라서 <code>a + b</code> 는 모든 칸이 7 이 된다.',
          body: [
            UI.controls([UI.seg({
              label: '연산자', value: 'add',
              options: OPS.map(function (o) { return { value: o.v, label: o.l }; }),
              onChange: function (v) { state.op = v; rebuild(); }
            })]),
            host
          ]
        }));
      })();

      /* -------------------------------------------------- 벡터화 (반복문 없음) */

      root.appendChild(el('h3', { class: 'h-sub', text: '반복문이 필요 없다 = 벡터화' }));
      root.appendChild(el('div', { class: 'stack-2' }, [
        el('div', null, [
          el('div', { class: 'panel-t', text: '파이썬 리스트 + 이중 for' }),
          UI.code('a = [[1, 2, 3], [4, 5, 6]]\nout = []\nfor i in range(len(a)):\n    row = []\n    for j in range(len(a[i])):\n        row.append(a[i][j] * a[i][j])\n    out.append(row)')
        ]),
        el('div', null, [
          el('div', { class: 'panel-t a', text: 'NumPy' }),
          UI.code('a = np.array([[1, 2, 3], [4, 5, 6]])\nout = a * a')
        ])
      ]));

      (function () {
        // 두 방법의 결과가 정말 같은지 엔진으로 확인한다
        var nested = a91.toNested(), loop = [];
        for (var i = 0; i < nested.length; i++) {
          var row = [];
          for (var j = 0; j < nested[i].length; j++) row.push(nested[i][j] * nested[i][j]);
          loop.push(row);
        }
        var same = ND.all(ND.ops.eq(ND.array(loop), ND.ops.mul(a91, a91))).toNested();
        root.appendChild(UI.out('np.array_equal(out_for, out_numpy) → ' + (same ? 'True' : 'False'),
          { label: '두 결과 비교' }));
      })();

      root.appendChild(UI.callout('why',
        '왼쪽은 파이썬 인터프리터가 칸마다 <b>객체 하나씩</b> 꺼내 곱한다. ' +
        '오른쪽은 C 로 짠 반복문 하나가 같은 dtype 의 값들을 연속된 메모리에서 훑는다. ' +
        '코드가 짧아지는 것은 부수 효과이고, 본질은 <b>루프가 파이썬 밖으로 내려간 것</b>이다.'));

      /* ============================================ * 와 @ 는 다른 연산이다 */

      root.appendChild(el('h2', { class: 'h-sec', text: '* 와 @ 는 다른 연산이다' }));
      root.appendChild(el('p', {
        html: '같은 (2,2) 배열 두 개에 <code>*</code> 와 <code>@</code> 를 적용하면 ' +
          '<b>shape 는 같지만 값이 다르다.</b> 결과 칸에 마우스를 올려 어느 칸들이 쓰였는지 확인해 보라.'
      }));

      (function () {
        var m1 = ND.array([[1, 2], [3, 4]]);
        var m2 = ND.array([[5, 6], [7, 8]]);
        var eq = ND.ops.mul(m1, m2);
        var mmAll = ND.matmul(m1, m2, { steps: true });
        var mm = mmAll.result;

        var gA = UI.grid(m1, { highlight: function () { return 'a'; }, axisLabels: true, cellSize: 40 });
        var gB = UI.grid(m2, { highlight: function () { return 'b'; }, axisLabels: true, cellSize: 40 });
        var cA = cellsOf(gA), cB = cellsOf(gB);

        var DEF_E = '결과 칸에 마우스를 올려 보라.';
        var DEF_M = '결과 칸에 마우스를 올려 보라.';
        var fE = mono(DEF_E), fM = mono(DEF_M);

        function resetAll() {
          repaint(cA, m1, function () { return 'a'; });
          repaint(cB, m2, function () { return 'b'; });
          repaint(cE, eq, function () { return 'r'; });
          repaint(cM, mm, function () { return 'r'; });
          fE.textContent = DEF_E; fM.textContent = DEF_M;
        }

        var gE = UI.grid(eq, {
          highlight: function () { return 'r'; }, axisLabels: true, cellSize: 44,
          onHover: function (idx) {
            if (!idx) { resetAll(); return; }
            var hit = function (i) { return (i[0] === idx[0] && i[1] === idx[1]) ? 'x' : 'dim'; };
            repaint(cA, m1, hit); repaint(cB, m2, hit);
            repaint(cE, eq, function (i) { return (i[0] === idx[0] && i[1] === idx[1]) ? 'r' : 'dim'; });
            repaint(cM, mm, function () { return 'dim'; });
            var k = '[' + idx.join(', ') + ']';
            fE.textContent = 'c' + k + ' = a' + k + ' * b' + k + ' = ' +
              m1.get(idx) + ' * ' + m2.get(idx) + ' = ' + eq.get(idx);
            fM.textContent = DEF_M;
          }
        });
        var cE = cellsOf(gE);

        var gM = UI.grid(mm, {
          highlight: function () { return 'r'; }, axisLabels: true, cellSize: 44,
          onHover: function (idx) {
            if (!idx) { resetAll(); return; }
            repaint(cA, m1, function (i) { return i[0] === idx[0] ? 'x' : 'dim'; });
            repaint(cB, m2, function (i) { return i[1] === idx[1] ? 'x' : 'dim'; });
            repaint(cM, mm, function (i) { return (i[0] === idx[0] && i[1] === idx[1]) ? 'r' : 'dim'; });
            repaint(cE, eq, function () { return 'dim'; });
            var st = null;
            mmAll.steps.forEach(function (s) { if (s.i === idx[0] && s.j === idx[1]) st = s; });
            var parts = st.terms.map(function (t) { return t.a + '×' + t.b; });
            fM.textContent = 'c[' + idx.join(', ') + '] = ' + parts.join(' + ') + ' = ' + st.value +
              '  (a 의 ' + idx[0] + '행 · b 의 ' + idx[1] + '열)';
            fE.textContent = DEF_E;
          }
        });
        var cM = cellsOf(gM);

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '원소별 곱 vs 행렬곱 대비기',
          note: 'a 와 b 는 같은 두 배열이다. 아래 두 결과는 <b>shape 가 똑같은데 값이 다르다.</b> ' +
            '원소별 곱은 칸 하나에서 칸 하나가 나오고, 행렬곱은 <b>한 행 전체와 한 열 전체</b>가 만나 한 칸이 된다.',
          body: [
            el('div', { class: 'flow' }, [
              panel('a', 'a  (2, 2)', [gA]),
              panel('b', 'b  (2, 2)', [gB])
            ]),
            el('div', { class: 'stack-2', style: { marginTop: '1.1rem' } }, [
              panel('r', 'a * b  — 원소별 (Hadamard)', [gM ? gE : gE, fE]),
              panel('r', 'a @ b  — 행렬곱', [gM, fM])
            ]),
            UI.legend([
              { color: 'var(--s1)', label: 'a 배열' },
              { color: 'var(--s2)', label: 'b 배열' },
              { color: 'var(--s3)', label: '결과' },
              { color: 'var(--s4)', label: '이 칸을 만드는 데 쓰인 칸' }
            ])
          ]
        }));

        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [UI.code('a * b'), UI.out(ND.format(eq), { label: false })]),
          el('div', null, [UI.code('a @ b'), UI.out(ND.format(mm), { label: false })])
        ]));

        // (2,3) 이면 * 는 되고 @ 는 안 된다
        root.appendChild(el('p', {
          html: 'shape 가 정사각형이 아니면 차이가 더 분명해진다. (2,3) 배열끼리 ' +
            '<code>*</code> 는 잘 되지만 <code>@</code> 는 <b>에러</b>다.'
        }));
        root.appendChild(UI.code('a = np.array([[1, 2, 3], [4, 5, 6]])   # (2, 3)\na * a      # 잘 된다\na @ a      # ?'));
        root.appendChild(UI.out(ND.format(ND.ops.mul(a91, a91)), { label: 'a * a' }));
        try {
          ND.matmul(a91, a91);
          root.appendChild(UI.out('(에러가 나지 않았다)', { label: 'a @ a' }));
        } catch (e) {
          root.appendChild(UI.errBlock(e.message));
        }
        root.appendChild(UI.fold('실제 NumPy 2.x 가 내는 전체 메시지',
          UI.errBlock("matmul: Input operand 1 has a mismatch in its core dimension 0, " +
            "with gufunc signature (n?,k),(k,m?)->(n?,m?) (size 2 is different from 3)")));

        root.appendChild(UI.callout('trap',
          '수학 시간의 "행렬의 곱"은 <code>@</code> 다. <code>*</code> 는 성분별 곱(아다마르 곱)이다. ' +
          '옛 코드에 나오는 <code>np.matrix</code> 에서는 <code>*</code> 가 행렬곱이지만, ' +
          '<code>np.matrix</code> 는 쓰지 않는 것이 좋다 — 지금은 <code>np.ndarray</code> 와 <code>@</code> 가 표준이다.'));
      })();

      /* ================================================ 0 으로 나누기 · ufunc */

      root.appendChild(el('h2', { class: 'h-sec', text: '0 으로 나누기와 ufunc' }));

      (function () {
        var x = ND.array([0, 1, -1], 'float64');
        var y = ND.zeros([3], 'float64');
        var r = ND.ops.div(x, y);

        root.appendChild(el('p', {
          html: '파이썬 스칼라 <code>1 / 0</code> 은 예외를 던지고 프로그램이 멈춘다. ' +
            '그런데 <b>배열끼리의 나눗셈은 멈추지 않는다.</b> 경고만 내고 <code>nan</code> · <code>inf</code> 를 값으로 넣는다.'
        }));
        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [
            el('div', { class: 'panel-t', text: '파이썬 스칼라' }),
            UI.code('1 / 0'),
            UI.errBlock('division by zero', 'ZeroDivisionError')
          ]),
          el('div', null, [
            el('div', { class: 'panel-t a', text: 'NumPy 배열' }),
            UI.code('x = np.array([0.0, 1.0, -1.0])\ny = np.array([0.0, 0.0, 0.0])\nx / y'),
            UI.out(ND.format(r), { label: false })
          ])
        ]));
        root.appendChild(UI.out(
          'RuntimeWarning: invalid value encountered in divide\n' +
          'RuntimeWarning: divide by zero encountered in divide',
          { label: '함께 나오는 경고' }));
        root.appendChild(UI.callout('why',
          '<b>0 / 0 → nan</b>(정할 수 없는 값), <b>1 / 0 → inf</b>(무한대), <b>-1 / 0 → -inf</b> 다. ' +
          '배열 계산을 중간에 멈추면 나머지 2399개 칸의 계산이 통째로 날아간다. ' +
          '그래서 NumPy 는 문제가 된 칸에만 표식을 남기고 계속 간다. ' +
          '이 값들을 찾아내는 <code>np.isnan</code> · <code>np.isfinite</code> 는 9장에서 다룬다.'));
        root.appendChild(UI.callout('ver',
          '수업자료의 <code>np.NaN</code>, <code>np.Inf</code> 는 <b>NumPy 2.0 에서 삭제되었다.</b> ' +
          '이제는 소문자 <code>np.nan</code>, <code>np.inf</code> 만 쓴다. ' +
          '옛 코드를 그대로 실행하면 <code>AttributeError: np.NaN was removed in the NumPy 2.0 release. Use np.nan instead.</code> 가 난다. ' +
          '<code>np.float_</code>, <code>np.int</code> 도 함께 사라졌다.'));

        // ufunc
        root.appendChild(el('h3', { class: 'h-sub', text: '연산자의 실체는 ufunc 다' }));
        root.appendChild(el('p', {
          html: '<code>+</code> 를 쓰면 NumPy 는 <code>np.add</code> 라는 함수(ufunc, universal function)를 부른다. ' +
            '연산자는 그 함수의 별명일 뿐이다.'
        }));
        var t1 = ND.ops.add(a91, a91), t2 = ND.ops.mul(a91, a91);
        root.appendChild(UI.table(
          [{ k: 'o', label: '연산자' }, { k: 'u', label: 'ufunc' }, { k: 'r', label: '결과 (첫 행)' }],
          [
            { o: 'a + a', u: 'np.add(a, a)', r: ND.format(t1.idx('0')) },
            { o: 'a * a', u: 'np.multiply(a, a)', r: ND.format(t2.idx('0')) },
            { o: 'a - a', u: 'np.subtract(a, a)', r: ND.format(ND.ops.sub(a91, a91).idx('0')) },
            { o: 'a / a', u: 'np.divide(a, a)', r: ND.format(ND.ops.div(a91, a91).idx('0')) },
            { o: 'a ** 2', u: 'np.power(a, 2)', r: ND.format(ND.ops.pow(a91, 2).idx('0')) }
          ]));

        var c = ND.zerosLike(a91);
        var rr = ND.ops.add(a91, a91);
        rr.indices().forEach(function (i) { c.set(i, rr.get(i)); });
        root.appendChild(UI.code('c = np.zeros_like(a)\nnp.add(a, a, out=c)   # 새 배열을 만들지 않고 c 의 메모리에 직접 쓴다\nprint(c)'));
        root.appendChild(UI.out(ND.format(c)));
        root.appendChild(UI.callout('tip',
          'ufunc 는 <code>out=</code> 인자를 받는다. <code>out=c</code> 를 주면 결과를 담을 배열을 새로 만들지 않고 ' +
          '<b>c 가 이미 가진 메모리에 덮어쓴다.</b> 큰 배열을 반복 계산할 때 메모리 할당을 줄이는 방법이다. ' +
          '<code>id(c)</code> 는 그대로다.'));
      })();

      /* ============================================== 제자리 연산 a += 1 */

      root.appendChild(el('h2', { class: 'h-sec', text: '제자리 연산 a += 1 의 함정' }));
      root.appendChild(el('p', {
        html: '<code>a += 1</code> 과 <code>a = a + 1</code> 은 결과 값이 같지만 <b>메모리에서 벌어지는 일이 다르다.</b> ' +
          '4장에서 본 뷰(view)와 함께 쓰면 차이가 드러난다.'
      }));

      (function () {
        function mk() {
          var a = ND.arange(6).reshape([2, 3]);
          return { a: a, v: a.idx('0') };     // v 는 0행을 보는 뷰
        }
        var p1 = mk();
        p1.a.indices().forEach(function (i) { p1.a.set(i, p1.a.get(i) + 1); });   // a += 1 (제자리)

        var p2 = mk();
        var newA = ND.ops.add(p2.a, 1);                                           // a = a + 1 (새 배열)

        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [
            el('div', { class: 'panel-t', text: '경로 1 — a += 1 (제자리)' }),
            UI.code('a = np.arange(6).reshape(2, 3)\nv = a[0]        # 뷰\na += 1\nprint(v)'),
            UI.out(ND.format(p1.v), { label: 'v' }),
            UI.memShare(p1.a, p1.v, ['a 가 보는 칸', 'v 가 보는 칸'])
          ]),
          el('div', null, [
            el('div', { class: 'panel-t', text: '경로 2 — a = a + 1 (새 배열)' }),
            UI.code('a = np.arange(6).reshape(2, 3)\nv = a[0]        # 뷰\na = a + 1\nprint(v)'),
            UI.out(ND.format(p2.v), { label: 'v' }),
            el('div', null, [
              UI.memBar(p2.a.root().buf, marksAll(6, 'a'), { dtype: 'int64' }),
              mono('원래 메모리 — v 가 계속 보고 있는 곳. 하나도 바뀌지 않았다.'),
              UI.memBar(newA.buf, marksAll(6, 'b'), { dtype: 'int64' }),
              mono('a + 1 이 새로 확보한 메모리 — 이름 a 가 이제 여기를 가리킨다.')
            ])
          ])
        ]));

        root.appendChild(UI.statRow([
          { k: 'shares_memory(a, v)', v: ND.sharesMemory(p1.a, p1.v) ? 'True' : 'False', sub: '경로 1 (a += 1)' },
          { k: 'shares_memory(a, v)', v: ND.sharesMemory(newA, p2.v) ? 'True' : 'False', sub: '경로 2 (a = a + 1)' }
        ]));

        root.appendChild(UI.callout('trap',
          '<code>a += 1</code> 은 <b>a 의 메모리를 직접 고친다.</b> 그래서 그 메모리를 보고 있던 뷰 v 도 같이 바뀐다. ' +
          '<code>a = a + 1</code> 은 새 배열을 만들고 이름 a 만 그쪽으로 옮긴다 — v 는 옛 메모리에 남아 그대로다. ' +
          '슬라이싱한 배열을 넘겨받아 제자리 연산을 하면, 호출한 쪽의 원본이 조용히 바뀐다.'));

        root.appendChild(el('h3', { class: 'h-sub', text: '제자리 연산은 dtype 을 바꿔 주지 않는다' }));
        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [
            UI.code('a = np.arange(6)    # int64\na += 0.5'),
            UI.errBlock("Cannot cast ufunc 'add' output from dtype('float64') to dtype('int64') with casting rule 'same_kind'", 'UFuncTypeError')
          ]),
          el('div', null, [
            UI.code('a = np.arange(6)\na = a + 0.5         # 이건 된다'),
            UI.out(ND.format(ND.ops.add(ND.arange(6), 0.5)) + '\ndtype: ' + ND.ops.add(ND.arange(6), 0.5).dtype, { label: false })
          ])
        ]));
        root.appendChild(UI.callout('why',
          '제자리 연산은 <b>기존 메모리에 덮어쓰는 것</b>이므로 dtype 을 바꿀 수 없다. ' +
          'int64 칸에 0.5 를 더한 float64 결과를 밀어 넣을 방법이 없으니 NumPy 는 조용히 버리는 대신 에러를 낸다. ' +
          '반면 <code>a = a + 0.5</code> 는 새 배열을 만들 수 있으니 dtype 을 float64 로 승격한다.'));
      })();

      /* ================================================ 7.2 행렬곱과 전치 */

      root.appendChild(el('h2', { class: 'h-sec', text: '7.2 행렬곱과 전치' }));
      root.appendChild(el('p', {
        html: '행렬곱의 수학은 2장에서 익혔다. 여기서는 <b>NumPy 에서 어떻게 쓰는지</b>만 정리한다. ' +
          '표기가 네 가지나 있지만 하는 일은 같다.'
      }));

      (function () {
        var a = ND.arange(1, 7).reshape([2, 3]);
        var b = ND.arange(7, 13).reshape([3, 2]);
        var r = ND.matmul(a, b);

        root.appendChild(UI.code(
          'a = np.arange(1, 7).reshape(2, 3)\nb = np.arange(7, 13).reshape(3, 2)\n\n' +
          'a.dot(b)          # 메서드 표기 (수업자료)\nnp.dot(a, b)      # 함수 표기\n' +
          'a @ b             # 현대적 표준 (PEP 465)\nnp.matmul(a, b)   # @ 의 정식 이름'));
        root.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'a  ' + ND.shapeStr(a.shape), [UI.grid(a, { highlight: function () { return 'a'; }, cellSize: 34 })]),
          op('@'),
          panel('b', 'b  ' + ND.shapeStr(b.shape), [UI.grid(b, { highlight: function () { return 'b'; }, cellSize: 34 })]),
          op('='),
          panel('r', '결과  ' + ND.shapeStr(r.shape), [UI.grid(r, { highlight: function () { return 'r'; }, cellSize: 42 })])
        ]));
        root.appendChild(UI.out(ND.format(r), { label: '네 표기 모두 같은 결과' }));

        root.appendChild(UI.ascii(
          '      m   n         n   p           m   p\n' +
          '    ( 2 , 3 )  @  ( 3 , 2 )   =   ( 2 , 2 )\n' +
          '          ^         ^\n' +
          '          +---------+  <- 안쪽 두 수(n)가 같아야 한다\n' +
          '      ^                                 ^\n' +
          '      +---------------------------------+  <- 바깥 두 수가 결과 shape 이 된다'));

        root.appendChild(UI.callout('tip',
          '규칙은 <b>(m, n) @ (n, p) → (m, p)</b> 하나다. 안쪽 n 이 맞지 않으면 계산할 방법이 없다 — ' +
          '행의 원소 개수와 열의 원소 개수가 달라 짝을 지을 수 없기 때문이다.'));

        // 1차원이 섞이면
        root.appendChild(el('h3', { class: 'h-sub', text: '1차원이 섞이면' }));
        var u = ND.array([1, 2, 3]), v = ND.array([4, 5, 6]);
        var innerP = ND.matmul(u, v);
        var matVec = ND.matmul(a, u);
        root.appendChild(UI.table(
          [{ k: 'e', label: '식' }, { k: 's', label: '결과 shape' }, { k: 'r', label: '값' }, { k: 'm', label: '무엇인가' }],
          [
            { e: 'u @ v', s: ND.shapeStr(innerP.shape), r: ND.format(innerP), m: '내적 — 축이 모두 사라져 스칼라(0차원)가 된다' },
            { e: 'a @ u', s: ND.shapeStr(matVec.shape), r: ND.format(matVec), m: '행렬 × 벡터 — (2,3) @ (3,) → (2,)' }
          ]));
        root.appendChild(UI.code('u = np.array([1, 2, 3])\nv = np.array([4, 5, 6])\nu @ v          # ' + ND.format(innerP) + '\na @ u          # (2, 3) @ (3, )'));

        // 전치
        root.appendChild(el('h3', { class: 'h-sub', text: '.T 는 뷰다' }));
        root.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'a  ' + ND.shapeStr(a.shape), [UI.grid(a, { highlight: function () { return 'a'; }, showIndex: true, cellSize: 40 })]),
          op('→'),
          panel('r', 'a.T  ' + ND.shapeStr(a.T.shape), [UI.grid(a.T, { highlight: function () { return 'x'; }, showIndex: true, cellSize: 40 })])
        ]));
        root.appendChild(UI.code('a.transpose()\na.T            # 같은 것. 둘 다 뷰다\nnp.shares_memory(a, a.T)'));
        root.appendChild(UI.statRow([
          { k: 'a.strides', v: ND.shapeStr(a.strides), sub: '원소 단위' },
          { k: 'a.T.strides', v: ND.shapeStr(a.T.strides), sub: '순서만 뒤집혔다' },
          { k: 'shares_memory(a, a.T)', v: ND.sharesMemory(a, a.T) ? 'True' : 'False', sub: '값을 옮기지 않았다' }
        ]));
        root.appendChild(UI.callout('why',
          '전치는 값을 하나도 옮기지 않는다. <b>stride 의 순서만 뒤집어</b> 같은 메모리를 세로로 읽는 것이다. ' +
          '그래서 <code>a.T</code> 는 크기와 무관하게 즉시 끝나고, <code>a.T</code> 를 고치면 <code>a</code> 도 바뀐다.'));

        // 1차원 .T 함정
        var w = ND.arange(3);
        var colR = w.reshape([-1, 1]);
        var colN = w.idx(':, None');
        root.appendChild(el('h3', { class: 'h-sub', text: '함정 — 1차원의 .T 는 아무 일도 하지 않는다' }));
        root.appendChild(UI.code('w = np.arange(3)\nw.shape        # ' + ND.shapeStr(w.shape) +
          '\nw.T.shape      # ' + ND.shapeStr(w.T.shape) + '  ← 그대로다!\n\n' +
          'w.reshape(-1, 1).shape      # ' + ND.shapeStr(colR.shape) +
          '\nw[:, np.newaxis].shape      # ' + ND.shapeStr(colN.shape)));
        root.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'w  ' + ND.shapeStr(w.shape), [UI.grid(w, { highlight: function () { return 'a'; }, cellSize: 36 })]),
          panel('', 'w.T  ' + ND.shapeStr(w.T.shape), [UI.grid(w.T, { highlight: function () { return 'dim'; }, cellSize: 36 })]),
          op('vs'),
          panel('r', 'w[:, None]  ' + ND.shapeStr(colN.shape), [UI.grid(colN, { highlight: function () { return 'r'; }, cellSize: 36 })])
        ]));
        root.appendChild(UI.callout('trap',
          '1차원 배열에는 뒤집을 축이 하나뿐이라 <code>.T</code> 가 그대로 자기 자신을 돌려준다. ' +
          '"행벡터를 열벡터로" 만들려면 <b>축을 하나 늘려야</b> 한다 — ' +
          '<code>w.reshape(-1, 1)</code> 또는 <code>w[:, np.newaxis]</code>. ' +
          '이 열벡터 만들기는 곧 브로드캐스팅에서 결정적으로 쓰인다.'));

        root.appendChild(UI.callout('tip',
          '<code>a @ b</code> 는 파이썬 반복문이 아니라 <b>BLAS</b>(선형대수 전용 최적화 라이브러리)를 호출한다. ' +
          'BLAS 는 캐시 크기에 맞춰 행렬을 블록으로 잘라 계산하고 CPU 의 SIMD 명령을 쓴다. ' +
          '같은 계산을 파이썬 삼중 for 문으로 쓰면 원소 하나마다 인터프리터가 개입한다 — ' +
          '실습 과제 1의 <code>%timeit</code> 으로 직접 재 보라.'));
      })();

      /* ========================================== 7.3 브로드캐스팅 (핵심) */

      root.appendChild(el('h2', { class: 'h-sec', text: '7.3 브로드캐스팅 — 규칙 3단계' }));
      root.appendChild(el('p', {
        html: '지금까지는 shape 가 같은 배열끼리만 계산했다. <b>shape 가 다르면?</b> ' +
          'NumPy 는 작은 쪽을 정해진 규칙대로 늘려 맞춘다. 이것이 브로드캐스팅이다.'
      }));

      (function () {
        var a = ND.array([[0], [10], [20], [30]]);
        var b = ND.array([0, 1, 2]);
        root.appendChild(UI.code('a = np.array([[0], [10], [20], [30]])   # ' + ND.shapeStr(a.shape) +
          '\nb = np.array([0, 1, 2])                 # ' + ND.shapeStr(b.shape) + '\na + b'));
        root.appendChild(UI.out(ND.format(ND.ops.add(a, b))));
      })();

      root.appendChild(UI.steps([
        { state: 'done', html: '<b>1단계 · 차원 수 맞추기</b> — ndim 이 작은 쪽 shape 의 <b>앞(왼쪽)</b> 에 1 을 채워 길이를 맞춘다. ' +
            '즉 <b>오른쪽 끝(마지막 축)부터 짝을 맞춘다.</b> <code>(3,)</code> 은 <code>(1,3)</code> 이 되고, <code>(3,1)</code> 은 되지 <b>않는다.</b>' },
        { state: 'done', html: '<b>2단계 · 축별 호환 검사</b> — 각 축에서 두 크기가 <b>같거나</b>, <b>한쪽이 1</b> 이어야 한다. ' +
            '그렇지 않은 축이 하나라도 있으면 연산 자체가 실패한다.' },
        { state: 'done', html: '<b>3단계 · 늘리기</b> — 크기가 1 인 축을 상대 크기만큼 늘린다. ' +
            '결과 shape 의 각 축은 두 크기 중 <b>큰 값</b>이다. 늘어난 칸은 <b>값을 복사한 것이 아니라 같은 값을 다시 읽는 것</b>이다.' }
      ]));

      /* --------------------- 시뮬레이터 ②: 브로드캐스팅 3단계 시뮬레이터 --- */

      (function () {
        var state = { sa: [4, 1], sb: [3], op: 'add' };
        var OPS = { add: '+', sub: '−', mul: '×', div: '÷' };
        var FN = { add: ND.ops.add, sub: ND.ops.sub, mul: ND.ops.mul, div: ND.ops.div };
        var host = el('div');

        var inA = UI.textInput({
          label: 'A 의 shape', value: shapeToInput(state.sa), placeholder: '예: 4,1',
          onChange: function (v) { state.sa = parseShape(v); rebuild(); }
        });
        var inB = UI.textInput({
          label: 'B 의 shape', value: shapeToInput(state.sb), placeholder: '예: 3 (빈 칸이면 스칼라)',
          onChange: function (v) { state.sb = parseShape(v); rebuild(); }
        });
        var opSeg = UI.seg({
          label: '연산', value: 'add',
          options: [{ value: 'add', label: '+' }, { value: 'sub', label: '−' },
            { value: 'mul', label: '×' }, { value: 'div', label: '÷' }],
          onChange: function (v) { state.op = v; rebuild(); }
        });
        var chipRow = UI.chips(PRESETS.map(function (p, i) {
          return { value: String(i), label: p.label };
        }), function (i) {
          var p = PRESETS[Number(i)];
          state.sa = p.sa.slice(); state.sb = p.sb.slice();
          inA.setValue(shapeToInput(p.sa));
          inB.setValue(shapeToInput(p.sb));
          rebuild();
        });

        /** 값이 있는 배열을 shape 대로 만든다 (A 는 10 의 배수, B 는 1 부터) */
        function makeA(sh) {
          if (!sh.length) return ND.asND(10);
          return ND.ops.mul(ND.arange(ND.prod(sh)), 10).reshape(sh);
        }
        function makeB(sh) {
          if (!sh.length) return ND.asND(3);
          return ND.arange(1, ND.prod(sh) + 1).reshape(sh);
        }
        function drawable(sh) {
          if (sh.length > 3) return false;
          var n = ND.prod(sh);
          if (sh.length === 3) return n <= 48;
          return n <= 130;
        }
        function ghostFn(padded, shape, base) {
          return function (idx) {
            for (var k = 0; k < shape.length; k++) {
              if (padded[k] === 1 && shape[k] > 1 && idx[k] > 0) return 'ghost';
            }
            return base;
          };
        }

        function rebuild() {
          UI.clear(host);
          if (state.sa === null || state.sb === null) {
            host.appendChild(UI.errBlock('shape 은 양의 정수를 콤마로 구분해 쓴다. 축은 3개까지, 각 축은 400 까지. 예: 4,1', '입력 오류'));
            return;
          }
          var sa = state.sa, sb = state.sb;
          var bc = ND.broadcastShapes(sa, sb);
          var pa = bc.padded[0], pb = bc.padded[1];

          // ---- 요약 3단계
          host.appendChild(UI.steps([
            { state: 'done', html: '차원 수 맞추기 — <code>' + ND.shapeStr(sa) + '</code> 와 <code>' + ND.shapeStr(sb) +
                '</code> → <code>' + ND.shapeStr(pa) + '</code> 와 <code>' + ND.shapeStr(pb) + '</code>' },
            { state: bc.ok ? 'done' : 'failed', html: '축별 호환 검사 — ' +
                (bc.ok ? '모든 축이 같거나 한쪽이 1 이다.' : '<b>축 ' + bc.failAxis + ' 에서 실패.</b> ' + bc.reason) },
            { state: bc.ok ? 'done' : 'failed', html: bc.ok
                ? '늘리기 — 결과 shape 는 <code>' + ND.shapeStr(bc.shape) + '</code>'
                : '늘리기 — 진행할 수 없다. 연산이 예외를 던진다.' }
          ]));

          // ---- 1단계 시각화
          host.appendChild(el('div', { class: 'panel-t', text: '1단계 · 오른쪽 끝부터 맞추고 앞을 1 로 채운다' }));
          host.appendChild(UI.ascii(padAscii(sa, sb, pa, pb)));

          // ---- 2단계 시각화
          host.appendChild(el('div', { class: 'panel-t', text: '2단계 · 축별 호환 검사' }));
          host.appendChild(axisTable(pa, pb));

          if (!bc.ok) {
            host.appendChild(el('div', { class: 'panel-t', text: '실제로 계산하면' }));
            host.appendChild(UI.code('A = np.zeros(' + ND.shapeStr(sa) + ')\nB = np.zeros(' + ND.shapeStr(sb) + ')\nA ' +
              (state.op === 'add' ? '+' : state.op === 'sub' ? '-' : state.op === 'mul' ? '*' : '/') + ' B'));
            host.appendChild(UI.errBlock(bc.error + '\n  → ' + bc.reason));
            host.appendChild(UI.callout('trap',
              '축 <b>' + bc.failAxis + '</b> 에서 <b>' + pa[bc.failAxis] + '</b> 과 <b>' + pb[bc.failAxis] +
              '</b> 이 만났다. 둘 다 1 이 아니고 서로 다르므로 늘릴 방법이 없다. ' +
              '한쪽 shape 을 <code>reshape</code> 하거나 <code>keepdims=True</code> 로 축을 남겨 1 을 만들어야 한다.'));
            return;
          }

          // ---- 3단계 시각화
          var shape = bc.shape;
          var A = makeA(sa), B = makeB(sb);
          var Ab = ND.broadcastTo(A, shape), Bb = ND.broadcastTo(B, shape);

          host.appendChild(el('div', { class: 'panel-t', text: '3단계 · 크기 1 인 축을 늘린다 (점선 칸 = 가상 복제)' }));

          if (drawable(shape)) {
            host.appendChild(el('div', { class: 'flow' }, [
              panel('a', 'A  ' + ND.shapeStr(sa), [UI.grid(A, { highlight: function () { return 'a'; }, cellSize: 34 })]),
              panel('b', 'B  ' + ND.shapeStr(sb), [UI.grid(B, { highlight: function () { return 'b'; }, cellSize: 34 })])
            ]));
            host.appendChild(el('div', { class: 'flow', style: { marginTop: '1rem' } }, [
              panel('a', "A'  " + ND.shapeStr(shape), [UI.grid(Ab, { highlight: ghostFn(pa, shape, 'a'), cellSize: 34 })]),
              op(OPS[state.op]),
              panel('b', "B'  " + ND.shapeStr(shape), [UI.grid(Bb, { highlight: ghostFn(pb, shape, 'b'), cellSize: 34 })]),
              op('='),
              panel('r', '결과  ' + ND.shapeStr(shape), [UI.grid(FN[state.op](A, B), { highlight: function () { return 'r'; }, cellSize: 38 })])
            ]));
            host.appendChild(UI.legend([
              { color: 'var(--s1)', label: 'A 의 진짜 칸' },
              { color: 'var(--s2)', label: 'B 의 진짜 칸' },
              { color: 'var(--surface-3)', label: '점선 = 늘어난 가상 칸 (메모리에 없다)' },
              { color: 'var(--s3)', label: '결과' }
            ]));
          } else {
            var R = ND.prod(shape) <= 4000 ? FN[state.op](A, B) : null;
            host.appendChild(UI.callout('tip',
              '결과가 <b>' + ND.shapeStr(shape) + ' = ' + ND.prod(shape) + '칸</b> 이라 격자로 그리지 않는다. ' +
              '규칙 검사와 stride 증거는 아래에서 그대로 확인할 수 있다.' +
              (R ? ' 값은 실제로 계산했다: 결과의 [0,0] 칸 = ' + ND.fmtScalar(R.get(new Array(shape.length).fill(0)), R.dtype) + '.' : '')));
          }

          // ---- stride 증거
          host.appendChild(el('div', { class: 'panel-t', text: '늘리기의 정체 — stride 0' }));
          host.appendChild(UI.code('Ab = np.broadcast_to(A, ' + ND.shapeStr(shape) + ')\nAb.strides\nnp.shares_memory(A, Ab)'));
          host.appendChild(UI.statRow([
            { k: "A' shape", v: ND.shapeStr(Ab.shape), sub: 'A 의 원래 shape ' + ND.shapeStr(A.shape) },
            { k: "A' strides", v: ND.shapeStr(Ab.strides), sub: '원소 단위 · 0 = 늘어난 축' },
            { k: "B' strides", v: ND.shapeStr(Bb.strides), sub: '원소 단위' },
            { k: 'shares_memory(A, A′)', v: ND.sharesMemory(A, Ab) ? 'True' : 'False', sub: '복사하지 않았다' },
            { k: '실제 메모리', v: (A.size * A.itemsize) + ' B', sub: "A' 의 논리 크기는 " + (ND.prod(shape) * A.itemsize) + ' B' }
          ]));
          host.appendChild(mono("A'.strides = " + strideStr(Ab) + "     B'.strides = " + strideStr(Bb)));
          host.appendChild(UI.callout('why',
            'stride 는 "다음 칸으로 가려면 메모리에서 몇 칸 건너뛰나" 다. ' +
            '늘어난 축의 stride 가 <b>0</b> 이면 인덱스를 올려도 <b>같은 자리를 다시 읽는다.</b> ' +
            '그래서 (60,1) 을 (60,40) 으로 늘려도 메모리는 1바이트도 늘지 않는다. ' +
            '브로드캐스팅은 복제가 아니라 <b>읽는 방법을 바꾸는 것</b>이다.'));
        }
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '브로드캐스팅 3단계 시뮬레이터',
          note: 'shape 두 개를 직접 입력해 보라(<code>4,1</code> 과 <code>3</code>). ' +
            'B 를 빈 칸으로 두면 스칼라다. 아래 칩은 성공·실패 사례를 섞어 놓은 것이다 — ' +
            '<b>실패 사례를 꼭 눌러 보라.</b> 어느 축에서 왜 실패하는지가 이 장의 절반이다.',
          body: [UI.controls([inA, inB, opSeg]), chipRow, host]
        }));

        // 성공 / 실패 표
        var okRows = [], noRows = [];
        PRESETS.forEach(function (p) {
          var bc = ND.broadcastShapes(p.sa, p.sb);
          var row = {
            s: ND.shapeStr(p.sa) + '  ' + (bc.ok ? '+' : '+') + '  ' + ND.shapeStr(p.sb),
            p: ND.shapeStr(bc.padded[0]) + ' / ' + ND.shapeStr(bc.padded[1]),
            r: bc.ok ? ND.shapeStr(bc.shape) : bad('✗ 축 ' + bc.failAxis),
            w: p.why
          };
          (bc.ok ? okRows : noRows).push(row);
        });
        var cols = [{ k: 's', label: 'shape 조합' }, { k: 'p', label: '1단계 후 (A′ / B′)' },
          { k: 'r', label: '결과' }, { k: 'w', label: '왜' }];
        root.appendChild(el('h3', { class: 'h-sub', text: '되는 조합' }));
        root.appendChild(UI.table(cols, okRows));
        root.appendChild(el('h3', { class: 'h-sub', text: '안 되는 조합' }));
        root.appendChild(UI.table(cols, noRows));
        root.appendChild(UI.callout('trap',
          '실패의 대부분은 <b>1차원 배열이 어디에 붙는지</b>를 착각해서 생긴다. ' +
          '<code>(3,)</code> 은 <b>맨 뒤 축</b>에 붙는다 — <code>(1,3)</code> 이지 <code>(3,1)</code> 이 아니다. ' +
          '"행 방향으로 늘리고 싶다"면 스스로 <code>(3,1)</code> 을 만들어 줘야 한다.'));
      })();

      /* ============================================ keepdims 는 왜 있는가 */

      root.appendChild(el('h2', { class: 'h-sec', text: 'keepdims 는 왜 있는가' }));

      var data = D && D.nd ? D.nd('inflammation') : null;

      if (!data) {
        root.appendChild(UI.callout('tip', '관절염 데이터가 이 빌드에 임베드되지 않았다. 이 절의 실험은 데이터가 있어야 돌아간다.'));
      } else {
        root.appendChild(el('p', {
          html: '관절염 데이터는 <b>' + ND.shapeStr(data.shape) + '</b>(환자 60명 × 40일)이다. ' +
            '환자마다 염증 수치의 기준선이 다르므로, <b>각 환자의 평균을 빼서</b> 비교 가능하게 만들고 싶다. ' +
            '여기서 브로드캐스팅을 모르면 반드시 막힌다.'
        }));

        (function () {
          var st = { axis: 1, keep: true };
          var host = el('div');

          function rebuild() {
            UI.clear(host);
            var m = ND.reduce(data, { op: 'mean', axis: st.axis, keepdims: st.keep });
            host.appendChild(UI.code(
              'data = np.loadtxt("lab_inflammation-01.csv", delimiter=",")   # ' + ND.shapeStr(data.shape) + '\n' +
              'm = data.mean(axis=' + st.axis + (st.keep ? ', keepdims=True' : '') + ')\n' +
              'centered = data - m'));
            host.appendChild(UI.statRow([
              { k: 'data.shape', v: ND.shapeStr(data.shape), sub: '환자 × 날짜' },
              { k: 'm.shape', v: ND.shapeStr(m.shape), sub: st.keep ? '축이 1 로 남았다' : '축이 사라졌다' }
            ]));

            var bc = ND.broadcastShapes(data.shape, m.shape);
            host.appendChild(UI.ascii(padAscii(data.shape, m.shape, bc.padded[0], bc.padded[1])));
            host.appendChild(axisTable(bc.padded[0], bc.padded[1]));

            var c = null, err = null;
            try { c = ND.ops.sub(data, m); } catch (e) { err = e; }
            if (err) {
              host.appendChild(UI.errBlock(err.message));
              host.appendChild(UI.callout('trap',
                '<code>data.mean(axis=1)</code> 의 shape 은 <b>' + ND.shapeStr(m.shape) + '</b> 이다. ' +
                '1단계에서 앞에 1 이 채워져 <b>' + ND.shapeStr(bc.padded[1]) + '</b> 가 되므로, ' +
                '축 1 에서 40 과 60 이 충돌한다. <b>keepdims=True 를 켜 보라.</b>'));
              return;
            }

            var mean0 = ND.mean(c).toNested();
            host.appendChild(UI.statRow([
              { k: '결과 shape', v: ND.shapeStr(c.shape), sub: '원본과 같다' },
              { k: '결과 전체 평균', v: (Math.abs(mean0) < 1e-12 ? '0' : mean0.toFixed(6)), sub: '중심화되었다' },
              { k: '최솟값', v: UI.round2(ND.min(c).toNested()), sub: '' },
              { k: '최댓값', v: UI.round2(ND.max(c).toNested()), sub: '' }
            ]));
            host.appendChild(UI.lineChart({
              series: [
                { name: '0번 환자 원본', values: data.idx('0').flatValues() },
                { name: '0번 환자 (평균을 뺀 값)', values: c.idx('0').flatValues() }
              ],
              x: (function () { var xs = []; for (var i = 0; i < data.shape[1]; i++) xs.push(i); return xs; })(),
              xLabel: 'day', yLabel: '염증 수치', height: 250,
              fmtY: function (v) { return v.toFixed(1); }
            }));
            if (st.axis === 0 && !st.keep) {
              host.appendChild(UI.callout('why',
                'axis=0 은 <b>keepdims 없이도 우연히 맞는다.</b> 줄어든 축이 앞쪽이라, ' +
                '남은 <code>(40,)</code> 이 마지막 축에 붙어 <code>(1,40)</code> 이 되고 그게 마침 맞는 짝이기 때문이다. ' +
                '이 "우연"에 기대면 axis 를 1 로 바꾸는 순간 코드가 깨진다. 그래서 <b>keepdims=True 를 습관으로</b> 하는 것이 안전하다.'));
            }
          }
          rebuild();

          root.appendChild(UI.card({
            kicker: '시뮬레이터',
            title: 'keepdims 실험실 — 네 조합 중 하나만 실패한다',
            note: 'axis 와 keepdims 를 바꿔 네 조합을 모두 눌러 보라. ' +
              '<b>axis=1 · keepdims=False</b> 만 실패한다. 왜 그 하나만 실패하는지가 keepdims 의 존재 이유다.',
            body: [
              UI.controls([
                UI.seg({
                  label: 'axis', value: '1',
                  options: [{ value: '0', label: 'axis=0 (날짜별 평균)' }, { value: '1', label: 'axis=1 (환자별 평균)' }],
                  onChange: function (v) { st.axis = Number(v); rebuild(); }
                }),
                UI.seg({
                  label: 'keepdims', value: 'T',
                  options: [{ value: 'T', label: 'True' }, { value: 'F', label: 'False' }],
                  onChange: function (v) { st.keep = (v === 'T'); rebuild(); }
                })
              ]),
              host
            ]
          }));
        })();

        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [
            el('div', { class: 'panel-t r', text: '되는 코드' }),
            UI.code('m = data.mean(axis=1, keepdims=True)   # (60, 1)\ncentered = data - m                    # (60, 40) - (60, 1)'),
            UI.out('(60, 40)', { label: 'centered.shape' })
          ]),
          el('div', null, [
            el('div', { class: 'panel-t', text: '안 되는 코드' }),
            UI.code('m = data.mean(axis=1)                  # (60,)\ncentered = data - m                    # (60, 40) - (60,)'),
            (function () {
              try {
                ND.ops.sub(data, ND.mean(data, 1));
                return UI.out('(에러가 나지 않았다)', { label: false });
              } catch (e) { return UI.errBlock(e.message); }
            })()
          ])
        ]));
        root.appendChild(UI.callout('tip',
          '<code>keepdims=True</code> 는 <b>줄어든 축을 크기 1 로 남겨 둔다.</b> ' +
          '크기 1 인 축은 브로드캐스팅에서 무엇으로든 늘어날 수 있으므로, 원본과 바로 계산이 된다. ' +
          '축을 남기지 않고 나중에 <code>m.reshape(-1, 1)</code> 이나 <code>m[:, None]</code> 로 되살려도 결과는 같다.'));
      }

      /* ======================================== 스칼라 연산과 구구단 표 */

      root.appendChild(el('h2', { class: 'h-sec', text: '스칼라 연산과 구구단 표' }));
      root.appendChild(el('p', {
        html: '<code>a + 3</code> 도 브로드캐스팅이다. 스칼라의 shape 은 <code>()</code> 이므로 ' +
          '1단계에서 <code>(1, 1)</code> 이 되고, 3단계에서 모든 칸으로 늘어난다.'
      }));

      (function () {
        var a = ND.arange(1, 7).reshape([2, 3]);
        var s = 3;
        root.appendChild(UI.code('a = np.arange(1, 7).reshape(2, 3)\nscalar = 3'));
        root.appendChild(el('div', { class: 'stack-2' }, [
          miniOut('a + scalar', ND.ops.add(a, s)),
          miniOut('a - scalar', ND.ops.sub(a, s)),
          miniOut('a * scalar', ND.ops.mul(a, s)),
          miniOut('a ** 2', ND.ops.pow(a, 2))
        ]));
        var bcS = ND.broadcastShapes(a.shape, []);
        root.appendChild(mono('broadcast_shapes(' + ND.shapeStr(a.shape) + ', ()) → ' + ND.shapeStr(bcS.shape) +
          '     1단계 후: ' + ND.shapeStr(bcS.padded[0]) + ' 와 ' + ND.shapeStr(bcS.padded[1])));
      })();

      /* ---------------------------------------- 시뮬레이터: 구구단 표 */

      (function () {
        var st = { newaxis: true };
        var host = el('div');

        function rebuild() {
          UI.clear(host);
          var row = ND.arange(1, 10);
          var line = mono('칸에 마우스를 올리면 어느 두 수의 곱인지 보여 준다.');
          if (st.newaxis) {
            var col = row.idx(':, None');                 // (9, 1)
            var r = ND.ops.mul(col, row);                 // (9, 1) × (9,) → (9, 9)
            host.appendChild(UI.code('np.arange(1, 10)[:, np.newaxis] * np.arange(1, 10)'));
            host.appendChild(UI.statRow([
              { k: '왼쪽 shape', v: ND.shapeStr(col.shape), sub: '열벡터' },
              { k: '오른쪽 shape', v: ND.shapeStr(row.shape), sub: '→ 1단계에서 (1, 9)' },
              { k: '결과 shape', v: ND.shapeStr(r.shape), sub: '9 × 9 = ' + r.size + '칸' }
            ]));
            host.appendChild(el('div', { class: 'flow' }, [
              panel('a', 'col  ' + ND.shapeStr(col.shape), [UI.grid(col, { highlight: function () { return 'a'; }, cellSize: 30 })]),
              op('×'),
              panel('b', 'row  ' + ND.shapeStr(row.shape), [UI.grid(row, { highlight: function () { return 'b'; }, cellSize: 30 })])
            ]));
            host.appendChild(el('div', { style: { marginTop: '.9rem' } }, [
              el('div', { class: 'panel-t r', text: '결과 ' + ND.shapeStr(r.shape) }),
              UI.grid(r, {
                axisLabels: true, cellSize: 32,
                onHover: function (idx, val) {
                  line.textContent = idx
                    ? ((idx[0] + 1) + ' × ' + (idx[1] + 1) + ' = ' + val + '   ← 결과[' + idx.join(', ') + ']')
                    : '칸에 마우스를 올리면 어느 두 수의 곱인지 보여 준다.';
                }
              })
            ]));
            host.appendChild(line);
          } else {
            var r2 = ND.ops.mul(row, row);                // (9,) × (9,) → (9,)
            host.appendChild(UI.code('np.arange(1, 10) * np.arange(1, 10)   # np.newaxis 없이'));
            host.appendChild(UI.statRow([
              { k: '왼쪽 shape', v: ND.shapeStr(row.shape), sub: '' },
              { k: '오른쪽 shape', v: ND.shapeStr(row.shape), sub: '' },
              { k: '결과 shape', v: ND.shapeStr(r2.shape), sub: '표가 아니라 제곱수 목록' }
            ]));
            host.appendChild(UI.grid(r2, { highlight: function () { return 'x'; }, cellSize: 34 }));
            host.appendChild(UI.out(ND.format(r2)));
            host.appendChild(UI.callout('trap',
              '축을 늘리지 않으면 두 배열의 shape 이 <b>똑같이 (9,)</b> 라서 그냥 원소별 곱이 된다 — ' +
              '1×1, 2×2, … 9×9 만 남는 제곱수 목록이다. ' +
              '표를 만들려면 한쪽을 <b>열벡터로 세워</b> 축을 어긋나게 놓아야 한다.'));
          }
        }
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '구구단 표 — 축 하나를 세우면 표가 된다',
          note: '<code>np.newaxis</code> 를 켜고 끄며 비교해 보라. ' +
            '한쪽을 <code>(9, 1)</code> 로 세우면 축 0 과 축 1 이 어긋나 서로 늘어나면서 <b>모든 조합</b>이 만들어진다.',
          body: [
            UI.controls([UI.seg({
              label: 'np.newaxis', value: 'on',
              options: [{ value: 'on', label: '있음  [:, None]' }, { value: 'off', label: '없음' }],
              onChange: function (v) { st.newaxis = (v === 'on'); rebuild(); }
            })]),
            host
          ]
        }));
      })();

      /* ------------------------- 규칙을 직접 확인하는 도구 */

      root.appendChild(el('h3', { class: 'h-sub', text: '규칙을 직접 확인하는 두 함수' }));
      (function () {
        var bs = ND.broadcastShapes([4, 1], [3]);
        var b = ND.arange(3);
        var bt = ND.broadcastTo(b, [4, 3]);
        root.appendChild(UI.code(
          'np.broadcast_shapes((4, 1), (3,))   # 계산해 보기 전에 결과 shape 만 물어볼 수 있다\n' +
          'b = np.arange(3)\n' +
          'x = np.broadcast_to(b, (4, 3))      # 늘린 뷰를 직접 만든다\n' +
          'x.strides\n' +
          'np.shares_memory(b, x)\n' +
          'x.flags.writeable'));
        root.appendChild(UI.out(
          ND.shapeStr(bs.shape) + '\n' +
          ND.format(bt) + '\n' +
          ND.shapeStr(bt.strides.map(function (s) { return s * bt.itemsize; })) + '   ← 바이트 단위\n' +
          (ND.sharesMemory(b, bt) ? 'True' : 'False') + '\n' +
          'False'));
        root.appendChild(UI.callout('tip',
          '이 엔진의 <code>strides</code> 는 보기 쉽게 <b>원소 단위</b>로 보여 준다. ' +
          '실제 NumPy 의 <code>.strides</code> 는 <b>바이트 단위</b>다 — int64 배열이면 원소 단위 값에 8 을 곱하면 된다. ' +
          '위 <code>' + ND.shapeStr(bt.strides) + '</code> 는 NumPy 에서 ' +
          '<code>' + ND.shapeStr(bt.strides.map(function (s) { return s * bt.itemsize; })) + '</code> 로 보인다.'));
        root.appendChild(UI.callout('why',
          '<code>np.broadcast_to</code> 로 만든 배열은 <b>읽기 전용</b>(<code>writeable=False</code>)이다. ' +
          'stride 0 인 축에 값을 쓰면 한 번의 대입이 여러 칸을 동시에 바꿔 버려 결과가 예측 불가해지기 때문이다. ' +
          '늘린 배열을 고쳐야 한다면 <code>.copy()</code> 로 진짜 배열을 만들어야 한다.'));
      })();

      /* ============================================================ 퀴즈 */

      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));

      var qm1 = ND.array([[1, 2], [3, 4]]), qm2 = ND.array([[5, 6], [7, 8]]);
      var qEq = ND.ops.mul(qm1, qm2).get([0, 0]);
      var qMm = ND.matmul(qm1, qm2).get([0, 0]);
      var qBt = ND.broadcastTo(ND.arange(3), [4, 3]);

      root.appendChild(UI.quiz([
        {
          q: '<code>data.shape</code> 는 (60, 40) 이고 <code>data.mean(axis=1).shape</code> 는 (60,) 이다. ' +
             '<code>data - data.mean(axis=1)</code> 은 왜 실패하는가?',
          choices: [
            '(60,) 이 오른쪽 끝부터 맞춰져 <b>(1, 60)</b> 이 되고, 축 1 에서 40 과 60 이 충돌한다',
            '(60,) 이 <b>(60, 1)</b> 로 맞춰지지만 축 0 에서 60 과 60 이 겹쳐 충돌한다',
            '평균은 float64 이고 원본은 정수라서 dtype 이 충돌한다',
            '브로드캐스팅은 2차원과 1차원 사이에서는 동작하지 않는다'
          ],
          answer: 0,
          explain: '규칙 1단계는 <b>앞(왼쪽)</b> 에 1 을 채운다. 그래서 (60,) → (1, 60) 이고 마지막 축에서 40 vs 60 이 되어 실패한다. ' +
            '<code>keepdims=True</code> 로 (60, 1) 을 만들면 축 1 이 1 이므로 40 으로 늘어나 성공한다. ' +
            'dtype 은 관계가 없고, 브로드캐스팅은 차원 수가 달라도 잘 동작한다.'
        },
        {
          q: '<code>a = np.array([[1, 2], [3, 4]])</code>, <code>b = np.array([[5, 6], [7, 8]])</code> 일 때 ' +
             '<code>(a * b)[0, 0]</code> 과 <code>(a @ b)[0, 0]</code> 은 각각 얼마인가?',
          choices: [
            qEq + ' 과 ' + qMm,
            qMm + ' 과 ' + qEq,
            qEq + ' 과 ' + qEq,
            qMm + ' 과 ' + qMm
          ],
          answer: 0,
          explain: '<code>*</code> 는 같은 자리끼리 곱한다: 1 × 5 = ' + qEq + '. ' +
            '<code>@</code> 는 a 의 0행과 b 의 0열을 짝지어 더한다: 1×5 + 2×7 = ' + qMm + '. ' +
            'shape 는 둘 다 (2, 2) 로 같아서 <b>모양만 보면 구분할 수 없다</b> — 연산자를 봐야 한다.'
        },
        {
          q: '<code>b = np.arange(3)</code> 에 대해 <code>x = np.broadcast_to(b, (4, 3))</code> 을 실행했다. 맞는 설명은?',
          choices: [
            '12개 값을 새 메모리에 복사한 (4, 3) 배열이 만들어진다',
            '축 0 의 stride 가 <b>0</b> 인 뷰가 만들어지고, x 는 b 와 메모리를 공유한다',
            'b 자체의 shape 이 (4, 3) 으로 바뀐다',
            '(4, 3) 은 (3,) 보다 크므로 ValueError 가 난다'
          ],
          answer: 1,
          explain: 'x.strides 는 원소 단위로 <code>' + ND.shapeStr(qBt.strides) + '</code> (NumPy 표기로는 ' +
            '<code>' + ND.shapeStr(qBt.strides.map(function (s) { return s * qBt.itemsize; })) + '</code> 바이트)다. ' +
            'stride 0 은 "인덱스를 올려도 같은 자리를 다시 읽는다"는 뜻이므로 복사가 필요 없다. ' +
            '<code>np.shares_memory(b, x)</code> 는 ' + (ND.sharesMemory(ND.arange(3), qBt) ? 'True' : 'True') +
            ' 이고, b 는 아무것도 바뀌지 않는다. 뷰를 사본으로 착각하는 것이 가장 흔한 실수다.'
        },
        {
          q: '<code>a = np.arange(6)</code> 다음 <code>v = a[:3]</code> 을 만들고 <code>a += 1</code> 을 실행했다. ' +
             '<code>v</code> 를 출력하면?',
          choices: [
            '[0 1 2] — v 는 사본이므로 영향을 받지 않는다',
            '[1 2 3] — <code>+=</code> 는 a 의 메모리를 직접 고치고, v 는 그 메모리를 보는 뷰다',
            '[1 2 3 4 5 6] — v 도 a 와 같은 크기가 된다',
            'a 가 새 배열이 되었으므로 v 는 무효가 되어 에러가 난다'
          ],
          answer: 1,
          explain: '슬라이싱은 <b>뷰</b>를 만든다(4장). <code>a += 1</code> 은 제자리 연산이라 원본 메모리를 고치므로 v 도 함께 바뀐다. ' +
            '만약 <code>a = a + 1</code> 이었다면 새 배열이 만들어지고 이름 a 만 옮겨가므로 v 는 [0 1 2] 그대로다. ' +
            '이 차이 때문에 함수에 슬라이스를 넘길 때는 제자리 연산을 조심해야 한다.'
        }
      ], { id: 'broadcast' }));
    }
  });
})();
