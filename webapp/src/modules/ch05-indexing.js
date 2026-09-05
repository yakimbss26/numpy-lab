/* ===========================================================================
 * ch05-indexing.js — 5장 인덱싱과 슬라이싱
 * 노트북 셀 46~56(기본 인덱싱·슬라이싱), 셀 150~154(불리언·팬시) 대응.
 *
 * 이 장의 축: "정수는 축을 없애고, 슬라이스는 축을 남긴다" 와
 *            "기본 인덱싱은 뷰, 불리언·팬시는 사본" 두 규칙을
 *            글로 외우게 하지 않고 조작해서 보게 만든다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  var CS = 26;    // 2·3차원 격자 칸 크기. .axis-lab(1.6rem≈25.6px) 과 폭을 맞춘 값
  var CS1 = 32;   // 1차원 격자 칸 크기 (좌상단 인덱스 표시가 들어가므로 조금 크게)

  /* ------------------------------------------------------------- 도우미 */

  /** "a[1:4, ::2]" → "1:4, ::2" */
  function stripShell(s) {
    s = String(s).trim();
    var lb = s.indexOf('[');
    if (lb !== -1 && s[s.length - 1] === ']') return s.slice(lb + 1, -1).trim();
    return s;
  }

  /** 뷰가 차지한 buf 위치 집합 — 원본 격자에서 "선택된 칸"을 칠할 때 쓴다 */
  function bufMarks(v) {
    var m = {};
    v.flatBufIndices().forEach(function (i) { m[i] = 1; });
    return m;
  }

  /** 뷰 전체에 값 하나를 대입 (a[0, :] = 0 재현) */
  function fillView(v, x) {
    v.indices().forEach(function (i) { v.set(i, x); });
    return v;
  }

  /** np.argsort — 오름차순 인덱스 배열 */
  function argsortOf(a) {
    var v = a.flatValues();
    var ord = v.map(function (_, i) { return i; });
    ord.sort(function (x, y) { return (v[x] - v[y]) || (x - y); });
    return ND.array(ord);
  }

  /** a[mask] — mask 가 행 축과 길이가 같은 1차원 불리언 배열일 때: 행 고르기 */
  function rowSelect(a, mask) {
    if (mask.ndim !== 1 || mask.shape[0] !== a.shape[0]) {
      throw new ND.NDError('boolean index did not match indexed array along axis 0; ' +
        'size of axis is ' + a.shape[0] + ' but size of corresponding boolean axis is ' +
        (mask.ndim === 1 ? mask.shape[0] : mask.size));
    }
    var picks = [];
    mask.flatValues().forEach(function (m, i) { if (m) picks.push(i); });
    if (!picks.length) return ND.zeros([0, a.shape[1]], a.dtype);
    return ND.concatenate(picks.map(function (i) { return a.idx(i + ':' + (i + 1)); }), 0);
  }

  /** a[[r0,r1,…], [c0,c1,…]] — 짝지은 원소만 뽑는다 (1차원) */
  function pairSelect(a, rs, cs) {
    var out = rs.map(function (r, k) {
      var c = cs[k];
      if (r < 0 || r >= a.shape[0]) throw new ND.NDError('index ' + r + ' is out of bounds for axis 0 with size ' + a.shape[0]);
      if (c < 0 || c >= a.shape[1]) throw new ND.NDError('index ' + c + ' is out of bounds for axis 1 with size ' + a.shape[1]);
      return a.get([r, c]);
    });
    return ND.array(out, a.dtype);
  }

  /** a[np.ix_(rows, cols)] — 행×열 블록 */
  function ixBlock(a, rs, cs) {
    return ND.array(rs.map(function (r) {
      return cs.map(function (c) { return a.get([r, c]); });
    }), a.dtype);
  }

  function panel(title, kind, kids) {
    return el('div', null, [
      el('div', { class: 'panel-t' + (kind ? ' ' + kind : ''), text: title }),
      kids
    ]);
  }

  function opArrow(t) { return el('span', { class: 'op', text: t || '→' }); }
  function note(html) { return el('p', { class: 'small muted', html: html }); }
  function line(html) { return el('p', { class: 'small', html: html }); }

  /** 차원에 맞는 격자 (1차원은 axisLabels 대신 셀 안 인덱스를 쓴다) */
  function arrGrid(a, hl, lab) {
    var o = { highlight: hl, label: lab };
    if (a.ndim >= 2) { o.axisLabels = true; o.cellSize = CS; }
    else { o.showIndex = true; o.cellSize = CS1; }
    return UI.grid(a, o);
  }

  function all(kind) { return function () { return kind; }; }

  /* =========================================================================
   * 시뮬레이터 ① 슬라이싱 플레이그라운드
   * ======================================================================= */

  var DESC2 = {
    '0': '0행 <b>전체</b>. 정수 하나 → 축 0 이 사라져 1차원이 된다.',
    '0:1': '똑같이 0행이지만 <b>슬라이스</b>라서 축 0 이 살아남는다. shape (1, 8).',
    ':, 0': '0열 전체. 파이썬 list 로는 <code>[row[0] for row in lst]</code> 를 써야 하는 일이다.',
    ':, 0:1': '같은 0열인데 2차원을 유지한다. shape (6, 1).',
    '2, 3': '정수 2개 → 축이 둘 다 사라진다. 0차원(스칼라)이다.',
    '2:3, 3:4': '같은 칸 하나인데 슬라이스 2개라서 shape (1, 1) 2차원이다.',
    '1:4': '행 1·2·3. <b>stop 인 4 는 포함되지 않는다.</b>',
    '1:4, ::2': '행 1~3, 열은 0부터 2칸씩. 행과 열을 따로 자를 수 있는 것이 list 와 다른 점이다.',
    '-1': '마지막 행. 음수 인덱스는 뒤에서부터 센다.',
    '-2:': '뒤에서 두 행. stop 을 생략하면 끝까지다.',
    '::-1': 'step 이 −1 → 행 순서가 뒤집힌다. 값을 복사하지 않고 <b>보폭만 −8 로 바꾼</b> 뷰다.',
    ':, ::-1': '열 순서를 뒤집는다.',
    '::2, ::2': '행·열 모두 한 칸씩 건너뛴다. 체스판처럼 성기게 뽑힌다.',
    '::-2': '뒤에서부터 두 칸씩.',
    '9': '<b>정수</b> 인덱스가 범위를 넘었다 → 바로 IndexError.',
    '9:20': '같은 범위인데 <b>슬라이스</b>라서 에러가 아니다. 있는 만큼(없으므로 0개) 준다.',
    '4:20': '슬라이스는 넘친 부분을 조용히 잘라 낸다. 4·5행만 나온다.',
    '2:2': 'start 와 stop 이 같으면 빈 배열이다.',
    '0, 0, 0': '2차원인데 인덱스를 3개 줬다 → IndexError.',
    '...': 'Ellipsis 하나는 "남은 축 전부"라서 <code>a[:, :]</code> 와 같다.',
    '..., 1': '마지막 축의 1 번. 축이 몇 개든 "맨 뒤 축"을 가리킬 때 쓴다. 여기서는 1열.',
    ':, None': 'None(=np.newaxis) 은 길이 1 인 축을 <b>끼워 넣는다</b>. (6, 8) → (6, 1, 8).',
    'None': '맨 앞에 축을 하나 추가한다. (6, 8) → (1, 6, 8).',
    '-1, -1': '오른쪽 아래 끝 칸.'
  };

  var DESC3 = {
    '0': '0번 <b>장</b> 전체. mnist 로 치면 첫 번째 이미지 한 장이다.',
    '1': '1번 장 전체.',
    '0:1': '같은 0번 장이지만 슬라이스라서 3차원을 유지한다. shape (1, 3, 4).',
    '::-1': '장 순서를 뒤집는다.',
    '1, 2, 3': '(장 1, 행 2, 열 3) 원소 하나. 정수 3개 → 0차원.',
    '0, 2': '0번 장의 2번 행. 뒤쪽 축(열)은 생략했으니 전체다.',
    ':, :, 0': '모든 장의 0번 열. 세로 한 줄씩 모은 것.',
    ':, 1, :': '모든 장의 1번 행.',
    '0, :, ::2': '0번 장에서 열을 한 칸씩 건너뛴다.',
    '..., 1': '맨 뒤 축의 1 번 → 모든 장·행의 1번 열. <code>[:, :, 1]</code> 과 같다.',
    '..., 0:2': '맨 뒤 축을 0~1 만. <code>[:, :, 0:2]</code> 와 같다.',
    '2': '장이 2개(0, 1)뿐인데 2 를 요청했다 → IndexError.',
    '0, 0, 0, 0': '3차원에 인덱스 4개 → IndexError.'
  };

  var GROUPS2 = [
    { t: '정수 vs 슬라이스 — 축이 사라지는가', items: ['0', '0:1', ':, 0', ':, 0:1', '2, 3', '2:3, 3:4'] },
    { t: '범위 · 방향 · 간격', items: ['1:4', '1:4, ::2', '-1', '-2:', '::-1', ':, ::-1', '::2, ::2', '::-2'] },
    { t: '범위를 넘기면 — 슬라이스는 봐 주고 정수는 화낸다', items: ['9', '9:20', '4:20', '2:2', '0, 0, 0'] },
    { t: '고급 표기', items: ['...', '..., 1', ':, None', 'None', '-1, -1'] }
  ];

  var GROUPS3 = [
    { t: '장(layer) 고르기', items: ['0', '1', '0:1', '::-1'] },
    { t: '(장, 행, 열) 세 축을 함께', items: ['1, 2, 3', '0, 2', ':, :, 0', ':, 1, :', '0, :, ::2'] },
    { t: 'Ellipsis 와 에러', items: ['..., 1', '..., 0:2', '2', '0, 0, 0, 0'] }
  ];

  function hintFor(m) {
    if (/out of bounds/.test(m)) {
      return '<b>정수</b> 인덱싱은 범위를 넘으면 그 자리에서 IndexError 다. ' +
        '같은 자리를 <code>9:20</code> 처럼 <b>슬라이스</b>로 바꿔 보라 — 에러 없이 빈 배열이 나온다.';
    }
    if (/too many indices/.test(m)) {
      return '축 개수보다 많은 인덱스를 콤마로 나열했다. 2차원 배열이면 콤마로 최대 2개, 3차원이면 3개까지다.';
    }
    if (/콜론이 너무 많다/.test(m)) return '슬라이스는 <code>start:stop:step</code> 까지다. 콜론은 두 개까지만 쓴다.';
    if (/정수가 아니다|쓸 수 없는 값/.test(m)) {
      return 'NumPy 인덱스는 정수·슬라이스·<code>...</code>·<code>None</code>·정수/불리언 배열만 된다. ' +
        '<code>a[1.5]</code> 같은 실수 인덱스는 IndexError 다.';
    }
    return '식을 다시 확인하라.';
  }

  function simPlayground() {
    var BASE = { '2': ND.arange(48).reshape([6, 8]), '3': ND.arange(24).reshape([2, 3, 4]) };
    var SRC = {
      '2': 'a = np.arange(48).reshape(6, 8)',
      '3': 'a = np.arange(24).reshape(2, 3, 4)   # (장, 행, 열)'
    };
    var DESC = { '2': DESC2, '3': DESC3 };
    var GROUPS = { '2': GROUPS2, '3': GROUPS3 };

    var st = { dim: '2', expr: '1:4, ::2' };
    var chipHost = el('div');
    var host = el('div');

    var input = UI.textInput({
      label: '인덱스식  a[ … ]', value: st.expr, wide: true, placeholder: '1:4, ::2',
      onChange: function (v) { st.expr = v; draw(); }
    });

    var dimSeg = UI.seg({
      label: '연습 배열',
      options: [{ value: '2', label: '2차원 (6, 8)' }, { value: '3', label: '3차원 (2, 3, 4)' }],
      value: st.dim,
      onChange: function (v) {
        st.dim = v; buildChips();
        input.setValue(v === '2' ? '1:4, ::2' : '0');   // setValue 가 onChange → draw 까지 부른다
      }
    });

    function buildChips() {
      UI.clear(chipHost);
      GROUPS[st.dim].forEach(function (g) {
        chipHost.appendChild(el('div', { style: { margin: '0 0 .6rem' } }, [
          el('div', { class: 'panel-t', text: g.t }),
          UI.chips(g.items, function (v) { input.setValue(v); })
        ]));
      });
    }

    function draw() {
      var base = BASE[st.dim];
      UI.clear(host);
      var inner = stripShell(st.expr);
      var shown = inner === '' ? ':' : inner;
      host.appendChild(UI.code(SRC[st.dim] + '\na[' + shown + ']'));

      var d = DESC[st.dim][inner];
      if (d) host.appendChild(line(d));

      var spec, res;
      try {
        spec = ND.parseIndex(st.expr);
        res = base.index(spec);
      } catch (e) {
        host.appendChild(el('div', { class: 'flow' }, [
          panel('a — 원본 ' + ND.shapeStr(base.shape), 'a', UI.grid(base, { axisLabels: true, cellSize: CS })),
          opArrow('✗'),
          panel('결과', null, el('div', { class: 'muted small', text: '없다 — 예외가 났다.' }))
        ]));
        host.appendChild(UI.errBlock(e.message));
        host.appendChild(note(hintFor(e.message)));
        return;
      }

      var marks = bufMarks(res);
      var left = UI.grid(base, {
        axisLabels: true, cellSize: CS,
        highlight: function (idx) { return marks[base.bufIndex(idx)] ? 'a' : 'dim'; }
      });

      var right;
      if (res.ndim > 3) {
        right = UI.out(ND.format(res), { label: '4차원 이상은 격자로 못 그린다' });
      } else if (res.size === 0) {
        right = el('div', { class: 'muted small', style: { padding: '.6rem 0' },
          text: '빈 배열이다 — 칠할 칸이 없다. 그래도 에러는 아니다.' });
      } else {
        right = arrGrid(res, all('r'));
      }

      host.appendChild(el('div', { class: 'flow' }, [
        panel('a — 원본 ' + ND.shapeStr(base.shape) + ' · 파랑이 선택된 칸', 'a', left),
        opArrow(),
        panel('a[' + shown + '] — 결과 ' + ND.shapeStr(res.shape), 'r', right)
      ]));

      var nInt = 0, nNew = 0;
      spec.forEach(function (s) { if (s.k === 'i') nInt++; else if (s.k === 'n') nNew++; });

      host.appendChild(el('div', { style: { margin: '.9rem 0 .2rem' } }, [UI.shapeBadge(res)]));

      if (base.ndim - nInt + nNew === res.ndim) {
        host.appendChild(line('<span class="mono">ndim: ' + base.ndim + ' − 정수 ' + nInt +
          '개 + None ' + nNew + '개 = <b>' + res.ndim + '</b></span> &nbsp; ' +
          '<span class="muted">정수는 축을 없애고, 슬라이스는 축을 남긴다.</span>'));
      }
      host.appendChild(line('<span class="mono">선택된 칸 ' + res.size + ' / 전체 ' + base.size + '</span>' +
        ' &nbsp; <span class="mono muted">strides (' + res.strides.join(', ') + ') · offset ' + res.offset + '</span>'));
      host.appendChild(el('p', { class: 'small', style: { color: 'var(--s3)' }, html:
        '<b>np.shares_memory(a, a[' + UI.esc(shown) + ']) → True</b> — 기본 인덱싱 결과는 <b>뷰(view)</b>다. ' +
        '값을 복사하지 않고 시작 위치(offset)와 보폭(strides)만 바꿔 같은 메모리를 다르게 본다.' }));
      host.appendChild(UI.fold('print(a[' + shown + ']) 출력 보기', UI.out(ND.format(res), { label: false })));
    }

    buildChips();
    draw();

    return UI.card({
      kicker: '시뮬레이터',
      title: '슬라이싱 플레이그라운드',
      note: '입력창에 인덱스식을 쓰면 <b>왼쪽 원본에서 뽑히는 칸</b>과 <b>결과 배열</b>이 바로 바뀐다. ' +
        '<code>a[1:4, ::2]</code> 처럼 껍질을 씌워 써도 된다. 아래 칩을 눌러 가며 shape 가 어떻게 변하는지 눈으로 따라가 보자.',
      body: [UI.controls([dimSeg, input]), chipHost, host]
    });
  }

  /* =========================================================================
   * 시뮬레이터 ② 슬라이스 눈금자 (1차원, start:stop:step)
   * ======================================================================= */

  function simRuler() {
    var a = ND.arange(10);
    var st = { start: 2, stop: 7, step: 1, useStart: 'v', useStop: 'v' };
    var host = el('div');

    function expr() {
      var s = (st.useStart === 'v' ? st.start : '') + ':' + (st.useStop === 'v' ? st.stop : '');
      return st.step === 1 ? s : s + ':' + st.step;
    }

    function draw() {
      UI.clear(host);
      var e = expr();
      host.appendChild(UI.code('a = np.arange(10)\na[' + e + ']'));
      var res;
      try { res = a.idx(e); } catch (err) { host.appendChild(UI.errBlock(err.message)); return; }
      var marks = bufMarks(res);
      host.appendChild(el('div', { class: 'flow' }, [
        panel('a — 원본 (10,)', 'a', UI.grid(a, {
          showIndex: true, cellSize: CS1,
          highlight: function (i) { return marks[a.bufIndex(i)] ? 'a' : 'dim'; }
        })),
        opArrow(),
        panel('a[' + e + '] — ' + ND.shapeStr(res.shape), 'r',
          res.size ? UI.grid(res, { showIndex: true, cellSize: CS1, highlight: all('r') })
            : el('div', { class: 'muted small', text: '빈 배열' }))
      ]));
      var s0 = st.useStart === 'v' ? st.start : (st.step > 0 ? 0 : 9);
      var s1 = st.useStop === 'v' ? st.stop : (st.step > 0 ? 10 : '끝');
      host.appendChild(line('실제로 쓰인 값 → <span class="mono">start=' + s0 + ', stop=' + s1 +
        ', step=' + st.step + '</span> · 개수 <b>' + res.size + '</b>개' +
        (st.step > 0 ? ' <span class="muted">(= ceil((stop − start) / step))</span>' : '')));
      host.appendChild(note(st.useStop === 'v'
        ? '<b>stop 인 ' + st.stop + ' 은 포함되지 않는다.</b> 마지막으로 뽑히는 인덱스는 ' +
          (res.size ? String(res.get([res.size - 1])) : '없다') + ' 다.'
        : 'stop 을 생략하면 ' + (st.step > 0 ? '끝까지' : '맨 앞까지') + ' 간다.'));
    }

    var ctl = UI.controls([
      UI.seg({ label: 'start', value: st.useStart,
        options: [{ value: 'v', label: '값 사용' }, { value: 'o', label: '생략' }],
        onChange: function (v) { st.useStart = v; draw(); } }),
      UI.slider({ label: 'start 값', min: -10, max: 10, step: 1, value: st.start,
        onChange: function (v) { st.start = v; draw(); } }),
      UI.seg({ label: 'stop', value: st.useStop,
        options: [{ value: 'v', label: '값 사용' }, { value: 'o', label: '생략' }],
        onChange: function (v) { st.useStop = v; draw(); } }),
      UI.slider({ label: 'stop 값', min: -10, max: 10, step: 1, value: st.stop,
        onChange: function (v) { st.stop = v; draw(); } }),
      UI.select({ label: 'step', options: ['-3', '-2', '-1', '1', '2', '3'], value: '1',
        onChange: function (v) { st.step = parseInt(v, 10); draw(); } })
    ]);

    draw();
    return UI.card({
      kicker: '시뮬레이터',
      title: '슬라이스 눈금자 — start : stop : step',
      note: '<code>stop</code> 이 포함되지 않는다는 것과, 음수 <code>step</code> 이 방향을 뒤집는다는 것을 ' +
        '슬라이더로 확인해 보자. <code>start</code>·<code>stop</code> 을 생략하면 어떤 값이 대신 들어가는지도 아래에 적힌다.',
      body: [ctl, host]
    });
  }

  /* =========================================================================
   * 시뮬레이터 ③ 마스크 만들기 (불리언 인덱싱)
   * ======================================================================= */

  function cmp(a, op, k) {
    if (op === '>') return ND.ops.gt(a, k);
    if (op === '>=') return ND.ops.ge(a, k);
    if (op === '<') return ND.ops.lt(a, k);
    if (op === '<=') return ND.ops.le(a, k);
    if (op === '==') return ND.ops.eq(a, k);
    return ND.ops.ne(a, k);
  }

  function simMask() {
    var TG = {};
    TG.t1 = {
      label: 'temp4 (1차원)', name: 'temp4',
      code: 'temp4 = np.array([10, 20, 30, 40, 50, 60])',
      a: ND.array([10, 20, 30, 40, 50, 60]), lo: 0, hi: 70, sp: 5, k1: 35, k2: 55
    };
    TG.t2 = {
      label: 'a = arange(48).reshape(6, 8)', name: 'a',
      code: 'a = np.arange(48).reshape(6, 8)',
      a: ND.arange(48).reshape([6, 8]), lo: 0, hi: 47, sp: 1, k1: 20, k2: 40
    };
    var inf = (D && D.nd) ? D.nd('inflammation') : null;
    if (inf) {
      var sub = inf.idx('0:8, 0:10').copy();
      TG.t3 = {
        label: '관절염 8명 × 10일', name: 'sub',
        code: "data = np.loadtxt('lab_inflammation-01.csv', delimiter=',')\nsub = data[:8, :10]   # 환자 8명의 첫 10일",
        a: sub, lo: 0, hi: ND.max(sub).toNested(), sp: 1, k1: 3, k2: 6
      };
    }

    var st = { tg: 't1', op1: '>', k1: 35, cb: 'none', op2: '<', k2: 55, neg: 'n' };
    var OPS = ['>', '>=', '<', '<=', '==', '!='];
    var ctlHost = el('div');
    var host = el('div');

    function buildCtl() {
      UI.clear(ctlHost);
      var t = TG[st.tg];
      var items = [
        UI.seg({
          label: '대상 배열', value: st.tg,
          options: Object.keys(TG).map(function (k) { return { value: k, label: TG[k].label }; }),
          onChange: function (v) {
            st.tg = v; st.k1 = TG[v].k1; st.k2 = TG[v].k2; buildCtl(); draw();
          }
        }),
        UI.select({ label: '조건 1', options: OPS, value: st.op1,
          onChange: function (v) { st.op1 = v; draw(); } }),
        UI.slider({ label: '임계값 1', min: t.lo, max: t.hi, step: t.sp, value: st.k1,
          onChange: function (v) { st.k1 = v; draw(); } }),
        UI.seg({
          label: '조건 조합', value: st.cb,
          options: [{ value: 'none', label: '하나만' }, { value: '&', label: '& 그리고' }, { value: '|', label: '| 또는' }],
          onChange: function (v) { st.cb = v; buildCtl(); draw(); }
        })
      ];
      if (st.cb !== 'none') {
        items.push(UI.select({ label: '조건 2', options: OPS, value: st.op2,
          onChange: function (v) { st.op2 = v; draw(); } }));
        items.push(UI.slider({ label: '임계값 2', min: t.lo, max: t.hi, step: t.sp, value: st.k2,
          onChange: function (v) { st.k2 = v; draw(); } }));
      }
      items.push(UI.seg({
        label: '뒤집기', value: st.neg,
        options: [{ value: 'n', label: '그대로' }, { value: 'y', label: '~ 반전' }],
        onChange: function (v) { st.neg = v; draw(); }
      }));
      ctlHost.appendChild(UI.controls(items));
    }

    function draw() {
      UI.clear(host);
      var t = TG[st.tg], a = t.a;
      var c1 = '(' + t.name + ' ' + st.op1 + ' ' + st.k1 + ')';
      var ex = st.cb === 'none' ? c1 : c1 + ' ' + st.cb + ' (' + t.name + ' ' + st.op2 + ' ' + st.k2 + ')';
      if (st.neg === 'y') ex = '~' + (st.cb === 'none' ? ex : '(' + ex + ')');
      host.appendChild(UI.code(t.code + '\ncond = ' + ex + '\n' + t.name + '[cond]'));

      var m, picked;
      try {
        m = cmp(a, st.op1, st.k1);
        if (st.cb === '&') m = ND.ops.and(m, cmp(a, st.op2, st.k2));
        else if (st.cb === '|') m = ND.ops.or(m, cmp(a, st.op2, st.k2));
        if (st.neg === 'y') m = ND.ops.not(m);
        picked = ND.maskSelect(a, m);
      } catch (e) { host.appendChild(UI.errBlock(e.message)); return; }

      var mv = m.flatValues();
      var flat = a.indices();
      var trueAt = {};
      flat.forEach(function (idx, i) { if (mv[i]) trueAt[idx.join(',')] = 1; });
      function hl(idx) { return trueAt[idx.join(',')] ? 'a' : 'dim'; }

      host.appendChild(el('div', { class: 'flow' }, [
        panel(t.name + ' — 원본 ' + ND.shapeStr(a.shape), 'a', arrGrid(a, hl)),
        opArrow('⇒'),
        panel('cond — 불리언 배열 ' + ND.shapeStr(m.shape), null, arrGrid(m, hl)),
        opArrow(),
        panel(t.name + '[cond] — ' + ND.shapeStr(picked.shape), 'r',
          picked.size ? arrGrid(picked, all('r'))
            : el('div', { class: 'muted small', text: '조건을 만족하는 칸이 없다 → 빈 배열' }))
      ]));

      var cnt = ND.sum(m).toNested();
      var ratio = ND.mean(m).toNested();
      host.appendChild(UI.statRow([
        { k: 'cond.sum()', v: String(cnt), sub: '참인 칸 수' },
        { k: 'cond.mean()', v: ratio.toFixed(4), sub: cnt + ' / ' + a.size },
        { k: '결과 shape', v: ND.shapeStr(picked.shape), sub: picked.ndim + '차원' },
        { k: '원본 shape', v: ND.shapeStr(a.shape), sub: a.ndim + '차원 · ' + a.size + '칸' }
      ]));
      host.appendChild(note(a.ndim >= 2
        ? '원본이 ' + a.ndim + '차원인데 결과는 <b>1차원</b>이다. 조건을 만족하는 칸이 격자 모양으로 모여 있을 이유가 없으니, ' +
          'NumPy 는 골라낸 값을 한 줄로 늘어놓는다.'
        : '<code>cond</code> 는 원본과 <b>shape 가 같은</b> 불리언 배열이다. True 인 자리의 값만 순서대로 뽑힌다.'));
      host.appendChild(UI.fold('cond 와 결과를 print() 로 보기', el('div', null, [
        UI.out(ND.format(m), { label: 'cond' }),
        UI.out(ND.format(picked), { label: t.name + '[cond]' })
      ])));
    }

    buildCtl();
    draw();

    return UI.card({
      kicker: '시뮬레이터',
      title: '마스크 만들기 — 조건으로 걸러내기',
      note: '연산자와 임계값을 움직이면 <b>불리언 배열(마스크)</b>과 걸러낸 결과가 함께 바뀐다. ' +
        '조건을 두 개 조합할 때 <code>&amp;</code>(그리고)·<code>|</code>(또는)·<code>~</code>(부정)를 쓴다는 것도 여기서 확인하자.',
      body: [ctlHost, host]
    });
  }

  /* =========================================================================
   * 시뮬레이터 ④ 팬시 인덱싱 조립기
   * ======================================================================= */

  function fancyDiagram(src, idxList, resVals) {
    var CW = 44, GP = 7, P = CW + GP, LM = 92, H = 200;
    var n = Math.max(src.shape[0], idxList.length);
    var W = LM + n * P + 10;
    var yS = 26, yI = 92, yR = 158, RH = 32;
    var svg = UI.svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': '인덱스 배열의 각 값이 원본의 어느 칸을 가리키는지 보여 주는 그림' });
    var defs = UI.svgEl('defs');
    svg.appendChild(defs);
    var mid = 'fa-' + Math.random().toString(36).slice(2, 8);
    var mk = UI.svgEl('marker', { id: mid, viewBox: '0 0 10 10', refX: 8, refY: 5,
      markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
    mk.appendChild(UI.svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--s4)' }));
    defs.appendChild(mk);

    function cx(k) { return LM + k * P + CW / 2; }
    function rowLabel(y, txt) {
      svg.appendChild(UI.svgEl('text', { x: LM - 10, y: y + 21, 'text-anchor': 'end',
        'font-size': 11, 'font-weight': 650, fill: 'var(--ink-2)', text: txt }));
    }
    function box(k, y, txt, wash, stroke, ink) {
      var r = UI.svgEl('rect', { x: LM + k * P, y: y, width: CW, height: RH, rx: 5,
        fill: wash, stroke: stroke, 'stroke-width': 1.3 });
      svg.appendChild(r);
      svg.appendChild(UI.svgEl('text', { x: cx(k), y: y + 21, 'text-anchor': 'middle',
        'font-family': 'ui-monospace, monospace', 'font-size': 13, 'font-weight': 650,
        fill: ink, 'pointer-events': 'none', text: txt }));
      return r;
    }

    rowLabel(yS, 'temp5 (원본)');
    rowLabel(yI, 'temp6 (인덱스)');
    rowLabel(yR, '결과');

    var srcRects = [];
    for (var k = 0; k < src.shape[0]; k++) {
      svg.appendChild(UI.svgEl('text', { x: cx(k), y: yS - 6, 'text-anchor': 'middle',
        'font-size': 10, fill: 'var(--ink-muted)', text: '[' + k + ']' }));
      srcRects.push(box(k, yS, UI.fmtCell(src.get([k]), src.dtype),
        'var(--s1-wash)', 'var(--s1)', 'var(--ink)'));
    }

    var arcs = [];
    idxList.forEach(function (v, j) {
      var ok = v >= 0 && v < src.shape[0];
      var x1 = cx(j), x2 = cx(Math.max(0, Math.min(src.shape[0] - 1, v)));
      var up = UI.svgEl('path', {
        d: 'M ' + x1 + ',' + yI + ' C ' + x1 + ',' + (yI - 18) + ' ' + x2 + ',' + (yS + RH + 22) + ' ' + x2 + ',' + (yS + RH + 3),
        fill: 'none', stroke: ok ? 'var(--s4)' : 'var(--critical)', 'stroke-width': 1.4,
        opacity: 0.6, 'marker-end': 'url(#' + mid + ')'
      });
      svg.appendChild(up);
      var down = UI.svgEl('line', { x1: x1, y1: yI + RH, x2: x1, y2: yR - 2,
        stroke: 'var(--s3)', 'stroke-width': 1.4, opacity: 0.6 });
      svg.appendChild(down);
      arcs.push({ up: up, down: down, v: v });
    });

    var idxRects = idxList.map(function (v, j) {
      var ok = v >= 0 && v < src.shape[0];
      return box(j, yI, String(v), ok ? 'var(--s4-wash)' : 'var(--crit-wash)',
        ok ? 'var(--s4)' : 'var(--critical)', ok ? 'var(--ink)' : 'var(--critical)');
    });
    resVals.forEach(function (v, j) {
      box(j, yR, v === null ? '?' : UI.fmtCell(v, src.dtype),
        v === null ? 'var(--crit-wash)' : 'var(--s3-wash)',
        v === null ? 'var(--critical)' : 'var(--s3)', 'var(--ink)');
    });

    function focus(j) {
      arcs.forEach(function (A, k) {
        var on = (j === null || k === j);
        A.up.setAttribute('opacity', on ? (j === null ? 0.6 : 1) : 0.1);
        A.down.setAttribute('opacity', on ? (j === null ? 0.6 : 1) : 0.1);
        A.up.setAttribute('stroke-width', k === j ? 2.6 : 1.4);
      });
      srcRects.forEach(function (R, k) {
        R.setAttribute('stroke-width', (j !== null && arcs[j] && arcs[j].v === k) ? 3 : 1.3);
      });
    }
    idxRects.forEach(function (R, j) {
      R.style.cursor = 'pointer';
      R.addEventListener('mouseenter', function () { focus(j); });
    });
    svg.addEventListener('mouseleave', function () { focus(null); });

    return el('div', { class: 'grid-wrap' }, [svg]);
  }

  function simFancy() {
    var src = ND.array([2, 4, 6, 8]);
    var st = { idx: [0, 0, 3, 2, 1, 2], two: false };
    var host = el('div');
    var ctlHost = el('div');

    function buildCtl() {
      UI.clear(ctlHost);
      var items = [
        UI.chips([
          { value: '0', label: '+ 0' }, { value: '1', label: '+ 1' },
          { value: '2', label: '+ 2' }, { value: '3', label: '+ 3' },
          { value: '-1', label: '+ -1 (음수)' }, { value: '9', label: '+ 9 (범위 밖!)' }
        ], function (v) { st.idx.push(parseInt(v, 10)); sync(); }),
        el('div', { class: 'flow', style: { gap: '.4rem', marginTop: '.5rem' } }, [
          UI.btn('마지막 삭제', function () { st.idx.pop(); sync(); }),
          UI.btn('비우기', function () { st.idx = []; sync(); }),
          UI.btn('수업 예제 0,0,3,2,1,2', function () { st.idx = [0, 0, 3, 2, 1, 2]; sync(); }, { primary: true })
        ])
      ];
      var even = st.idx.length >= 2 && st.idx.length % 2 === 0;
      items.push(el('div', { style: { marginTop: '.6rem' } }, [
        even ? UI.seg({
          label: '인덱스 배열의 shape', value: st.two ? 'y' : 'n',
          options: [{ value: 'n', label: '1차원 (' + st.idx.length + ',)' },
                    { value: 'y', label: '2차원 (2, ' + (st.idx.length / 2) + ')' }],
          onChange: function (v) { st.two = (v === 'y'); draw(); }
        }) : note('인덱스 개수가 짝수일 때 2차원으로 바꿔 볼 수 있다.')
      ]));
      ctlHost.appendChild(el('div', { class: 'controls', style: { display: 'block' } }, items));
    }

    function sync() {
      if (st.idx.length % 2 !== 0) st.two = false;
      buildCtl(); draw();
    }

    function draw() {
      UI.clear(host);
      var code = 'temp5 = np.array([2, 4, 6, 8])\ntemp6 = np.array([' + st.idx.join(', ') + '])';
      if (st.two) code += '.reshape(2, ' + (st.idx.length / 2) + ')';
      host.appendChild(UI.code(code + '\ntemp5[temp6]'));

      if (!st.idx.length) {
        host.appendChild(note('인덱스 배열이 비었다. 위의 칩으로 값을 넣어 보자.'));
        return;
      }

      var idxArr = ND.array(st.idx);
      if (st.two) idxArr = idxArr.reshape([2, st.idx.length / 2]);

      var res = null, err = null;
      try { res = ND.fancySelect(src, idxArr); } catch (e) { err = e; }

      if (!st.two) {
        var vals = st.idx.map(function (v) {
          return (v >= 0 && v < src.shape[0]) ? src.get([v]) : (v < 0 && v + src.shape[0] >= 0 ? src.get([v + src.shape[0]]) : null);
        });
        host.appendChild(fancyDiagram(src, st.idx, vals));
        host.appendChild(note('인덱스 칸에 마우스를 올리면 그 값이 원본의 어느 칸을 가리키는지 진하게 표시된다.'));
      } else {
        host.appendChild(el('div', { class: 'flow' }, [
          panel('temp5 — 원본 (4,)', 'a', arrGrid(src, all('a'))),
          opArrow('⇒'),
          panel('temp6 — 인덱스 ' + ND.shapeStr(idxArr.shape), null, arrGrid(idxArr, all('x'))),
          opArrow(),
          panel('결과', 'r', err ? el('div', { class: 'muted small', text: '에러' }) : arrGrid(res, all('r')))
        ]));
      }

      if (err) {
        host.appendChild(UI.errBlock(err.message, 'IndexError'));
        host.appendChild(note('팬시 인덱싱도 <b>정수 인덱싱</b>이다. 범위를 넘으면 슬라이싱처럼 봐 주지 않고 IndexError 를 낸다. ' +
          '음수는 뒤에서부터 세므로 <code>-1</code> 은 정상이다.'));
        return;
      }

      if (!st.two) {
        host.appendChild(el('div', { class: 'flow' }, [
          panel('결과 ' + ND.shapeStr(res.shape), 'r', arrGrid(res, all('r')))
        ]));
      }
      host.appendChild(el('div', { style: { margin: '.7rem 0 .2rem' } }, [UI.shapeBadge(res)]));
      host.appendChild(line('원본은 <b>' + src.size + '칸</b>인데 결과는 <b>' + res.size + '칸</b>이다. ' +
        '결과의 shape 는 원본이 아니라 <b>인덱스 배열의 shape</b>(' + ND.shapeStr(idxArr.shape) + ')를 그대로 따른다.' +
        (res.size > src.size ? ' 같은 칸을 여러 번 가리켜도 되니 <b>원본보다 길어질 수 있다.</b>' : '')));
      host.appendChild(el('p', { class: 'small', style: { color: 'var(--s3)' }, html:
        '<b>np.shares_memory(temp5, temp5[temp6]) → False</b> — 팬시 인덱싱 결과는 <b>사본</b>이다. ' +
        '뽑는 순서가 규칙적이지 않으니 offset·strides 로는 표현할 수 없고, 새 메모리에 값을 복사해야 한다.' }));
    }

    buildCtl();
    draw();

    return UI.card({
      kicker: '시뮬레이터',
      title: '팬시 인덱싱 조립기',
      note: '인덱스 배열 <code>temp6</code> 를 직접 만들어 보자. 같은 인덱스를 여러 번 넣어도 되고, ' +
        '원본보다 길게 만들어도 된다. 범위를 벗어나면 어떻게 되는지도 눌러 보라.',
      body: [ctlHost, host]
    });
  }

  /* =========================================================================
   * 본문
   * ======================================================================= */

  function sec(root, t) { root.appendChild(el('h2', { class: 'h-sec', text: t })); }
  function sub(root, t) { root.appendChild(el('h3', { class: 'h-sub', text: t })); }
  function p(root, html) { root.appendChild(el('p', { html: html })); }

  /* ------------------------------------------------ 5.1 1차원 인덱싱 */

  function part1D(root) {
    sec(root, '5.1  1차원 인덱싱 — list 와 똑같다');
    p(root, '먼저 안심할 것. 1차원 배열의 인덱싱은 파이썬 list 와 <b>완전히 같다.</b> ' +
      '0 부터 세고, 음수는 뒤에서부터 센다. 새로 외울 것이 없다.');

    var a = ND.array([10, 20, 30, 40, 50, 60]);
    root.appendChild(UI.code(
      'temp4 = np.array([10, 20, 30, 40, 50, 60])\n' +
      'lst   = [10, 20, 30, 40, 50, 60]        # 비교용 파이썬 list'));

    var dialHost = el('div');
    var stI = { i: -1 };
    function dial() {
      UI.clear(dialHost);
      var v, ok = true, msg = '';
      try { v = a.idx(String(stI.i)); } catch (e) { ok = false; msg = e.message; }
      var norm = stI.i < 0 ? stI.i + a.shape[0] : stI.i;
      dialHost.appendChild(el('div', { class: 'flow' }, [
        panel('temp4', 'a', UI.grid(a, {
          showIndex: true, cellSize: CS1,
          highlight: function (idx) { return (ok && idx[0] === norm) ? 'x' : (ok ? 'dim' : 'dim'); }
        })),
        opArrow(),
        panel('temp4[' + stI.i + ']', 'r', ok
          ? el('div', { class: 'mono', style: { fontSize: '1.5rem', fontWeight: 650, color: 'var(--s3)' },
              text: ND.format(v) })
          : el('div', { class: 'muted small', text: 'IndexError' }))
      ]));
      if (ok) {
        dialHost.appendChild(line(stI.i < 0
          ? '음수 인덱스 <span class="mono">' + stI.i + '</span> 는 <span class="mono">' + stI.i + ' + 6 = ' + norm +
            '</span> 로 바뀐다. <span class="mono">temp4[' + stI.i + '] = temp4[' + norm + ']</span>'
          : '<span class="mono">temp4[' + stI.i + ']</span> 는 앞에서부터 ' + (stI.i + 1) + '번째 값이다.'));
      } else {
        dialHost.appendChild(UI.errBlock(msg));
        dialHost.appendChild(note('원소가 6개면 쓸 수 있는 정수 인덱스는 0~5 와 −6~−1 뿐이다.'));
      }
    }
    root.appendChild(UI.controls([UI.slider({
      label: '인덱스 i', min: -8, max: 7, step: 1, value: stI.i,
      format: function (v) { return 'temp4[' + v + ']'; },
      onChange: function (v) { stI.i = v; dial(); }
    })]));
    dial();
    root.appendChild(dialHost);

    root.appendChild(UI.callout('tip',
      '여기까지는 list 와 판박이다. 진짜 차이는 <b>차원이 둘 이상</b>이 되는 순간부터 나타난다.'));
  }

  /* ------------------------------------------------ 5.2 다차원 인덱싱 */

  function partND(root) {
    sec(root, '5.2  다차원 인덱싱 — list 와 다른 것');
    p(root, '2차원 배열에서 NumPy 는 <b>콤마 하나로</b> 두 축을 동시에 지정한다. ' +
      '<code>a[i, j]</code> 다. list 처럼 <code>a[i][j]</code> 라고 써도 같은 값이 나오지만, ' +
      '둘은 속으로 하는 일이 다르다.');

    var insl = ND.array([[1, 2, 3], [4, 5, 6]]);
    root.appendChild(UI.code(
      'insl = np.array([[1, 2, 3],\n' +
      '                 [4, 5, 6]])\n' +
      'print(insl[0, 1], insl[0][1])'));
    root.appendChild(UI.out(
      ND.format(insl.idx('0, 1')) + ' ' + ND.format(insl.idx('0').idx('1'))));

    root.appendChild(el('div', { class: 'flow' }, [
      panel('insl[0, 1] — 한 번에', 'a', UI.grid(insl, {
        axisLabels: true, cellSize: CS,
        highlight: function (i) { return (i[0] === 0 && i[1] === 1) ? 'x' : 'dim'; }
      })),
      opArrow('vs'),
      panel('insl[0][1] — 두 걸음', 'b', UI.grid(insl, {
        axisLabels: true, cellSize: CS,
        highlight: function (i) { return i[0] !== 0 ? 'dim' : (i[1] === 1 ? 'x' : 'b'); }
      }))
    ]));
    root.appendChild(note('오른쪽은 먼저 0행 전체(주황)를 <b>임시 뷰</b>로 만들고, 그 뷰에서 다시 1번을 꺼낸다.'));

    root.appendChild(UI.callout('why',
      '<code>insl[0][1]</code> 은 <b>인덱싱을 두 번</b> 한다. 첫 번째 <code>insl[0]</code> 이 길이 3 인 ' +
      '뷰 객체를 하나 만들고, 두 번째 <code>[1]</code> 이 거기서 값을 꺼낸다. ' +
      '<code>insl[0, 1]</code> 은 두 축의 좌표를 한꺼번에 받아 <b>메모리 위치를 한 번만 계산</b>한다. ' +
      '결과는 같지만 중간 객체가 없으니 더 빠르고, 무엇보다 <code>a[:, 0]</code> 처럼 ' +
      '<b>list 로는 못 쓰는 표기</b>가 가능해진다.'));

    sub(root, '중간에 생긴 뷰가 원본을 바꾼다 (셀 49)');
    p(root, '수업 노트북 셀 49 는 <code>insl[0][0] = 10</code> 을 실행한 뒤 원본을 출력한다. ' +
      '원본이 바뀐다. <code>insl[0]</code> 이 <b>사본이 아니라 뷰</b>이기 때문이다.');

    var stM = { done: false };
    var mHost = el('div');
    function mutDemo() {
      UI.clear(mHost);
      var A = ND.array([[1, 2, 3], [4, 5, 6]]);
      if (stM.done) A.idx('0').set([0], 10);
      var row0 = A.idx('0');
      mHost.appendChild(UI.code(
        'insl = np.array([[1, 2, 3],\n                 [4, 5, 6]])\n' +
        (stM.done ? 'insl[0][0] = 10\n' : '') + 'insl'));
      mHost.appendChild(el('div', { class: 'flow' }, [
        panel('insl', 'a', UI.grid(A, {
          axisLabels: true, cellSize: CS,
          highlight: function (i) { return (stM.done && i[0] === 0 && i[1] === 0) ? 'x' : null; }
        })),
        panel('insl[0] — 뷰', 'b', UI.grid(row0, { showIndex: true, cellSize: CS1, highlight: all('b') }))
      ]));
      mHost.appendChild(UI.memShare(A, row0, ['insl 이 보는 칸', 'insl[0] 이 보는 칸']));
      mHost.appendChild(UI.out(ND.format(A)));
    }
    root.appendChild(el('div', { class: 'flow', style: { gap: '.5rem', margin: '0 0 1rem' } }, [
      UI.btn('insl[0][0] = 10 실행', function () { stM.done = true; mutDemo(); }, { primary: true }),
      UI.btn('처음으로', function () { stM.done = false; mutDemo(); })
    ]));
    mutDemo();
    root.appendChild(mHost);
    root.appendChild(note('메모리 막대에서 <code>insl[0]</code> 이 차지한 칸은 <code>insl</code> 의 칸과 완전히 겹친다. ' +
      '따로 복사한 것이 아니라 <b>같은 메모리를 다르게 보는 것</b>이다. 4장에서 본 그 이야기다.'));

    sub(root, '열 하나 뽑기 — list 로는 반복문이 필요하다');
    root.appendChild(UI.code(
      'lst = [[1, 2, 3], [4, 5, 6]]\n' +
      '[row[0] for row in lst]     # list: 반복문을 돌려야 한다\n\n' +
      'insl[:, 0]                  # NumPy: 표기 하나로 끝난다'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('insl', 'a', UI.grid(insl, {
        axisLabels: true, cellSize: CS,
        highlight: function (i) { return i[1] === 0 ? 'x' : 'dim'; }
      })),
      opArrow(),
      panel('insl[:, 0]', 'r', UI.grid(insl.idx(':, 0'), { showIndex: true, cellSize: CS1, highlight: all('r') }))
    ]));
    p(root, '행은 <code>lst[0]</code> 로 쉽게 꺼내지만 열은 그렇지 않다. ' +
      '2차원 배열을 다루는 일의 절반은 "열 하나 뽑기" 인데, ' +
      '이것을 표기 하나로 할 수 있다는 것이 NumPy 를 쓰는 큰 이유 중 하나다.');

    sub(root, '3차원 — (장, 행, 열)');
    p(root, 'mnist 이미지 데이터셋은 <code>(장, 행, 열)</code> 3차원이다. ' +
      '<code>train_imgs[6, 10, 12]</code> 는 "7번째 이미지의 10행 12열 픽셀"이다. ' +
      '축이 늘어도 규칙은 그대로다 — 콤마로 축의 좌표를 순서대로 적는다.');
    var b3 = ND.arange(24).reshape([2, 3, 4]);
    root.appendChild(UI.code('a = np.arange(24).reshape(2, 3, 4)   # (장 2, 행 3, 열 4)\na[1, 2, 3]'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a — (2, 3, 4)', 'a', UI.grid(b3, {
        axisLabels: true, cellSize: CS,
        layerLabel: function (L) { return 'a[' + L + '] — ' + L + '번 장'; },
        highlight: function (i) { return (i[0] === 1 && i[1] === 2 && i[2] === 3) ? 'x' : 'dim'; }
      })),
      opArrow(),
      panel('a[1, 2, 3]', 'r', el('div', { class: 'mono',
        style: { fontSize: '1.5rem', fontWeight: 650, color: 'var(--s3)' },
        text: ND.format(b3.idx('1, 2, 3')) }))
    ]));
    root.appendChild(note('플레이그라운드의 "3차원" 버튼을 눌러 <code>0</code>, <code>:, :, 0</code>, ' +
      '<code>..., 1</code> 을 직접 넣어 보라.'));
  }

  /* ------------------------------------------------ 5.3 슬라이싱 */

  function partSlice(root) {
    sec(root, '5.3  슬라이싱 — start : stop : step');
    p(root, '슬라이싱은 <code>start:stop:step</code> 세 값으로 "어디서부터, 어디 앞까지, 몇 칸씩" 을 적는다. ' +
      '가장 많이 틀리는 것은 <b>stop 이 포함되지 않는다</b>는 점이다. ' +
      '<code>a[1:4]</code> 는 1, 2, 3 이고 4 는 빠진다.');

    root.appendChild(UI.table(
      [{ k: 'w', label: '쓰는 법' }, { k: 'm', label: '뜻' }, { k: 'e', label: '예', raw: true }],
      [
        { w: 'start 생략', m: 'step 이 양수면 0 부터, 음수면 마지막부터', e: '<code>a[:3]</code>' },
        { w: 'stop 생략', m: '끝까지 (음수 step 이면 맨 앞까지)', e: '<code>a[2:]</code>' },
        { w: '둘 다 생략', m: '전체', e: '<code>a[:]</code>' },
        { w: 'step 음수', m: '거꾸로 훑는다', e: '<code>a[::-1]</code>' },
        { w: '음수 start/stop', m: '뒤에서부터 센 위치', e: '<code>a[-2:]</code>' }
      ]));

    root.appendChild(simRuler());

    sub(root, '수업 노트북 셀 52 · 55 · 56');
    p(root, '셀 49 에서 <code>insl[0][0] = 10</code> 을 이미 실행했으므로, ' +
      '이 시점의 <code>insl</code> 은 <span class="mono">[[10 2 3] [4 5 6]]</span> 이다. ' +
      '노트북을 위에서부터 순서대로 실행했다면 값이 이렇게 나온다.');

    var insl = ND.array([[10, 2, 3], [4, 5, 6]]);
    var cells = [
      { c: 'insl[1:, 0:1]', k: '[행 1부터 끝까지, 0열만]', n: '셀 52' },
      { c: 'insl[1, 1:3]', k: '[1행, 1열~2열]', n: '셀 55' },
      { c: 'insl[1:3]', k: '[1행~2행] — 콤마가 없으면 행만 지정한 것', n: '셀 56' }
    ];
    cells.forEach(function (row) {
      var res = insl.idx(stripShell(row.c));
      var marks = bufMarks(res);
      root.appendChild(el('div', { style: { margin: '1.1rem 0' } }, [
        el('div', { class: 'panel-t', text: row.n + ' — ' + row.k }),
        UI.code('insl' + row.c.slice(4)),
        el('div', { class: 'flow' }, [
          panel('insl', 'a', UI.grid(insl, {
            axisLabels: true, cellSize: CS,
            highlight: function (i) { return marks[insl.bufIndex(i)] ? 'a' : 'dim'; }
          })),
          opArrow(),
          panel('결과 ' + ND.shapeStr(res.shape), 'r', arrGrid(res, all('r'))),
          UI.shapeBadge(res)
        ]),
        UI.out(ND.format(res))
      ]));
    });

    root.appendChild(UI.callout('why',
      '셀 56 의 <code>insl[1:3]</code> 은 행이 2개뿐인 배열에 "1행부터 2행까지" 를 요청한다. ' +
      '2행은 없다. 그런데 <b>에러가 아니다</b> — NumPy 는 있는 만큼인 1행 하나만 준다. ' +
      '슬라이스는 "요청한 범위와 실제 범위의 교집합"을 조용히 계산한다. 파이썬 list 슬라이싱도 같은 규칙이다.'));

    sub(root, '결정적 대비 — 슬라이스는 봐 주고, 정수는 화낸다');
    var b2 = ND.array([[1, 2, 3], [4, 5, 6]]);
    function tryRow(expr, why) {
      var r = { e: '<code>b[' + UI.esc(expr) + ']</code>', w: why };
      try {
        var v = b2.idx(expr);
        r.o = '<span class="mono">shape ' + ND.shapeStr(v.shape) + '</span>';
      } catch (e) {
        r.o = '<span class="mono" style="color:var(--critical)">IndexError</span>';
      }
      return r;
    }
    root.appendChild(UI.code('b = np.array([[1, 2, 3],\n              [4, 5, 6]])   # 행이 2개다'));
    root.appendChild(UI.table(
      [{ k: 'e', label: '식', raw: true }, { k: 'o', label: '결과', raw: true }, { k: 'w', label: '왜' }],
      [
        tryRow('1:3', '슬라이스 — 있는 만큼(1행) 준다'),
        tryRow('5:9', '슬라이스 — 겹치는 것이 없으면 빈 배열. 에러가 아니다'),
        tryRow('2', '정수 — 2행은 없다. 값을 만들어 낼 수 없으니 IndexError'),
        tryRow('-3', '정수 — −3 + 2 = −1 로 여전히 범위 밖이다'),
        tryRow('0, 5', '정수 — 열 축에서도 마찬가지다')
      ]));
    root.appendChild(UI.callout('why',
      '왜 이렇게 다른가. 슬라이스는 <b>배열을 돌려주는</b> 요청이다. 요청한 칸이 없으면 원소가 없는 배열을 주면 되니 ' +
      '돌려줄 것이 있다. 정수 인덱싱은 <b>값 하나(또는 한 축 낮은 배열)를 돌려주는</b> 요청이다. ' +
      '없는 값은 만들어 낼 수 없으므로 에러밖에 답이 없다. ' +
      '플레이그라운드에서 <code>9</code> 와 <code>9:20</code> 을 번갈아 눌러 이 차이를 직접 확인하라.'));

    sub(root, '정수는 축을 없애고, 슬라이스는 축을 남긴다');
    p(root, '이것이 5장에서 가장 중요한 규칙이다. 값이 같아도 <b>차원이 다르면 다른 배열</b>이고, ' +
      '뒤따르는 연산에서 브로드캐스팅 결과가 달라진다.');
    var a68 = ND.arange(48).reshape([6, 8]);
    root.appendChild(UI.code('a = np.arange(48).reshape(6, 8)'));
    root.appendChild(UI.table(
      [{ k: 'e', label: '식', raw: true }, { k: 's', label: 'shape', num: true },
       { k: 'n', label: 'ndim', num: true }, { k: 'w', label: '무슨 일이 일어났나' }],
      [
        ['0', '정수 1개 → 축 0 이 사라진다'],
        ['0:1', '슬라이스 → 축 0 이 길이 1 로 남는다'],
        [':, 0', '정수 1개 → 축 1 이 사라진다'],
        [':, 0:1', '슬라이스 → 축 1 이 길이 1 로 남는다'],
        ['2, 3', '정수 2개 → 축이 둘 다 사라진다 (스칼라)'],
        ['2:3, 3:4', '슬라이스 2개 → 둘 다 남는다']
      ].map(function (r) {
        var v = a68.idx(r[0]);
        return { e: '<code>a[' + UI.esc(r[0]) + ']</code>', s: ND.shapeStr(v.shape), n: v.ndim, w: r[1] };
      })));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a[:, 0] — 1차원 (6,)', 'a', arrGrid(a68.idx(':, 0'), all('a'))),
      opArrow('vs'),
      panel('a[:, 0:1] — 2차원 (6, 1)', 'b', UI.grid(a68.idx(':, 0:1'),
        { axisLabels: true, cellSize: CS, highlight: all('b') }))
    ]));
    root.appendChild(note('값은 똑같이 6개다. 그런데 왼쪽은 가로 한 줄(1차원), 오른쪽은 세로 한 열(2차원)이다.'));

    var RAT = (D && D.nd) ? D.nd('ratingsSample') : null;
    if (RAT) {
      root.appendChild(UI.callout('tip',
        '3장에서 본 <code>data[:, :1]</code> 이 바로 이 규칙을 쓴 것이다. 이 페이지에 든 평점 표본은 ' +
        '<span class="mono">' + ND.shapeStr(RAT.shape) + '</span> 인데(실제 전체는 ' +
        '<span class="mono">' + ND.shapeStr(D.ratingsMeta.trueShape) + '</span> 이고, ' +
        '여기 실린 것은 재배포 제한 때문에 구조만 같게 만든 합성 데이터다), ' +
        '<code>data[:, :1]</code> 은 <span class="mono">' + ND.shapeStr(RAT.idx(':, 0:1').shape) +
        '</span> 로 <b>2차원 표 모양을 유지</b>하고 <code>data[:, 0]</code> 은 <span class="mono">' +
        ND.shapeStr(RAT.idx(':, 0').shape) + '</span> 로 <b>1차원 목록</b>이 된다. ' +
        '표를 계속 표로 다루고 싶으면 슬라이스를, 값들만 필요하면 정수를 쓴다.'));
    }

    sub(root, '... (Ellipsis)');
    p(root, '<code>...</code> 은 "여기 남은 축은 전부" 라는 뜻이다. ' +
      '축이 몇 개인지 모르는 배열에서 <b>맨 뒤 축</b>만 지정하고 싶을 때 쓴다.');
    root.appendChild(UI.code(
      'a3 = np.arange(24).reshape(2, 3, 4)\n' +
      'a3[..., 1]        # 맨 뒤 축의 1번\n' +
      'a3[:, :, 1]       # 위와 똑같다'));
    var a3 = ND.arange(24).reshape([2, 3, 4]);
    root.appendChild(UI.out(ND.format(a3.idx('..., 1'))));
    root.appendChild(note('두 식의 shape 는 모두 <span class="mono">' +
      ND.shapeStr(a3.idx('..., 1').shape) + '</span> 다. ' +
      '<code>...</code> 은 딱 한 번만 쓸 수 있다.'));

    sub(root, '슬라이스 결과는 뷰다 — 대입하면 원본이 바뀐다');
    p(root, '여기서 파이썬 list 와 NumPy 가 <b>정반대</b>로 갈린다. ' +
      'list 슬라이싱은 <b>사본</b>을 만들고, NumPy 슬라이싱은 <b>뷰</b>를 만든다. ' +
      '같은 코드 모양인데 결과가 다르다.');

    var lstBefore = [0, 1, 2, 3, 4];
    var lstSlice = lstBefore.slice(1, 4);
    lstSlice[0] = 99;
    root.appendChild(el('div', { class: 'stack-2' }, [
      el('div', null, [
        el('div', { class: 'panel-t', text: '파이썬 list — 사본' }),
        UI.code('lst = [0, 1, 2, 3, 4]\ns = lst[1:4]      # 사본\ns[0] = 99\nprint(lst)'),
        UI.out('[' + lstBefore.join(', ') + ']', { label: '출력' }),
        note('원본은 그대로다.')
      ]),
      el('div', null, [
        el('div', { class: 'panel-t r', text: 'NumPy — 뷰' }),
        UI.code('arr = np.arange(5)\nv = arr[1:4]      # 뷰\nv[0] = 99\nprint(arr)'),
        (function () {
          var arr = ND.arange(5), v = arr.idx('1:4');
          v.set([0], 99);
          return UI.out(ND.format(arr), { label: '출력' });
        })(),
        note('원본이 바뀌었다.')
      ])
    ]));

    var arr2 = ND.arange(5), v2 = arr2.idx('1:4');
    root.appendChild(UI.memShare(arr2, v2, ['arr 이 보는 칸', 'v = arr[1:4] 가 보는 칸']));

    root.appendChild(UI.callout('trap',
      'list 를 쓰던 습관으로 <code>backup = data[:]</code> 라고 쓰면 백업이 되지 않는다. ' +
      '뷰라서 원본과 같은 메모리를 가리키고, 원본을 고치면 "백업" 도 같이 바뀐다. ' +
      '진짜 사본이 필요하면 <code>data.copy()</code> 를 써라.'));

    sub(root, '슬라이스에 통째로 대입하기');
    p(root, '뷰라는 성질은 불편한 함정이기만 한 것이 아니다. ' +
      '<b>배열의 일부를 한 번에 고치는</b> 가장 좋은 도구가 된다.');
    var stZ = { done: false };
    var zHost = el('div');
    function zeroDemo() {
      UI.clear(zHost);
      var A = ND.arange(1, 13).reshape([3, 4]);
      if (stZ.done) fillView(A.idx('0, :'), 0);
      zHost.appendChild(UI.code('a = np.arange(1, 13).reshape(3, 4)\n' +
        (stZ.done ? 'a[0, :] = 0        # 0행 전체를 0 으로\n' : '') + 'a'));
      zHost.appendChild(el('div', { class: 'flow' }, [
        panel('a', 'a', UI.grid(A, {
          axisLabels: true, cellSize: CS,
          highlight: function (i) { return i[0] === 0 ? (stZ.done ? 'x' : 'a') : null; }
        })),
        UI.shapeBadge(A)
      ]));
      zHost.appendChild(UI.out(ND.format(A)));
    }
    root.appendChild(el('div', { class: 'flow', style: { gap: '.5rem', margin: '0 0 1rem' } }, [
      UI.btn('a[0, :] = 0 실행', function () { stZ.done = true; zeroDemo(); }, { primary: true }),
      UI.btn('처음으로', function () { stZ.done = false; zeroDemo(); })
    ]));
    zeroDemo();
    root.appendChild(zHost);
    root.appendChild(note('오른쪽 변에 배열을 놓아도 된다. ' +
      '<code>a[0, :] = [9, 9, 9, 9]</code> 나 <code>a[:, 0] = a[:, 1]</code> 처럼 쓸 수 있고, ' +
      '길이가 안 맞으면 브로드캐스팅 규칙을 따른다(7장).'));
  }

  /* ------------------------------------------------ 5.4 불리언 인덱싱 */

  function partBool(root) {
    sec(root, '5.4  불리언 인덱싱 — 조건으로 골라내기');
    p(root, '배열을 숫자와 비교하면 값이 아니라 <b>참·거짓의 배열</b>이 나온다. ' +
      '이 불리언 배열을 그대로 인덱스로 넣으면 True 인 자리의 값만 뽑힌다. ' +
      '반복문도 <code>if</code> 문도 쓰지 않는다.');

    var t4 = ND.array([10, 20, 30, 40, 50, 60]);
    var m4 = ND.ops.gt(t4, 35);
    root.appendChild(UI.code('temp4 = np.array([10, 20, 30, 40, 50, 60])\ntemp4 > 35'));
    root.appendChild(UI.out(ND.format(m4)));
    root.appendChild(UI.code('temp4[temp4 > 35]      # 조건이 True 인 요소만'));
    root.appendChild(UI.out(ND.format(ND.maskSelect(t4, m4))));

    root.appendChild(el('div', { class: 'flow' }, [
      panel('temp4', 'a', UI.grid(t4, {
        showIndex: true, cellSize: CS1,
        highlight: function (i) { return m4.get(i) ? 'a' : 'dim'; }
      })),
      opArrow('⇒'),
      panel('temp4 > 35', null, UI.grid(m4, {
        showIndex: true, cellSize: CS1,
        highlight: function (i) { return m4.get(i) ? 'a' : 'dim'; }
      })),
      opArrow(),
      panel('temp4[temp4 > 35]', 'r', arrGrid(ND.maskSelect(t4, m4), all('r')))
    ]));

    root.appendChild(simMask());

    sub(root, 'True 는 1, False 는 0 이다');
    p(root, '불리언 배열의 <code>dtype</code> 은 <code>bool</code> 이고, 계산할 때는 True=1, False=0 으로 쓰인다. ' +
      '그래서 <code>.sum()</code> 은 <b>조건을 만족하는 개수</b>, <code>.mean()</code> 은 <b>그 비율</b>이 된다. ' +
      '이 두 줄로 "몇 개인가 / 몇 퍼센트인가" 를 바로 답할 수 있다.');
    root.appendChild(UI.code(
      'cond = temp4 > 35\n' +
      'cond.dtype       # bool\n' +
      'cond.sum()       # 참인 개수\n' +
      'cond.mean()      # 참인 비율'));
    root.appendChild(UI.statRow([
      { k: 'dtype', v: m4.dtype, sub: 'True/False' },
      { k: 'cond.sum()', v: String(ND.sum(m4).toNested()), sub: '참인 개수' },
      { k: 'cond.mean()', v: String(ND.mean(m4).toNested()), sub: '참인 비율' },
      { k: 'astype(int)', v: ND.format(m4.astype('int64')), sub: '0/1 로 보면' }
    ]));

    sub(root, '조건 두 개 묶기 — and 가 아니라 &');
    p(root, '조건을 조합할 때 파이썬의 <code>and</code>·<code>or</code>·<code>not</code> 은 ' +
      '<b>쓸 수 없다.</b> 대신 <code>&amp;</code>, <code>|</code>, <code>~</code> 를 쓰고, ' +
      '<b>각 조건을 반드시 괄호로 묶는다.</b>');
    root.appendChild(UI.code('temp4[(temp4 > 15) & (temp4 < 45)]     # 올바른 방법'));
    root.appendChild(UI.out(ND.format(ND.maskSelect(t4,
      ND.ops.and(ND.ops.gt(t4, 15), ND.ops.lt(t4, 45))))));

    root.appendChild(UI.code('temp4[(temp4 > 15) and (temp4 < 45)]   # ✗'));
    root.appendChild(UI.errBlock(
      'The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()'));
    root.appendChild(UI.callout('why',
      '파이썬의 <code>and</code> 는 왼쪽 값을 먼저 <b>하나의 참/거짓</b>으로 판단한다. ' +
      '그런데 <code>temp4 &gt; 15</code> 는 원소가 6개인 배열이다 — 이걸 참 하나로 정하려면 ' +
      '"하나라도 참이면 참" 인지 "모두 참이어야 참" 인지 정해야 하는데, NumPy 는 ' +
      '<b>멋대로 정하지 않고 거부한다.</b> 그래서 저 메시지가 <code>any()</code> 와 <code>all()</code> 을 알려 준다. ' +
      '반면 <code>&amp;</code> 는 원소별로 계산하므로 배열 두 개를 자리마다 짝지어 처리한다 — 우리가 원하는 것이다.'));

    root.appendChild(UI.callout('trap',
      '괄호를 빼면 이런 일이 난다. <code>temp4 &gt; 15 &amp; temp4 &lt; 45</code> 에서 ' +
      '<code>&amp;</code> 는 비교 연산자 <code>&gt;</code> 보다 <b>우선순위가 높다.</b> ' +
      '그래서 파이썬은 <code>temp4 &gt; (15 &amp; temp4) &lt; 45</code> 로 읽고, ' +
      '연쇄 비교가 되면서 결국 위와 똑같은 ValueError 가 난다. ' +
      '<b>조건마다 괄호</b> — 예외 없는 규칙으로 외워 두는 것이 이득이다.'));

    root.appendChild(UI.callout('ver',
      '수업 노트북 셀 147 은 <code>np.NaN</code>, <code>np.Inf</code> 를 쓴다. ' +
      '이 이름들은 <b>NumPy 2.0 에서 삭제되었다</b> — 그대로 실행하면 ' +
      '<code>AttributeError: np.NaN was removed in the NumPy 2.0 release. Use np.nan instead.</code> 가 난다. ' +
      '소문자 <code>np.nan</code>, <code>np.inf</code> 를 써야 한다. ' +
      '사본 관련해서도 하나: <code>np.array(x, copy=False)</code> 는 2.0 부터 ' +
      '사본이 필요한 상황이면 에러를 낸다. 사본을 피하고 싶으면 <code>np.asarray(x)</code> 를 쓴다.'));

    root.appendChild(UI.code(
      'temp3 = np.array([1, np.nan, np.inf])   # 2.x 에서는 소문자\n' +
      'np.isnan(temp3)\n' +
      'temp3[~np.isnan(temp3)]                # 결측치만 걸러낸다'));
    var t3 = ND.array([1, NaN, Infinity]);
    var isn = ND.unop(t3, function (x) { return isNaN(x); }, 'bool');
    root.appendChild(el('div', { class: 'flow' }, [
      panel('temp3', 'a', arrGrid(t3, function (i) { return isn.get(i) ? 'err' : 'a'; })),
      opArrow('⇒'),
      panel('np.isnan(temp3)', null, arrGrid(isn, function (i) { return isn.get(i) ? 'err' : 'dim'; })),
      opArrow(),
      panel('temp3[~np.isnan(temp3)]', 'r',
        arrGrid(ND.maskSelect(t3, ND.ops.not(isn)), all('r')))
    ]));
    root.appendChild(note('<code>~</code> 는 마스크를 뒤집는다. "결측치가 아닌 것만 남기기" 는 실전에서 가장 자주 쓰는 마스크다.'));

    sub(root, '2차원에서 — 행 단위로 고르려면 마스크가 1차원이어야 한다');
    p(root, '2차원 배열에 <b>같은 shape 의</b> 마스크를 넣으면 결과가 1차원으로 납작해진다. ' +
      '반면 <b>행 축과 길이가 같은 1차원</b> 마스크를 넣으면 "행 고르기" 가 되어 2차원이 유지된다. ' +
      '마스크의 shape 가 무엇을 고를지 결정한다.');

    var inf = (D && D.nd) ? D.nd('inflammation') : null;
    if (inf) {
      var means = ND.mean(inf, 1);
      var hot = ND.ops.gt(means, 6);
      var picked = rowSelect(inf, hot);
      root.appendChild(UI.code(
        "data = np.loadtxt('lab_inflammation-01.csv', delimiter=',')\n" +
        'means = data.mean(axis=1)        # 환자별 평균 염증\n' +
        'hot = means > 6                  # 1차원 마스크\n' +
        'data[hot].shape                  # 평균 염증이 6 넘는 환자만'));
      root.appendChild(UI.statRow([
        { k: 'data.shape', v: ND.shapeStr(inf.shape), sub: '환자 60 × 날짜 40' },
        { k: 'means.shape', v: ND.shapeStr(means.shape), sub: '환자별 평균' },
        { k: 'hot.sum()', v: String(ND.sum(hot).toNested()), sub: '해당 환자 수' },
        { k: 'data[hot].shape', v: ND.shapeStr(picked.shape), sub: '2차원이 유지된다' }
      ]));
      root.appendChild(UI.callout('why',
        '<code>hot</code> 의 길이(' + hot.shape[0] + ')가 <code>data</code> 의 <b>행 개수</b>와 같으므로 ' +
        'NumPy 는 이것을 "행을 고르라" 는 뜻으로 읽는다. 고른 행은 통째로 살아남으니 열 축(40)이 그대로 붙어 ' +
        '<span class="mono">' + ND.shapeStr(picked.shape) + '</span> 가 된다. ' +
        '만약 <code>data > 6</code> 처럼 <span class="mono">(60, 40)</span> 마스크를 넣었다면 ' +
        '골라진 칸들이 흩어져 있으니 결과는 1차원 ' +
        '<span class="mono">' + ND.shapeStr(ND.maskSelect(inf, ND.ops.gt(inf, 6)).shape) + '</span> 가 된다.'));
      root.appendChild(UI.code('data[np.array([True, False])]     # 길이가 안 맞으면?'));
      try { rowSelect(inf, ND.array([true, false])); }
      catch (e) { root.appendChild(UI.errBlock(e.message, 'IndexError')); }
      root.appendChild(note('마스크 길이는 그 축의 길이와 정확히 같아야 한다. NumPy 는 부족한 만큼 채워 주지 않는다.'));
    }

    sub(root, '결과는 사본인데, 대입은 원본을 바꾼다');
    p(root, '이 절의 마지막 미묘한 지점이다. <code>a[a > 5]</code> 로 <b>꺼낸 배열</b>은 사본이라 ' +
      '고쳐도 원본에 영향이 없다. 그런데 <code>a[a > 5] = 0</code> 처럼 <b>대입문의 왼쪽</b>에 쓰면 ' +
      '원본이 바뀐다. 꺼낼 때와 넣을 때가 다른 것이다.');

    var stB = { step: 0 };
    var bHost = el('div');
    function boolDemo() {
      UI.clear(bHost);
      var a = ND.arange(10);
      var msk = ND.ops.gt(a, 5);
      var b = ND.maskSelect(a, msk);
      var log = [];
      if (stB.step >= 1) { b.set([0], 99); log.push('b[0] = 99'); }
      if (stB.step >= 2) { ND.maskAssign(a, ND.ops.gt(a, 5), 0); log.push('a[a > 5] = 0'); }
      bHost.appendChild(UI.code('a = np.arange(10)\nb = a[a > 5]      # 사본이 만들어진다\n' +
        (log.length ? log.join('\n') + '\n' : '') + 'print(a)\nprint(b)'));
      bHost.appendChild(el('div', { class: 'flow' }, [
        panel('a', 'a', arrGrid(a, function (i) { return a.get(i) === 0 && stB.step >= 2 && i[0] > 5 ? 'x' : 'a'; })),
        panel('b = a[a > 5]', 'r', arrGrid(b, function (i) { return (stB.step >= 1 && i[0] === 0) ? 'x' : 'r'; }))
      ]));
      bHost.appendChild(el('p', { class: 'small', style: { color: 'var(--s3)' }, html:
        '<b>np.shares_memory(a, b) → ' + (ND.sharesMemory(a, b) ? 'True' : 'False') + '</b> — ' +
        '불리언 인덱싱 결과는 새 메모리에 담긴 <b>사본</b>이다.' }));
      bHost.appendChild(el('div', { class: 'stack-2' }, [
        el('div', null, [el('div', { class: 'panel-t a', text: 'a 의 메모리' }),
          UI.memBar(a.root().buf, null, { dtype: a.dtype })]),
        el('div', null, [el('div', { class: 'panel-t r', text: 'b 의 메모리 (따로 있다)' }),
          UI.memBar(b.root().buf, null, { dtype: b.dtype })])
      ]));
      bHost.appendChild(UI.out(ND.format(a), { label: 'print(a)' }));
      bHost.appendChild(UI.out(ND.format(b), { label: 'print(b)' }));
    }
    root.appendChild(el('div', { class: 'flow', style: { gap: '.5rem', margin: '0 0 1rem' } }, [
      UI.btn('① b[0] = 99 실행', function () { stB.step = 1; boolDemo(); }),
      UI.btn('② a[a > 5] = 0 실행', function () { stB.step = 2; boolDemo(); }, { primary: true }),
      UI.btn('처음으로', function () { stB.step = 0; boolDemo(); })
    ]));
    boolDemo();
    root.appendChild(bHost);
    root.appendChild(UI.callout('why',
      '<code>b = a[a &gt; 5]</code> 는 값을 <b>읽어 오는</b> 식이다. 뽑히는 자리가 규칙적이지 않아 ' +
      'offset·strides 로 표현할 수 없으니, NumPy 는 새 메모리를 잡아 값을 복사한다 → 사본. ' +
      '<code>a[a &gt; 5] = 0</code> 은 파이썬이 <code>a.__setitem__</code> 을 부르는 식이다. ' +
      '중간 배열을 만들 필요 없이 <b>원본의 해당 칸에 바로 쓴다</b> → 원본이 바뀐다.'));
  }

  /* ------------------------------------------------ 5.5 팬시 인덱싱 */

  function partFancy(root) {
    sec(root, '5.5  팬시 인덱싱 — 정수 배열로 골라 뽑기');
    p(root, '인덱스 자리에 <b>정수 배열</b>을 넣을 수도 있다. ' +
      '그 배열의 각 값이 원본의 몇 번 칸인지를 가리키고, 가리킨 순서대로 값이 나온다. ' +
      '순서를 바꾸거나, 같은 값을 여러 번 뽑거나, 원하는 몇 개만 골라올 때 쓴다.');

    root.appendChild(UI.code(
      'temp5 = np.array([2, 4, 6, 8])\n' +
      'temp6 = np.array([0, 0, 3, 2, 1, 2])   # temp5 의 인덱스들\n' +
      'temp5[temp6]'));
    var t5 = ND.array([2, 4, 6, 8]), t6 = ND.array([0, 0, 3, 2, 1, 2]);
    root.appendChild(UI.out(ND.format(ND.fancySelect(t5, t6))));

    root.appendChild(simFancy());

    sub(root, '2차원에서 — 블록이 아니다');
    p(root, '여기서 거의 모두가 한 번은 틀린다. <code>a[[0, 2], [1, 3]]</code> 은 ' +
      '"0·2행 × 1·3열 블록" 이 아니다. 두 리스트를 <b>자리마다 짝지어</b> ' +
      '<code>(0, 1)</code> 과 <code>(2, 3)</code> <b>두 원소</b>만 뽑는다.');

    var a34 = ND.arange(12).reshape([3, 4]);
    var rs = [0, 2], cs = [1, 3];
    var real = pairSelect(a34, rs, cs);
    var block = ixBlock(a34, rs, cs);
    root.appendChild(UI.code('a = np.arange(12).reshape(3, 4)\na[[0, 2], [1, 3]]'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('실제로 뽑히는 칸 — 2개', 'r', UI.grid(a34, {
        axisLabels: true, cellSize: CS,
        highlight: function (i) {
          return (i[0] === 0 && i[1] === 1) || (i[0] === 2 && i[1] === 3) ? 'r' : 'dim';
        }
      })),
      opArrow('≠'),
      panel('많이들 기대하는 것 — 블록 4개 (틀렸다)', null, UI.grid(a34, {
        axisLabels: true, cellSize: CS,
        highlight: function (i) {
          return (rs.indexOf(i[0]) !== -1 && cs.indexOf(i[1]) !== -1) ? 'err' : 'dim';
        }
      }))
    ]));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a[[0, 2], [1, 3]]', 'r', arrGrid(real, all('r'))),
      UI.shapeBadge(real)
    ]));
    root.appendChild(UI.out(ND.format(real)));
    root.appendChild(UI.callout('why',
      '두 인덱스 배열이 <b>브로드캐스팅되어 좌표 짝</b>이 만들어진다고 생각하면 된다. ' +
      '<code>[0, 2]</code> 와 <code>[1, 3]</code> 은 둘 다 길이 2 이므로 짝은 ' +
      '<code>(0,1)</code>, <code>(2,3)</code> 두 개뿐이다. ' +
      '그래서 결과도 원소 2개인 1차원 배열이다.'));

    p(root, '정말 블록을 원한다면 두 가지 방법이 있다.');
    root.appendChild(UI.code(
      'a[np.ix_([0, 2], [1, 3])]     # 방법 1: 좌표 짝을 격자로 펼쳐 준다\n' +
      'a[[0, 2]][:, [1, 3]]          # 방법 2: 행 고른 뒤 열 고르기 (사본이 두 번 생긴다)'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a[np.ix_([0,2], [1,3])]', 'r', UI.grid(block, { axisLabels: true, cellSize: CS, highlight: all('r') })),
      UI.shapeBadge(block),
      opArrow('='),
      panel('a[[0,2]][:, [1,3]]', 'r', UI.grid(
        ixBlock(a34, rs, cs), { axisLabels: true, cellSize: CS, highlight: all('r') }))
    ]));
    root.appendChild(note('<code>np.ix_</code> 는 <code>[0, 2]</code> 를 ' +
      '<span class="mono">(2, 1)</span> 로, <code>[1, 3]</code> 을 <span class="mono">(1, 2)</span> 로 ' +
      '바꿔 준다. 브로드캐스팅되면 <span class="mono">(2, 2)</span> 좌표 격자가 되므로 블록이 나온다.'));

    sub(root, 'np.argsort — 정렬 순서를 인덱스로 받아 쓰기');
    p(root, '팬시 인덱싱이 가장 빛나는 곳이다. <code>np.argsort</code> 는 값을 정렬하지 않고 ' +
      '<b>정렬했을 때의 순서</b>를 인덱스 배열로 준다. 그 인덱스를 그대로 넣으면 정렬된 배열이 된다.');
    var score = ND.array([88, 72, 95, 61, 79]);
    var order = argsortOf(score);
    root.appendChild(UI.code(
      'score = np.array([88, 72, 95, 61, 79])\n' +
      'order = np.argsort(score)      # 정렬 순서(인덱스)\n' +
      'score[order]                   # 오름차순 정렬\n' +
      'score[order[::-1]]             # 내림차순'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('score', 'a', arrGrid(score, all('a'))),
      opArrow('⇒'),
      panel('order = np.argsort(score)', null, arrGrid(order, all('x'))),
      opArrow(),
      panel('score[order]', 'r', arrGrid(ND.fancySelect(score, order), all('r')))
    ]));
    root.appendChild(note('<code>order</code> 의 첫 값 ' + order.get([0]) +
      ' 은 "가장 작은 값은 ' + order.get([0]) + '번 칸에 있다" 는 뜻이다. ' +
      '값이 아니라 <b>위치</b>를 준다는 것이 요점이다.'));
    root.appendChild(UI.out(ND.format(ND.fancySelect(score, order.idx('::-1'))), { label: '내림차순' }));

    var inf = (D && D.nd) ? D.nd('inflammation') : null;
    if (inf) {
      var means = ND.mean(inf, 1);
      var ord = argsortOf(means);
      var top5 = ord.idx('::-1').idx('0:5').copy();
      root.appendChild(UI.code(
        'means = data.mean(axis=1)          # 환자별 평균 염증 (60,)\n' +
        'order = np.argsort(means)\n' +
        'top5  = order[::-1][:5]            # 평균이 높은 환자 5명\n' +
        'means[top5]'));
      root.appendChild(el('div', { class: 'flow' }, [
        panel('top5 — 환자 번호', 'x', arrGrid(top5, all('x'))),
        opArrow(),
        panel('means[top5] — 그들의 평균 염증', 'r',
          UI.grid(ND.fancySelect(means, top5), { showIndex: true, cellSize: 44, highlight: all('r'),
            label: function (i, v) { return v.toFixed(3); } }))
      ]));
      root.appendChild(note('환자 번호와 그 값이 짝을 유지한 채 함께 따라온다. ' +
        '이것이 "정렬해서 상위 몇 개 보기" 를 반복문 없이 하는 표준 방법이다.'));
    }

    sec(root, '세 가지 인덱싱 정리');
    root.appendChild(UI.table(
      [{ k: 't', label: '종류' }, { k: 'e', label: '예', raw: true },
       { k: 'v', label: '뷰인가 사본인가', raw: true }, { k: 's', label: '결과 shape' },
       { k: 'u', label: '언제 쓰나' }],
      [
        { t: '기본 (정수·슬라이스)', e: '<code>a[1:4, ::2]</code>',
          v: '<b style="color:var(--s3)">뷰</b>', s: '규칙적으로 줄어든다 (정수는 축 삭제)',
          u: '부분을 통째로 다룰 때. 고쳐서 원본에 반영할 때' },
        { t: '불리언', e: '<code>a[a &gt; 5]</code>',
          v: '<b>사본</b>', s: '항상 1차원 (행 마스크면 예외)',
          u: '조건으로 걸러낼 때. 개수·비율을 셀 때' },
        { t: '팬시 (정수 배열)', e: '<code>a[[0, 2, 2]]</code>',
          v: '<b>사본</b>', s: '인덱스 배열의 shape 를 따른다',
          u: '순서를 바꿀 때. 중복해서 뽑을 때. argsort 와 함께' }
      ]));
    root.appendChild(UI.callout('tip',
      '헷갈릴 때 판단 기준은 하나다. <b>offset 과 strides 만으로 그 칸들을 훑을 수 있는가?</b> ' +
      '가능하면 뷰를 줄 수 있고(기본 인덱싱), 불가능하면 복사밖에 방법이 없다(불리언·팬시). ' +
      '확실하지 않으면 <code>np.shares_memory(a, b)</code> 로 물어보면 된다.'));
  }

  /* =========================================================================
   * 등록
   * ======================================================================= */

  Lab.register({
    id: 'indexing',
    n: '5',
    title: '인덱싱과 슬라이싱',
    blurb: '배열에서 원하는 부분만 꺼내는 네 가지 방법과, 꺼낸 것이 원본과 메모리를 나눠 쓰는지를 직접 확인한다.',
    sim: '슬라이싱 플레이그라운드 · 슬라이스 눈금자 · 마스크 만들기 · 팬시 인덱싱 조립기',
    render: function (root) {
      root.appendChild(el('p', { class: 'lede', html:
        '배열을 만드는 것보다 <b>필요한 부분만 꺼내는 일</b>이 훨씬 자주 필요하다. ' +
        'NumPy 의 인덱싱은 파이썬 list 에서 출발하지만, 축이 둘 이상이 되는 순간부터 ' +
        '표기도 규칙도 달라진다. 이 장의 목표는 두 가지 규칙을 손에 익히는 것이다 — ' +
        '<b>정수는 축을 없애고 슬라이스는 축을 남긴다</b>, 그리고 ' +
        '<b>기본 인덱싱은 뷰, 불리언·팬시는 사본이다.</b>' }));

      root.appendChild(simPlayground());
      root.appendChild(note('이 플레이그라운드는 이 장 전체에서 계속 참조한다. ' +
        '새 규칙을 읽을 때마다 여기로 돌아와 직접 넣어 보는 것이 가장 빠른 길이다.'));

      part1D(root);
      partND(root);
      partSlice(root);
      partBool(root);
      partFancy(root);

      sec(root, '확인 문제');
      root.appendChild(UI.quiz([
        {
          q: '<code>a = np.arange(12).reshape(3, 4)</code> 일 때 ' +
             '<code>a[1]</code> 과 <code>a[1:2]</code> 의 shape 는 각각 무엇인가?',
          choices: [
            '<code>(4,)</code> 와 <code>(1, 4)</code>',
            '둘 다 <code>(4,)</code> — 값이 같으니 shape 도 같다',
            '둘 다 <code>(1, 4)</code>',
            '<code>(1, 4)</code> 와 <code>(4,)</code>'
          ],
          answer: 0,
          explain: '값은 둘 다 1행의 네 숫자지만 차원이 다르다. <b>정수 인덱스는 그 축을 없애고</b> ' +
            '<code>a[1]</code> → <code>(4,)</code>, <b>슬라이스는 축을 남겨</b> ' +
            '<code>a[1:2]</code> → <code>(1, 4)</code> 가 된다. ' +
            '플레이그라운드에서 <code>0</code> 과 <code>0:1</code> 을 번갈아 눌러 확인할 수 있다.'
        },
        {
          q: '행이 3개인 배열 <code>a</code> 에 <code>a[1:9]</code> 와 <code>a[9]</code> 를 각각 실행하면?',
          choices: [
            '둘 다 IndexError 가 난다',
            '<code>a[1:9]</code> 는 있는 만큼 2행을 주고, <code>a[9]</code> 는 IndexError 다',
            '<code>a[1:9]</code> 는 빈 배열이고, <code>a[9]</code> 는 마지막 행을 준다',
            '둘 다 부족한 자리를 0 으로 채워서 준다'
          ],
          answer: 1,
          explain: '<b>슬라이스는 범위를 넘어도 에러가 아니다</b> — 요청 범위와 실제 범위의 교집합인 1·2행을 준다. ' +
            '반면 <b>정수 인덱싱은 값 하나를 돌려줘야 하므로</b> 없는 자리를 요구받으면 ' +
            '<code>IndexError: index 9 is out of bounds for axis 0 with size 3</code> 를 낸다. ' +
            'NumPy 가 없는 값을 만들어 채우는 일은 절대 없다.'
        },
        {
          q: '<code>a = np.arange(10)</code> 다. 다음 중 <b>원본 <code>a</code> 가 바뀌는</b> 것은?',
          choices: [
            '<code>b = a[a &gt; 5]</code> 뒤에 <code>b[0] = 99</code>',
            '<code>c = a[[0, 1, 2]]</code> 뒤에 <code>c[0] = 99</code>',
            '<code>d = a[2:5]</code> 뒤에 <code>d[0] = 99</code>',
            '세 개 모두 원본이 바뀐다'
          ],
          answer: 2,
          explain: '<code>a[2:5]</code> 는 <b>기본 인덱싱</b>이라 <b>뷰</b>다 — 같은 메모리를 보고 있으니 ' +
            '<code>d[0] = 99</code> 는 <code>a[2]</code> 를 바꾼다. ' +
            '<b>불리언</b>(<code>a[a &gt; 5]</code>)과 <b>팬시</b>(<code>a[[0,1,2]]</code>)는 ' +
            '새 메모리에 값을 복사한 <b>사본</b>이므로 원본과 무관하다. ' +
            '단, <code>a[a &gt; 5] = 0</code> 처럼 <b>대입문 왼쪽</b>에 쓰면 사본이 만들어지지 않고 ' +
            '원본이 바로 바뀐다는 점은 따로 기억해야 한다.'
        },
        {
          q: '<code>a = np.arange(12).reshape(3, 4)</code> 에서 <code>a[[0, 2], [1, 3]]</code> 의 결과는?',
          choices: [
            '0·2행과 1·3열이 만나는 <code>(2, 2)</code> 블록',
            '<code>(0, 1)</code> 과 <code>(2, 3)</code> 두 원소, shape <code>(2,)</code>',
            '0·2행 전체인 <code>(2, 4)</code>',
            '인덱스 배열을 두 개 쓸 수 없으므로 에러'
          ],
          answer: 1,
          explain: '두 인덱스 배열은 <b>자리마다 짝지어</b> 좌표를 만든다. ' +
            '<code>[0, 2]</code> 와 <code>[1, 3]</code> 에서 나오는 짝은 <code>(0,1)</code>, <code>(2,3)</code> ' +
            '두 개뿐이므로 결과는 원소 2개인 1차원 배열 <code>[1, 11]</code> 이다. ' +
            '블록이 필요하면 <code>a[np.ix_([0,2], [1,3])]</code> 또는 ' +
            '<code>a[[0,2]][:, [1,3]]</code> 를 쓴다.'
        }
      ], { id: 'indexing' }));
    }
  });
})();
