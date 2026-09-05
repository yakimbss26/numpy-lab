/* ===========================================================================
 * ch09-condition.js — 9장 "조건, 논리, 결측치"
 * 원본 수업 노트북 셀 132~149 + 파일 입출력(155~160) 대응.
 *
 * 이 장의 축: 조건은 값이 아니라 "배열"로 돌아온다(마스크). 그 마스크를
 * all/any 로 한 마디로 줄이고, & | ~ 로 조합하고, where 로 값을 고르고,
 * nan 이 섞이면 무엇이 무너지는지를 전부 엔진으로 계산해 보여준다.
 * 화면의 숫자는 하나도 하드코딩하지 않았다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* ------------------------------------------------------------ 공용 도구 */

  var DATA = (D && D.inflammation) ? D.nd('inflammation') : null;

  var OPS = {
    lt: { sym: '<',  fn: function (a, b) { return ND.ops.lt(a, b); } },
    le: { sym: '<=', fn: function (a, b) { return ND.ops.le(a, b); } },
    gt: { sym: '>',  fn: function (a, b) { return ND.ops.gt(a, b); } },
    ge: { sym: '>=', fn: function (a, b) { return ND.ops.ge(a, b); } },
    eq: { sym: '==', fn: function (a, b) { return ND.ops.eq(a, b); } },
    ne: { sym: '!=', fn: function (a, b) { return ND.ops.ne(a, b); } }
  };
  var OP_OPTS = [
    { value: 'lt', label: '<' }, { value: 'le', label: '<=' },
    { value: 'gt', label: '>' }, { value: 'ge', label: '>=' },
    { value: 'eq', label: '==' }, { value: 'ne', label: '!=' }
  ];

  /** 0차원 ND → NumPy 출력 문자열 */
  function sc(nd) { return ND.format(nd); }

  function isnanOf(a) { return ND.unop(a, function (x) { return isNaN(x); }, 'bool'); }
  function isfiniteOf(a) { return ND.unop(a, function (x) { return isFinite(x); }, 'bool'); }
  function isinfOf(a) { return ND.unop(a, function (x) { return !isFinite(x) && !isNaN(x); }, 'bool'); }

  /** np.array_equal — shape 와 모든 값이 정확히 같은가 */
  function arrayEqual(a, b) {
    if (a.ndim !== b.ndim) return false;
    for (var i = 0; i < a.ndim; i++) if (a.shape[i] !== b.shape[i]) return false;
    var av = a.flatValues(), bv = b.flatValues();
    for (var j = 0; j < av.length; j++) if (av[j] !== bv[j]) return false;
    return true;
  }

  /** np.allclose — 부동소수 오차를 허용한 비교 */
  function allClose(a, b, rtol, atol) {
    rtol = (rtol === undefined) ? 1e-5 : rtol;
    atol = (atol === undefined) ? 1e-8 : atol;
    var av = a.flatValues(), bv = b.flatValues();
    if (av.length !== bv.length) return false;
    for (var i = 0; i < av.length; i++) {
      if (!(Math.abs(av[i] - bv[i]) <= atol + rtol * Math.abs(bv[i]))) return false;
    }
    return true;
  }

  function TF(b) { return b ? 'True' : 'False'; }

  function panel(kind, title, body) {
    return el('div', null, [
      el('div', { class: 'panel-t' + (kind ? ' ' + kind : ''), text: title }),
      body
    ]);
  }
  function opMark(t) { return el('span', { class: 'op', text: t }); }

  /** np.where(cond) 가 돌려주는 "튜플" 문자열을 실제로 만들어 본다 */
  function whereTupleStr(mask) {
    var hits = mask.indices().filter(function (ix) { return !!mask.get(ix); });
    var parts = [];
    for (var d = 0; d < mask.ndim; d++) {
      var vals = hits.map(function (ix) { return ix[d]; });
      parts.push(vals.length
        ? ND.format(ND.array(vals, 'int64'), { mode: 'repr' })
        : 'array([], dtype=int64)');
    }
    return '(' + parts.join(', ') + (mask.ndim === 1 ? ',' : '') + ')';
  }

  /* =======================================================================
   * 시뮬레이터 ① 조건 검사기 — all / any / axis
   * ===================================================================== */

  function simChecker() {
    var srcOpts = [
      { value: 'a10', label: 'np.arange(10)' },
      { value: 'a110', label: 'np.arange(1, 10)' }
    ];
    if (DATA) srcOpts.push({ value: 'inf', label: '관절염 6×8' });

    var st = { src: 'a10', op: 'lt', thr: 10, axis: 'none' };
    var view = el('div');

    function makeArr() {
      if (st.src === 'a110') return ND.arange(1, 10);
      if (st.src === 'inf' && DATA) return DATA.idx('0:6, 0:8').copy();
      return ND.arange(10);
    }
    function srcCode() {
      if (st.src === 'a110') return 'arr = np.arange(1, 10)';
      if (st.src === 'inf') return 'arr = data[0:6, 0:8]        # 관절염 데이터 일부';
      return 'arr = np.arange(10)';
    }

    function rebuild() {
      UI.clear(view);
      var a = makeArr();
      var op = OPS[st.op];
      var cond = 'arr ' + op.sym + ' ' + st.thr;
      var axArg = st.axis === 'none' ? '' : ', axis=' + st.axis;
      var axisNum = st.axis === 'none' ? null : parseInt(st.axis, 10);

      view.appendChild(UI.code(
        srcCode() + '\n' +
        'mask = ' + cond + '\n' +
        'np.all(mask' + axArg + ')\n' +
        'np.any(mask' + axArg + ')'
      ));

      var mask = op.fn(a, st.thr);
      var nBad = ND.sum(ND.ops.not(mask)).toNested();

      view.appendChild(el('div', { class: 'flow' }, [
        panel('a', 'arr — 조건을 만족한 칸은 파랑, 깬 칸은 빨강', UI.grid(a, {
          axisLabels: true,
          highlight: function (idx) { return mask.get(idx) ? 'a' : 'err'; }
        })),
        opMark('→'),
        panel('', 'mask = ' + cond + '  (bool 배열)', UI.grid(mask, {
          axisLabels: true,
          highlight: function (idx) { return mask.get(idx) ? 'a' : 'err'; }
        }))
      ]));
      view.appendChild(el('p', { class: 'small muted', html:
        '마스크의 shape 는 ' + ND.shapeStr(mask.shape) + ' — 원본과 똑같다. dtype 은 <b>' +
        mask.dtype + '</b>. 조건은 참·거짓 하나가 아니라 <b>배열</b>로 돌아온다.' }));

      if (axisNum === null) {
        view.appendChild(UI.statRow([
          { k: 'np.all(mask)', v: sc(ND.all(mask)), sub: '전부 만족?' },
          { k: 'np.any(mask)', v: sc(ND.any(mask)), sub: '하나라도 만족?' },
          { k: '조건을 깬 원소', v: nBad + ' 개', sub: '전체 ' + a.size + ' 개 중' }
        ]));
      } else {
        var okAll, okAny;
        try {
          okAll = ND.all(mask, axisNum);
          okAny = ND.any(mask, axisNum);
        } catch (e) {
          view.appendChild(UI.errBlock(e.message));
          view.appendChild(UI.callout('why',
            '1차원 배열에는 축이 <code>axis=0</code> 하나뿐이다. 없는 축을 부르면 NumPy 는 ' +
            '그대로 <b>AxisError</b> 를 낸다. 배열 <b>arr</b> 을 관절염 6×8 로 바꾸면 ' +
            'axis=1 도 살아난다.'));
          return;
        }
        view.appendChild(el('div', { class: 'flow' }, [
          panel('r', 'np.all(mask, axis=' + axisNum + ')  →  ' + ND.shapeStr(okAll.shape),
            UI.grid(okAll, { axisLabels: true,
              highlight: function (idx) { return okAll.get(idx) ? 'r' : 'err'; } })),
          panel('r', 'np.any(mask, axis=' + axisNum + ')  →  ' + ND.shapeStr(okAny.shape),
            UI.grid(okAny, { axisLabels: true,
              highlight: function (idx) { return okAny.get(idx) ? 'r' : 'err'; } }))
        ]));
        view.appendChild(el('p', { class: 'small muted', html:
          '축을 지정하면 그 축이 <b>사라진다</b>: ' + ND.shapeStr(mask.shape) + ' → ' +
          ND.shapeStr(okAll.shape) + '. axis=1 은 "행마다 한 칸", axis=0 은 "열마다 한 칸" 이다.' }));
        view.appendChild(UI.out(
          'np.all(mask, axis=' + axisNum + ') → ' + ND.format(okAll) + '\n' +
          'np.any(mask, axis=' + axisNum + ') → ' + ND.format(okAny)));
      }
    }

    var ctl = UI.controls([
      UI.seg({ label: '배열 arr', options: srcOpts, value: st.src,
        onChange: function (v) { st.src = v; rebuild(); } }),
      UI.select({ label: '연산자', options: OP_OPTS, value: st.op,
        onChange: function (v) { st.op = v; rebuild(); } }),
      UI.slider({ label: '임계값', min: 0, max: 20, step: 1, value: st.thr,
        format: function (v) { return String(v); },
        onChange: function (v) { st.thr = v; rebuild(); } }),
      UI.seg({ label: 'axis',
        options: [{ value: 'none', label: '전체(None)' }, { value: '0', label: 'axis=0' }, { value: '1', label: 'axis=1' }],
        value: st.axis, onChange: function (v) { st.axis = v; rebuild(); } })
    ]);

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: '조건 검사기 — 어느 원소가 조건을 깼는가',
      note: '조건을 만들면 마스크가 생기고, <b>np.all</b> 과 <b>np.any</b> 가 그 마스크를 하나의 ' +
            '참·거짓으로 줄인다. 조건을 깬 칸은 빨강으로 표시된다. axis 를 바꾸면 행별·열별 검사가 된다.',
      body: [ctl, view]
    });
  }

  /* =======================================================================
   * 시뮬레이터 ② 조건 조합기 — & | 와 괄호
   * ===================================================================== */

  function simCombiner() {
    if (!DATA) return null;
    var N = 16;
    var sub = DATA.idx('0:' + N).copy();             // 환자 16명 × 40일
    var dayOpts = [0, 5, 10, 15, 20, 25, 30, 35].map(function (d) {
      return { value: String(d), label: 'day ' + d };
    });

    var st = {
      d1: 5, o1: 'gt', t1: 2,
      d2: 20, o2: 'ge', t2: 12,
      join: 'and'
    };
    var view = el('div');
    var errHost = el('div');

    function condStr(day, op, thr) {
      return 'data[:' + N + ', ' + day + '] ' + OPS[op].sym + ' ' + thr;
    }

    function rebuild() {
      UI.clear(view);
      UI.clear(errHost);

      var col1 = sub.idx(':, ' + st.d1);
      var col2 = sub.idx(':, ' + st.d2);
      var m1 = OPS[st.o1].fn(col1, st.t1);
      var m2 = OPS[st.o2].fn(col2, st.t2);
      var joined = st.join === 'and' ? ND.ops.and(m1, m2) : ND.ops.or(m1, m2);
      var joinSym = st.join === 'and' ? '&' : '|';

      view.appendChild(UI.code(
        'c1 = (' + condStr(st.d1, st.o1, st.t1) + ')\n' +
        'c2 = (' + condStr(st.d2, st.o2, st.t2) + ')\n' +
        'mask = c1 ' + joinSym + ' c2                # np.logical_' +
          (st.join === 'and' ? 'and' : 'or') + '(c1, c2) 와 같다\n' +
        'np.where(mask)[0]                 # 조건을 만족한 환자 번호'
      ));

      var vals = ND.stack([col1, col2], 1);          // (16, 2)
      view.appendChild(el('div', { class: 'flow' }, [
        panel('', '값  [열0 = day ' + st.d1 + ', 열1 = day ' + st.d2 + ']', UI.grid(vals, {
          axisLabels: true,
          highlight: function (idx) {
            if (idx[1] === 0) return m1.get([idx[0]]) ? 'a' : 'dim';
            return m2.get([idx[0]]) ? 'b' : 'dim';
          }
        })),
        opMark('→'),
        panel('a', '조건 1', UI.grid(m1.reshape([N, 1]), {
          highlight: function (idx) { return m1.get([idx[0]]) ? 'a' : 'dim'; }
        })),
        opMark(joinSym),
        panel('b', '조건 2', UI.grid(m2.reshape([N, 1]), {
          highlight: function (idx) { return m2.get([idx[0]]) ? 'b' : 'dim'; }
        })),
        opMark('='),
        panel('r', '결합 mask', UI.grid(joined.reshape([N, 1]), {
          highlight: function (idx) { return joined.get([idx[0]]) ? 'r' : 'dim'; }
        }))
      ]));
      view.appendChild(UI.legend([
        { color: 'var(--s1)', label: '조건 1 이 참' },
        { color: 'var(--s2)', label: '조건 2 이 참' },
        { color: 'var(--s3)', label: '결합 결과가 참' }
      ]));

      var picked = ND.whereIdx(joined);
      var means = ND.mean(sub, 1);
      var pickedMeans = ND.maskSelect(means, joined);
      view.appendChild(UI.out(
        'np.where(mask)[0] → ' + ND.format(picked, { mode: 'repr' }) + '\n' +
        'mask.sum()        → ' + sc(ND.sum(joined)) + '  (환자 ' + N + '명 중)\n' +
        'data[:' + N + '][mask].mean(axis=1) → ' + ND.format(pickedMeans)));
      view.appendChild(el('p', { class: 'small muted', html:
        '마지막 줄이 조건에 걸린 환자들의 40일 평균 염증 수치다. 참고로 16명 전체 평균은 <b>' +
        sc(ND.mean(sub)) + '</b> 이다.' }));
    }

    var ctl1 = UI.controls([
      UI.select({ label: '조건 1 · 열', options: dayOpts, value: String(st.d1),
        onChange: function (v) { st.d1 = parseInt(v, 10); rebuild(); } }),
      UI.select({ label: '연산자', options: OP_OPTS, value: st.o1,
        onChange: function (v) { st.o1 = v; rebuild(); } }),
      UI.slider({ label: '임계값', min: 0, max: 20, step: 1, value: st.t1,
        format: function (v) { return String(v); },
        onChange: function (v) { st.t1 = v; rebuild(); } }),
      UI.seg({ label: '결합', options: [{ value: 'and', label: '& (그리고)' }, { value: 'or', label: '| (또는)' }],
        value: st.join, onChange: function (v) { st.join = v; rebuild(); } })
    ]);
    var ctl2 = UI.controls([
      UI.select({ label: '조건 2 · 열', options: dayOpts, value: String(st.d2),
        onChange: function (v) { st.d2 = parseInt(v, 10); rebuild(); } }),
      UI.select({ label: '연산자', options: OP_OPTS, value: st.o2,
        onChange: function (v) { st.o2 = v; rebuild(); } }),
      UI.slider({ label: '임계값', min: 0, max: 20, step: 1, value: st.t2,
        format: function (v) { return String(v); },
        onChange: function (v) { st.t2 = v; rebuild(); } })
    ]);

    var traps = el('div', { class: 'chips' }, [
      UI.btn('c1 and c2 로 쓰면?', function () {
        UI.clear(errHost);
        errHost.appendChild(UI.code('mask = c1 and c2'));
        errHost.appendChild(UI.errBlock(
          'The truth value of an array with more than one element is ambiguous. ' +
          'Use a.any() or a.all()', 'ValueError'));
        errHost.appendChild(UI.callout('why',
          '파이썬의 <code>and</code> 는 왼쪽 값을 <b>하나의 참·거짓</b>으로 판정하려 한다. ' +
          '그런데 c1 은 원소가 ' + N + '개인 배열이다. "16개가 참이냐"는 질문에 답이 없으므로 ' +
          'NumPy 는 거부하고, <code>.all()</code> 이나 <code>.any()</code> 로 줄이라고 알려 준다. ' +
          '원소별로 묶고 싶으면 <b>&</b> 를 써야 한다.'));
      }),
      UI.btn('괄호를 빼면?', function () {
        UI.clear(errHost);
        errHost.appendChild(UI.code(
          'arr6 = np.arange(10)\n' +
          'arr6 > 2 & arr6 < 5      # 괄호 없음'));
        errHost.appendChild(UI.errBlock(
          'The truth value of an array with more than one element is ambiguous. ' +
          'Use a.any() or a.all()', 'ValueError'));
        errHost.appendChild(UI.callout('trap',
          '<code>&</code> 는 비교 연산자보다 <b>우선순위가 높다</b>. 그래서 파이썬은 이 식을 ' +
          '<code>arr6 &gt; (2 &amp; arr6) &lt; 5</code> 로 읽고, 이어서 연쇄 비교로 풀어 ' +
          '<code>and</code> 를 쓰다가 위 에러를 낸다. 실수 배열이라면 <code>2 &amp; arr</code> ' +
          '자체가 불가능해 <b>TypeError</b>(bitwise_and not supported) 가 난다. ' +
          '조건마다 괄호를 씌우는 것은 선택이 아니라 <b>필수</b>다.'));
      }),
      UI.btn('지우기', function () { UI.clear(errHost); })
    ]);

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: '조건 조합기 — & 와 | 로 두 조건을 묶는다',
      note: '관절염 데이터 앞 16명을 대상으로, 서로 다른 두 날짜(열)에 조건을 걸어 본다. ' +
            '조건 1(파랑)·조건 2(주황)·결합(초록) 마스크가 나란히 갱신된다. ' +
            '아래 버튼은 학생들이 가장 많이 내는 두 에러를 실제 메시지로 보여 준다.',
      body: [ctl1, ctl2, view, traps, errHost]
    });
  }

  /* =======================================================================
   * 시뮬레이터 ③ where 시각화
   * ===================================================================== */

  function simWhere() {
    var st = { dim: '1d', op: 'lt', thr: 35, mode: '3', tv: '1', fv: '0' };
    var view = el('div');
    var tvCtl, fvCtl;

    function makeArr() {
      if (st.dim === '2d') {
        return DATA ? DATA.idx('0:5, 0:8').copy() : ND.arange(40).reshape([5, 8]);
      }
      return ND.array([10, 20, 30, 40, 50, 60]);
    }
    function srcName() { return st.dim === '2d' ? 'data[0:5, 0:8]' : 'temp4'; }

    /** '1' · 'a' · 'a*2' · 'a+5' 같은 입력을 실제 값/배열로 */
    function parseSide(s, a) {
      s = String(s).trim();
      if (s === '') throw new ND.NDError('빈 칸은 값이 될 수 없다.');
      if (s === 'a') return a;
      if (s === '-a') return ND.ops.mul(a, -1);
      var m = /^a\s*\*\s*(-?[0-9]*\.?[0-9]+)$/.exec(s);
      if (m) return ND.ops.mul(a, parseFloat(m[1]));
      m = /^a\s*([+-])\s*([0-9]*\.?[0-9]+)$/.exec(s);
      if (m) {
        return m[1] === '+' ? ND.ops.add(a, parseFloat(m[2])) : ND.ops.sub(a, parseFloat(m[2]));
      }
      if (/^-?[0-9]*\.?[0-9]+$/.test(s)) return parseFloat(s);
      throw new ND.NDError("여기에는 숫자나 a, a*2, a+5, -a 같은 식만 쓸 수 있다: '" + s + "'");
    }

    function rebuild() {
      UI.clear(view);
      var a = makeArr();
      var op = OPS[st.op];
      var cond = 'a ' + op.sym + ' ' + st.thr;
      var mask = op.fn(a, st.thr);

      if (st.mode === '1') {
        view.appendChild(UI.code(
          'a = ' + srcName() + '\n' +
          'np.where(' + cond + ')          # 인자 1개 → 인덱스\n' +
          'np.where(' + cond + ')[0]'
        ));
        view.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'a — 조건이 참인 칸이 파랑', UI.grid(a, {
            axisLabels: true, showIndex: st.dim === '1d',
            highlight: function (idx) { return mask.get(idx) ? 'a' : 'b'; }
          })),
          opMark('→'),
          panel('', 'mask (bool)', UI.grid(mask, {
            axisLabels: true,
            highlight: function (idx) { return mask.get(idx) ? 'a' : 'b'; }
          }))
        ]));
        var tup = whereTupleStr(mask);
        var flat = ND.whereIdx(mask);
        view.appendChild(UI.out(
          'np.where(' + cond + ')\n' + tup + '\n\n' +
          'np.where(' + cond + ')[0]\n' +
          (mask.ndim === 1
            ? ND.format(flat, { mode: 'repr' })
            : ND.format(ND.array(mask.indices().filter(function (ix) { return !!mask.get(ix); })
                .map(function (ix) { return ix[0]; }), 'int64'), { mode: 'repr' }) + '   # 행 번호만')));
        view.appendChild(UI.callout('trap',
          '결과 맨 끝의 쉼표를 보라 — <code>' + UI.esc(tup) + '</code> 는 배열이 아니라 ' +
          '<b>배열이 든 튜플</b>이다. 축이 ' + mask.ndim + '개니까 배열도 ' + mask.ndim +
          '개 들어 있다. 그래서 실제로 인덱스를 쓰려면 거의 항상 ' +
          '<code>np.where(...)[0]</code> 처럼 꺼내 써야 한다.'));
        return;
      }

      var X, Y;
      try {
        X = parseSide(st.tv, a);
        Y = parseSide(st.fv, a);
      } catch (e) {
        view.appendChild(UI.errBlock(e.message, 'ValueError'));
        return;
      }
      var res;
      try {
        res = ND.where(mask, X, Y);
      } catch (e) {
        view.appendChild(UI.errBlock(e.message));
        return;
      }

      view.appendChild(UI.code(
        'a = ' + srcName() + '\n' +
        'np.where(' + cond + ', ' + st.tv + ', ' + st.fv + ')   # 인자 3개 → 값을 고른 배열'
      ));
      view.appendChild(el('div', { class: 'flow' }, [
        panel('a', 'a', UI.grid(a, {
          axisLabels: true,
          highlight: function (idx) { return mask.get(idx) ? 'a' : 'b'; }
        })),
        opMark('→'),
        panel('', 'mask = ' + cond, UI.grid(mask, {
          axisLabels: true,
          highlight: function (idx) { return mask.get(idx) ? 'a' : 'b'; }
        })),
        opMark('→'),
        panel('r', '결과 — 색은 값을 가져온 쪽', UI.grid(res, {
          axisLabels: true,
          highlight: function (idx) { return mask.get(idx) ? 'a' : 'b'; }
        }))
      ]));
      view.appendChild(UI.legend([
        { color: 'var(--s1)', label: '조건이 참 → 참값(' + st.tv + ') 에서 가져왔다' },
        { color: 'var(--s2)', label: '조건이 거짓 → 거짓값(' + st.fv + ') 에서 가져왔다' }
      ]));
      view.appendChild(UI.out(ND.format(res) + '\n' +
        'shape ' + ND.shapeStr(res.shape) + ' · dtype ' + res.dtype));
      var xIsArr = (X instanceof ND.ND), yIsArr = (Y instanceof ND.ND);
      view.appendChild(el('p', { class: 'small muted', html:
        '참값은 ' + (xIsArr ? '<b>배열</b>' : '<b>스칼라</b>') + ', 거짓값은 ' +
        (yIsArr ? '<b>배열</b>' : '<b>스칼라</b>') + '. 스칼라는 브로드캐스팅으로 ' +
        ND.shapeStr(mask.shape) + ' 만큼 늘어난다 — 그래서 숫자와 배열을 섞어 써도 된다.' }));
    }

    var ctl = UI.controls([
      UI.seg({ label: '배열', options: [{ value: '1d', label: 'temp4 (1차원)' }, { value: '2d', label: '관절염 5×8' }],
        value: st.dim, onChange: function (v) { st.dim = v; st.thr = v === '2d' ? 10 : 35; thrCtl.setValue(st.thr); rebuild(); } }),
      UI.seg({ label: '사용법', options: [{ value: '1', label: '인자 1개 → 인덱스' }, { value: '3', label: '인자 3개 → 값' }],
        value: st.mode, onChange: function (v) { st.mode = v; rebuild(); } }),
      UI.select({ label: '연산자', options: OP_OPTS, value: st.op,
        onChange: function (v) { st.op = v; rebuild(); } })
    ]);
    var thrCtl = UI.slider({ label: '임계값', min: 0, max: 60, step: 5, value: st.thr,
      format: function (v) { return String(v); },
      onChange: function (v) { st.thr = v; rebuild(); } });
    tvCtl = UI.textInput({ label: '참값 (x)', value: st.tv,
      onChange: function (v) { st.tv = v; rebuild(); } });
    fvCtl = UI.textInput({ label: '거짓값 (y)', value: st.fv,
      onChange: function (v) { st.fv = v; rebuild(); } });
    var ctl2 = UI.controls([thrCtl, tvCtl, fvCtl]);
    var preset = UI.chips([
      { value: '1|0', label: '1 / 0  (깃발 세우기)' },
      { value: 'a|0', label: 'a / 0  (통과 못한 값은 0)' },
      { value: '0|a', label: '0 / a  (조건에 걸린 값만 지우기)' },
      { value: 'a*2|a', label: 'a*2 / a  (조건부 두 배)' }
    ], function (v) {
      var p = v.split('|');
      st.mode = '3';
      st.tv = p[0]; st.fv = p[1];
      tvCtl.setValue(p[0]); fvCtl.setValue(p[1]);
    });

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: 'where 시각화 — 인덱스도 되고 값도 된다',
      note: '<b>인자 1개</b>면 조건이 참인 자리의 <b>인덱스(튜플)</b>, <b>인자 3개</b>면 조건에 따라 ' +
            '값을 고른 <b>새 배열</b>이 나온다. 참값·거짓값 칸에는 숫자뿐 아니라 ' +
            '<code>a</code>, <code>a*2</code>, <code>a+5</code>, <code>-a</code> 도 쓸 수 있다.',
      body: [ctl, ctl2, preset, view]
    });
  }

  /* =======================================================================
   * 시뮬레이터 ④ nan 전파 실험실
   * ===================================================================== */

  function simNanLab() {
    var base = DATA
      ? DATA.idx('0, 15:23').copy()
      : ND.array([4, 7, 7, 12, 18, 6, 13, 11], 'float64');
    var st = { nan: {} };
    var view = el('div');

    function current() {
      var a = base.copy();
      Object.keys(st.nan).forEach(function (k) { if (st.nan[k]) a.set([parseInt(k, 10)], NaN); });
      return a;
    }

    function cellHtml(txt, bad) {
      return bad ? '<b style="color:var(--critical)">' + txt + '</b>' : txt;
    }

    function rebuild() {
      UI.clear(view);
      var a = current();
      var nanMask = isnanOf(a);
      var keep = ND.ops.not(nanMask);
      var clean = ND.maskSelect(a, keep);
      var nNan = ND.sum(nanMask).toNested();

      view.appendChild(el('p', { class: 'small', html:
        '칸을 <b>클릭</b>하면 그 값이 nan(측정 실패)이 된다. 다시 누르면 되돌아온다. ' +
        '현재 nan ' + nNan + '개 / ' + a.size + '개.' }));
      view.appendChild(UI.grid(a, {
        showIndex: true, cellSize: 46,
        highlight: function (idx) { return isNaN(a.get(idx)) ? 'err' : 'a'; },
        label: function (idx, val) { return isNaN(val) ? 'nan' : UI.fmtCell(val, 'float64'); },
        onClick: function (idx) {
          var k = String(idx[0]);
          st.nan[k] = !st.nan[k];
          rebuild();
        }
      }));
      view.appendChild(el('div', { class: 'chips' }, [
        UI.btn('한 칸만 nan (index 2)', function () { st.nan = { '2': true }; rebuild(); }),
        UI.btn('전부 nan', function () {
          st.nan = {};
          for (var i = 0; i < base.size; i++) st.nan[String(i)] = true;
          rebuild();
        }),
        UI.btn('모두 되돌리기', function () { st.nan = {}; rebuild(); }, { primary: true })
      ]));

      view.appendChild(UI.code(
        'np.isnan(a)          # nan 인 자리 찾기\n' +
        'a[~np.isnan(a)]      # nan 을 빼고 남은 값 (사본)\n' +
        'np.sum(a), np.nansum(a)'));
      view.appendChild(el('div', { class: 'flow' }, [
        panel('', 'np.isnan(a)', UI.grid(nanMask, {
          highlight: function (idx) { return nanMask.get(idx) ? 'err' : 'a'; }
        })),
        opMark('→'),
        panel('r', 'a[~np.isnan(a)]  ' + ND.shapeStr(clean.shape),
          UI.grid(clean, { highlight: function () { return 'r'; } }))
      ]));

      function row(name, nanName, f) {
        var raw, cln;
        try { raw = sc(f(a)); } catch (e) { raw = '에러'; }
        try { cln = clean.size ? sc(f(clean)) : 'nan'; } catch (e) { cln = 'nan'; }
        return {
          f: name,
          v: cellHtml(raw, raw === 'nan'),
          nf: nanName,
          nv: cellHtml(cln, cln === 'nan')
        };
      }
      var rows = [
        row('np.sum(a)', 'np.nansum(a)', function (x) { return ND.sum(x); }),
        row('np.mean(a)', 'np.nanmean(a)', function (x) { return ND.mean(x); }),
        row('np.max(a)', 'np.nanmax(a)', function (x) { return ND.max(x); }),
        row('np.min(a)', 'np.nanmin(a)', function (x) { return ND.min(x); }),
        row('np.std(a)', 'np.nanstd(a)', function (x) { return ND.std(x, null, 0); })
      ];
      view.appendChild(UI.table([
        { k: 'f', label: '보통 함수' },
        { k: 'v', label: '결과', num: true, raw: true },
        { k: 'nf', label: 'nan 을 건너뛰는 함수' },
        { k: 'nv', label: '결과', num: true, raw: true }
      ], rows));

      if (nNan === 0) {
        view.appendChild(UI.callout('tip',
          'nan 이 하나도 없으면 두 줄의 값이 같다. 이제 위 격자에서 칸 하나만 눌러 보라 — ' +
          '<b>왼쪽 열 전체가 한꺼번에 nan 이 된다.</b>'));
      } else if (clean.size === 0) {
        view.appendChild(UI.callout('trap',
          '전부 nan 이면 걸러낼 값이 남지 않는다. 이때 <code>np.nansum</code> 은 <b>0.0</b> 을 ' +
          '돌려주지만 <code>np.nanmean</code> 은 nan + RuntimeWarning, ' +
          '<code>np.nanmax</code> 는 아예 <b>ValueError</b> 를 낸다. ' +
          '"결측치를 무시한다"는 말이 "결측치가 없는 것처럼 된다"는 뜻은 아니다.'));
      } else {
        view.appendChild(UI.callout('why',
          'nan 은 <b>어떤 수와 연산해도 nan</b> 이다. 합에 nan 이 한 번 들어오면 그 뒤 모든 덧셈이 ' +
          'nan 이고, 평균·표준편차·최댓값까지 전부 nan 이 된다. 2400개 중 하나만 빠져도 ' +
          '통계 전체가 무의미해지는 것이다. 그래서 <b>nan 을 먼저 처리</b>하고 계산해야 한다. ' +
          '남은 ' + clean.size + '개로 계산한 합은 <b>' + sc(ND.sum(clean)) + '</b> 이다.'));
      }
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터',
      title: 'nan 전파 실험실 — 한 칸이 전체를 무너뜨린다',
      note: '관절염 데이터 0번 환자의 day 15~22 값이다. 칸을 눌러 결측치를 만들고, ' +
            '보통 함수와 <code>nan*</code> 함수의 결과가 어떻게 갈라지는지 보라. ' +
            'nan 을 건너뛴 값은 <code>a[~np.isnan(a)]</code> 로 걸러낸 배열에서 실제로 계산한 것이다.',
      body: [view]
    });
  }

  /* =======================================================================
   * 본문
   * ===================================================================== */

  function render(root) {

    root.appendChild(el('p', { class: 'lede', html:
      'NumPy 에서 조건을 쓰면 <b>참·거짓 하나</b>가 아니라 <b>참·거짓 배열</b>이 돌아온다. ' +
      '이 배열을 마스크(mask)라 부르고, 마스크를 줄이고 조합하고 값으로 바꾸는 도구가 ' +
      'all·any·where 다. 마지막에는 실제 데이터에 반드시 섞여 있는 결측치 nan 을 다룬다.' }));

    /* ---------------------------------------------------------- 9.1 */

    root.appendChild(el('h2', { class: 'h-sec', text: '9.1 all 과 any — 배열 전체를 한마디로' }));

    root.appendChild(el('p', { html:
      '<code>np.all</code> 은 "전부 참인가", <code>np.any</code> 는 "하나라도 참인가"를 묻는다. ' +
      '조건 배열을 넣으면 그 배열을 하나의 참·거짓으로 줄여 준다. 수업 노트북의 예를 그대로 계산해 보자.' }));

    var arr6 = ND.arange(10);
    root.appendChild(UI.code(
      'arr6 = np.arange(10)\n' +
      'np.all(arr6 < 10)   # 원소 모두가 조건을 만족하면 True\n' +
      'np.any(arr6 > 5)    # 하나라도 만족하면 True'));
    root.appendChild(UI.out(
      'arr6            → ' + ND.format(arr6) + '\n' +
      'arr6 < 10       → ' + ND.format(ND.ops.lt(arr6, 10)) + '\n' +
      'np.all(arr6<10) → ' + sc(ND.all(ND.ops.lt(arr6, 10))) + '\n' +
      'arr6 > 5        → ' + ND.format(ND.ops.gt(arr6, 5)) + '\n' +
      'np.any(arr6>5)  → ' + sc(ND.any(ND.ops.gt(arr6, 5)))));

    root.appendChild(el('h3', { class: 'h-sub', text: '조건 없이 배열만 넣으면?' }));
    root.appendChild(el('p', { html:
      '조건이 아니라 배열을 그냥 넣어도 동작한다. 이때는 <b>0 을 거짓, 0 이 아닌 값을 참</b>으로 본다. ' +
      '<code>np.arange(10)</code> 에는 0 이 들어 있으니 결과가 <b>False</b> 다 — ' +
      '수업 시간에 가장 많이 놀라는 지점이다.' }));

    root.appendChild(el('div', { class: 'stack-2' }, [
      panel('a', 'np.all(np.arange(10))', el('div', null, [
        UI.grid(ND.arange(10), {
          highlight: function (idx, val) { return val === 0 ? 'err' : 'a'; }
        }),
        UI.out('→ ' + sc(ND.all(ND.arange(10))), { label: false })
      ])),
      panel('r', 'np.all(np.arange(1, 10))', el('div', null, [
        UI.grid(ND.arange(1, 10), { highlight: function () { return 'r'; } }),
        UI.out('→ ' + sc(ND.all(ND.arange(1, 10))), { label: false })
      ]))
    ]));
    root.appendChild(el('p', { class: 'small muted', html:
      '왼쪽 빨간 칸 하나(값 0)가 결과를 False 로 만든다. 시작을 1 로 바꾸면 True 가 된다.' }));

    var emptyArr = ND.array([], 'float64');
    root.appendChild(UI.table([
      { k: 'e', label: '식' }, { k: 'd', label: '왜' }, { k: 'v', label: '결과', num: true }
    ], [
      { e: 'np.all(np.array([1, 2, 3]))', d: '0 이 없다', v: sc(ND.all(ND.array([1, 2, 3]))) },
      { e: 'np.all(np.array([0, 1, 2]))', d: '0 이 하나 있다 → 거짓 취급', v: sc(ND.all(ND.array([0, 1, 2]))) },
      { e: 'np.all(np.array([-3, 2, 7]))', d: '음수도 0 이 아니면 참', v: sc(ND.all(ND.array([-3, 2, 7]))) },
      { e: 'np.any(np.zeros(5))', d: '전부 0', v: sc(ND.any(ND.zeros(5))) },
      { e: 'np.all(np.array([]))', d: '빈 배열 — 조건을 깰 원소가 없다', v: sc(ND.all(emptyArr)) },
      { e: 'np.any(np.array([]))', d: '빈 배열 — 만족하는 원소가 없다', v: sc(ND.any(emptyArr)) }
    ]));
    root.appendChild(UI.callout('why',
      '빈 배열의 <code>all</code> 이 True 인 게 이상해 보이지만 논리적으로는 당연하다. ' +
      '"모든 원소가 조건을 만족한다"의 반대는 "조건을 깨는 원소가 하나라도 있다"인데, ' +
      '원소가 없으면 깨는 원소도 없다. 수학에서 말하는 <b>공허한 참(vacuous truth)</b> 이다. ' +
      '데이터를 걸러낸 뒤 빈 배열이 남았는데 all 이 True 라서 통과해 버리는 버그가 실제로 자주 난다.'));
    root.appendChild(UI.callout('trap',
      '파이썬 내장 <code>all()</code>·<code>any()</code> 와 이름은 같지만 다른 함수다. ' +
      '내장 함수는 원소를 하나씩 꺼내 참·거짓을 판정하므로, 2차원 배열에 쓰면 ' +
      '"행 하나"를 판정하려다 <b>ValueError</b> 를 낸다. 게다가 파이썬 반복문으로 돌아 훨씬 느리다. ' +
      '배열에는 <b>np.all / np.any</b> 나 <code>arr.all() / arr.any()</code> 를 쓴다.'));

    root.appendChild(simChecker());

    if (DATA) {
      root.appendChild(el('h3', { class: 'h-sub', text: '실전: 안전했던 환자를 찾아라' }));
      root.appendChild(el('p', { html:
        '관절염 데이터는 환자 60명 × 40일이다. "40일 동안 <b>한 번도</b> 염증이 15를 넘지 않은 환자"는 ' +
        '행마다 all 을 걸어 찾는다. 축을 잘못 고르면 전혀 다른 질문이 된다.' }));
      root.appendChild(UI.code(
        "data = np.loadtxt('lab_inflammation-01.csv', delimiter=',')\n" +
        'safe = (data < 15).all(axis=1)     # 환자마다 한 칸 → shape (60,)\n' +
        'safe.sum()                          # 몇 명인가\n' +
        'np.where(safe)[0]                   # 몇 번 환자인가'));
      var lt15 = ND.ops.lt(DATA, 15);
      var safe = ND.all(lt15, 1);
      var safeIdx = ND.whereIdx(safe);
      var everHigh = ND.any(ND.ops.ge(DATA, 15), 1);
      var byDay = ND.all(lt15, 0);
      root.appendChild(UI.out(
        '(data < 15).shape        → ' + ND.shapeStr(lt15.shape) + '\n' +
        'safe.shape               → ' + ND.shapeStr(safe.shape) + '\n' +
        'safe.sum()               → ' + sc(ND.sum(safe)) + '   (환자 60명 중)\n' +
        'np.where(safe)[0]        → ' + ND.format(safeIdx, { mode: 'repr' }) + '\n' +
        '(data >= 15).any(axis=1) 의 합 → ' + sc(ND.sum(everHigh)) + '   (한 번이라도 15 이상)\n' +
        '(data < 15).all(axis=0) 의 합  → ' + sc(ND.sum(byDay)) + '   ← axis=0 은 "날짜"를 묻는 질문'));
      root.appendChild(UI.statRow([
        { k: '15 미만을 지킨 환자', v: sc(ND.sum(safe)) + ' 명', sub: '(data<15).all(axis=1)' },
        { k: '한 번이라도 15 이상', v: sc(ND.sum(everHigh)) + ' 명', sub: '(data>=15).any(axis=1)' },
        { k: '전체 최댓값', v: sc(ND.max(DATA)), sub: 'np.max(data)' },
        { k: '전체 평균', v: sc(ND.mean(DATA)), sub: 'np.mean(data)' }
      ]));
      root.appendChild(UI.callout('trap',
        '<code>axis=1</code> 은 "각 <b>환자</b>에 대해 40일을 훑는다", <code>axis=0</code> 은 ' +
        '"각 <b>날짜</b>에 대해 60명을 훑는다"는 뜻이다. 사라지는 축이 곧 훑는 축이다. ' +
        '환자를 세려면 남아야 할 축이 환자 축(axis 0)이므로 지워야 할 축은 axis=1 이다.'));
    }

    /* ---------------------------------------------------------- 9.2 */

    root.appendChild(el('h2', { class: 'h-sec', text: '9.2 비교 연산과 논리 연산' }));

    var temp1 = ND.array([1, 3, 0]), temp2 = ND.array([5, 2, 0]);
    root.appendChild(el('p', { html:
      '비교 연산자는 <b>원소끼리</b> 짝지어 비교하고, 같은 shape 의 bool 배열을 돌려준다. ' +
      '한쪽이 숫자면 브로드캐스팅으로 늘어나 모든 원소와 비교된다.' }));
    root.appendChild(UI.code(
      'temp1 = np.array([1, 3, 0])\n' +
      'temp2 = np.array([5, 2, 0])\n' +
      'temp1 > temp2\n' +
      'temp1 == temp2\n' +
      '(temp1 > temp2).any()\n' +
      'temp1 > 2'));
    root.appendChild(UI.out(
      'temp1 > temp2        → ' + ND.format(ND.ops.gt(temp1, temp2)) + '\n' +
      'temp1 == temp2       → ' + ND.format(ND.ops.eq(temp1, temp2)) + '\n' +
      '(temp1>temp2).any()  → ' + sc(ND.any(ND.ops.gt(temp1, temp2))) + '\n' +
      '(temp1>temp2).all()  → ' + sc(ND.all(ND.ops.gt(temp1, temp2))) + '\n' +
      'temp1 > 2            → ' + ND.format(ND.ops.gt(temp1, 2)) + '\n' +
      'repr:  ' + ND.format(ND.ops.gt(temp1, temp2), { mode: 'repr' })));

    root.appendChild(el('div', { class: 'flow' }, [
      panel('a', 'temp1', UI.grid(temp1, { showIndex: true, highlight: function () { return 'a'; } })),
      opMark('>'),
      panel('b', 'temp2', UI.grid(temp2, { showIndex: true, highlight: function () { return 'b'; } })),
      opMark('='),
      panel('r', 'temp1 > temp2', (function () {
        var m = ND.ops.gt(temp1, temp2);
        return UI.grid(m, { showIndex: true, highlight: function (idx) { return m.get(idx) ? 'r' : 'dim'; } });
      })())
    ]));

    root.appendChild(el('h3', { class: 'h-sub', text: 'if 문에 배열을 넣으면 안 되는 이유' }));
    root.appendChild(UI.code(
      'if temp1 > temp2:        # ← 배열을 조건문에 넣었다\n' +
      '    print("크다")'));
    root.appendChild(UI.errBlock(
      'The truth value of an array with more than one element is ambiguous. ' +
      'Use a.any() or a.all()', 'ValueError'));
    root.appendChild(UI.callout('why',
      '<code>if</code> 는 조건을 <b>참 또는 거짓 하나</b>로 판정해야 한다. 그런데 ' +
      '<code>temp1 &gt; temp2</code> 는 ' + ND.format(ND.ops.gt(temp1, temp2)) +
      ' 처럼 원소가 3개다. 첫 원소만 볼지, 전부 참이어야 하는지, 하나라도 참이면 되는지 ' +
      'NumPy 는 알 수 없다. 그래서 <b>추측하지 않고 에러를 낸다.</b> ' +
      '뜻을 정해서 <code>.all()</code> 이나 <code>.any()</code> 로 직접 줄여 줘야 한다. ' +
      '(원소가 1개인 배열은 예외적으로 통과하지만, 그 동작에 기대는 코드는 위험하다.)'));

    root.appendChild(el('h3', { class: 'h-sub', text: '배열 두 개가 같은지 비교하기' }));
    root.appendChild(el('p', { html:
      '<code>a == b</code> 는 배열을 돌려주니 "두 배열이 같은가"라는 질문의 답이 아니다. ' +
      '정수라면 <code>np.array_equal</code>, <b>실수라면 반드시 <code>np.allclose</code></b> 를 쓴다.' }));
    var eqA = ND.array([1, 2, 3]), eqB = ND.array([1, 2, 3]), eqC = ND.array([1, 2, 4]);
    var f1 = ND.array([0.1 + 0.2, 0.7 * 3]), f2 = ND.array([0.3, 2.1]);
    root.appendChild(UI.code(
      'np.array_equal(np.array([1,2,3]), np.array([1,2,3]))\n' +
      'np.array_equal(np.array([1,2,3]), np.array([1,2,4]))\n\n' +
      'f1 = np.array([0.1 + 0.2, 0.7 * 3])\n' +
      'f2 = np.array([0.3,       2.1])\n' +
      'np.array_equal(f1, f2)      # 비트까지 같아야 True\n' +
      'np.allclose(f1, f2)         # 오차를 허용'));
    root.appendChild(UI.out(
      'array_equal([1,2,3],[1,2,3]) → ' + TF(arrayEqual(eqA, eqB)) + '\n' +
      'array_equal([1,2,3],[1,2,4]) → ' + TF(arrayEqual(eqA, eqC)) + '\n' +
      'f1 == f2                     → ' + ND.format(ND.ops.eq(f1, f2)) + '\n' +
      'np.array_equal(f1, f2)       → ' + TF(arrayEqual(f1, f2)) + '\n' +
      'np.allclose(f1, f2)          → ' + TF(allClose(f1, f2)) + '\n\n' +
      '왜 다른가 — 실제로 저장된 값:\n' +
      '  0.1 + 0.2 = ' + String(0.1 + 0.2) + '\n' +
      '  0.7 * 3   = ' + String(0.7 * 3) + '\n' +
      '  0.1 + 0.2 == 0.3 → ' + TF(0.1 + 0.2 === 0.3)));
    root.appendChild(UI.callout('trap',
      '컴퓨터는 실수를 2진 소수로 저장하는데 0.1 이나 0.7 은 2진법으로 딱 끊어지지 않는다. ' +
      '그래서 <code>0.1 + 0.2</code> 는 0.3 이 아니라 ' + String(0.1 + 0.2) + ' 가 된다. ' +
      '화면에는 <code>print</code> 가 반올림해 <b>0.3</b> 으로 보이니 더 헷갈린다. ' +
      '<b>실수 배열을 <code>==</code> 로 비교하지 마라.</b> 언제나 <code>np.allclose</code> 다.'));

    root.appendChild(el('h3', { class: 'h-sub', text: '논리 연산자 — 괄호를 잊지 마라' }));
    root.appendChild(UI.table([
      { k: 'o', label: '연산자' }, { k: 'f', label: '함수형' },
      { k: 'd', label: '뜻' }, { k: 'v', label: '예 (m1, m2)', num: true }
    ], (function () {
      var m1 = ND.ops.gt(arr6, 2), m2 = ND.ops.lt(arr6, 6);
      return [
        { o: '&', f: 'np.logical_and(m1, m2)', d: '둘 다 참', v: ND.format(ND.ops.and(m1, m2)) },
        { o: '|', f: 'np.logical_or(m1, m2)', d: '하나라도 참', v: ND.format(ND.ops.or(m1, m2)) },
        { o: '~', f: 'np.logical_not(m1)', d: '뒤집기', v: ND.format(ND.ops.not(m1)) },
        { o: '^', f: 'np.logical_xor(m1, m2)', d: '정확히 하나만 참', v: ND.format(ND.ops.xor(m1, m2)) }
      ];
    })()));
    root.appendChild(el('p', { class: 'small muted', html:
      '위 표는 <code>m1 = np.arange(10) &gt; 2</code>, <code>m2 = np.arange(10) &lt; 6</code> 으로 ' +
      '실제 계산한 값이다. <code>&amp;</code> 의 결과가 3, 4, 5 자리에서만 True 인 것을 확인하라.' }));
    root.appendChild(UI.callout('tip',
      '<code>and / or / not</code> 은 파이썬 문법이라 배열에 못 쓴다. 배열에는 ' +
      '<code>&amp; | ~ ^</code> 를 쓰고, 조건마다 <b>괄호</b>를 씌운다: ' +
      '<code>(a &gt; 2) &amp; (a &lt; 6)</code>. ' +
      '<code>~</code> 는 뺄셈이 아니라 부정이다 — <code>a[~np.isnan(a)]</code> 처럼 아주 자주 쓴다.'));

    var comb = simCombiner();
    if (comb) root.appendChild(comb);

    /* ---------------------------------------------------------- 9.3 */

    root.appendChild(el('h2', { class: 'h-sec', text: '9.3 np.where — 인덱스인가 값인가' }));

    root.appendChild(el('p', { html:
      '<code>np.where</code> 는 인자 개수에 따라 <b>완전히 다른 일</b>을 한다. ' +
      '인자가 1개면 조건이 참인 자리의 <b>인덱스</b>, 3개면 조건에 따라 값을 고른 <b>배열</b>이다. ' +
      '이 둘을 섞어 쓰는 실수가 흔하다.' }));

    var temp4 = ND.array([10, 20, 30, 40, 50, 60]);
    var m35 = ND.ops.lt(temp4, 35);
    root.appendChild(UI.code(
      'temp4 = np.array([10, 20, 30, 40, 50, 60])\n' +
      'np.where(temp4 < 35)        # 인자 1개 → 인덱스 (튜플!)\n' +
      'np.where(temp4 < 35)[0]     # 보통 이렇게 꺼내 쓴다\n' +
      'temp4[np.where(temp4 < 35)] # 인덱스로 값 뽑기\n' +
      'temp4[temp4 < 35]           # 마스크로 바로 뽑기 (같은 결과)'));
    root.appendChild(UI.out(
      'temp4                        → ' + ND.format(temp4) + '\n' +
      'temp4 < 35                   → ' + ND.format(m35) + '\n' +
      'np.where(temp4 < 35)         → ' + whereTupleStr(m35) + '\n' +
      'np.where(temp4 < 35)[0]      → ' + ND.format(ND.whereIdx(m35), { mode: 'repr' }) + '\n' +
      'temp4[temp4 < 35]            → ' + ND.format(ND.maskSelect(temp4, m35)) + '\n' +
      'type(np.where(temp4 < 35))   → <class \'tuple\'>'));
    root.appendChild(UI.callout('trap',
      '<code>np.where(cond)</code> 의 결과에는 <b>괄호와 쉼표</b>가 붙어 있다 — ' +
      '<code>' + UI.esc(whereTupleStr(m35)) + '</code>. 배열이 아니라 <b>튜플</b>이기 때문이다. ' +
      '왜 튜플인가? 2차원 배열이면 행 인덱스 배열과 열 인덱스 배열이 <b>둘</b> 필요하다. ' +
      '축 개수만큼 배열을 담으려고 튜플로 감싼 것이다. ' +
      '1차원에서도 규칙이 같으므로 원소 1개짜리 튜플이 나오고, 그래서 ' +
      '<code>np.where(...)[0]</code> 로 꺼내 쓴다.'));

    root.appendChild(UI.code(
      'np.where(temp4 > 10, 1, 0)   # where(조건, 참일 때, 거짓일 때)'));
    var w3 = ND.where(ND.ops.gt(temp4, 10), 1, 0);
    root.appendChild(UI.out(
      'temp4                     → ' + ND.format(temp4) + '\n' +
      'temp4 > 10                → ' + ND.format(ND.ops.gt(temp4, 10)) + '\n' +
      'np.where(temp4>10, 1, 0)  → ' + ND.format(w3)));
    root.appendChild(UI.callout('why',
      '첫 원소가 0 인 이유는 단순하다. temp4[0] 은 <b>10</b> 이고 조건은 <code>&gt; 10</code> ' +
      '(초과)이므로 <code>10 &gt; 10</code> 은 거짓이다. 거짓이면 세 번째 인자인 0 을 가져온다. ' +
      '경계값을 포함하려면 <code>&gt;=</code> 를 써야 한다: ' +
      'np.where(temp4 &gt;= 10, 1, 0) → ' + ND.format(ND.where(ND.ops.ge(temp4, 10), 1, 0)) + '.'));

    root.appendChild(simWhere());

    root.appendChild(el('h3', { class: 'h-sub', text: '실전 1: 등급 매기기' }));
    var scores = ND.array([92, 78, 55, 88, 61, 70]);
    var gp = ND.where(ND.ops.ge(scores, 90), 4,
      ND.where(ND.ops.ge(scores, 80), 3,
        ND.where(ND.ops.ge(scores, 70), 2, 1)));
    root.appendChild(UI.code(
      'scores = np.array([92, 78, 55, 88, 61, 70])\n\n' +
      '# where 를 겹쳐 쓰기 — 안쪽으로 갈수록 조건이 느슨해진다\n' +
      'gp = np.where(scores >= 90, 4,\n' +
      '     np.where(scores >= 80, 3,\n' +
      '     np.where(scores >= 70, 2, 1)))\n\n' +
      '# np.select 는 같은 일을 납작하게 쓴다 (조건은 위에서부터 먼저 맞는 것 하나만)\n' +
      'gp = np.select([scores >= 90, scores >= 80, scores >= 70],\n' +
      '               [4, 3, 2], default=1)'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a', 'scores', UI.grid(scores, { showIndex: true, highlight: function () { return 'a'; } })),
      opMark('→'),
      panel('r', '등급 점수 gp', UI.grid(gp, { showIndex: true, highlight: function () { return 'r'; } }))
    ]));
    root.appendChild(el('p', { class: 'small muted', html:
      'where 를 3겹으로 겹치면 읽기가 힘들어진다. 조건이 3개 이상이면 <code>np.select</code> 가 낫다. ' +
      '두 방법 모두 결과는 ' + ND.format(gp) + ' 로 같다.' }));

    root.appendChild(el('h3', { class: 'h-sub', text: '실전 2: 이상치 잘라내기 — where 와 np.clip' }));
    var raw = ND.array([2, 9, 15, 18, 20, 4], 'float64');
    var upperOnly = ND.where(ND.ops.gt(raw, 15), 15, raw);
    var both = ND.where(ND.ops.lt(raw, 5), 5, ND.where(ND.ops.gt(raw, 15), 15, raw));
    root.appendChild(UI.code(
      'raw = np.array([2., 9., 15., 18., 20., 4.])\n' +
      'np.where(raw > 15, 15, raw)     # 위쪽만 자르기\n' +
      'np.clip(raw, 5, 15)             # 위아래 한꺼번에 — 이게 훨씬 짧다'));
    root.appendChild(UI.out(
      'raw                        → ' + ND.format(raw) + '\n' +
      'np.where(raw > 15, 15, raw) → ' + ND.format(upperOnly) + '\n' +
      'np.clip(raw, 5, 15)         → ' + ND.format(both) + '\n' +
      '  (위 clip 값은 where 를 두 번 겹쳐 실제로 계산한 것이다 — 결과가 같다)'));
    root.appendChild(UI.callout('tip',
      '아래·위를 동시에 자르는 일은 <code>np.clip(a, min, max)</code> 한 줄로 끝난다. ' +
      'where 는 <b>자르기 말고 다른 값으로 바꿀 때</b> 쓴다 — 예를 들어 이상치를 평균으로 채우거나 ' +
      'nan 으로 바꿔 두고 나중에 처리할 때다.'));

    if (DATA) {
      root.appendChild(el('h3', { class: 'h-sub', text: '실전 3: 관절염 데이터의 위험 수치 세기' }));
      var risk = ND.where(ND.ops.ge(DATA, 15), 1, 0);
      var riskPer = ND.sum(risk, 1);
      var worst = ND.argmax(riskPer).toNested();
      root.appendChild(UI.code(
        'risk = np.where(data >= 15, 1, 0)   # 15 이상이면 1, 아니면 0\n' +
        'risk.sum()                          # 전체 위험 기록 수\n' +
        'risk.sum(axis=1)                    # 환자별 위험 일수\n' +
        'np.argmax(risk.sum(axis=1))         # 가장 위험했던 환자'));
      root.appendChild(UI.out(
        'risk.sum()                → ' + sc(ND.sum(risk)) + '  (전체 ' + DATA.size + '칸 중)\n' +
        'risk.sum(axis=1)[:12]     → ' + ND.format(riskPer.idx('0:12')) + '\n' +
        'np.argmax(risk.sum(axis=1)) → ' + worst + '번 환자, ' + sc(ND.max(riskPer)) + '일\n' +
        '(data >= 15).sum()        → ' + sc(ND.sum(ND.ops.ge(DATA, 15))) +
          '   ← bool 배열의 합은 True 의 개수다'));
      root.appendChild(UI.callout('tip',
        'bool 배열을 <code>sum</code> 하면 True 가 1로 세어진다. 그래서 ' +
        '<code>np.where(cond, 1, 0).sum()</code> 과 <code>cond.sum()</code> 은 같은 값이다. ' +
        '개수만 필요하면 where 없이 <code>cond.sum()</code> 이 더 짧다.'));
      root.appendChild(UI.heatmap(DATA.idx('0:12'), {
        vmin: 0, vmax: 20, rowLabel: '환자', colLabel: 'day', unit: '',
        highlight: function (idx, val) { return val >= 15; }
      }));
      root.appendChild(el('p', { class: 'small muted', html:
        '앞 12명의 염증 수치다. 색이 진할수록 높고, <b>주황 외곽선</b>이 ' +
        '<code>data &gt;= 15</code> 인 칸 — 위 마스크가 실제로 잡아낸 자리다.' }));
    }

    root.appendChild(el('h3', { class: 'h-sub', text: '이웃 함수들: nonzero · argwhere · select' }));
    var mm = ND.ops.ge(ND.array([[1, 20], [16, 3]]), 15);
    var coords = mm.indices().filter(function (ix) { return !!mm.get(ix); });
    root.appendChild(UI.code(
      'b = np.array([[1, 20],\n' +
      '              [16, 3]])\n' +
      'np.nonzero(b >= 15)    # np.where(b >= 15) 와 똑같다 (축별 인덱스 튜플)\n' +
      'np.argwhere(b >= 15)   # (찾은 개수, 차원 수) 모양의 좌표 배열'));
    root.appendChild(UI.out(
      'b >= 15            →\n' + ND.format(mm) + '\n\n' +
      'np.nonzero(b>=15)  → ' + whereTupleStr(mm) + '\n' +
      'np.argwhere(b>=15) →\n' +
      (coords.length ? ND.format(ND.array(coords, 'int64'), { mode: 'repr' }) : 'array([], shape=(0, 2))') + '\n' +
      '  shape ' + ND.shapeStr([coords.length, mm.ndim]) + ' — 한 줄이 좌표 하나 [행, 열]'));
    root.appendChild(UI.callout('tip',
      '셋을 구분하는 기준은 <b>결과의 모양</b>이다. <code>where</code>·<code>nonzero</code> 는 ' +
      '"축별 인덱스 배열들의 튜플"이라서 곧바로 <code>b[...]</code> 인덱싱에 넣을 수 있고, ' +
      '<code>argwhere</code> 는 "좌표 목록"이라서 <code>for r, c in np.argwhere(...)</code> ' +
      '처럼 하나씩 돌 때 편하다. <code>select</code> 는 조건이 여러 개일 때의 where 다.'));

    /* ---------------------------------------------------------- 9.4 */

    root.appendChild(el('h2', { class: 'h-sec', text: '9.4 결측치 nan 과 무한값 inf' }));

    root.appendChild(UI.callout('ver',
      '수업자료의 <code>np.array([1, np.NaN, np.Inf])</code> 는 <b>지금 실행하면 에러가 난다.</b> ' +
      'NumPy 2.0(2024년 6월)에서 대문자 별칭이 삭제되었기 때문이다. ' +
      '<code>np.nan</code>, <code>np.inf</code> 처럼 <b>전부 소문자</b>로 써야 한다. ' +
      '옛 블로그·강의자료·인터넷 코드에서 <code>np.NaN</code>, <code>np.Inf</code>, ' +
      '<code>np.float_</code>, <code>np.int</code> 를 보면 그 자리에서 소문자 이름으로 고쳐 읽어라.'));
    root.appendChild(UI.code('temp3 = np.array([1, np.NaN, np.Inf])   # NumPy 1.x 시절 코드'));
    root.appendChild(UI.errBlock(
      '`np.NaN` was removed in the NumPy 2.0 release. Use `np.nan` instead.', 'AttributeError'));
    root.appendChild(UI.table([
      { k: 'o', label: '1.x 에서 쓰던 이름' }, { k: 'n', label: '2.x 에서 쓸 이름' }, { k: 'd', label: '설명' }
    ], [
      { o: 'np.NaN, np.NAN', n: 'np.nan', d: 'Not a Number — 값이 없거나 정의되지 않음' },
      { o: 'np.Inf, np.Infinity, np.NINF', n: 'np.inf, -np.inf', d: '무한대' },
      { o: 'np.float_', n: 'np.float64', d: '별칭 정리' },
      { o: 'np.int, np.float, np.bool', n: 'int, float, bool (파이썬 내장)', d: '혼동을 부르던 별칭 삭제' }
    ]));
    root.appendChild(UI.callout('why',
      '왜 굳이 없앴을까. <code>np.nan</code>·<code>np.NaN</code>·<code>np.NAN</code> 세 이름이 ' +
      '똑같은 하나를 가리키고 있었고, <code>np.int</code> 는 파이썬 <code>int</code> 와 ' +
      '헷갈리기까지 했다. 2.0 은 "이름 하나에 뜻 하나"로 정리한 대청소였다. ' +
      '덕분에 옛 코드가 깨지지만, 에러 메시지가 <b>고칠 이름을 직접 알려 준다</b>는 점은 친절하다.'));

    root.appendChild(el('h3', { class: 'h-sub', text: 'nan 이 섞이면 dtype 이 바뀐다' }));
    var temp3 = ND.array([1, NaN, Infinity]);
    root.appendChild(UI.code(
      'temp3 = np.array([1, np.nan, np.inf])\n' +
      'temp3\n' +
      'temp3.dtype'));
    root.appendChild(UI.out(
      'temp3       → ' + ND.format(temp3) + '\n' +
      'repr        → ' + ND.format(temp3, { mode: 'repr' }) + '\n' +
      'temp3.dtype → ' + temp3.dtype + '\n' +
      'temp3.shape → ' + ND.shapeStr(temp3.shape)));
    root.appendChild(el('p', { html:
      '정수 1 을 넣었는데도 dtype 이 <b>float64</b> 다. nan 과 inf 는 <b>실수(IEEE 754)</b> 에만 ' +
      '존재하는 특별한 비트 패턴이라서, 하나라도 섞이면 배열 전체가 실수로 승격된다.' }));
    root.appendChild(UI.code(
      'ints = np.array([1, 2, 3])   # dtype int64\n' +
      'ints[0] = np.nan             # 정수 칸에 nan 을 넣으려 하면?'));
    root.appendChild(UI.errBlock('cannot convert float NaN to integer', 'ValueError'));
    root.appendChild(UI.callout('trap',
      '<b>정수 배열에는 결측치를 표시할 방법이 없다.</b> 실제 데이터를 다룰 때 이것이 큰 제약이다. ' +
      '결측치가 생길 수 있는 열은 처음부터 <code>float64</code> 로 읽어야 한다. ' +
      '<code>ints.astype(float)</code> 로 바꾼 뒤에 nan 을 넣으면 된다. ' +
      '(정수 결측치를 정말 다뤄야 하면 pandas 의 nullable 정수형이나 마스크 배열을 쓴다.)'));

    root.appendChild(el('h3', { class: 'h-sub', text: '검사 함수 세 개' }));
    root.appendChild(UI.code(
      'np.isnan(temp3)     # nan 인가\n' +
      'np.isfinite(temp3)  # 유한한 값인가 (nan 도 inf 도 아닌가)\n' +
      'np.isinf(temp3)     # 무한인가'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a', 'temp3', UI.grid(temp3, {
        showIndex: true, cellSize: 44,
        highlight: function (idx, val) { return isFinite(val) ? 'a' : 'err'; },
        label: function (idx, val) { return isNaN(val) ? 'nan' : (isFinite(val) ? UI.fmtCell(val, 'float64') : 'inf'); }
      })),
      opMark('→'),
      panel('', 'np.isnan', (function () {
        var m = isnanOf(temp3);
        return UI.grid(m, { highlight: function (idx) { return m.get(idx) ? 'err' : 'a'; } });
      })()),
      panel('', 'np.isfinite', (function () {
        var m = isfiniteOf(temp3);
        return UI.grid(m, { highlight: function (idx) { return m.get(idx) ? 'a' : 'err'; } });
      })()),
      panel('', 'np.isinf', (function () {
        var m = isinfOf(temp3);
        return UI.grid(m, { highlight: function (idx) { return m.get(idx) ? 'err' : 'a'; } });
      })())
    ]));
    root.appendChild(UI.out(
      'np.isnan(temp3)    → ' + ND.format(isnanOf(temp3)) + '\n' +
      'np.isfinite(temp3) → ' + ND.format(isfiniteOf(temp3)) + '\n' +
      'np.isinf(temp3)    → ' + ND.format(isinfOf(temp3))));
    root.appendChild(el('p', { class: 'small muted', html:
      '<code>isfinite</code> 는 nan 과 inf 를 <b>둘 다</b> 거른다. ' +
      '"쓸 수 있는 값만 남기고 싶다"면 <code>isnan</code> 이 아니라 <code>isfinite</code> 가 맞다.' }));

    root.appendChild(el('h3', { class: 'h-sub', text: 'nan 은 자기 자신과도 같지 않다' }));
    var nanEq = ND.ops.eq(ND.array([NaN, 1, Infinity]), ND.array([NaN, 1, Infinity]));
    root.appendChild(UI.code(
      'np.nan == np.nan     # ???\n' +
      'np.nan != np.nan\n' +
      'np.inf == np.inf\n\n' +
      'x = np.array([np.nan, 1, np.inf])\n' +
      'x == x'));
    root.appendChild(UI.out(
      'np.nan == np.nan → ' + sc(ND.ops.eq(ND.array([NaN]), ND.array([NaN])).idx('0')) + '\n' +
      'np.nan != np.nan → ' + sc(ND.ops.ne(ND.array([NaN]), ND.array([NaN])).idx('0')) + '\n' +
      'np.inf == np.inf → ' + sc(ND.ops.eq(ND.array([Infinity]), ND.array([Infinity])).idx('0')) + '\n' +
      'x == x           → ' + ND.format(nanEq) + '   ← 첫 칸이 False!'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a', 'x = [nan, 1, inf]', UI.grid(ND.array([NaN, 1, Infinity]), {
        showIndex: true, cellSize: 44,
        highlight: function (idx, val) { return isNaN(val) ? 'err' : 'a'; },
        label: function (idx, val) { return isNaN(val) ? 'nan' : (isFinite(val) ? String(val) : 'inf'); }
      })),
      opMark('=='),
      panel('r', 'x == x', UI.grid(nanEq, {
        highlight: function (idx) { return nanEq.get(idx) ? 'r' : 'err'; }
      }))
    ]));
    root.appendChild(UI.callout('trap',
      '<b>nan == nan 은 False 다.</b> nan 은 "값이 없다"는 표시이지 값이 아니다. ' +
      '측정 실패 두 개가 서로 같다고 말할 근거가 없으니 IEEE 754 표준이 아예 ' +
      '"nan 과의 모든 비교는 거짓"으로 정했다. 반면 inf 는 정상적인 값이라 ' +
      '<code>inf == inf</code> 는 True 다. ' +
      '따라서 <code>a[a == np.nan]</code> 은 <b>영원히 빈 배열</b>이다 — ' +
      '반드시 <code>a[np.isnan(a)]</code> 를 써야 한다. ' +
      '<code>np.isnan</code> 이 존재하는 이유가 바로 이것이다.'));

    root.appendChild(simNanLab());

    root.appendChild(el('h3', { class: 'h-sub', text: '0 으로 나누면 — 파이썬과 NumPy 가 다르다' }));
    var dv = ND.ops.div(ND.array([1, 0, -1], 'float64'), ND.array([0, 0, 0], 'float64'));
    root.appendChild(UI.code(
      '1 / 0                      # 파이썬 스칼라'));
    root.appendChild(UI.errBlock('division by zero', 'ZeroDivisionError'));
    root.appendChild(UI.code(
      'a = np.array([1., 0., -1.])\n' +
      'b = np.array([0., 0., 0.])\n' +
      'a / b                      # NumPy 배열끼리'));
    root.appendChild(UI.out(
      'a / b → ' + ND.format(dv) + '\n\n' +
      'RuntimeWarning: divide by zero encountered in divide\n' +
      'RuntimeWarning: invalid value encountered in divide'));
    root.appendChild(el('div', { class: 'flow' }, [
      panel('a', 'a', UI.grid(ND.array([1, 0, -1], 'float64'), { showIndex: true, highlight: function () { return 'a'; } })),
      opMark('/'),
      panel('b', 'b', UI.grid(ND.array([0, 0, 0], 'float64'), { showIndex: true, highlight: function () { return 'b'; } })),
      opMark('='),
      panel('r', 'a / b', UI.grid(dv, {
        showIndex: true,
        highlight: function (idx, val) { return isFinite(val) ? 'r' : 'err'; },
        label: function (idx, val) { return isNaN(val) ? 'nan' : (isFinite(val) ? UI.fmtCell(val, 'float64') : (val > 0 ? 'inf' : '-inf')); }
      }))
    ]));
    root.appendChild(UI.callout('why',
      'NumPy 는 <b>멈추지 않는다.</b> 배열 100만 개를 계산하는 중에 한 칸이 0 나누기라고 ' +
      '전체를 중단시키면 손해가 크기 때문이다. 대신 <code>1/0 → inf</code>, ' +
      '<code>0/0 → nan</code>(정의 자체가 불가능) 으로 채우고 <b>RuntimeWarning</b> 만 띄운다. ' +
      '경고는 기본적으로 <b>같은 자리에서 한 번만</b> 나오니, 무시하고 지나치기 쉽다.'));
    root.appendChild(UI.code(
      "# 경고 다루기\n" +
      "with np.errstate(divide='ignore', invalid='ignore'):\n" +
      "    r = a / b              # 이 블록에서만 경고를 끈다\n" +
      "r = np.where(np.isfinite(r), r, 0)   # 뒤처리는 직접\n\n" +
      "np.seterr(all='raise')     # 반대로, 경고를 예외로 승격시켜 즉시 잡기"));
    root.appendChild(UI.callout('tip',
      '경고를 끄는 것은 "문제가 없다"가 아니라 "내가 이미 알고 있고 뒤처리도 한다"는 선언이다. ' +
      '<code>errstate</code> 로 껐다면 반드시 <code>isfinite</code> 로 뒤처리하라. ' +
      '디버깅 중이라면 <code>np.seterr(all=\'raise\')</code> 로 <b>경고를 예외로 바꿔</b> ' +
      'nan 이 처음 생기는 지점을 잡는 것이 훨씬 빠르다.'));

    root.appendChild(UI.callout('tip',
      '실전에서 nan 은 대개 <b>측정 실패·응답 없음·기록 누락</b>을 뜻한다. 관절염 데이터라면 ' +
      '"그날 환자가 오지 않았다", 설문이라면 "무응답"이다. 그러니 nan 을 만나면 먼저 물어야 한다 — ' +
      '<b>왜 비었는가?</b> 무응답이 특정 집단에 몰려 있다면 그 자체가 데이터다. ' +
      '0 으로 채우는 것이 가장 위험하다: 없는 값이 "0 이라는 측정값"으로 바뀌어 평균을 끌어내린다.',
      'nan 을 만나면'));

    /* ---------------------------------------------------------- 9.5 */

    root.appendChild(el('h2', { class: 'h-sec', text: '9.5 파일 입출력 — 결측치는 어디서 오는가' }));

    root.appendChild(el('p', { html:
      'nan 은 대부분 <b>파일을 읽는 순간</b> 들어온다. CSV 에 빈칸이 하나 있으면 ' +
      '<code>np.loadtxt</code> 는 아예 실패하고, <code>np.genfromtxt</code> 는 그 자리를 nan 으로 채운다. ' +
      '이 차이가 두 함수를 구분하는 이유다.' }));

    root.appendChild(UI.code(
      "# 텍스트 파일 (CSV)\n" +
      "data = np.loadtxt('lab_inflammation-01.csv', delimiter=',')\n" +
      "data = np.loadtxt('ra.csv', delimiter=',', skiprows=1)   # 헤더 1줄 건너뛰기\n" +
      "np.savetxt('result.csv', data, delimiter=',', fmt='%.2f')"));
    root.appendChild(UI.out(
      D && D.inflammationMeta
        ? "np.loadtxt('lab_inflammation-01.csv', delimiter=',')\n" +
          '  shape ' + ND.shapeStr(DATA.shape) + ' · dtype ' + DATA.dtype + '\n' +
          '  ' + D.inflammationMeta.rowMeaning + ' × ' + D.inflammationMeta.colMeaning +
          ' · 헤더 없음 → skiprows 불필요'
        : '(관절염 데이터가 이 빌드에 포함되지 않았다)'));
    root.appendChild(UI.callout('tip',
      '<code>skiprows</code> 는 <b>맨 위 몇 줄을 버릴지</b>다. 관절염 데이터는 헤더가 없으니 0(기본값), ' +
      '영화 평점 <code>ra.csv</code> 는 <code>' +
      UI.esc((D && D.ratingsMeta && D.ratingsMeta.header) || 'userId,movieId,rating,timestamp') +
      '</code> 라는 헤더가 한 줄 있으니 <code>skiprows=1</code> 이다. ' +
      '빼먹으면 문자열을 실수로 바꾸다 실패한다. ' +
      '<code>fmt=\'%.2f\'</code> 는 저장할 때의 소수점 자릿수다 — 빼면 지수 표기로 길게 저장된다.'));

    root.appendChild(UI.code(
      "# 빈칸이 섞인 CSV: 3.5,,4.0\n" +
      "np.loadtxt('gaps.csv', delimiter=',')"));
    root.appendChild(UI.errBlock(
      "could not convert string '' to float64 at row 0, column 2.", 'ValueError'));
    root.appendChild(UI.code(
      "# genfromtxt 는 빈칸을 nan 으로 채운다\n" +
      "np.genfromtxt('gaps.csv', delimiter=',')                       # 기본값이 이미 nan\n" +
      "np.genfromtxt('gaps.csv', delimiter=',', filling_values=0)     # 0 으로 채우기\n" +
      "np.genfromtxt('gaps.csv', delimiter=',', names=True)           # 헤더를 열 이름으로"));
    root.appendChild(UI.out(
      'np.genfromtxt(...) → ' + ND.format(ND.array([3.5, NaN, 4.0])) + '\n' +
      'np.isnan(...)      → ' + ND.format(isnanOf(ND.array([3.5, NaN, 4.0])))));
    root.appendChild(UI.callout('trap',
      '<code>loadtxt</code> 가 실패하는 것이 <b>단점이 아니다.</b> "이 파일에는 내가 예상 못한 것이 ' +
      '들어 있다"고 큰 소리로 알려 주는 것이다. <code>genfromtxt</code> 로 바꿔 조용히 nan 을 ' +
      '받아들이는 순간, 그 nan 이 어디에 몇 개 있는지 <b>내가 직접 세어야 하는 책임</b>이 생긴다. ' +
      '읽은 직후에 <code>np.isnan(data).sum()</code> 을 찍어 보는 습관을 들여라.'));

    root.appendChild(el('h3', { class: 'h-sub', text: 'save / load — 이진 파일과 확장자 함정' }));
    root.appendChild(UI.code(
      "temp6 = np.array([0, 0, 3, 2, 1, 2])\n\n" +
      "np.save('test_npy', arr=temp6)      # 저장할 때는 .npy 가 자동으로 붙는다\n" +
      "npy = np.load('test_npy.npy')       # 불러올 때는 .npy 를 반드시 써야 한다\n\n" +
      "np.savez('multi.npz', a=arr1, b=arr2)   # 여러 배열을 한 파일로\n" +
      "z = np.load('multi.npz')\n" +
      "z['a'], z.files                          # 이름으로 꺼낸다\n" +
      "np.savez_compressed('multi.npz', a=arr1) # 압축까지"));
    root.appendChild(UI.code("npy = np.load('test_npy')     # 확장자를 빼면?"));
    root.appendChild(UI.errBlock("[Errno 2] No such file or directory: 'test_npy'", 'FileNotFoundError'));
    root.appendChild(UI.callout('trap',
      '<code>np.save</code> 는 확장자를 <b>붙여 주고</b>, <code>np.load</code> 는 ' +
      '<b>붙여 주지 않는다.</b> 이 비대칭 때문에 "저장은 됐는데 못 불러온다"는 일이 자주 생긴다. ' +
      '<code>np.save(\'test_npy.npy\', ...)</code> 처럼 저장할 때부터 확장자를 직접 써 두면 ' +
      '헷갈릴 일이 없다.'));

    root.appendChild(UI.table([
      { k: 'k', label: '항목' },
      { k: 't', label: 'savetxt / loadtxt (텍스트)' },
      { k: 'b', label: 'save / load (이진 .npy)' }
    ], [
      { k: '사람이 열어 볼 수 있나', t: '된다 — 엑셀·메모장에서 그대로', b: '안 된다 — 깨진 글자로 보인다' },
      { k: 'dtype 보존', t: '안 된다 — 읽으면 기본 float64', b: '된다 — int8 이든 bool 이든 그대로' },
      { k: 'shape 보존', t: '2차원까지만', b: '몇 차원이든 그대로' },
      { k: '용량', t: '크다 (숫자를 글자로 적는다)', b: '작다 (메모리 그대로)' },
      { k: '속도', t: '느리다 (글자 ↔ 숫자 변환)', b: '빠르다' },
      { k: '다른 프로그램과 공유', t: '쉽다 — 사실상 표준', b: '어렵다 — NumPy 전용' },
      { k: '언제 쓰나', t: '결과를 남기거나 남에게 줄 때', b: '내 계산 중간 결과를 다시 쓸 때' }
    ]));
    root.appendChild(UI.callout('trap',
      '<code>np.load(..., allow_pickle=True)</code> 는 <b>파일 안의 파이썬 객체를 되살리는</b> 옵션이다. ' +
      '그 과정에서 <b>임의의 코드가 실행될 수 있다</b> — 신뢰할 수 없는 곳에서 받은 ' +
      '<code>.npy</code>·<code>.npz</code> 에는 절대 쓰지 마라. NumPy 가 이 옵션을 ' +
      '기본으로 끈 이유가 보안이다. 순수한 숫자 배열이라면 이 옵션이 필요하지 않다.',
      '보안 주의'));

    root.appendChild(UI.callout('ver',
      '수업 노트북 셀 156 은 <code>np.loadtxt(\'ratings.csv\', ...)</code> 라고 쓰지만, ' +
      '실습 폴더의 실제 파일명은 <code>ra.csv</code> 다. 그대로 실행하면 아래 에러가 난다. ' +
      '파일을 못 찾는 에러의 90%는 <b>철자·확장자·작업 폴더</b> 셋 중 하나다. ' +
      '<code>import os; os.listdir()</code> 로 지금 폴더에 무엇이 있는지 먼저 확인하라.'));
    root.appendChild(UI.errBlock("ratings.csv not found.", 'FileNotFoundError'));
    if (D && D.ratingsMeta) {
      root.appendChild(UI.statRow([
        { k: '실제 파일명', v: D.ratingsMeta.file, sub: 'ratings.csv 가 아니다' },
        { k: '전체 shape', v: ND.shapeStr(D.ratingsMeta.trueShape), sub: '헤더 1줄 제외' },
        { k: '사용자 · 영화', v: D.ratingsMeta.users + '명 · ' + D.ratingsMeta.movies + '편', sub: '전체 데이터 기준' },
        { k: '평점 평균', v: String(D.ratingsMeta.ratingMean), sub: D.ratingsMeta.ratingMin + ' ~ ' + D.ratingsMeta.ratingMax }
      ]));
      root.appendChild(el('p', { class: 'small muted', html:
        '위 집계값은 <b>실제 전체 ' + D.ratingsMeta.trueShape[0] + '행</b>으로 정확히 계산한 사실이다. ' +
        '다만 이 페이지에 실려 있는 ' + D.ratingsMeta.sampleRows + '행은 <b>합성 데이터</b>다 — ' +
        'MovieLens 라이선스가 재배포를 금지하기 때문이다. 열 구성과 값의 범위만 실제와 같게 맞췄다.' }));
    }

    /* ---------------------------------------------------------- 확인 문제 */

    root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
    root.appendChild(UI.quiz([
      {
        q: '<code>np.all(np.array([0, 1, 2]))</code> 의 결과는?',
        choices: ['True', 'False', 'array([False, True, True])', 'ValueError 가 난다'],
        answer: 1,
        explain: '조건 없이 배열만 넣으면 <b>0 은 거짓, 0 이 아닌 값은 참</b>으로 본다. ' +
          '첫 원소가 0 이므로 "전부 참"이 아니어서 <b>False</b> 다. ' +
          'np.all 은 배열을 하나의 참·거짓으로 <b>줄이는</b> 함수이므로 결과가 배열일 수 없다. ' +
          '실제 계산값: ' + sc(ND.all(ND.array([0, 1, 2]))) + ' ' +
          '(참고로 <code>np.all(np.array([1, 2, 3]))</code> → ' + sc(ND.all(ND.array([1, 2, 3]))) + ')'
      },
      {
        q: '<code>temp4 = np.array([10,20,30,40,50,60])</code> 일 때 ' +
           '<code>np.where(temp4 &lt; 35)</code> 의 결과는?',
        choices: [
          'array([0, 1, 2])',
          '(array([0, 1, 2]),)',
          'array([10, 20, 30])',
          'array([ True,  True,  True, False, False, False])'
        ],
        answer: 1,
        explain: '인자가 1개인 where 는 <b>축마다 인덱스 배열 하나</b>를 만들어 <b>튜플</b>에 담아 준다. ' +
          '1차원이라 배열 하나짜리 튜플이 되고, 그래서 끝에 쉼표가 붙는다: <code>' +
          UI.esc(whereTupleStr(m35)) + '</code>. ' +
          '보기 1(array 만)은 <code>np.where(...)[0]</code> 의 결과, ' +
          '보기 3(값)은 <code>temp4[temp4 &lt; 35]</code> 의 결과, ' +
          '보기 4(bool)는 <code>temp4 &lt; 35</code> 자체다. 네 개가 전부 다른 것이다.'
      },
      {
        q: '관절염 데이터 <code>data</code> 의 shape 는 (60, 40)(환자 × 날짜)이다. ' +
           '"40일 동안 한 번도 염증이 15를 넘지 않은 <b>환자</b>"를 찾는 식은?',
        choices: [
          '(data &lt; 15).all(axis=0)',
          '(data &lt; 15).all(axis=1)',
          '(data &lt; 15).any(axis=1)',
          'np.all(data &lt; 15)'
        ],
        answer: 1,
        explain: '환자별로 답이 하나씩 나와야 하므로 결과 shape 는 (60,) — 즉 <b>날짜 축(axis=1)이 ' +
          '사라져야</b> 한다. <code>axis=0</code> 은 환자 축을 지워 (40,) 이 되므로 ' +
          '"날짜별로 60명 모두가 15 미만이었나"라는 다른 질문이다. ' +
          '<code>any</code> 는 "하루라도 15 미만"이라 훨씬 느슨하고, ' +
          '<code>np.all(data &lt; 15)</code> 는 축이 없어 전체를 참·거짓 하나로 줄인다. ' +
          (DATA ? '실제로 정답 식으로 세어 보면 <b>' + sc(ND.sum(ND.all(ND.ops.lt(DATA, 15), 1))) +
            '명</b>(환자 ' + ND.format(ND.whereIdx(ND.all(ND.ops.lt(DATA, 15), 1))) +
            ')이고, any 로 세면 ' + sc(ND.sum(ND.any(ND.ops.lt(DATA, 15), 1))) + '명이 나온다.' : '')
      },
      {
        q: 'nan 이 섞인 실수 배열 <code>a</code> 에서 nan 인 칸을 찾으려 한다. ' +
           '<code>a[a == np.nan]</code> 은 어떻게 되는가?',
        choices: [
          'nan 인 칸만 골라진다',
          '항상 빈 배열이 나온다',
          'nan 을 포함한 배열 전체가 나온다',
          'ValueError 가 난다'
        ],
        answer: 1,
        explain: '<b>nan == nan 은 False</b> 다(실제 계산: ' +
          sc(ND.ops.eq(ND.array([NaN]), ND.array([NaN])).idx('0')) + '). ' +
          'nan 은 "값이 없다"는 표시일 뿐이므로 자기 자신과도 같지 않다고 IEEE 754 가 정했다. ' +
          '따라서 마스크가 전부 False 이고 결과는 <b>언제나 빈 배열</b>이다 — ' +
          '에러도 나지 않아 조용히 틀린다는 점이 더 위험하다. ' +
          '반드시 <code>a[np.isnan(a)]</code> 를 쓰고, 반대로 성한 값만 남기려면 ' +
          '<code>a[~np.isnan(a)]</code> 또는 <code>a[np.isfinite(a)]</code> 를 쓴다.'
      }
    ], { id: 'condition' }));
  }

  Lab.register({
    id: 'condition',
    n: '9',
    title: '조건, 논리, 결측치',
    blurb: '조건은 참·거짓 하나가 아니라 배열로 돌아온다. 그 마스크를 all·any 로 줄이고 &·|로 묶고 where 로 값을 고른 다음, 실제 데이터에 반드시 섞여 있는 nan 을 다룬다.',
    sim: '조건 검사기 · 조건 조합기 · where 시각화 · nan 전파 실험실',
    render: render
  });
})();
