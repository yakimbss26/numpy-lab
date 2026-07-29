/* ===========================================================================
 * ch04-reshape.js — 4장. 배열의 모양 바꾸기와 뷰
 * 노트북 셀 32~45 대응. 이 장의 진짜 주제는 "뷰(view)"다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el;

  /* ========================================================== 작은 헬퍼들 */

  /** 오른쪽 정렬 패딩 (아스키 그림 정렬용) */
  function pad(s, w) {
    s = String(s);
    while (s.length < w) s = ' ' + s;
    return s;
  }

  /** idx · strides 내적 — 평평한 위치 계산 */
  function dotIdx(idx, st) {
    var s = 0;
    for (var i = 0; i < idx.length; i++) s += idx[i] * st[i];
    return s;
  }

  /** C 순서 평평한 인덱스 → 다차원 인덱스 */
  function unravelC(q, shape) {
    var n = shape.length, idx = new Array(n);
    for (var i = n - 1; i >= 0; i--) { idx[i] = q % shape[i]; q = Math.floor(q / shape[i]); }
    return idx;
  }

  /** 배열을 F 순서(열 우선)로 읽는다. 값과 "원본 C 평평한 인덱스"를 함께 돌려준다. */
  function fOrderRead(a) {
    var sh = a.shape, n = sh.length, total = a.size;
    var cs = ND.cStrides(sh);
    var vals = [], orig = [];
    for (var p = 0; p < total; p++) {
      var rem = p, idx = new Array(n), k;
      for (k = 0; k < n; k++) { idx[k] = rem % sh[k]; rem = Math.floor(rem / sh[k]); }
      vals.push(a.get(idx));
      orig.push(dotIdx(idx, cs));
    }
    return { vals: vals, orig: orig };
  }

  /** C 순서로 읽기 (값 + 원본 평평한 인덱스) */
  function cOrderRead(a) {
    var vals = a.flatValues();
    return { vals: vals, orig: vals.map(function (_, i) { return i; }) };
  }

  /** 목표 shape 문자열 파싱. "3, 8" / "(2,3,4)" / "-1, 6" */
  function parseShapeStr(s) {
    var t = String(s).trim().replace(/^\(|\)$/g, '').replace(/^\[|\]$/g, '');
    var parts = t.split(',').map(function (x) { return x.trim(); })
      .filter(function (x) { return x !== ''; });
    if (!parts.length) throw new Error('목표 shape 가 비었다. 정수를 콤마로 구분해 적어라. 예: 3, 8');
    return parts.map(function (x) {
      if (!/^-?\d+$/.test(x)) {
        throw new Error("'" + x + "' 는 정수가 아니다. shape 에는 정수만 쓴다. 예: 2, 3, 4");
      }
      return parseInt(x, 10);
    });
  }

  /** np.expand_dims */
  function expandDims(a, axis) {
    var sh = a.shape.slice();
    if (axis < 0) axis += sh.length + 1;
    sh.splice(axis, 0, 1);
    return a.reshape(sh);
  }

  /** np.squeeze (axis 생략 = 크기 1 인 축 전부 제거) */
  function squeeze(a, axis) {
    var sh;
    if (axis === undefined || axis === null) {
      sh = a.shape.filter(function (d) { return d !== 1; });
    } else {
      if (a.shape[axis] !== 1) {
        throw new ND.NDError('cannot select an axis to squeeze out which has size not equal to one');
      }
      sh = a.shape.slice(); sh.splice(axis, 1);
    }
    return a.reshape(sh);
  }

  /** a[[r0, r1, …]] — 행 팬시 인덱싱. 새 메모리에 값을 복사한다(NumPy 와 같다). */
  function rowGather(a, rows) {
    var nested = rows.map(function (r) {
      var row = [];
      for (var j = 0; j < a.shape[1]; j++) row.push(a.get([r, j]));
      return row;
    });
    return ND.array(nested, a.dtype);
  }

  /** 버퍼 한 줄을 아스키 상자로. 칸 폭 3 으로 고정해 정렬을 코드로 보장한다. */
  function asciiBuf(vals, marks) {
    var n = vals.length, top = '┌', mid = '│', bot = '└', pos = ' ', mk = ' ';
    for (var i = 0; i < n; i++) {
      var last = (i === n - 1);
      top += '───' + (last ? '┐' : '┬');
      mid += pad(vals[i], 3) + '│';
      bot += '───' + (last ? '┘' : '┴');
      pos += pad(i, 3) + ' ';
      mk += pad(marks && marks[i] ? '^' : '', 3) + ' ';
    }
    var lines = [top, mid, bot, pos];
    if (marks) lines.push(mk);
    return lines.join('\n');
  }

  function strTuple(arr) { return '(' + arr.join(', ') + ')'; }

  function panel(cls, title, kids) {
    return el('div', null, [el('div', { class: 'panel-t ' + cls, text: title })].concat(kids || []));
  }

  function markAll(n, m) {
    var o = {};
    for (var i = 0; i < n; i++) o[i] = m;
    return o;
  }

  /* ================================================== 4.1 reshape 시뮬레이터 */

  function reshapeSim() {
    var SRC = {
      a12: { label: 'arange(12)', decl: 'a = np.arange(12)', name: 'a',
             make: function () { return ND.arange(12); } },
      a24: { label: 'arange(24)', decl: 'a = np.arange(24)', name: 'a',
             make: function () { return ND.arange(24); } },
      a30: { label: 'arange(30)', decl: 'a = np.arange(30)', name: 'a',
             make: function () { return ND.arange(30); } },
      m:   { label: 'matrix (2,4)', name: 'matrix',
             decl: 'matrix = np.array([[1, 2, 5, 8],\n                   [1, 2, 5, 8]])',
             make: function () { return ND.array([[1, 2, 5, 8], [1, 2, 5, 8]]); } }
    };

    var st = { src: 'a24', shape: '3, 8', order: 'C', show: 'val', track: null };

    var host = el('div');

    var srcCtl = UI.seg({
      label: '원본 배열', value: st.src,
      options: [
        { value: 'a12', label: 'arange(12)' },
        { value: 'a24', label: 'arange(24)' },
        { value: 'a30', label: 'arange(30)' },
        { value: 'm', label: 'matrix (2,4)' }
      ],
      onChange: function (v) { st.src = v; st.track = null; rebuild(); }
    });

    var shapeCtl = UI.textInput({
      label: '목표 shape', value: st.shape, wide: true, placeholder: '3, 8',
      onChange: function (v) { st.shape = v; st.track = null; rebuild(); }
    });

    var orderCtl = UI.seg({
      label: '읽는 순서', value: st.order,
      options: [
        { value: 'C', label: 'C 순서만', title: 'NumPy 기본값' },
        { value: 'both', label: 'C · F 나란히' }
      ],
      onChange: function (v) { st.order = v; rebuild(); }
    });

    var showCtl = UI.seg({
      label: '칸에 쓸 것', value: st.show,
      options: [
        { value: 'val', label: '값' },
        { value: 'orig', label: '원본 평평한 인덱스' }
      ],
      onChange: function (v) { st.show = v; rebuild(); }
    });

    var PRESETS = [
      { value: 'm|8', label: 'matrix.reshape(8,)' },
      { value: 'm|-1, 2', label: 'matrix.reshape(-1, 2)' },
      { value: 'm|2, 2, 2', label: 'matrix.reshape(2, 2, 2)' },
      { value: 'm|-1, 3', label: 'matrix.reshape(-1, 3) ← 에러' },
      { value: 'a24|-1, 6', label: 'arange(24).reshape(-1, 6)' },
      { value: 'a24|2, 3, 4', label: 'arange(24).reshape(2, 3, 4)' },
      { value: 'a30|-1, 6', label: 'arange(30).reshape(-1, 6)' },
      { value: 'a24|-1, -1', label: 'arange(24).reshape(-1, -1) ← 에러' },
      { value: 'a12|5, 3', label: 'arange(12).reshape(5, 3) ← 에러' }
    ];
    var presetCtl = UI.chips(PRESETS, function (v) {
      var bits = v.split('|');
      st.src = bits[0]; st.track = null;
      srcCtl.setValue(bits[0]);
      shapeCtl.setValue(bits[1]);      // setValue 안에서 onChange → rebuild 가 돈다
    });

    /** 목표 shape 로 배치한 결과 격자 하나 만들기 */
    function resultBlock(src, shape, order, engineNd) {
      var read = order === 'F' ? fOrderRead(src) : cOrderRead(src);
      var cs = ND.cStrides(shape), fs = ND.fStrides(shape), total = ND.prod(shape);
      var vals = new Array(total), orig = new Array(total);
      for (var q = 0; q < total; q++) {
        var idx = unravelC(q, shape);
        var p = (order === 'F') ? dotIdx(idx, fs) : q;
        vals[q] = read.vals[p];
        orig[q] = read.orig[p];
      }
      var nd = engineNd || new ND.ND(vals, shape, null, 0, src.dtype, null);
      var originAt = function (idx) { return orig[dotIdx(idx, cs)]; };

      var body = [];
      var codeTxt = order === 'F'
        ? 'np.reshape(' + SRC[st.src].name + ', ' + strTuple(shape) + ", order='F')"
        : SRC[st.src].name + '.reshape(' + shape.join(', ') + ')';
      body.push(UI.code(codeTxt));
      body.push(UI.shapeBadge(nd));
      if (nd.ndim <= 3) {
        body.push(UI.grid(nd, {
          showIndex: true, cellSize: 36,
          layerLabel: function (L) { return '층 [' + L + ']'; },
          label: function (idx, val) {
            return st.show === 'orig' ? String(originAt(idx)) : UI.fmtCell(val, nd.dtype);
          },
          highlight: function (idx) { return originAt(idx) === st.track ? 'x' : 'r'; },
          onClick: function (idx) { st.track = originAt(idx); rebuild(); }
        }));
      } else {
        body.push(el('p', { class: 'small muted',
          text: '4차원 이상은 격자로 그리지 않는다. 아래는 print() 출력이다.' }));
        body.push(UI.out(ND.format(nd)));
      }
      return body;
    }

    function rebuild() {
      UI.clear(host);
      var src = SRC[st.src].make();
      var srcCs = ND.cStrides(src.shape);

      host.appendChild(UI.code(SRC[st.src].decl));

      host.appendChild(panel('a', '원본 — 파랑. 칸을 누르면 그 원소를 노랑으로 추적한다', [
        UI.shapeBadge(src),
        UI.grid(src, {
          showIndex: true, cellSize: 36,
          label: function (idx, val) {
            return st.show === 'orig' ? String(dotIdx(idx, srcCs)) : UI.fmtCell(val, src.dtype);
          },
          highlight: function (idx) { return dotIdx(idx, srcCs) === st.track ? 'x' : 'a'; },
          onClick: function (idx) { st.track = dotIdx(idx, srcCs); rebuild(); }
        })
      ]));

      // 목표 shape 읽기
      var target;
      try {
        target = parseShapeStr(st.shape);
      } catch (e) {
        host.appendChild(UI.errBlock(e.message, 'TypeError'));
        return;
      }

      // -1 자동 계산 설명
      var negs = target.filter(function (d) { return d === -1; }).length;
      if (negs === 1) {
        var known = 1, parts = [];
        target.forEach(function (d) { if (d !== -1) { known *= d; parts.push(String(d)); } });
        if (known > 0 && src.size % known === 0) {
          host.appendChild(UI.callout('why',
            'size ' + src.size + ' ÷ 지정한 ' + (parts.length ? parts.join(' × ') : '1') +
            ' = ' + (src.size / known) + ' → <b>-1 은 ' + (src.size / known) + ' 이 된다.</b> ' +
            '나머지 한 축의 크기는 size 로부터 유일하게 정해지므로 NumPy 가 대신 계산해 준다.',
            '-1 은 이렇게 정해진다'));
        }
      }

      // 실제 reshape (엔진이 계산한다)
      var res;
      try {
        res = src.reshape(target);
      } catch (e) {
        host.appendChild(UI.code(SRC[st.src].name + '.reshape(' + target.join(', ') + ')'));
        host.appendChild(UI.errBlock(e.message));
        var why;
        if (negs > 1) {
          why = '-1 은 "네가 계산해라" 라는 뜻이다. 두 곳에 쓰면 답이 하나로 정해지지 않으므로 ' +
                'NumPy 는 계산을 포기한다. -1 은 <b>한 번만</b> 쓸 수 있다.';
        } else if (negs === 1) {
          var kn = 1;
          target.forEach(function (d) { if (d !== -1) kn *= d; });
          why = 'size ' + src.size + ' 를 지정한 ' + kn + ' 으로 나누면 ' +
                (src.size / kn).toFixed(4).replace(/0+$/, '') + ' — 정수가 아니다. ' +
                '<b>size 가 나누어떨어지지 않으면 -1 도 소용없다.</b> ' +
                '(수업자료 셀 40 이 바로 이 에러다. 일부러 남겨 둔 예제다.)';
        } else {
          why = '원소 개수는 늘거나 줄지 않는다. ' + ND.shapeStr(target) + ' 은 원소 ' +
                ND.prod(target) + '개가 필요한데 원본은 ' + src.size + '개뿐이다. ' +
                '<b>reshape 의 유일한 조건은 size 가 같은 것</b>이다.';
        }
        host.appendChild(UI.callout('trap', why));
        return;
      }

      var shared = ND.sharesMemory(src, res);
      if (st.order === 'both') {
        host.appendChild(el('div', { class: 'stack-2' }, [
          panel('r', 'C 순서 (NumPy 기본)', resultBlock(src, res.shape, 'C', res)),
          panel('r', "F 순서 (order='F')", resultBlock(src, res.shape, 'F', null))
        ]));
        host.appendChild(UI.callout('why',
          '같은 목표 shape 인데 원소 배치가 다르다. reshape 는 메모리를 옮기지 않는다 — ' +
          '<b>원소를 어떤 순서로 읽고 어떤 순서로 채울지</b>만 바꾼다. ' +
          'C 순서는 마지막 축이 가장 빨리 변하고(행을 다 채우고 다음 행), ' +
          'F 순서는 첫 축이 가장 빨리 변한다(열을 다 채우고 다음 열). ' +
          '"칸에 쓸 것" 을 <b>원본 평평한 인덱스</b>로 바꿔 보면 읽는 순서가 바로 보인다.'));
      } else {
        host.appendChild(panel('r', '결과 — 초록', resultBlock(src, res.shape, 'C', res)));
      }

      host.appendChild(el('p', { class: 'small', html:
        'size 는 <b>' + src.size + ' → ' + res.size + '</b> 로 그대로다. ' +
        'np.shares_memory(' + SRC[st.src].name + ', 결과) → <b>' + (shared ? 'True' : 'False') +
        '</b> — ' + (shared
          ? 'reshape 는 값을 복사하지 않았다. 같은 메모리를 다른 모양으로 보는 <b>뷰</b>다.'
          : '원본이 연속(contiguous)이 아니어서 어쩔 수 없이 사본이 만들어졌다.') }));

      return;
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터 ①',
      title: 'reshape 시뮬레이터',
      note: '목표 shape 를 직접 적어 보라. 칸을 누르면 그 원소를 <b>노랑</b>으로 추적한다 — ' +
            '어느 칸이 어디로 갔는지 눈으로 따라갈 수 있다. ' +
            '아래 칩은 수업 노트북 셀 33~41 과 셀 61 을 그대로 재현한 것이다.',
      body: [
        UI.controls([srcCtl, shapeCtl, orderCtl, showCtl]),
        presetCtl,
        host
      ]
    });
  }

  /* ============================================== 4.2 flatten 대응 시각화 */

  function flattenSim() {
    var m2 = ND.array([[[1, 2, 3, 4], [1, 2, 5, 8]],
                       [[1, 2, 3, 4], [1, 2, 5, 8]]]);
    var flat = m2.flatten();
    var cs = ND.cStrides(m2.shape);
    var st = { track: null, show: 'val' };

    var host = el('div');

    var showCtl = UI.seg({
      label: '칸에 쓸 것', value: st.show,
      options: [{ value: 'val', label: '값' }, { value: 'ord', label: 'flatten 순서' }],
      onChange: function (v) { st.show = v; rebuild(); }
    });

    function rebuild() {
      UI.clear(host);

      host.appendChild(panel('a', '원본 matrix2 — 층으로 펼쳐 그린 3차원 배열', [
        UI.shapeBadge(m2),
        UI.grid(m2, {
          cellSize: 38,
          layerLabel: function (L) { return 'matrix2[' + L + ']'; },
          label: function (idx, val) {
            return st.show === 'ord' ? String(dotIdx(idx, cs)) : UI.fmtCell(val, m2.dtype);
          },
          highlight: function (idx) { return dotIdx(idx, cs) === st.track ? 'x' : 'a'; },
          onClick: function (idx) { st.track = dotIdx(idx, cs); rebuild(); }
        })
      ]));

      host.appendChild(el('div', { class: 'flow', style: { margin: '.4rem 0' } }, [
        el('span', { class: 'op', text: '↓' }),
        el('span', { class: 'small muted',
          text: '층 [0] 의 0행 → 층 [0] 의 1행 → 층 [1] 의 0행 → 층 [1] 의 1행 (C 순서)' })
      ]));

      host.appendChild(panel('r', 'matrix2.flatten() — 1차원', [
        UI.shapeBadge(flat),
        UI.grid(flat, {
          cellSize: 38, showIndex: true,
          label: function (idx, val) {
            return st.show === 'ord' ? String(idx[0]) : UI.fmtCell(val, flat.dtype);
          },
          highlight: function (idx) { return idx[0] === st.track ? 'x' : 'r'; },
          onClick: function (idx) { st.track = idx[0]; rebuild(); }
        })
      ]));

      if (st.track !== null) {
        var src = unravelC(st.track, m2.shape);
        host.appendChild(el('p', { class: 'small', html:
          'matrix2[' + src.join('][') + '] = <b>' + m2.get(src) + '</b> 는 ' +
          'flatten 결과의 <b>' + st.track + '</b>번 칸으로 갔다. ' +
          '평평한 위치 = ' + src[0] + '×' + cs[0] + ' + ' + src[1] + '×' + cs[1] +
          ' + ' + src[2] + '×' + cs[2] + ' = ' + st.track + '.' }));
      } else {
        host.appendChild(el('p', { class: 'small muted',
          text: '아무 칸이나 눌러 보라. 대응하는 칸이 양쪽에서 노랑으로 켜진다.' }));
      }
    }

    rebuild();

    return UI.card({
      kicker: '시각화',
      title: 'flatten — 3차원이 1차원으로 펴지는 순서',
      note: '수업 셀 43~45 의 배열이다. shape 는 <b>' + ND.shapeStr(m2.shape) + '</b>, ndim <b>' +
            m2.ndim + '</b> 이므로 flatten 결과 길이는 8 이 아니라 <b>' + flat.size +
            '</b> 이다. 2×2×4 = ' + m2.size + ' 를 세어 보면 당연하다.',
      body: [UI.controls([showCtl]), host]
    });
  }

  /* ============================================ 4.3 뷰 vs 사본 실험실 */

  function viewLab() {
    var OPS = [
      { key: 'slice', code: 'a[0:2, 1:3]', kind: '슬라이싱',
        make: function (a) { return a.idx('0:2, 1:3'); } },
      { key: 'reshape', code: 'a.reshape(2, 6)', kind: 'reshape',
        make: function (a) { return a.reshape([2, 6]); } },
      { key: 'ravel', code: 'a.ravel()', kind: 'ravel',
        make: function (a) { return a.ravel(); } },
      { key: 'flatten', code: 'a.flatten()', kind: 'flatten',
        make: function (a) { return a.flatten(); } },
      { key: 'T', code: 'a.T', kind: '전치',
        make: function (a) { return a.T; } },
      { key: 'copy', code: 'a.copy()', kind: 'copy',
        make: function (a) { return a.copy(); } },
      { key: 'bool', code: 'a[a > 5]', kind: '불리언 인덱싱',
        make: function (a) { return ND.maskSelect(a, ND.ops.gt(a, 5)); } },
      { key: 'fancy', code: 'a[[0, 2]]', kind: '팬시 인덱싱',
        make: function (a) { return rowGather(a, [0, 2]); } },
      { key: 'astype', code: 'a.astype(float)', kind: 'astype',
        make: function (a) { return a.astype('float64'); } }
    ];

    function opOf(k) {
      for (var i = 0; i < OPS.length; i++) if (OPS[i].key === k) return OPS[i];
      return OPS[0];
    }

    var st = { key: 'slice', a: null, b: null, a0: null, poked: false };

    function fresh() {
      st.a = ND.arange(12).reshape([3, 4]);
      st.a0 = st.a.flatValues();
      st.b = opOf(st.key).make(st.a);
      st.poked = false;
    }

    var host = el('div');

    var opCtl = UI.select({
      label: 'b 를 만드는 연산', value: st.key,
      options: OPS.map(function (o) { return { value: o.key, label: 'b = ' + o.code }; }),
      onChange: function (v) { st.key = v; fresh(); rebuild(); }
    });

    function rebuild() {
      UI.clear(host);
      var a = st.a, b = st.b, op = opOf(st.key);
      var shared = ND.sharesMemory(a, b);
      var zeroIdx = new Array(b.ndim).fill(0);
      var bLabel = 'b[' + zeroIdx.join(', ') + ']';
      var aCs = ND.cStrides(a.shape);

      host.appendChild(UI.code('a = np.arange(12).reshape(3, 4)\nb = ' + op.code));

      /* (ㄱ) 두 격자 */
      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('a', 'a — 원본 (3, 4)', [
          UI.shapeBadge(a),
          UI.grid(a, {
            cellSize: 36, showIndex: true,
            highlight: function (idx, val) {
              return val !== st.a0[dotIdx(idx, aCs)] ? 'err' : 'a';
            }
          })
        ]),
        panel('r', 'b — ' + op.code, [
          UI.shapeBadge(b),
          UI.grid(b, {
            cellSize: 36, showIndex: true,
            highlight: function (idx) {
              return (st.poked && dotIdx(idx, ND.cStrides(b.shape)) === 0) ? 'err' : 'r';
            }
          })
        ])
      ]));

      /* 999 버튼 */
      host.appendChild(el('div', { class: 'controls' }, [
        UI.btn(bLabel + ' = 999 실행', function () {
          st.b.set(zeroIdx, 999);
          st.poked = true;
          rebuild();
        }, { primary: true }),
        UI.btn('처음으로 되돌리기', function () { fresh(); rebuild(); })
      ]));

      if (st.poked) {
        var aChanged = a.flatValues().some(function (v, i) { return v !== st.a0[i]; });
        host.appendChild(UI.callout(aChanged ? 'trap' : 'tip',
          aChanged
            ? 'b 만 고쳤는데 <b>a 도 함께 바뀌었다</b>(빨간 칸). b 는 a 와 같은 메모리를 보는 ' +
              '<b>뷰</b>였기 때문이다. a 를 건드리지도 않았는데 값이 변했다 — ' +
              '이것이 초보자를 가장 많이 괴롭히는 버그다.'
            : 'b 를 고쳐도 <b>a 는 그대로다</b>. b 는 값을 새 메모리에 복사해 둔 ' +
              '<b>사본</b>이라서 서로 영향이 없다.'));
      }

      /* (ㄴ)(ㄷ) 메모리 */
      host.appendChild(el('h4', { class: 'panel-t', text: '메모리는 하나인가 둘인가' }));
      if (shared) {
        host.appendChild(UI.memShare(a, b, ['a 만 보는 칸', 'b 만 보는 칸']));
      } else {
        host.appendChild(el('div', { class: 'stack-2' }, [
          panel('a', 'a 의 메모리', [
            UI.memBar(a.root().buf, markAll(a.root().buf.length, 'a'), { dtype: a.dtype })
          ]),
          panel('b', 'b 의 메모리 (새로 복사됨)', [
            UI.memBar(b.buf, markAll(b.buf.length, 'b'), { dtype: b.dtype })
          ])
        ]));
        host.appendChild(el('p', { class: 'small', html:
          '<b>np.shares_memory(a, b) → False</b> — 버퍼가 두 개다. 완전히 독립적이다.' }));
      }

      /* (ㄹ)(ㅁ) 표 */
      var baseTxt;
      if (b.base === null) baseTxt = 'None ← 스스로 메모리를 가진 배열';
      else if (b.base === a) baseTxt = 'a';
      else if (b.base === a.root()) baseTxt = 'a 와 같은 원본(np.arange(12))';
      else baseTxt = '다른 배열';

      host.appendChild(UI.table(
        [{ k: 'k', label: '항목' }, { k: 'a', label: 'a' }, { k: 'b', label: 'b' }],
        [
          { k: 'shape', a: ND.shapeStr(a.shape), b: ND.shapeStr(b.shape) },
          { k: 'strides (원소 단위)', a: strTuple(a.strides), b: strTuple(b.strides) },
          { k: 'strides (바이트 — NumPy 표시)',
            a: strTuple(a.strides.map(function (s) { return s * a.itemsize; })),
            b: strTuple(b.strides.map(function (s) { return s * b.itemsize; })) },
          { k: 'offset (버퍼 시작 위치)', a: String(a.offset), b: String(b.offset) },
          { k: 'dtype', a: a.dtype, b: b.dtype },
          { k: 'C 연속(contiguous)인가', a: a.isContiguous() ? 'True' : 'False',
            b: b.isContiguous() ? 'True' : 'False' },
          { k: 'base', a: 'np.arange(12)', b: baseTxt },
          { k: 'np.shares_memory(a, b)', a: '—', b: shared ? 'True' : 'False' },
          { k: '판정', a: '—', b: shared ? '뷰 (view)' : '사본 (copy)' }
        ]
      ));
    }

    fresh();
    rebuild();

    /* 규칙 표 — 하드코딩이 아니라 아홉 연산을 실제로 돌려서 채운다 */
    var ruleRows = OPS.map(function (o) {
      var a = ND.arange(12).reshape([3, 4]);
      var b = o.make(a);
      var sh = ND.sharesMemory(a, b);
      return {
        c: o.code, k: o.kind, s: ND.shapeStr(b.shape),
        v: sh ? '뷰 — 원본과 같은 메모리' : '사본 — 새 메모리'
      };
    });

    return {
      card: UI.card({
        kicker: '시뮬레이터 ②',
        title: '뷰 vs 사본 실험실',
        note: '연산을 하나 고르고 <b>' + '아래 버튼' + '</b>을 눌러 b 의 첫 칸을 999 로 바꿔 보라. ' +
              'a 가 함께 바뀌는지 안 바뀌는지가 뷰와 사본의 차이다. ' +
              '이 장에서 딱 하나만 가져간다면 이것이다.',
        body: [UI.controls([opCtl]), host]
      }),
      rules: UI.table(
        [{ k: 'c', label: '연산' }, { k: 'k', label: '종류' },
         { k: 's', label: '결과 shape' }, { k: 'v', label: '뷰인가 사본인가' }],
        ruleRows
      )
    };
  }

  /* ================================================ 4.3 strides 주소 계산기 */

  function stridesSim() {
    var base = ND.arange(12).reshape([3, 4]);
    var VIEWS = {
      a: { label: 'a', code: 'a = np.arange(12).reshape(3, 4)', make: function () { return base; } },
      T: { label: 'a.T', code: 'v = a.T', make: function () { return base.T; } },
      sl: { label: 'a[0:2, 1:3]', code: 'v = a[0:2, 1:3]', make: function () { return base.idx('0:2, 1:3'); } },
      st: { label: 'a[::2, ::2]', code: 'v = a[::2, ::2]', make: function () { return base.idx('::2, ::2'); } }
    };
    var st = { which: 'a', idx: [0, 0] };
    var host = el('div');

    var whichCtl = UI.seg({
      label: '보는 창(뷰)', value: st.which,
      options: Object.keys(VIEWS).map(function (k) { return { value: k, label: VIEWS[k].label }; }),
      onChange: function (v) { st.which = v; st.idx = [0, 0]; rebuild(); }
    });

    function rebuild() {
      UI.clear(host);
      var v = VIEWS[st.which].make();
      if (st.idx[0] >= v.shape[0] || st.idx[1] >= v.shape[1]) st.idx = [0, 0];
      var i = st.idx[0], j = st.idx[1];
      var s0 = v.strides[0], s1 = v.strides[1];
      var posn = v.offset + i * s0 + j * s1;

      host.appendChild(UI.code(VIEWS[st.which].code));

      host.appendChild(panel('a', '이 창이 보는 값 — 칸을 눌러 보라', [
        UI.shapeBadge(v),
        UI.grid(v, {
          cellSize: 38, showIndex: true,
          highlight: function (idx) { return (idx[0] === i && idx[1] === j) ? 'x' : 'a'; },
          onClick: function (idx) { st.idx = idx.slice(); rebuild(); }
        })
      ]));

      var marks = {};
      v.flatBufIndices().forEach(function (p) { marks[p] = 'a'; });
      marks[posn] = 'b';
      host.appendChild(panel('b', '메모리(버퍼) — 파랑은 이 창이 보는 칸, 주황은 지금 고른 칸', [
        UI.memBar(base.root().buf, marks, { dtype: 'int64' })
      ]));

      host.appendChild(UI.code(
        '# 인덱스 [' + i + ', ' + j + '] 이 앉은 메모리 위치\n' +
        'buf_pos = offset + i*strides[0] + j*strides[1]\n' +
        'buf_pos = ' + v.offset + ' + ' + i + '*' + s0 + ' + ' + j + '*' + s1 +
        ' = ' + posn + '        # buf[' + posn + '] = ' + base.root().buf[posn]));

      host.appendChild(UI.table(
        [{ k: 'k', label: '항목' }, { k: 'v', label: '값' }, { k: 'd', label: '뜻' }],
        [
          { k: 'shape', v: ND.shapeStr(v.shape), d: '축마다 칸이 몇 개인가' },
          { k: 'strides (원소)', v: strTuple(v.strides),
            d: '그 축으로 한 칸 갈 때 메모리에서 몇 칸을 뛰는가' },
          { k: 'strides (바이트)', v: strTuple(v.strides.map(function (s) { return s * v.itemsize; })),
            d: 'NumPy 가 실제로 출력하는 값 — 원소 단위 × itemsize(' + v.itemsize + ')' },
          { k: 'offset', v: String(v.offset), d: '버퍼에서 몇 번째 칸부터 시작하는가' },
          { k: 'v.flags[\'C_CONTIGUOUS\']', v: v.isContiguous() ? 'True' : 'False',
            d: v.isContiguous() ? '메모리에 쭉 이어져 있다 → reshape 가 뷰로 된다'
                                : '건너뛰며 본다 → reshape 는 사본을 만들어야 한다' }
        ]
      ));
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터 ③',
      title: 'strides 주소 계산기',
      note: '뷰가 마법이 아니라 <b>덧셈과 곱셈</b>이라는 것을 확인하는 도구다. ' +
            '창을 바꿔 보면 값은 그대로인데 (shape, strides, offset) 세 숫자만 달라진다.',
      body: [UI.controls([whichCtl]), host]
    });
  }

  /* ============================================ 4.4 축 추가·제거 시뮬레이터 */

  function axisSim() {
    var OPS = [
      { code: 'a', make: function (a) { return a; } },
      { code: 'a[np.newaxis, :]', make: function (a) { return a.idx('None, :'); } },
      { code: 'a[:, np.newaxis]', make: function (a) { return a.idx(':, None'); } },
      { code: 'a.reshape(1, -1)', make: function (a) { return a.reshape([1, -1]); } },
      { code: 'a.reshape(-1, 1)', make: function (a) { return a.reshape([-1, 1]); } },
      { code: 'np.expand_dims(a, 0)', make: function (a) { return expandDims(a, 0); } },
      { code: 'np.expand_dims(a, 1)', make: function (a) { return expandDims(a, 1); } },
      { code: 'np.squeeze(a[:, np.newaxis])', make: function (a) { return squeeze(a.idx(':, None')); } }
    ];
    var st = { i: 2 };
    var host = el('div');

    var ctl = UI.chips(OPS.map(function (o, i) { return { value: String(i), label: o.code }; }),
      function (v) { st.i = parseInt(v, 10); rebuild(); });

    function rebuild() {
      UI.clear(host);
      var a = ND.arange(4);
      var op = OPS[st.i];
      var b;
      try { b = op.make(a); } catch (e) { host.appendChild(UI.errBlock(e.message)); return; }

      host.appendChild(UI.code('a = np.arange(4)\nb = ' + op.code));
      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('a', 'a — 1차원', [UI.shapeBadge(a), UI.grid(a, { cellSize: 38, showIndex: true })]),
        panel('r', 'b — ' + op.code, [
          UI.shapeBadge(b),
          UI.grid(b, { cellSize: 38, showIndex: true, highlight: function () { return 'r'; } })
        ])
      ]));
      host.appendChild(el('p', { class: 'small', html:
        'size 는 ' + a.size + ' → ' + b.size + ' 로 그대로다. 값도 하나도 안 바뀌었다. ' +
        'ndim 만 ' + a.ndim + ' → ' + b.ndim + '. ' +
        'np.shares_memory(a, b) → <b>' + (ND.sharesMemory(a, b) ? 'True' : 'False') + '</b> — ' +
        '축을 추가하는 일은 <b>보는 방식만 바꾸는 것</b>이라 값을 복사하지 않는다.' }));
      host.appendChild(UI.out(ND.format(b)));
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터 ④',
      title: '축 추가·제거 실험 (newaxis · expand_dims · squeeze)',
      note: '길이 4 인 1차원 배열에 축을 하나 끼워 넣어 본다. ' +
            '<code>(4,)</code> 가 <code>(1, 4)</code> 인지 <code>(4, 1)</code> 인지가 ' +
            '7장 브로드캐스팅에서 결과를 완전히 갈라 놓는다.',
      body: [ctl, host]
    });
  }

  /* ======================================= 4.4 전치 vs reshape 추적 비교 */

  function transposeVsReshape() {
    var m = ND.arange(1, 7).reshape([2, 3]);
    var t = m.T;
    var r = m.reshape([3, 2]);
    var st = { track: null };
    var host = el('div');

    function gridOf(nd, kind) {
      return UI.grid(nd, {
        cellSize: 40, showIndex: true,
        highlight: function (idx, val) { return val === st.track ? 'x' : kind; },
        onClick: function (idx, val) { st.track = val; rebuild(); }
      });
    }

    function rebuild() {
      UI.clear(host);
      host.appendChild(el('div', { class: 'stack-3' }, [
        panel('a', 'a — shape (2, 3)', [gridOf(m, 'a')]),
        panel('r', 'a.T — shape (3, 2)', [gridOf(t, 'r')]),
        panel('r', 'a.reshape(3, 2) — shape (3, 2)', [gridOf(r, 'r')])
      ]));
      host.appendChild(el('p', { class: 'small muted',
        text: st.track === null
          ? '아무 칸이나 눌러 그 값이 세 격자에서 어디에 있는지 확인해 보라.'
          : '값 ' + st.track + ' 의 자리를 노랑으로 표시했다. .T 와 reshape 의 자리가 다르다.' }));
      host.appendChild(UI.table(
        [{ k: 'k', label: '' }, { k: 'v', label: 'print() 출력', raw: true }],
        [
          { k: 'a.T', v: '<pre class="code out" style="margin:0">' + UI.esc(ND.format(t)) + '</pre>' },
          { k: 'a.reshape(3, 2)', v: '<pre class="code out" style="margin:0">' + UI.esc(ND.format(r)) + '</pre>' }
        ]
      ));
      host.appendChild(el('p', { class: 'small', html:
        'shape 는 둘 다 (3, 2) 지만 <b>값의 배치가 다르다.</b> ' +
        '.T 의 strides 는 ' + strTuple(t.strides) + ' 로 a 의 ' + strTuple(m.strides) +
        ' 를 뒤집은 것이고(메모리는 그대로), ' +
        'reshape 는 메모리에 놓인 순서대로 다시 끊어 읽은 것이다. ' +
        'a.T 가 연속인가 → <b>' + (t.isContiguous() ? 'True' : 'False') + '</b>, ' +
        'a.reshape(3, 2) 가 연속인가 → <b>' + (r.isContiguous() ? 'True' : 'False') + '</b>.' }));
    }

    rebuild();

    return UI.card({
      kicker: '시뮬레이터 ⑤',
      title: '전치(.T) 와 reshape 는 다르다',
      note: '학생이 가장 많이 헷갈리는 지점이다. shape 가 같아도 결과가 같지 않다.',
      body: [host]
    });
  }

  /* ================================================ 3차원 transpose 시각화 */

  function transpose3D() {
    var a = ND.arange(24).reshape([2, 3, 4]);
    var t = a.transpose([1, 0, 2]);
    var s = a.swapaxes(0, 1);
    var box = el('div');

    box.appendChild(UI.code(
      'a = np.arange(24).reshape(2, 3, 4)\n' +
      'a.transpose(1, 0, 2).shape   # ' + ND.shapeStr(t.shape) + '\n' +
      'np.swapaxes(a, 0, 1).shape   # ' + ND.shapeStr(s.shape) + '   # 같은 결과'));

    box.appendChild(panel('a', 'a — shape ' + ND.shapeStr(a.shape) + ' (층 2개 × 3행 × 4열)', [
      UI.grid(a, { cellSize: 32, layerLabel: function (L) { return 'a[' + L + ']'; } })
    ]));
    box.appendChild(panel('r', 'a.transpose(1, 0, 2) — shape ' + ND.shapeStr(t.shape) +
      ' (층 3개 × 2행 × 4열)', [
      UI.grid(t, {
        cellSize: 32, highlight: function () { return 'r'; },
        layerLabel: function (L) { return '[' + L + ']'; }
      })
    ]));
    box.appendChild(el('p', { class: 'small', html:
      'transpose(1, 0, 2) 는 "새 배열의 0번 축에는 원래 1번 축을, 1번 축에는 원래 0번 축을, ' +
      '2번 축에는 원래 2번 축을 놓아라" 는 뜻이다. 축 0 과 1 만 맞바꾼 것이므로 ' +
      '<code>np.swapaxes(a, 0, 1)</code> 와 결과가 같다. ' +
      'np.shares_memory(a, 결과) → <b>' + (ND.sharesMemory(a, t) ? 'True' : 'False') + '</b> ' +
      '— 전치는 언제나 뷰다. 다만 연속성은 잃는다(a.transpose 결과가 연속인가 → <b>' +
      (t.isContiguous() ? 'True' : 'False') + '</b>).' }));
    return box;
  }

  /* ==================================================== ravel vs flatten 증명 */

  function ravelProof() {
    var a = ND.arange(6).reshape([2, 3]);
    var rv = a.ravel();
    var shareR = ND.sharesMemory(a, rv);
    rv.set([0], 999);
    var afterR = ND.format(a);

    var a2 = ND.arange(6).reshape([2, 3]);
    var fl = a2.flatten();
    var shareF = ND.sharesMemory(a2, fl);
    fl.set([0], 999);
    var afterF = ND.format(a2);

    var box = el('div');
    box.appendChild(el('div', { class: 'stack-2' }, [
      el('div', null, [
        UI.code('a = np.arange(6).reshape(2, 3)\n' +
                'r = a.ravel()\n' +
                'np.shares_memory(a, r)   # ' + (shareR ? 'True' : 'False') + '\n' +
                'r[0] = 999\n' +
                'print(a)'),
        UI.out(afterR)
      ]),
      el('div', null, [
        UI.code('a = np.arange(6).reshape(2, 3)\n' +
                'f = a.flatten()\n' +
                'np.shares_memory(a, f)   # ' + (shareF ? 'True' : 'False') + '\n' +
                'f[0] = 999\n' +
                'print(a)'),
        UI.out(afterF)
      ])
    ]));
    box.appendChild(UI.callout('tip',
      '둘 다 1차원으로 펴 준다. 차이는 딱 하나다 — <b>ravel 은 가능하면 뷰</b>, ' +
      '<b>flatten 은 항상 사본</b>. 원본을 지키고 싶으면 flatten, ' +
      '큰 배열을 복사 없이 훑고 싶으면 ravel 이다. ' +
      '(원본이 연속이 아니면 ravel 도 어쩔 수 없이 사본을 만든다.)'));
    return box;
  }

  /* ============================================================== 등록 */

  Lab.register({
    id: 'reshape',
    n: '4',
    title: '배열의 모양 바꾸기와 뷰',
    blurb: 'size 가 같으면 모양은 자유롭게 바꿀 수 있다. 그런데 모양이 바뀐 그 배열은 새 배열이 아니라 같은 메모리를 다른 창으로 보는 "뷰"인 경우가 많다.',
    sim: 'reshape 시뮬레이터 · 뷰 vs 사본 실험실 · strides 주소 계산기 · 축 추가/제거 · 전치 vs reshape',

    render: function (root) {

      /* ------------------------------------------------ 도입 */
      root.appendChild(el('p', { class: 'lede', html:
        'NumPy 배열은 <b>값이 든 메모리 한 줄</b>과 <b>그것을 어떻게 읽을지 적어 둔 쪽지</b>로 되어 있다. ' +
        'reshape 는 값을 옮기지 않고 그 쪽지만 고쳐 쓴다. 그래서 빠르고, 그래서 위험하다.' }));

      /* ============================================ 4.1 */
      root.appendChild(el('h2', { class: 'h-sec', text: '4.1 reshape — 조건은 size 하나뿐' }));

      var matrix = ND.array([[1, 2, 5, 8], [1, 2, 5, 8]]);
      root.appendChild(UI.code(
        'matrix = np.array([[1, 2, 5, 8],\n' +
        '                   [1, 2, 5, 8]])\n' +
        'matrix.shape   # ' + ND.shapeStr(matrix.shape) + '\n' +
        'matrix.size    # ' + matrix.size));
      root.appendChild(el('p', { html:
        'reshape 가 허락하는 조건은 <b>size 가 같은 것</b> 하나뿐이다. ' +
        'size ' + matrix.size + ' 인 이 배열은 ' + ND.shapeStr([8]) + ', ' +
        ND.shapeStr([4, 2]) + ', ' + ND.shapeStr([2, 2, 2]) +
        ' 로 자유롭게 바뀔 수 있다. 값의 개수가 달라지는 모양만 거절한다.' }));

      root.appendChild(reshapeSim());

      root.appendChild(UI.callout('trap',
        '<code>-1</code> 은 "이 축의 크기는 네가 계산해라" 라는 뜻이다. ' +
        '<b>한 번만</b> 쓸 수 있고(두 번 쓰면 답이 하나로 정해지지 않아 에러), ' +
        'size 가 나누어떨어지지 않으면 -1 을 써도 에러다. ' +
        '수업 노트북 셀 40 의 <code>matrix.reshape(-1, 3)</code> 이 바로 그 경우다 — ' +
        'size 8 은 3 으로 나누어떨어지지 않는다. 위 시뮬레이터의 칩으로 직접 확인해 보라.'));

      root.appendChild(UI.callout('ver',
        '수업자료는 2024년 3월 <b>NumPy 1.x</b> 기준이다. 지금은 2.x 다. ' +
        'reshape 자체는 그대로지만 이름이 바뀐 것들이 있다 — ' +
        '<code>np.reshape(a, newshape=(3, 4))</code> 의 <code>newshape</code> 는 권장하지 않고 ' +
        '<code>shape=</code> 를 쓴다(위치 인자 <code>np.reshape(a, (3, 4))</code> 는 문제없다). ' +
        '또 <code>np.NaN</code>, <code>np.Inf</code>, <code>np.float_</code>, <code>np.int</code> 는 ' +
        '<b>2.0 에서 삭제</b>되어 <code>AttributeError</code> 가 난다. ' +
        '<code>np.nan</code>, <code>np.inf</code> 를 써야 한다.'));

      /* ============================================ 4.2 */
      root.appendChild(el('h2', { class: 'h-sec', text: '4.2 flatten 과 ravel — 1차원으로 펴기' }));
      root.appendChild(el('p', { html:
        '몇 차원이든 1차원으로 펴는 일은 자주 필요하다. ' +
        '<code>flatten()</code> 과 <code>ravel()</code> 이 그 일을 하는데, ' +
        '결과 값은 똑같고 <b>원본과의 관계</b>가 다르다.' }));

      root.appendChild(flattenSim());
      root.appendChild(ravelProof());

      /* ============================================ 4.3 */
      root.appendChild(el('h2', { class: 'h-sec', text: '4.3 뷰(view)와 사본(copy) — 이 장의 핵심' }));
      root.appendChild(el('p', { html:
        '배열 하나는 네 가지 정보로 되어 있다: <b>메모리 한 줄(buffer)</b>, ' +
        '<b>shape</b>, <b>strides</b>, <b>offset</b>. ' +
        '뒤의 세 가지는 "그 메모리를 어떻게 읽을지" 적어 둔 쪽지일 뿐이다. ' +
        '<b>뷰란 같은 메모리를 다른 쪽지로 보는 창</b>이다.' }));

      (function () {
        var a = ND.arange(12).reshape([3, 4]);
        var v = a.idx('0:2, 1:3');
        var used = {};
        v.flatBufIndices().forEach(function (p) { used[p] = true; });
        root.appendChild(UI.ascii(
          asciiBuf(a.root().buf, used) + '\n' +
          '  ↑ buf : 메모리에 실제로 저장된 값. 아래 줄은 buf 위치, ^ 는 아래 창이 보는 칸.\n' +
          '\n' +
          '  a           = shape ' + ND.shapeStr(a.shape) + '  strides ' + strTuple(a.strides) +
            '  offset ' + a.offset + '   → 12칸 전부를 3×4 로 읽는다\n' +
          '  a[0:2, 1:3] = shape ' + ND.shapeStr(v.shape) + '  strides ' + strTuple(v.strides) +
            '  offset ' + v.offset + '   → 같은 메모리에서 4칸만 골라 읽는다'));
      })();

      var lab = viewLab();
      root.appendChild(lab.card);

      root.appendChild(el('h3', { class: 'h-sub', text: '규칙 — 아홉 가지 연산을 실제로 돌려 본 결과' }));
      root.appendChild(lab.rules);
      root.appendChild(el('p', { class: 'small muted', html:
        '이 표는 적어 둔 것이 아니라 이 페이지가 방금 아홉 연산을 실행해서 ' +
        '<code>np.shares_memory</code> 로 확인한 결과다. ' +
        '외우는 대신 이렇게 기억하면 된다 — <b>"자리를 골라서 보는 것"은 뷰, ' +
        '"조건에 맞는 것만 모으는 것"은 사본.</b> ' +
        '슬라이싱은 규칙적인 간격이라 strides 로 표현할 수 있지만, ' +
        '불리언·팬시 인덱싱이 뽑아 오는 칸들은 간격이 불규칙해서 ' +
        'strides 하나로 표현할 방법이 없다. 그래서 복사밖에 없다.' }));

      root.appendChild(UI.callout('trap',
        '이것이 <b>초보자를 가장 많이 괴롭히는 버그의 원인</b>이다. ' +
        '<code>부분 = data[0:10]</code> 로 잘라 놓고 <code>부분[0] = 0</code> 을 하면 ' +
        '원본 <code>data</code> 가 조용히 망가진다. 에러도 경고도 없다. ' +
        '원본을 지켜야 한다면 <code>data[0:10].copy()</code> 라고 <b>명시적으로</b> 적어라. ' +
        '거꾸로, 큰 배열을 다룰 때 습관적으로 <code>.copy()</code> 를 붙이면 ' +
        '메모리를 몇 배로 쓰게 된다. 어느 쪽이 필요한지 생각하고 골라야 한다.'));

      root.appendChild(el('h3', { class: 'h-sub', text: 'strides — 뷰의 정체' }));
      root.appendChild(el('p', { html:
        '<code>a.strides</code> 는 <b>그 축으로 한 칸 옮길 때 메모리에서 몇 칸을 뛰어야 하는가</b>다. ' +
        '(3, 4) 배열은 행을 하나 내려가면 다음 행의 시작까지 4칸을 뛰어야 하고, ' +
        '열을 하나 옮기면 바로 옆 칸이니 1칸이다. 그래서 <b>(4, 1)</b> 이다(원소 단위). ' +
        'NumPy 는 이것을 바이트로 출력하므로 int64(8바이트) 배열이면 <b>(32, 8)</b> 로 보인다.' }));

      root.appendChild(stridesSim());

      root.appendChild(UI.callout('why',
        '<code>a.T</code> 는 값을 하나도 옮기지 않는다. strides 를 뒤집을 뿐이다. ' +
        '(4, 1) 이 (1, 4) 가 되면 "행 방향으로 1칸, 열 방향으로 4칸" 이 되어 ' +
        '같은 메모리가 전치된 행렬로 읽힌다. ' +
        '그래서 전치는 배열이 아무리 커도 시간이 거의 들지 않는다. ' +
        '대신 메모리를 건너뛰며 읽게 되므로 <b>연속(contiguous)이 아니게</b> 되고, ' +
        '그런 배열을 reshape 하면 NumPy 는 어쩔 수 없이 사본을 만든다.'));

      root.appendChild(UI.callout('tip',
        '뷰를 <b>보장</b>받고 싶으면 shape 에 직접 대입하는 방법이 있다 — ' +
        '<code>a.shape = (2, 6)</code>. 이 방법은 사본이 필요한 상황이면 조용히 복사하는 대신 ' +
        '에러를 낸다. "복사가 일어나면 안 되는" 코드에서 안전장치로 쓸 수 있다.'));

      /* ============================================ 4.4 */
      root.appendChild(el('h2', { class: 'h-sec', text: '4.4 차원 늘리기·줄이기' }));
      root.appendChild(el('p', { html:
        '값도 size 도 그대로 두고 <b>축의 개수만</b> 바꾸는 일이 자주 필요하다. ' +
        '<code>np.newaxis</code>(= <code>None</code>) 를 인덱스 자리에 끼워 넣으면 ' +
        '그 자리에 크기 1 인 축이 생긴다. <code>reshape</code> 로도, ' +
        '<code>np.expand_dims</code> 로도 같은 일을 할 수 있다.' }));

      root.appendChild(axisSim());

      root.appendChild(UI.callout('tip',
        '<code>a[:, np.newaxis]</code> 를 왜 배우는가. 7장 브로드캐스팅에서 ' +
        '길이 4 인 배열과 길이 3 인 배열로 4×3 표를 만들려면 ' +
        '<code>a[:, np.newaxis] + b</code> 처럼 한쪽을 세로로 세워야 한다. ' +
        '<code>(4,) + (3,)</code> 는 에러지만 <code>(4, 1) + (3,)</code> 은 (4, 3) 이 된다. ' +
        '이 장에서 배운 축 끼워 넣기가 거기서 결정적으로 쓰인다.'));

      root.appendChild(el('h3', { class: 'h-sub', text: 'transpose — 축 순서 바꾸기' }));
      root.appendChild(transpose3D());

      root.appendChild(transposeVsReshape());

      /* ============================================ 확인 문제 */
      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
      root.appendChild(UI.quiz([
        {
          q: '<code>np.arange(8).reshape(-1, 3)</code> 을 실행하면?',
          choices: [
            'shape (2, 3) 배열이 되고 남는 두 칸은 0 으로 채워진다',
            'shape (3, 3) 배열이 되고 마지막 칸은 버려진다',
            '<code>ValueError</code> — size 8 을 3 으로 나눌 수 없다',
            '-1 이 있으므로 언제나 성공한다'
          ],
          answer: 2,
          explain: 'reshape 는 원소를 <b>버리지도 만들지도 않는다.</b> ' +
            'size 8 을 3 으로 나누면 정수가 아니므로 -1 에 넣을 수가 없다. ' +
            '수업 노트북 셀 40 에 일부러 남겨 둔 에러가 이것이다. ' +
            '<code>reshape(-1, 2)</code> 나 <code>reshape(-1, 4)</code> 는 성공한다.'
        },
        {
          q: '<code>m = np.array([[[1,2,3,4],[1,2,5,8]], [[1,2,3,4],[1,2,5,8]]])</code> 일 때 ' +
             '<code>m.flatten()</code> 의 길이는?',
          choices: ['4', '8', '16', '2'],
          answer: 2,
          explain: 'shape 는 (2, 2, 4) 이고 ndim 은 3 이다. ' +
            'flatten 의 길이는 size, 즉 2 × 2 × 4 = <b>16</b> 이다. ' +
            '8 을 고르는 것은 안쪽 두 축(2 × 4)만 세고 층이 2개인 것을 빠뜨린 실수다. ' +
            '겉보기 줄 수가 아니라 <b>모든 축의 곱</b>을 세야 한다.'
        },
        {
          q: '<code>a = np.arange(12).reshape(3, 4)</code> 에서 ' +
             '<code>r = a.ravel()</code> 로 만든 뒤 <code>r[0] = 999</code> 를 실행했다. ' +
             '<code>a[0, 0]</code> 은?',
          choices: [
            '0 — ravel 은 새 배열을 만들므로 원본은 그대로다',
            '999 — a 가 연속이므로 ravel 은 뷰를 돌려주고, 같은 메모리를 고친 것이다',
            '에러가 난다 — 뷰는 값을 바꿀 수 없다',
            '999 지만 <code>a.flatten()</code> 을 썼어도 결과는 같다'
          ],
          answer: 1,
          explain: '<code>ravel()</code> 은 <b>가능하면 뷰</b>다. a 는 연속이므로 뷰가 되고, ' +
            'r 을 고친 것은 a 의 메모리를 고친 것이다 → <code>a[0, 0]</code> 은 <b>999</b>. ' +
            '<code>flatten()</code> 은 <b>항상 사본</b>이라 이 경우 a 는 0 그대로다. ' +
            '이 차이를 모르면 원본이 조용히 망가진다.'
        },
        {
          q: '<code>a = np.arange(1, 7).reshape(2, 3)</code> 에 대해 옳은 것은?',
          choices: [
            '<code>a.T</code> 와 <code>a.reshape(3, 2)</code> 는 shape 도 값도 같다',
            'shape 는 둘 다 (3, 2) 지만 값의 배치가 다르다. <code>a.T</code> 는 strides 를 뒤집은 뷰다',
            '<code>a.T</code> 는 값을 복사해 새 배열을 만들고 <code>reshape</code> 는 뷰다',
            '<code>a[a > 3]</code> 은 뷰라서 고치면 a 도 바뀐다'
          ],
          answer: 1,
          explain: 'shape 가 같다고 같은 배열이 아니다. <code>a.T</code> 는 ' +
            '<code>[[1,4],[2,5],[3,6]]</code>, <code>a.reshape(3,2)</code> 는 ' +
            '<code>[[1,2],[3,4],[5,6]]</code> 이다. ' +
            '전치는 strides 를 뒤집기만 하는 <b>뷰</b>이고 값을 옮기지 않는다. ' +
            '한편 <code>a[a > 3]</code> 같은 불리언 인덱싱은 뽑는 칸의 간격이 불규칙해서 ' +
            'strides 로 표현할 수 없으므로 <b>항상 사본</b>이다.'
        }
      ], { id: 'reshape' }));
    }
  });
})();
