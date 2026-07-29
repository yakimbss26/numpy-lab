/* ===========================================================================
 * ch01-why.js — 1장 "왜 NumPy인가"
 * 수업 노트북 셀 0~2 + 실습과제 1번(속도 비교) 범위.
 * 목표: "리스트로 하면 안 되나?" 라는 의문을 학생이 스스로 버리게 만든다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el;

  /* ------------------------------------------------------------ 작은 도구 */

  function rep(ch, n) { var s = ''; for (var i = 0; i < n; i++) s += ch; return s; }
  function padL(s, w) { s = String(s); return rep(' ', Math.max(0, w - s.length)) + s; }
  function padR(s, w) { s = String(s); return s + rep(' ', Math.max(0, w - s.length)); }
  function mid(s, w) {
    s = String(s);
    var left = Math.floor(Math.max(0, w - s.length) / 2);
    return rep(' ', left) + s + rep(' ', Math.max(0, w - s.length - left));
  }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pyList(vals) { return '[' + vals.join(', ') + ']'; }

  /** 제목 붙은 작은 판 (panel-t 색: 'a' 파랑 / 'b' 주황 / 'r' 초록) */
  function panel(kind, title, kids) {
    return el('div', null, [el('p', { class: 'panel-t ' + kind, text: title })].concat(kids || []));
  }

  function row(kids, gap) {
    return el('div', {
      style: { display: 'flex', alignItems: 'center', gap: (gap || '.4rem'), flexWrap: 'wrap' }
    }, kids);
  }

  /* =====================================================================
   * 시뮬레이터 ① 연립방정식 풀이기
   * ===================================================================== */

  function simSolve() {
    var st = { A: [[2, 2, 1], [2, -1, 2], [1, -1, 2]], b: [9, 6, 5] };
    var inputs = { A: [[null, null, null], [null, null, null], [null, null, null]], b: [null, null, null] };
    var outHost = el('div');
    var VARS = ['x', 'y', 'z'];

    function numIn(get, set, color) {
      var inp = el('input', {
        type: 'number', step: 'any', value: String(get()),
        style: { minWidth: '3.1rem', width: '3.6rem', textAlign: 'right', borderColor: color },
        oninput: function () {
          var v = parseFloat(inp.value);
          if (isFinite(v)) { set(v); refresh(); }
        }
      });
      return { wrap: el('div', { class: 'ctl' }, [inp]), inp: inp };
    }

    /* 방정식 편집기 — 한 번만 만든다(다시 그리면 입력 포커스가 날아간다) */
    var eqRows = [];
    for (var i = 0; i < 3; i++) {
      (function (i) {
        var kids = [];
        for (var j = 0; j < 3; j++) {
          (function (j) {
            var h = numIn(function () { return st.A[i][j]; },
              function (v) { st.A[i][j] = v; }, 'var(--s1)');
            inputs.A[i][j] = h.inp;
            kids.push(h.wrap);
            kids.push(el('span', { class: 'mono', text: VARS[j] + (j < 2 ? '  +' : '') }));
          })(j);
        }
        kids.push(el('span', { class: 'mono', text: '=' }));
        var hb = numIn(function () { return st.b[i]; }, function (v) { st.b[i] = v; }, 'var(--s2)');
        inputs.b[i] = hb.inp;
        kids.push(hb.wrap);
        eqRows.push(row(kids));
      })(i);
    }
    var editor = el('div', {
      class: 'controls',
      style: { flexDirection: 'column', alignItems: 'flex-start', gap: '.45rem' }
    }, eqRows);

    var PRESETS = {
      cls: { label: '수업 원본', A: [[2, 2, 1], [2, -1, 2], [1, -1, 2]], b: [9, 6, 5] },
      sing: { label: '해가 유일하지 않은 예', A: [[1, 1, 1], [2, 2, 2], [3, 1, 0]], b: [6, 12, 5] },
      ident: { label: '단위행렬', A: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], b: [3, -1, 4] },
      frac: { label: '해가 분수인 예', A: [[2, 1, 0], [0, 3, 1], [1, 0, 2]], b: [3, 4, 5] }
    };

    function setAll(key) {
      var p = PRESETS[key];
      if (!p) return;
      st.A = p.A.map(function (r) { return r.slice(); });
      st.b = p.b.slice();
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) inputs.A[i][j].value = String(st.A[i][j]);
        inputs.b[i].value = String(st.b[i]);
      }
      refresh();
    }

    function refresh() {
      UI.clear(outHost);

      var A = ND.array(st.A), bv = ND.array(st.b);

      /* 지금 값으로 파이썬 코드를 만든다 (숫자 폭을 맞춰 정렬) */
      var w = 1;
      st.A.forEach(function (r) {
        r.forEach(function (v) { w = Math.max(w, String(v).length); });
      });
      var lines = st.A.map(function (r) {
        return '[' + r.map(function (v) { return padL(v, w); }).join(', ') + ']';
      });
      outHost.appendChild(UI.code(
        'import numpy as np\n\n' +
        'A = np.array([' + lines[0] + ',\n' +
        '              ' + lines[1] + ',\n' +
        '              ' + lines[2] + '])\n' +
        'b = np.array(' + pyList(st.b) + ')\n\n' +
        'x = np.linalg.solve(A, b)\n' +
        'print(x)'
      ));

      var d = ND.det(A);
      var singular = Math.abs(d) < 1e-9;

      outHost.appendChild(UI.statRow([
        {
          k: 'np.linalg.det(A)', v: ND.fmtScalar(d, 'float64'),
          sub: singular ? '0 이다 → 해가 하나로 정해지지 않는다' : '0 이 아니다 → 해가 딱 하나'
        }
      ]));

      if (singular) {
        try {
          ND.solve(A, bv);
        } catch (e) {
          outHost.appendChild(UI.errBlock(e.message));
        }
        outHost.appendChild(UI.callout('trap',
          '세 평면이 한 점에서 만나지 않는 경우다. 해가 아예 없거나(평행) 무한히 많다(겹침). ' +
          '행렬식이 0 이면 <code>np.linalg.solve</code> 는 답을 지어내지 않고 <b>예외를 던진다</b>. ' +
          '이런 경우에는 <code>np.linalg.lstsq</code> 처럼 다른 도구가 필요하다.'));
        return;
      }

      var x = ND.solve(A, bv);
      var lhs = ND.matmul(A, x);   /* A @ x — 검산용 */

      outHost.appendChild(el('div', { class: 'flow' }, [
        panel('a', 'A · 계수 행렬', [
          UI.grid(A, { highlight: function () { return 'a'; }, axisLabels: true }),
          UI.shapeBadge(A)
        ]),
        panel('b', 'b · 우변', [
          UI.grid(bv, { highlight: function () { return 'b'; } }),
          UI.shapeBadge(bv)
        ]),
        panel('r', 'x · 구한 해', [
          UI.grid(x, { highlight: function () { return 'r'; } }),
          UI.shapeBadge(x)
        ])
      ]));

      outHost.appendChild(UI.out(ND.format(x), { label: 'print(x)' }));

      var trows = [];
      for (var i = 0; i < 3; i++) {
        var terms = [];
        for (var j = 0; j < 3; j++) {
          terms.push('(' + st.A[i][j] + ')·' + ND.fmtScalar(x.get([j]), 'float64'));
        }
        var lv = lhs.get([i]);
        trows.push({
          eq: terms.join(' + '),
          l: ND.fmtScalar(lv, 'float64'),
          r: String(st.b[i]),
          ok: Math.abs(lv - st.b[i]) < 1e-9 ? '✓ 같다' : '✗ 다르다'
        });
      }
      outHost.appendChild(el('p', { class: 'panel-t', text: '검산 — 구한 해를 원래 식에 넣어 본다' }));
      outHost.appendChild(UI.table([
        { k: 'eq', label: '좌변에 해를 대입' },
        { k: 'l', label: '좌변 값', num: true },
        { k: 'r', label: '우변', num: true },
        { k: 'ok', label: '검산' }
      ], trows));
    }

    refresh();

    return UI.card({
      kicker: '시뮬레이터',
      title: '연립방정식 풀이기',
      note: '계수 9개와 우변 3개를 직접 고쳐 보라. 숫자를 바꾸는 즉시 <code>np.linalg.solve</code> 가 다시 푼다. ' +
        '아래 검산 표에서 좌변 값이 정말 우변과 같은지 확인하라 — 믿지 말고 확인하는 것이 습관이 되어야 한다.',
      body: [
        UI.chips(Object.keys(PRESETS).map(function (k) {
          return { value: k, label: PRESETS[k].label };
        }), setAll),
        editor,
        outHost
      ]
    });
  }

  /* =====================================================================
   * 시뮬레이터 ② list vs ndarray 연산 대조기
   * ===================================================================== */

  function simListOps() {
    var L = [1, 2, 3], L2 = [10, 20, 30];
    var a = ND.array(L), b = ND.array(L2);

    var OPS = [
      {
        v: 'mul', label: '× 2',
        pyCode: 'py_list = ' + pyList(L) + '\nprint(py_list * 2)',
        pyRun: function () { return pyList(L.concat(L)); },
        npCode: 'a = np.array(' + pyList(L) + ')\nprint(a * 2)',
        npRun: function () { return ND.ops.mul(a, 2); },
        note: 'list 의 <code>*</code> 는 <b>반복(repetition)</b>이다 — 원소가 6개로 늘어났다. ' +
          'ndarray 의 <code>*</code> 는 <b>원소별 곱셈</b>이다 — 개수는 그대로 3개다. ' +
          '같은 기호가 전혀 다른 뜻을 갖는다. 이 한 줄이 두 자료형의 차이를 가장 잘 보여 준다.'
      },
      {
        v: 'add2', label: '+ 2',
        pyCode: 'py_list = ' + pyList(L) + '\nprint(py_list + 2)',
        pyErr: ['TypeError', 'can only concatenate list (not "int") to list'],
        npCode: 'a = np.array(' + pyList(L) + ')\nprint(a + 2)',
        npRun: function () { return ND.ops.add(a, 2); },
        note: 'list 의 <code>+</code> 는 <b>이어붙이기</b>라서 리스트끼리만 된다. 숫자를 더하면 TypeError 다. ' +
          'ndarray 는 숫자 하나를 모든 원소에 더한다(브로드캐스팅 — 6장에서 자세히 본다).'
      },
      {
        v: 'addl', label: '+ 다른 리스트',
        pyCode: 'py_list = ' + pyList(L) + '\nother = ' + pyList(L2) + '\nprint(py_list + other)',
        pyRun: function () { return pyList(L.concat(L2)); },
        npCode: 'a = np.array(' + pyList(L) + ')\nb = np.array(' + pyList(L2) + ')\nprint(a + b)',
        npRun: function () { return ND.ops.add(a, b); },
        note: '리스트 두 개를 <code>+</code> 하면 원소 6개짜리 리스트가 된다(이어붙이기). ' +
          '배열 두 개를 <code>+</code> 하면 <b>같은 자리끼리</b> 더해 원소 3개가 그대로 남는다. ' +
          '수학에서 쓰는 벡터의 합은 오른쪽이다.'
      },
      {
        v: 'pow', label: '** 2',
        pyCode: 'py_list = ' + pyList(L) + '\nprint(py_list ** 2)',
        pyErr: ['TypeError', "unsupported operand type(s) for ** or pow(): 'list' and 'int'"],
        npCode: 'a = np.array(' + pyList(L) + ')\nprint(a ** 2)',
        npRun: function () { return ND.ops.pow(a, 2); },
        note: '리스트에는 제곱이 아예 정의되어 있지 않다. 원소별로 제곱하려면 for 문이나 리스트 컴프리헨션을 써야 한다. ' +
          'ndarray 는 <code>** 2</code> 한 번으로 끝난다.'
      },
      {
        v: 'mulf', label: '× 2.0',
        pyCode: 'py_list = ' + pyList(L) + '\nprint(py_list * 2.0)',
        pyErr: ['TypeError', "can't multiply sequence by non-int of type 'float'"],
        npCode: 'a = np.array(' + pyList(L) + ')\nprint(a * 2.0)',
        npRun: function () { return ND.ops.mul(a, 2.0); },
        note: '리스트는 <b>정수배</b>만 반복할 수 있어서 2.0 은 거부한다. ' +
          'ndarray 는 int64 배열에 실수를 곱하면 결과를 float64 로 올려서 계산한다 — 출력에 붙은 소수점이 그 증거다.'
      }
    ];

    var st = { op: 'mul' };
    var host = el('div');

    function find() {
      for (var i = 0; i < OPS.length; i++) if (OPS[i].v === st.op) return OPS[i];
      return OPS[0];
    }

    function rebuild() {
      UI.clear(host);
      var o = find();

      var left = [UI.code(o.pyCode)];
      if (o.pyErr) left.push(UI.errBlock(o.pyErr[1], o.pyErr[0]));
      else left.push(UI.out(o.pyRun()));

      var r = o.npRun();
      var right = [
        UI.code('import numpy as np\n' + o.npCode),
        UI.out(ND.format(r)),
        UI.grid(r, { highlight: function () { return 'r'; }, showIndex: true }),
        UI.shapeBadge(r)
      ];

      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('b', '파이썬 list', left),
        panel('a', 'NumPy ndarray', right)
      ]));
      host.appendChild(el('p', { class: 'small', html: o.note }));
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: 'list vs ndarray — 같은 기호, 다른 뜻',
      note: '연산을 골라 두 자료형의 결과를 나란히 비교하라. 왼쪽의 에러 메시지는 파이썬이 실제로 내는 문장이다.',
      body: [
        UI.controls([UI.seg({
          label: '연산', value: st.op,
          options: OPS.map(function (o) { return { value: o.v, label: o.label }; }),
          onChange: function (v) { st.op = v; rebuild(); }
        })]),
        host
      ]
    });
  }

  /* =====================================================================
   * 시뮬레이터 ③ 메모리 배치 비교
   * ===================================================================== */

  function simMemory() {
    var st = { n: 6 };
    var host = el('div');
    var ITEM = ND.zeros([1], 'int64').itemsize;   /* 8 — 엔진에서 얻는다 */
    var PTR = 8;         /* 64비트 파이썬의 포인터 하나 */
    var INTOBJ = 28;     /* CPython 정수 객체 하나 — 약 28바이트 (구현 의존) */

    /** n 에 따라 정해지는(매번 같은) 흩어진 위치 */
    function scatter(n) {
      var slots = 3 * n, seed = 7919 + n * 131, pos = [], used = {};
      for (var i = 0; i < n; i++) {
        seed = (seed * 48271) % 2147483647;
        var p = seed % slots;
        while (used[p]) p = (p + 1) % slots;
        used[p] = 1;
        pos.push(p);
      }
      return pos;
    }

    function addr(slot) {
      return '0x' + ('00000000' + (0x7f3a0000 + slot * ITEM).toString(16)).slice(-8);
    }

    function rebuild() {
      UI.clear(host);
      var n = st.n, i;
      var arr = ND.arange(1, n + 1);          /* int64 배열 */
      var pos = scatter(n);
      var slots = 3 * n;

      /* ---- 왼쪽: 파이썬 list — 포인터 표 + 흩어진 값 ---- */
      var cellW = ('p[' + (n - 1) + ']').length + 2;
      var ptrLines = ['┌' + rep('─', cellW) + '┐'];
      for (i = 0; i < n; i++) {
        ptrLines.push('│ ' + padR('p[' + i + ']', cellW - 2) + ' │ ──> ' +
          addr(pos[i]) + '  int(' + (i + 1) + ')');
      }
      ptrLines.push('└' + rep('─', cellW) + '┘');

      var heap = ND.zeros([slots], 'int64');
      var atSlot = {};
      for (i = 0; i < n; i++) { heap.set([pos[i]], i + 1); atSlot[pos[i]] = i + 1; }
      var heapGrid = UI.grid(heap, {
        highlight: function (idx) { return atSlot[idx[0]] ? 'b' : 'dim'; },
        label: function (idx) { return atSlot[idx[0]] ? String(atSlot[idx[0]]) : '·'; },
        cellSize: 26
      });

      /* ---- 오른쪽: ndarray — 같은 메모리 안의 연속된 한 덩어리 ---- */
      var off = Math.floor((slots - n) / 2);
      var strip = ND.zeros([slots], 'int64');
      for (i = 0; i < n; i++) strip.set([off + i], i + 1);
      var stripGrid = UI.grid(strip, {
        highlight: function (idx) { return (idx[0] >= off && idx[0] < off + n) ? 'a' : 'dim'; },
        label: function (idx) {
          return (idx[0] >= off && idx[0] < off + n) ? String(idx[0] - off + 1) : '·';
        },
        cellSize: 26
      });
      var marks = {};
      for (i = 0; i < n; i++) marks[i] = 'a';

      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('b', '파이썬 list — 포인터의 모음', [
          UI.ascii(ptrLines.join('\n')),
          el('p', { class: 'small muted', text: '메모리(heap) — 값들이 흩어져 있다' }),
          heapGrid
        ]),
        panel('a', 'ndarray — 값 자체가 한 덩어리', [
          el('p', {
            class: 'small', html: '포인터 표가 없다. 시작 주소 하나 + shape + strides 만 알면 ' +
              '<code>i</code>번째 값은 <b>시작 + i × ' + ITEM + '바이트</b> 로 바로 찾아간다.'
          }),
          el('p', { class: 'small muted', text: '같은 메모리 — 값이 연속으로 놓여 있다' }),
          stripGrid,
          el('p', { class: 'small muted', text: '이 페이지 엔진이 실제로 쓰는 버퍼(buf) — 칸에 마우스를 올리면 위치가 보인다' }),
          UI.memBar(arr.buf, marks, { dtype: 'int64' })
        ])
      ]));

      host.appendChild(UI.statRow([
        { k: 'size', v: String(arr.size), sub: '원소 개수' },
        { k: 'itemsize', v: arr.itemsize + ' B', sub: 'int64 하나의 크기' },
        { k: 'nbytes', v: comma(arr.nbytes) + ' B', sub: 'size × itemsize — 정확한 값' },
        { k: 'dtype', v: arr.dtype, sub: '배열 전체가 이 한 가지 타입' }
      ]));

      function memRow(N, note) {
        var nd = N * ITEM, li = N * (PTR + INTOBJ);
        return {
          n: comma(N), nd: comma(nd) + ' B', li: '약 ' + comma(li) + ' B',
          x: (li / nd).toFixed(1) + '배', note: note || ''
        };
      }
      host.appendChild(UI.table([
        { k: 'n', label: '원소 개수', num: true },
        { k: 'nd', label: 'ndarray(int64) nbytes', num: true },
        { k: 'li', label: 'list 대략', num: true },
        { k: 'x', label: 'list 가 몇 배', num: true },
        { k: 'note', label: '' }
      ], [
        memRow(n, '지금 그림'),
        memRow(1000),
        memRow(1000000, '= 정확히 8 MB')
      ]));
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: '메모리 배치 비교 — 포인터의 모음 vs 한 덩어리',
      note: '원소 개수를 바꿔 보라. 왼쪽은 값이 있는 곳을 <b>가리키기만</b> 하는 파이썬 list, ' +
        '오른쪽은 값 자체가 <b>붙어 있는</b> ndarray 다.',
      body: [
        UI.controls([UI.slider({
          label: '원소 개수', min: 4, max: 8, step: 1, value: st.n,
          format: function (v) { return v + '개'; },
          onChange: function (v) { st.n = v; rebuild(); }
        })]),
        host,
        UI.legend([
          { color: 'var(--s2)', label: 'list 가 가리키는 정수 객체' },
          { color: 'var(--s1)', label: 'ndarray 가 차지한 연속 구간' }
        ])
      ]
    });
  }

  /* =====================================================================
   * 시뮬레이터 ④ 벡터화 애니메이션
   * ===================================================================== */

  function simVector() {
    var N = 8;
    var a = ND.arange(1, N + 1);
    var res = ND.ops.mul(a, 2);          /* 정답을 미리 계산해 두고 한 칸씩 드러낸다 */
    var TOTAL = N * 3;                   /* 원소마다 3단계 */
    var st = { step: 0, timer: null };
    var host = el('div');

    function stop() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

    function tick() {
      if (!document.body.contains(host)) { stop(); return; }   /* 다른 장으로 떠났다 */
      if (st.step >= TOTAL) { stop(); rebuild(); return; }
      st.step++;
      rebuild();
    }

    function subText(i, cur) {
      var tag = cur < 0 ? 'a[i]' : 'a[' + cur + ']';
      if (i === 0) return '<code>' + tag + '</code> 의 <b>타입 확인</b> — 리스트 원소는 무엇이든 될 수 있으므로 매번 필요하다';
      if (i === 1) return '<code>' + tag + ' * 2</code> 계산 — 결과를 담을 <b>새 정수 객체</b>를 만든다';
      return '<code>result.append(...)</code> — 리스트에 포인터를 하나 더 붙인다';
    }

    function rebuild() {
      UI.clear(host);
      var done = Math.floor(st.step / 3);
      var sub = st.step % 3;
      var cur = done < N ? done : -1;
      var npDone = st.step > 0;

      /* ---- 버튼 ---- */
      var btns = [
        UI.btn('다음 단계', function () {
          stop();
          if (st.step < TOTAL) { st.step++; rebuild(); }
        }, { primary: true }),
        UI.btn(st.timer ? '멈춤' : '자동 재생', function () {
          if (st.timer) { stop(); rebuild(); return; }
          if (st.step >= TOTAL) st.step = 0;
          st.timer = setInterval(tick, 300);
          rebuild();
        }),
        UI.btn('처음으로', function () { stop(); st.step = 0; rebuild(); })
      ];
      host.appendChild(el('div', { class: 'controls' }, btns));

      /* ---- 왼쪽: 파이썬 for ---- */
      var left = [
        UI.code('result = []\nfor value in py_list:\n    result.append(value * 2)'),
        el('p', { class: 'small muted', text: '입력 py_list' }),
        UI.grid(a, {
          highlight: function (idx) {
            if (idx[0] < done) return 'dim';
            if (idx[0] === cur) return 'x';
            return 'a';
          },
          cellSize: 32
        }),
        UI.steps([0, 1, 2].map(function (i) {
          return { html: subText(i, cur), state: (cur < 0 || i < sub) ? 'done' : '' };
        })),
        el('p', { class: 'small muted', text: '결과 result' }),
        UI.grid(res, {
          highlight: function (idx) { return idx[0] < done ? 'r' : null; },
          label: function (idx, val) { return idx[0] < done ? String(val) : '·'; },
          cellSize: 32
        })
      ];

      /* ---- 오른쪽: NumPy ---- */
      var right = [
        UI.code('result = a * 2'),
        el('p', { class: 'small muted', text: '입력 a (ndarray, dtype 하나)' }),
        UI.grid(a, {
          highlight: function () { return npDone ? 'dim' : 'a'; },
          cellSize: 32
        }),
        UI.steps([
          { html: '배열 전체의 <b>dtype 을 한 번</b> 확인한다 — 원소마다 확인하지 않는다', state: npDone ? 'done' : '' },
          { html: 'C 로 짠 루프가 <b>버퍼를 처음부터 끝까지</b> 훑으며 곱한다 (파이썬은 여기 끼어들지 않는다)', state: npDone ? 'done' : '' },
          { html: '결과를 미리 잡아 둔 <b>연속 버퍼에 바로 쓴다</b> — append 가 없다', state: npDone ? 'done' : '' }
        ]),
        el('p', { class: 'small muted', text: '결과 result' }),
        UI.grid(res, {
          highlight: function () { return npDone ? 'r' : null; },
          label: function (idx, val) { return npDone ? String(val) : '·'; },
          cellSize: 32
        })
      ];

      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('b', '파이썬 for 루프 — 한 칸씩', left),
        panel('a', 'NumPy 벡터화 — 한 번에', right)
      ]));

      host.appendChild(UI.table([
        { k: 'k', label: '세어 보는 것' },
        { k: 'py', label: '파이썬 for', num: true },
        { k: 'np', label: 'NumPy', num: true }
      ], [
        { k: '처리한 원소 수', py: done + ' / ' + N, np: (npDone ? N : 0) + ' / ' + N },
        { k: '파이썬이 실행한 단계', py: st.step + '단계', np: (npDone ? 1 : 0) + '단계 (호출 한 번)' },
        { k: '원소별 타입 확인', py: done + '번', np: (npDone ? 1 : 0) + '번 (배열 앞에서 한 번)' },
        { k: '새로 만든 파이썬 객체', py: done + '개', np: '0개' }
      ]));
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: '벡터화 애니메이션 — 같은 계산, 다른 진행',
      note: '<b>같은 계산</b>(배열 × 2)을 두 방식으로 진행한다. ' +
        '노란 칸이 지금 처리하는 원소, 초록 칸이 끝난 원소다. ' +
        '오른쪽은 첫 클릭에 전부 끝난다 — 파이썬 입장에서는 <b>한 단계</b>이기 때문이다.',
      body: [host]
    });
  }

  /* =====================================================================
   * 시뮬레이터 ⑤ 브라우저에서 직접 재는 벤치마크 (자바스크립트다!)
   * ===================================================================== */

  function simBench() {
    var st = { n: 200000 };
    var outHost = el('div');

    function reps(n) { return n <= 20000 ? 20 : (n <= 100000 ? 10 : 6); }

    function sumOf(x) {
      if (x && x.shape) return ND.sum(x).toNested();
      var s = 0;
      for (var i = 0; i < x.length; i++) s += x[i];
      return s;
    }

    function run() {
      UI.clear(outHost);
      var n = st.n, R = reps(n), i;

      var base = new Array(n);
      for (i = 0; i < n; i++) base[i] = i;
      var f64 = new Float64Array(n);
      for (i = 0; i < n; i++) f64[i] = i;
      var nda = ND.arange(n);

      var methods = [
        {
          k: 'ㄱ', name: 'JS for 루프 + push', code: 'for (i=0;i<a.length;i++) out.push(a[i]*2)',
          fn: function () {
            var out = [];
            for (var j = 0; j < base.length; j++) out.push(base[j] * 2);
            return out;
          }
        },
        {
          k: 'ㄴ', name: 'JS map', code: 'a.map(function (v) { return v*2; })',
          fn: function () { return base.map(function (v) { return v * 2; }); }
        },
        {
          k: 'ㄷ', name: 'Float64Array 루프 (연속 메모리 · 고정 타입)', code: 'out[i] = a[i]*2',
          fn: function () {
            var out = new Float64Array(f64.length);
            for (var j = 0; j < f64.length; j++) out[j] = f64[j] * 2;
            return out;
          }
        },
        {
          k: 'ㄹ', name: '이 페이지의 미니 엔진 (벡터화 호출)', code: 'ND.ops.mul(a, 2)',
          fn: function () { return ND.ops.mul(nda, 2); }
        }
      ];

      var results = methods.map(function (m) {
        var first = m.fn();                 /* 워밍업 겸 검증용 */
        var chk = sumOf(first);
        var keep = null, t0 = performance.now();
        for (var r = 0; r < R; r++) keep = m.fn();
        var ms = (performance.now() - t0) / R;
        if (keep === null) ms = -1;         /* 결과를 참조해 최적화로 지워지지 않게 한다 */
        return { k: m.k, name: m.name, code: m.code, ms: ms, chk: chk };
      });

      var fastest = results.reduce(function (mn, r) { return Math.min(mn, r.ms); }, Infinity);
      var allSame = results.every(function (r) { return r.chk === results[0].chk; });

      outHost.appendChild(UI.table([
        { k: 'k', label: '' },
        { k: 'name', label: '방법' },
        { k: 'code', label: '계산' },
        { k: 'ms', label: '1회 평균 (ms)', num: true },
        { k: 'x', label: '가장 빠른 것 대비', num: true }
      ], results.map(function (r) {
        return {
          k: r.k, name: r.name, code: r.code,
          ms: r.ms.toFixed(2),
          x: (r.ms / fastest).toFixed(1) + '배'
        };
      })));

      outHost.appendChild(el('p', {
        class: 'small', html: '원소 ' + comma(n) + '개 · 각 방법을 ' + R + '회 실행한 평균이다. ' +
          '네 방법의 결과 합이 ' + (allSame ? '<b>모두 같다</b>' : '<b>다르다(버그다!)</b>') +
          ' — ' + comma(results[0].chk) + '. ' +
          '같은 계산을 했다는 증거다. 실행할 때마다 값이 조금씩 달라지니 여러 번 눌러 보라.'
      }));
    }

    return UI.card({
      kicker: '시뮬레이터',
      title: '지금 이 브라우저에서 직접 재 보기',
      note: '<b>이것은 NumPy 가 아니라 자바스크립트 측정이다.</b> ' +
        '그래도 "값이 연속으로 놓이고 타입이 고정되면 빨라진다"는 원리는 똑같다. ' +
        '여기 나오는 숫자를 NumPy 의 성능이라고 말하면 안 된다.',
      body: [
        UI.controls([
          UI.seg({
            label: '원소 개수', value: String(st.n),
            options: [
              { value: '20000', label: '2만' },
              { value: '100000', label: '10만' },
              { value: '200000', label: '20만' }
            ],
            onChange: function (v) { st.n = parseInt(v, 10); UI.clear(outHost); }
          }),
          UI.btn('측정 실행', run, { primary: true })
        ]),
        outHost,
        UI.callout('trap',
          '(ㄹ)의 미니 엔진은 이 페이지에서 <b>읽기 쉽게</b> 짠 교육용 구현이라 아마 가장 느릴 것이다. ' +
          '진짜 NumPy 의 내부는 (ㄷ)에 훨씬 가깝다 — C 로 짠 루프가 연속 버퍼를 훑는다. ' +
          '즉 이 표에서 배울 것은 <b>(ㄱ)·(ㄴ) 대 (ㄷ)의 차이</b>이고, (ㄹ)은 "벡터화 문법이라고 다 빠른 게 아니다, ' +
          '무엇으로 구현했는지가 중요하다"는 반례로 읽어라.')
      ]
    });
  }

  /* =====================================================================
   * 라이브러리 층 그림 (정렬을 코드로 맞춘다)
   * ===================================================================== */

  function stackAscii() {
    var tops = ['pandas', 'matplotlib', 'scikit-learn', 'PyTorch'].map(function (s) {
      return '  ' + s + '  ';
    });
    var inner = tops.reduce(function (s, t) { return s + t.length; }, 0) + (tops.length - 1);
    var dash = function (t) { return rep('─', t.length); };
    var lines = [
      '┌' + tops.map(dash).join('┬') + '┐',
      '│' + tops.join('│') + '│',
      '└' + tops.map(dash).join('┴') + '┘',
      '┌' + rep('─', inner) + '┐',
      '│' + mid('numpy.ndarray  --  one dtype, one contiguous block', inner) + '│',
      '└' + rep('─', inner) + '┘',
      '┌' + rep('─', inner) + '┐',
      '│' + mid('CPU  --  64 B cache line, SIMD instructions', inner) + '│',
      '└' + rep('─', inner) + '┘'
    ];
    return UI.ascii(lines.join('\n'));
  }

  /* =====================================================================
   * 등록
   * ===================================================================== */

  Lab.register({
    id: 'why',
    n: '1',
    title: '왜 NumPy인가',
    blurb: '리스트로도 될 것 같은 계산이 왜 새 자료형을 필요로 하는지 — 연립방정식, 메모리 배치, 벡터화, 그리고 직접 재는 속도로 확인한다.',
    sim: '연립방정식 풀이기 · list vs ndarray 대조 · 메모리 배치 비교 · 벡터화 애니메이션 · 브라우저 벤치마크',

    render: function (root) {

      /* ================================================ 1. 도입: 수식 */

      root.appendChild(el('h2', { class: 'h-sec', text: '수업 첫 화면의 수식' }));

      root.appendChild(el('p', {
        html: '수업 노트북의 첫 문장은 "다음 수식을 코드로 표현해 보자"다. 그 수식은 <b>연립일차방정식</b>이다.'
      }));

      root.appendChild(UI.ascii(
        '2x + 2y +  z = 9\n' +
        '2x -  y + 2z = 6\n' +
        ' x -  y + 2z = 5'
      ));

      root.appendChild(el('p', {
        html: '계수를 파이썬 리스트에 <b>담는 것</b>까지는 된다. 문제는 그다음이다. ' +
          '담아 놓은 리스트로는 아무 계산도 되지 않는다.'
      }));

      root.appendChild(UI.code(
        'A = [[2, 2, 1],\n' +
        '     [2, -1, 2],\n' +
        '     [1, -1, 2]]\n' +
        'b = [9, 6, 5]\n\n' +
        'A * b        # 계수와 우변을 곱해 보려 하면?'
      ));
      root.appendChild(UI.errBlock("can't multiply sequence by non-int of type 'list'", 'TypeError'));

      root.appendChild(el('p', {
        html: '리스트로 이 문제를 풀려면 가우스 소거법을 직접 구현해야 한다 — 수십 줄이다. ' +
          'NumPy 에서는 <code>np.linalg.solve(A, b)</code> 한 줄이다. ' +
          '아래에서 직접 계수를 바꿔 가며 풀어 보라.'
      }));

      root.appendChild(simSolve());

      root.appendChild(UI.callout('why',
        '해가 <code>x = 1, y = 2, z = 3</code> 인데 출력은 <code>[1. 2. 3.]</code> 처럼 점이 붙는다. ' +
        '풀이 과정에 나눗셈이 들어가므로 <code>np.linalg.solve</code> 는 정수 행렬을 받아도 결과를 항상 ' +
        '<b>float64</b> 로 준다. 점 하나가 dtype 을 알려 주는 신호다 — 배열을 볼 때 항상 확인하는 습관을 들여라.'));

      root.appendChild(el('p', {
        html: '이것이 NumPy 의 정체다. <b>Numerical Python</b>, 파이썬의 고성능 수치 계산 패키지이고, ' +
          '행렬(matrix)과 벡터(vector) 연산의 사실상 표준이다. ' +
          '수업자료가 꼽은 세 가지 특징 — 리스트보다 빠르고 메모리 효율적이며, 반복문 없이 배열을 처리하고, ' +
          '선형대수 연산을 제공한다 — 이 장에서 앞의 두 개를 눈으로 확인한다.'
      }));

      /* ================================================ 2. list 의 한계 */

      root.appendChild(el('h2', { class: 'h-sec', text: 'list 로는 어디까지 되는가' }));

      root.appendChild(el('p', {
        html: '파이썬 리스트가 나쁜 자료형이라는 말이 아니다. 리스트는 <b>순서 있는 아무 물건들의 모음</b>이라는 다른 일을 하도록 만들어졌다. ' +
          '그래서 숫자 계산 기호를 리스트에 쓰면 우리가 기대한 뜻이 아닌 다른 뜻으로 동작한다.'
      }));

      root.appendChild(simListOps());

      root.appendChild(el('h3', { class: 'h-sub', text: '값이 아니라 포인터를 모아 둔 것' }));

      root.appendChild(el('p', {
        html: '리스트는 원소마다 타입이 달라도 된다. 그러려면 리스트 안에는 값이 아니라 ' +
          '<b>값이 있는 곳을 가리키는 주소(포인터)</b>가 들어 있어야 한다. ' +
          '실제 정수 객체들은 메모리 곳곳에 흩어져 있다.'
      }));

      root.appendChild(UI.code(
        'mixed = [1, 2.5, "세", True, None]   # 리스트는 무엇이든 담는다\n' +
        'for v in mixed:\n' +
        '    print(type(v))                   # 원소마다 타입이 다르다\n\n' +
        'import sys\n' +
        'sys.getsizeof(mixed)                 # 껍데기 크기 — 값들의 크기는 여기 없다\n' +
        'sys.getsizeof(mixed[0])              # 정수 객체 하나의 크기를 직접 재 보라'
      ));

      root.appendChild(el('p', {
        html: '그래서 <code>value * 2</code> 라는 한 번의 곱셈에도 파이썬은 ' +
          '① 포인터를 따라가 객체를 찾고 ② 그 객체의 타입을 확인해 맞는 곱셈 함수를 골라 ③ 결과를 담을 새 객체를 만든다. ' +
          '이것이 <b>동적 타이핑의 비용</b>이고, 원소 100만 개면 100만 번 낸다. ' +
          'ndarray 는 dtype 이 하나로 고정되어 있어 이 확인을 <b>배열 앞에서 딱 한 번</b> 한다.'
      }));

      /* ================================================ 3. 메모리 */

      root.appendChild(el('h2', { class: 'h-sec', text: '메모리에 어떻게 놓이는가' }));

      root.appendChild(simMemory());

      root.appendChild(UI.callout('why',
        'CPU 는 메모리에서 값을 하나만 가져오지 않는다. 한 번에 <b>64바이트짜리 캐시 라인</b>을 통째로 읽는다. ' +
        'int64 값이 연속으로 놓여 있으면 한 번 읽을 때 8개가 함께 따라온다 — 다음 계산에 필요한 값이 이미 CPU 안에 있다. ' +
        '값이 흩어져 있으면 원소마다 새로 읽어야 하고(캐시 미스), 그 대기 시간이 곱셈 자체보다 훨씬 길다. ' +
        '게다가 같은 타입이 나란히 있으면 CPU 의 <b>SIMD</b> 명령이 한 명령으로 여러 값을 동시에 곱할 수 있다. ' +
        'NumPy 가 빠른 이유의 절반은 똑똑한 알고리즘이 아니라 이 <b>배치</b>다.'));

      root.appendChild(UI.callout('trap',
        '표의 <code>nbytes</code> 는 정확하다(<code>size × itemsize</code>). ' +
        '반면 list 쪽 숫자는 <b>어림값</b>이다 — 포인터 8바이트는 확실하지만 정수 객체 하나의 크기는 파이썬 구현과 버전에 따라 다르고, ' +
        'CPython 은 작은 정수(-5 ~ 256)를 미리 만들어 두고 공유하기 때문에 <code>list(range(10))</code> 같은 경우에는 덜 든다. ' +
        '정확한 값이 궁금하면 <code>sys.getsizeof</code> 로 직접 재라. ' +
        '어림값이라도 결론은 바뀌지 않는다: <b>리스트가 몇 배 더 쓴다.</b>'));

      /* ================================================ 4. 벡터화 */

      root.appendChild(el('h2', { class: 'h-sec', text: '벡터화 — 루프를 지운다' }));

      root.appendChild(el('p', {
        html: '"반복문 없이 배열을 처리한다"는 말은 <b>루프가 사라진다</b>는 뜻이 아니다. ' +
          '루프가 파이썬에서 <b>C 안쪽으로 옮겨간다</b>는 뜻이다. ' +
          '루프 한 바퀴의 값은 같지만, 한 바퀴를 도는 비용이 전혀 다르다.'
      }));

      root.appendChild(simVector());

      root.appendChild(UI.callout('tip',
        '원소 수가 N 일 때 파이썬 for 는 <b>N번</b> 파이썬 바이트코드를 돌지만, ' +
        'NumPy 벡터화는 파이썬 입장에서 <b>1번</b>이다. ' +
        '앞으로 코드를 짜다가 <code>for</code> 안에서 ndarray 원소를 하나씩 만지고 있다면, ' +
        '거의 항상 그것을 지울 수 있는 배열 표현이 있다. 그 표현들이 이 실습장의 나머지 장들이다.'));

      /* ================================================ 5. 속도 */

      root.appendChild(el('h2', { class: 'h-sec', text: '속도를 직접 재 본다' }));

      root.appendChild(el('p', {
        html: '실습 과제 1번이 요구하는 것이 이것이다: <b>for loop &lt; list comprehension &lt; numpy</b> 순으로 빨라진다는 것을 증명하라. ' +
          '측정에는 IPython(주피터·Colab)의 <code>%timeit</code> 매직을 쓴다 — 여러 번 실행해 가장 빠른 시간을 보고한다.'
      }));

      root.appendChild(UI.code(
        'import numpy as np\n\n' +
        'iteration = 1_000_000\n' +
        'scalar = 2\n\n' +
        'py_list = list(range(iteration))   # 준비. 측정 대상이 아니다\n' +
        'np_arr  = np.arange(iteration)     # 준비. 측정 대상이 아니다\n\n' +
        'def loops(scalar, vector):\n' +
        '    result = []\n' +
        '    for value in vector:\n' +
        '        result.append(value * scalar)\n' +
        '    return result\n\n' +
        '%timeit -n 5 loops(scalar, py_list)                    # 1) for loop\n' +
        '%timeit -n 5 [value * scalar for value in py_list]     # 2) list comprehension\n' +
        '%timeit -n 5 np_arr * scalar                           # 3) numpy 벡터화'
      ));

      root.appendChild(UI.callout('trap',
        '원본 과제 코드에는 문제가 두 개 있다. ' +
        '<b>첫째</b>, <code>%timeit loops(scalar, list(range(iteration)))</code> 는 ' +
        '리스트 100만 개를 <b>만드는 시간까지</b> 함께 재고 있다. 우리가 비교하려는 것은 곱셈이므로 배열·리스트 생성은 위처럼 준비 단계로 빼야 한다. ' +
        '<b>둘째</b>, 2번·3번 줄은 <code>%timeit</code> 뒤에 주석만 있어서 <b>아무것도 측정하지 않는다</b> — ' +
        '빈 문장을 재고 "수십 나노초"라는 말도 안 되는 결과를 낸다. 코드를 채워 넣어야 한다.'));

      root.appendChild(UI.callout('tip',
        '준비 코드를 전역 변수로 두기 싫으면 셀 매직을 쓴다. ' +
        '<code>%%timeit</code> 의 <b>첫 줄</b>은 준비 코드로 취급되어 측정에서 빠진다.' +
        '<br><code>%%timeit py_list = list(range(1_000_000))</code>' +
        '<br><code>[v * 2 for v in py_list]</code>'));

      root.appendChild(el('p', {
        html: '절대 시간은 컴퓨터·파이썬 버전·다른 실행 중인 프로그램에 따라 달라지므로 ' +
          '"몇 ms 가 나온다"고 외우는 것은 의미가 없다. 확인할 것은 <b>경향</b>이다: ' +
          '리스트 컴프리헨션은 for 루프보다 조금 빠르고(루프 관리와 <code>append</code> 호출이 C 안쪽으로 들어간다), ' +
          'NumPy 는 리스트 컴프리헨션보다 보통 <b>수십 배</b> 빠르다. ' +
          '직접 실행해서 자기 컴퓨터의 숫자를 확인하라.'
      }));

      root.appendChild(simBench());

      /* ================================================ 6. 느린 경우 */

      root.appendChild(el('h2', { class: 'h-sec', text: 'NumPy 가 오히려 느린 경우' }));

      root.appendChild(el('p', {
        html: 'NumPy 를 쓰면 항상 빨라진다고 배우면 곧 배신당한다. 벡터화에는 <b>고정 비용</b>이 있다 — ' +
          '함수를 호출하고 dtype 을 맞추고 결과 버퍼를 잡는 비용이다. 계산량이 이 고정 비용보다 작으면 손해다.'
      }));

      root.appendChild(UI.code(
        '%timeit sum([1, 2, 3])          # 파이썬 내장 sum — 원소 3개면 이게 빠르다\n' +
        '%timeit np.sum([1, 2, 3])       # 리스트를 배열로 바꾸는 비용까지 든다\n\n' +
        'arr = np.arange(1_000_000)\n' +
        'total = 0\n' +
        'for v in arr:                   # 최악. 벡터화를 못 쓰고,\n' +
        '    total += v                  # 원소를 꺼낼 때마다 np.int64 객체가 새로 생긴다\n\n' +
        'total = arr.sum()               # 이렇게 쓴다'
      ));

      root.appendChild(UI.callout('trap',
        '<b>ndarray 를 파이썬 for 로 훑는 것</b>은 두 번 손해다. 벡터화 이득을 버리고, ' +
        '원소를 꺼낼 때마다 스칼라 객체를 새로 만드는 비용을 추가로 낸다 — 같은 일을 리스트로 하는 것보다 느릴 수 있다. ' +
        '<code>np.append</code> 로 배열을 조금씩 키우는 것도 함정이다. 배열은 크기가 고정된 한 덩어리라서 ' +
        '<code>np.append</code> 는 매번 <b>전체를 새로 복사</b>한다. 이럴 때는 파이썬 리스트에 모은 뒤 마지막에 ' +
        '<code>np.array(...)</code> 로 한 번만 바꾸는 것이 빠르다.'));

      /* ================================================ 7. 서 있는 자리 */

      root.appendChild(el('h2', { class: 'h-sec', text: 'ndarray 위에 서 있는 도구들' }));

      root.appendChild(el('p', {
        html: 'NumPy 를 배우는 실질적인 이유가 하나 더 있다. 파이썬 데이터·인공지능 생태계가 ' +
          '거의 전부 <b>ndarray 라는 공통 언어</b> 위에 올라가 있다.'
      }));

      root.appendChild(stackAscii());

      root.appendChild(el('p', {
        html: '<b>pandas</b> 의 DataFrame 은 내부에 ndarray 를 들고 있고 <code>.values</code> 로 꺼낼 수 있다. ' +
          '<b>matplotlib</b> 은 ndarray 를 그린다. ' +
          '<b>scikit-learn</b> 의 <code>fit(X, y)</code> 에서 X 는 (표본 수, 특징 수) 모양의 2차원 배열이다. ' +
          '<b>PyTorch</b> 의 텐서는 ndarray 와 거의 같은 인터페이스에 GPU 와 자동미분을 붙인 것이다. ' +
          'shape·axis·브로드캐스팅을 한 번 익히면 네 도구에서 그대로 쓴다.'
      }));

      root.appendChild(UI.code('pip install numpy\n\nimport numpy as np   # 관례상 별칭은 항상 np'));

      root.appendChild(el('p', {
        class: 'small muted',
        text: '아나콘다와 Colab 에는 이미 들어 있어 설치할 필요가 없다. 공식 문서는 numpy.org/doc/stable 이다.'
      }));

      root.appendChild(UI.callout('ver',
        '이 수업자료는 2024년 3월 <b>NumPy 1.x</b> 기준이다. 지금 <code>pip install numpy</code> 를 하면 <b>2.x</b> 가 깔린다. ' +
        '2.0 에서 <code>np.NaN</code>, <code>np.Inf</code>, <code>np.float_</code>, <code>np.int</code> 가 <b>삭제되었다</b> — ' +
        '옛 코드를 그대로 실행하면 <code>AttributeError</code> 가 난다. ' +
        '<code>np.nan</code>, <code>np.inf</code>, 그리고 파이썬 기본 <code>float</code>·<code>int</code> 로 고쳐 써야 한다. ' +
        '수업 노트북 뒤쪽(부정형 값 부분)에 이 표현이 그대로 남아 있으니 그 장에서 다시 짚는다.'));

      /* ================================================ 8. 확인 문제 */

      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));

      root.appendChild(UI.quiz([
        {
          q: '<code>py_list = [1, 2, 3]</code> 일 때 <code>py_list * 2</code> 의 결과는?',
          choices: [
            '<code>[2, 4, 6]</code>',
            '<code>[1, 2, 3, 1, 2, 3]</code>',
            '<code>TypeError</code> 가 난다',
            '<code>array([2, 4, 6])</code>'
          ],
          answer: 1,
          explain: 'list 의 <code>*</code> 는 곱셈이 아니라 <b>반복</b>이다. 원소가 6개로 늘어난다. ' +
            '원소별 곱셈을 원하면 <code>np.array(py_list) * 2</code> 처럼 배열로 바꿔야 하고, 그때는 원소가 3개로 남는다. ' +
            '숫자를 곱하는 것은 되지만 <code>py_list + 2</code> 처럼 <b>더하는</b> 것은 TypeError 다 — ' +
            'list 의 <code>+</code> 는 이어붙이기라서 리스트끼리만 되기 때문이다.'
        },
        {
          q: 'dtype 이 <code>int64</code> 이고 원소가 100만 개인 ndarray 의 <code>nbytes</code> 는?',
          choices: [
            '1,000,000',
            '8,000,000',
            '4,000,000',
            '구현에 따라 달라서 알 수 없다'
          ],
          answer: 1,
          explain: '<code>nbytes = size × itemsize = 1,000,000 × 8 = 8,000,000</code> 바이트다. ' +
            'ndarray 는 같은 dtype 의 값이 연속으로 놓인 한 덩어리라서 이 값이 <b>정확히</b> 정해진다. ' +
            '반대로 같은 숫자를 파이썬 list 에 담으면 포인터 8바이트 + 정수 객체(약 28바이트)가 따로 필요해 서너 배가 되고, ' +
            '그 값은 파이썬 구현에 따라 달라진다 — "알 수 없다"는 <b>list</b> 쪽 이야기다.'
        },
        {
          q: '과제 원본의 <code>%timeit loops(scalar, list(range(iteration)))</code> 에서 잘못된 점은?',
          choices: [
            'iteration 이 100만이라 너무 커서 의미가 없다',
            '리스트를 만드는 시간까지 함께 측정되어 곱셈 속도만 비교할 수 없다',
            '<code>%timeit</code> 은 함수 호출을 측정할 수 없다',
            '<code>loops</code> 가 결과를 반환하기 때문에 측정이 왜곡된다'
          ],
          answer: 1,
          explain: '비교하려는 것은 <b>곱셈</b>인데 <code>list(range(1000000))</code> 을 만드는 시간이 매 측정마다 포함된다. ' +
            'NumPy 쪽을 <code>np.arange(iteration) * 2</code> 로 쓰면 거기도 배열 생성이 포함되어, 두 숫자 모두 ' +
            '"생성 + 곱셈"이 섞인 값이 된다. 리스트와 배열을 <b>미리 만들어 두고</b> 곱셈만 재야 공정하다. ' +
            '참고로 원본 2·3번 줄은 <code>%timeit</code> 뒤에 주석만 있어 아무것도 측정하지 않는다.'
        },
        {
          q: '다음 중 NumPy 가 파이썬 list 보다 <b>느릴 수 있는</b> 경우는?',
          choices: [
            '원소 100만 개를 한꺼번에 2배로 만들 때',
            '원소 3개의 합을 구할 때 (<code>np.sum([1,2,3])</code> vs 내장 <code>sum</code>)',
            '(60, 40) 배열에서 행마다 평균을 구할 때',
            '큰 배열 두 개를 더할 때'
          ],
          answer: 1,
          explain: '벡터화에는 <b>고정 비용</b>이 있다 — 함수 호출, 리스트를 배열로 바꾸기, dtype 결정, 결과 버퍼 확보. ' +
            '원소가 3개면 이 고정 비용이 실제 계산보다 크므로 내장 <code>sum</code> 이 빠르다. ' +
            '나머지 세 경우는 원소가 많아 고정 비용이 묻히므로 NumPy 가 크게 유리하다. ' +
            '"작을 때는 순수 파이썬, 커지면 NumPy" 가 실전 기준이다.'
        }
      ], { id: 'why' }));
    }
  });
})();
