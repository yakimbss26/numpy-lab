/* ===========================================================================
 * ch08-axis.js — 8장 축(axis)과 수학·통계 함수
 * 노트북 셀 114~131 대응.
 * axis 는 학생이 가장 많이 틀리는 개념이다. "axis=k 로 집계하면 k번째 축이
 * 사라지고, 결과의 shape 가 곧 답이다" — 이 문장 하나를 시뮬레이터로 증명한다.
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
      .concat(Array.isArray(body) ? body : [body]));
  }

  function arrowRight() { return el('span', { class: 'op', text: '→' }); }
  function arrowDown() {
    return el('div', { class: 'small mono', style: { textAlign: 'center', fontSize: '1.5rem', margin: '.3rem 0', color: 'var(--ink-muted)' }, text: '↓' });
  }
  function mono(text) {
    return el('div', { class: 'small mono', style: { color: 'var(--ink-2)', marginTop: '.5rem', minHeight: '1.3em' }, text: text });
  }

  function fmtN(v) {
    if (!isFinite(v)) return String(v);
    return Number.isInteger(v) ? String(v) : UI.round2(v);
  }

  /* ------------------------------------------------------ axis 그룹 계산 */

  /** keepdims 결과의 idx 를 "남는 축만 있는" idx 로 정규화한다 */
  function toKeepIdx(idx, axis, keepdims) {
    if (axis === null || axis === undefined) return [];
    if (!keepdims) return idx;
    var o = idx.slice(); o.splice(axis, 1); return o;
  }

  /** axis 하나로 reduce 될 때, 결과의 keepIdx 하나를 만드는 원본 인덱스들 */
  function sourceIndices(arr, axis, keepIdx) {
    if (axis === null || axis === undefined) return arr.indices();
    var ndim = arr.ndim, keepAxes = [], i;
    for (i = 0; i < ndim; i++) if (i !== axis) keepAxes.push(i);
    var base = new Array(ndim).fill(0);
    for (i = 0; i < keepAxes.length; i++) base[keepAxes[i]] = keepIdx[i];
    var n = arr.shape[axis], out = [];
    for (var t = 0; t < n; t++) { var ix = base.slice(); ix[axis] = t; out.push(ix); }
    return out;
  }

  /** 같은 결과 칸으로 합쳐지는 원본 칸들은 항상 같은 색(a/b 번갈아)이 되게 한다 */
  function groupColorFn(arr, axis) {
    return function (idx) {
      if (axis === null || axis === undefined) return 'a';
      var s = 0, n = 0;
      for (var i = 0; i < arr.ndim; i++) if (i !== axis) { s += idx[i]; n++; }
      if (!n) return 'a';
      return s % 2 === 0 ? 'a' : 'b';
    };
  }

  function keyOf(idx) { return idx.join(','); }

  /** 함수별로 "이 칸들이 어떻게 이 값이 되었나" 설명 문장 */
  function explainGroup(op, vals, result) {
    var vs = vals.map(fmtN);
    switch (op) {
      case 'sum': return vs.join(' + ') + ' = ' + fmtN(result);
      case 'mean': return '(' + vs.join(' + ') + ') / ' + vals.length + ' = ' + fmtN(result);
      case 'max': return 'max(' + vs.join(', ') + ') = ' + fmtN(result);
      case 'min': return 'min(' + vs.join(', ') + ') = ' + fmtN(result);
      case 'std': return '값 {' + vs.join(', ') + '} 의 표준편차(ddof=0) = ' + fmtN(result);
      case 'argmax': return '값 {' + vs.join(', ') + '} 중 최댓값의 자리(0부터) → ' + result;
      default: return vs.join(', ') + ' → ' + fmtN(result);
    }
  }

  var FN_LABEL = { sum: '합(sum)', mean: '평균(mean)', max: '최댓값(max)', min: '최솟값(min)',
    argmax: '최댓값 위치(argmax)', std: '표준편차(std)' };

  /* ============================================================= 장 등록 */

  Lab.register({
    id: 'axis',
    n: '8',
    title: '축(axis)과 수학·통계 함수',
    blurb: 'axis=k 로 집계하면 k번째 축이 사라진다 — 그것이 전부다. 결과의 shape 를 보면 어느 축이 사라졌는지 항상 알 수 있다.',
    sim: 'axis 축소기(2·3차원) · 통계 함수 탐색기 · 수학 함수 적용기',

    render: function (root) {

      /* ==================================================== 8.1 집계의 기본 */

      root.appendChild(el('h2', { class: 'h-sec', text: '8.1 집계의 기본 — sum 부터' }));
      root.appendChild(el('p', {
        class: 'lede',
        html: '이 장 전체에서 예제로 쓸 배열 하나를 만든다. <code>1</code>부터 <code>12</code>까지를 <code>(3, 4)</code> 로 접은 것이다.'
      }));

      var arr5 = ND.arange(1, 13).reshape([3, 4]);
      root.appendChild(UI.code('arr5 = np.arange(1, 13).reshape(3, 4)\narr5'));
      root.appendChild(el('div', { class: 'flow' }, [
        panel('a', 'arr5  ' + ND.shapeStr(arr5.shape), UI.grid(arr5, { highlight: function () { return 'a'; }, axisLabels: true, cellSize: 40 }))
      ]));
      root.appendChild(UI.out(ND.format(arr5)));

      var sumAll = ND.sum(arr5);
      root.appendChild(UI.code('np.sum(arr5)'));
      root.appendChild(UI.out(ND.fmtScalar(sumAll.toNested(), sumAll.dtype), { label: false }));

      root.appendChild(UI.code('arr5.sum()          # 메서드형 — 결과는 np.sum(arr5) 와 완전히 같다'));
      root.appendChild(el('p', {
        html: '<code>np.sum(a)</code>(함수형)와 <code>a.sum()</code>(메서드형)은 <b>완전히 같은 계산</b>이다. ' +
          '함수형은 "이 배열에 sum 이라는 동작을 적용한다"는 관점, 메서드형은 "배열 스스로 sum 을 안다"는 관점일 뿐이다. ' +
          '이 실습장은 엔진 구조상 함수형(<code>ND.sum(a)</code>)으로 계산을 보여 주지만, 실제 NumPy 코드는 둘 다 자유롭게 섞어 쓴다.'
      }));

      // dtype=float — 오버플로 데모
      (function () {
        var small = ND.array([100, 100], 'int8');
        var wrapped = ND.reduce(small, { op: 'sum' });          // dtype 유지 → 오버플로 재현
        var fixed = ND.reduce(small, { op: 'sum', dtype: 'float64' });
        root.appendChild(el('h3', { class: 'h-sub', text: 'np.sum(a, dtype=float) 는 왜 있는가' }));
        root.appendChild(el('p', {
          html: '<code>sum</code> 은 기본적으로 <b>입력과 같은 dtype 으로 결과를 낸다.</b> ' +
            '작은 정수 dtype 은 담을 수 있는 범위가 좁아서, 합이 그 범위를 넘으면 랩어라운드(오버플로)가 난다.'
        }));
        root.appendChild(UI.code('a = np.array([100, 100], dtype=np.int8)   # int8 범위: -128 ~ 127\nnp.sum(a)                 # dtype 을 안 주면?\nnp.sum(a, dtype=float)    # 명시하면?'));
        root.appendChild(UI.table(
          [{ k: 'e', label: '식' }, { k: 'd', label: '결과 dtype' }, { k: 'v', label: '값' }],
          [
            { e: 'np.sum(a)', d: 'int8 (입력 그대로)', v: ND.fmtScalar(wrapped.toNested(), 'int8') + '  ← 100+100=200 인데 int8 은 127 까지라 감싸 넘어간다' },
            { e: 'np.sum(a, dtype=float)', d: 'float64', v: ND.fmtScalar(fixed.toNested(), 'float64') + '  (진짜 합)' }
          ]));
        root.appendChild(UI.callout('why',
          'int8 은 8비트, 표현 범위 -128~127 이다. 200 은 이 범위를 넘어 <b>256 을 기준으로 접혀서 -56</b> 이 된다 ' +
          '(<code>200 → 200-256 = -56</code>). 큰 값을 더할 가능성이 있다면 <code>dtype=float</code> 이나 <code>dtype=np.int64</code> 처럼 ' +
          '넉넉한 dtype 을 명시적으로 지정해야 한다.'));
      })();

      // axis 도입
      root.appendChild(el('h2', { class: 'h-sec', text: 'axis — "기준이 되는 축"' }));
      root.appendChild(el('p', {
        html: '<code>np.sum(arr5, axis=1)</code> 처럼 axis 를 주면 그 축을 따라서만 합친다. ' +
          '문제는 "axis=1 이 행이냐 열이냐"를 외우려다 늘 틀린다는 것이다. ' +
          '정확한 규칙은 하나뿐이다 — <b>axis=k 로 집계하면 shape 튜플의 k번째 자리가 사라진다.</b>'
      }));

      (function () {
        var w = ND.arange(4);
        var w2 = w.idx('None, :');
        root.appendChild(el('p', {
          html: '팁: <b>1차원이 2차원이 될 때 새로 생기는 축은 axis=0</b> 이다. 새 축은 항상 shape 튜플의 <b>앞</b>에 붙기 때문이다.'
        }));
        root.appendChild(UI.code('w = np.arange(4)          # shape ' + ND.shapeStr(w.shape) +
          '\nw2 = w[np.newaxis, :]     # shape ' + ND.shapeStr(w2.shape) + '  ← 새로 생긴 축이 위치 0 이다 = axis 0'));
        root.appendChild(UI.statRow([
          { k: 'w.shape', v: ND.shapeStr(w.shape) },
          { k: 'w[np.newaxis, :].shape', v: ND.shapeStr(w2.shape), sub: '앞에 1 이 붙었다 → 그 자리가 axis 0' }
        ]));
      })();

      /* ------------------------------------------- 시뮬레이터 ①: axis 축소기 */

      (function () {
        var arr2 = ND.arange(1, 13).reshape([3, 4]);
        var arr3 = ND.arange(1, 13).reshape([3, 2, 2]);

        var state = { ndim: '2', fn: 'sum', axisSel: 'none', keepdims: false };

        var ctlHost = el('div');
        var resHost = el('div');

        function curArr() { return state.ndim === '2' ? arr2 : arr3; }

        function buildControls() {
          UI.clear(ctlHost);
          var maxAxis = state.ndim === '2' ? 2 : 3;
          var axisOpts = [{ value: 'none', label: 'None' }];
          for (var i = 0; i < maxAxis; i++) axisOpts.push({ value: String(i), label: String(i) });
          axisOpts.push({ value: 'oob', label: maxAxis + ' (범위 밖)' });

          var ndimSeg = UI.seg({
            label: '차원', value: state.ndim,
            options: [{ value: '2', label: '2차원 (3,4)' }, { value: '3', label: '3차원 (3,2,2)' }],
            onChange: function (v) { state.ndim = v; state.axisSel = 'none'; buildControls(); rebuild(); }
          });
          var fnSeg = UI.seg({
            label: '함수', value: state.fn,
            options: [{ value: 'sum', label: 'sum' }, { value: 'mean', label: 'mean' },
              { value: 'max', label: 'max' }, { value: 'min', label: 'min' },
              { value: 'argmax', label: 'argmax' }, { value: 'std', label: 'std' }],
            onChange: function (v) { state.fn = v; rebuild(); }
          });
          var axisSeg = UI.seg({
            label: 'axis', value: state.axisSel, options: axisOpts,
            onChange: function (v) { state.axisSel = v; rebuild(); }
          });
          var kdSeg = UI.seg({
            label: 'keepdims', value: state.keepdims ? 'on' : 'off',
            options: [{ value: 'off', label: '끄기' }, { value: 'on', label: '켜기' }],
            onChange: function (v) { state.keepdims = (v === 'on'); rebuild(); }
          });
          ctlHost.appendChild(UI.controls([ndimSeg, fnSeg, axisSeg, kdSeg]));
        }

        function rebuild() {
          UI.clear(resHost);
          var arr = curArr();
          var axisNum = state.axisSel === 'none' ? null : (state.axisSel === 'oob' ? arr.ndim : Number(state.axisSel));
          var keepdims = state.keepdims;

          var result;
          try {
            result = ND.reduce(arr, { op: state.fn, axis: axisNum, keepdims: keepdims, ddof: 0 });
          } catch (e) {
            resHost.appendChild(UI.errBlock(e.message));
            resHost.appendChild(UI.callout('why',
              '<code>axis</code> 는 항상 <code>0 ≤ axis &lt; ndim</code> 범위여야 한다. ' +
              '지금 배열은 <b>' + arr.ndim + '차원</b>이므로 axis 는 ' +
              (arr.ndim === 1 ? '0' : '0 ~ ' + (arr.ndim - 1)) + ' 까지만 쓸 수 있다. ' +
              '실제 NumPy 도 똑같은 <code>IndexError</code> 를 던진다.'));
            return;
          }

          var axisLabelTxt = state.axisSel === 'none' ? 'None' : state.axisSel;
          var flowTxt = ND.shapeStr(arr.shape) + '  --axis=' + axisLabelTxt +
            (keepdims ? ', keepdims=True' : '') + '-->  ' + ND.shapeStr(result.shape);
          resHost.appendChild(el('div', {
            class: 'mono', style: { fontSize: '1.15rem', fontWeight: 700, margin: '.2rem 0 1rem' }, text: flowTxt
          }));

          var groupHi = groupColorFn(arr, axisNum);
          var gOrig = UI.grid(arr, { highlight: groupHi, axisLabels: true, cellSize: 38 });
          var cellsOrig = cellsOf(gOrig);

          var explainEl = mono('결과 칸에 마우스를 올려 보라.');

          var gRes = UI.grid(result, {
            highlight: function () { return 'r'; }, axisLabels: true, cellSize: 44,
            onHover: function (idx) {
              if (!idx) {
                repaint(cellsOrig, arr, groupHi);
                repaint(cellsOf(gRes), result, function () { return 'r'; });
                explainEl.textContent = '결과 칸에 마우스를 올려 보라.';
                return;
              }
              var keepIdx = toKeepIdx(idx, axisNum, keepdims);
              var srcs = sourceIndices(arr, axisNum, keepIdx);
              var srcSet = {};
              srcs.forEach(function (ix) { srcSet[keyOf(ix)] = true; });
              repaint(cellsOrig, arr, function (ix2) { return srcSet[keyOf(ix2)] ? 'x' : 'dim'; });
              repaint(cellsOf(gRes), result, function (ix2) { return keyOf(ix2) === keyOf(idx) ? 'r' : 'dim'; });
              var vals = srcs.map(function (ix) { return arr.get(ix); });
              var val = result.ndim === 0 ? result.toNested() : result.get(idx);
              explainEl.textContent = explainGroup(state.fn, vals, val);
            }
          });

          var origPanel = panel('a', 'arr  ' + ND.shapeStr(arr.shape), gOrig);
          var resPanel = panel('r', FN_LABEL[state.fn] + '  ' + ND.shapeStr(result.shape), gRes);

          if (state.ndim === '2' && axisNum === 0) {
            resHost.appendChild(el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.2rem' } }, [
              origPanel, arrowDown(), resPanel
            ]));
          } else {
            resHost.appendChild(el('div', { class: 'flow' }, [origPanel, arrowRight(), resPanel]));
          }
          resHost.appendChild(explainEl);
          resHost.appendChild(UI.legend([
            { color: 'var(--s1)', label: 'A 그룹 (같은 색 = 같은 결과 칸으로 합쳐진다)' },
            { color: 'var(--s2)', label: 'B 그룹' },
            { color: 'var(--s4)', label: '지금 가리키는 결과가 쓰는 원본 칸' },
            { color: 'var(--s3)', label: '결과' }
          ]));

          if (state.ndim === '3') {
            var a1 = ND.reduce(arr, { op: state.fn, axis: 1 });
            var a2 = ND.reduce(arr, { op: state.fn, axis: 2 });
            resHost.appendChild(el('h3', { class: 'h-sub', text: 'axis=1 과 axis=2 대비 — shape 는 같은데 값이 다르다' }));
            resHost.appendChild(el('div', { class: 'stack-2' }, [
              panel('r', 'axis=1  ' + ND.shapeStr(a1.shape), UI.grid(a1, { highlight: function () { return 'r'; }, axisLabels: true, cellSize: 38 })),
              panel('r', 'axis=2  ' + ND.shapeStr(a2.shape), UI.grid(a2, { highlight: function () { return 'r'; }, axisLabels: true, cellSize: 38 }))
            ]));
            resHost.appendChild(UI.callout('trap',
              '두 결과 모두 shape <code>(3, 2)</code> 다. 그런데 <b>값은 완전히 다르다.</b> ' +
              'axis=1 은 각 층(layer) 안에서 <b>세로</b>로 합치고, axis=2 는 같은 층 안에서 <b>가로</b>로 합친다. ' +
              'shape 가 같다고 같은 계산이라고 넘겨짚으면 안 된다 — 항상 <code>axis</code> 숫자 자체를 확인해야 한다.'));
          }
        }

        buildControls();
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: 'axis 축소기 — 이 장의 핵심',
          note: '함수·axis·keepdims 를 자유롭게 바꿔 보라. <b>axis=k 를 주면 k번째 축이 사라진다.</b> ' +
            '결과 칸에 마우스를 올리면 원본의 어느 칸들이 그 값을 만들었는지 노란색으로 뜬다. ' +
            '"범위 밖" axis 를 골라 실제 에러 메시지도 확인하라.',
          body: [ctlHost, resHost]
        }));
      })();

      /* ================================================== 통계 함수 탐색기 */

      root.appendChild(el('h2', { class: 'h-sec', text: '기초 통계 함수' }));
      root.appendChild(el('p', {
        html: 'NumPy 는 <code>mean, std, var, min, max, median, percentile, argmin, argmax, ptp, cumsum</code> 등 ' +
          '통계에 필요한 함수를 거의 다 갖고 있다. 배열 하나를 바꿔 가며 값이 한꺼번에 갱신되는 것을 보자.'
      }));

      (function () {
        var state = { grid: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] };
        var host = el('div');

        function curArr() { return ND.array(state.grid); }

        function bump(r, c, ev) {
          var delta = (ev && (ev.shiftKey || ev.button === 2)) ? -1 : 1;
          var v = state.grid[r][c] + delta;
          if (v > 30) v = -30; if (v < -30) v = 30;
          state.grid[r][c] = v;
          rebuild();
        }

        function rebuild() {
          UI.clear(host);
          var a = curArr();
          var g = UI.grid(a, {
            highlight: function () { return 'a'; }, axisLabels: true, cellSize: 42,
            onClick: function (idx, val, ev) { bump(idx[0], idx[1], ev); }
          });
          host.appendChild(el('p', { class: 'small muted', text: '칸을 클릭하면 값이 1씩 늘어난다(Shift+클릭은 1씩 줄어든다). 아래 통계값이 실시간으로 다시 계산된다.' }));
          host.appendChild(g);

          var m = ND.mean(a).toNested();
          var sd0 = ND.std(a, null, 0).toNested();
          var sd1 = ND.std(a, null, 1).toNested();
          var v0 = ND.variance(a, null, 0).toNested();
          var mn = ND.min(a).toNested();
          var mx = ND.max(a).toNested();
          var ptp = ND.ptp(a).toNested();
          var amin = ND.argmin(a).toNested();
          var amax = ND.argmax(a).toNested();
          var med = ND.median(a).toNested();
          var p25 = ND.percentile(a, 25).toNested();
          var p50 = ND.percentile(a, 50).toNested();
          var p75 = ND.percentile(a, 75).toNested();
          var cs = ND.cumsum(a);

          host.appendChild(UI.statRow([
            { k: 'sum', v: fmtN(ND.sum(a).toNested()) },
            { k: 'mean', v: fmtN(m) },
            { k: 'min / max', v: fmtN(mn) + ' / ' + fmtN(mx) },
            { k: 'ptp (max-min)', v: fmtN(ptp) },
            { k: 'argmin / argmax', v: amin + ' / ' + amax, sub: '평평하게 편 뒤의 위치' },
            { k: 'median', v: fmtN(med) }
          ]));
          host.appendChild(UI.statRow([
            { k: 'std (ddof=0)', v: UI.round2(sd0), sub: '모표준편차 — NumPy 기본' },
            { k: 'std (ddof=1)', v: UI.round2(sd1), sub: '표본표준편차' },
            { k: 'var (ddof=0)', v: UI.round2(v0) },
            { k: 'percentile 25', v: UI.round2(p25) },
            { k: 'percentile 50', v: UI.round2(p50), sub: '= median' },
            { k: 'percentile 75', v: UI.round2(p75) }
          ]));
          host.appendChild(UI.out('np.cumsum(a) = ' + ND.format(cs), { label: 'cumsum (평평하게 편 뒤 누적)' }));

          // argmax 위치를 격자에서 하이라이트
          var flat = amax;
          var pos = a.unravel(flat);
          host.appendChild(el('p', {
            html: '<code>np.argmax(a)</code> = <b>' + flat + '</b> (평평한 위치). ' +
              '2차원 자리로 바꾸려면 <code>np.unravel_index(' + flat + ', ' + ND.shapeStr(a.shape) + ')</code> → <b>' +
              ND.shapeStr(pos) + '</b>. 아래 격자에서 노란 칸이 바로 그 자리다.'
          }));
          host.appendChild(UI.grid(a, {
            highlight: function (idx) { return (idx[0] === pos[0] && idx[1] === pos[1]) ? 'x' : 'dim'; },
            axisLabels: true, cellSize: 38
          }));
        }
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '통계 함수 탐색기',
          note: '기본값은 <code>np.arange(1, 13).reshape(3, 4)</code> 다(arr5 와 같다). ' +
            '칸을 클릭해 값을 바꾸면 sum·mean·std·percentile 등 모든 통계값이 함께 다시 계산된다.',
          body: [host]
        }));

        root.appendChild(UI.callout('trap',
          '<b><code>np.std</code> 의 기본은 <code>ddof=0</code>(모표준편차, n 으로 나눔)</b> 이다. ' +
          '통계 시간에 배우는 표본표준편차는 <code>n-1</code> 로 나누는 <code>ddof=1</code> 이다. ' +
          '식으로 쓰면 분산은 <code>Σ(x-평균)² / (n-ddof)</code> — ddof 가 0 이면 n, 1 이면 n-1 로 나눈다. ' +
          'ddof 를 빼먹고 통계 수업 값과 비교하면 항상 NumPy 쪽이 조금 작게 나온다.'));
        root.appendChild(UI.callout('tip',
          '<code>np.percentile</code> 의 사분위수는 두 값 사이를 <b>직선으로 보간</b>해서 계산한다(NumPy 기본 방식). ' +
          '예를 들어 위치가 정수가 아니면 앞뒤 두 값의 가중 평균을 쓴다 — 그래서 정수 배열에서도 사분위수는 소수가 될 수 있다.'));
      })();

      root.appendChild(UI.callout('tip',
        '노트북 셀 129 는 <code>np.mean</code>, <code>np.std</code>, <code>np.argmax</code> 등을 ' +
        '한 셀에 몰아 쓴다. 주피터는 <b>셀의 마지막 줄만 자동으로 출력</b>하므로 <code>np.percentile(arr5, 75)</code> 만 화면에 뜨고 ' +
        '나머지 계산 결과는 눈에 보이지 않은 채 사라진다. 값을 전부 보고 싶으면 줄마다 <code>print()</code> 로 감싸야 한다.',
        '주피터 함정 — 마지막 줄만 보인다'));

      /* ------------------------------------------------ 관절염 데이터 실전 연습 */

      var data = D && D.nd ? D.nd('inflammation') : null;
      root.appendChild(el('h3', { class: 'h-sub', text: '관절염 데이터로 axis 실전 연습' }));

      if (!data) {
        root.appendChild(UI.callout('tip', '관절염 데이터가 이 빌드에 임베드되지 않았다. 이 절의 실습은 데이터가 있어야 돌아간다.'));
      } else {
        var meta = D.inflammationMeta || {};
        root.appendChild(el('p', {
          html: '관절염 데이터 <code>data</code> 는 shape <b>' + ND.shapeStr(data.shape) + '</b> — ' +
            (meta.rowMeaning || '환자') + ' × ' + (meta.colMeaning || '날짜') + ' 다. ' +
            '<code>data.mean(axis=0)</code> 과 <code>data.mean(axis=1)</code> 은 둘 다 "평균" 이지만 ' +
            '<b>shape 가 완전히 다르다</b> — 그 shape 만 봐도 어느 쪽 평균인지 알 수 있어야 한다.'
        }));

        var meanByDay = ND.mean(data, 0);   // (40,)
        var meanByPatient = ND.mean(data, 1); // (60,)

        root.appendChild(UI.code('data.mean(axis=0)   # ' + ND.shapeStr(meanByDay.shape) + ' ← axis 0(환자)이 사라졌다 = "날짜별" 평균\ndata.mean(axis=1)   # ' + ND.shapeStr(meanByPatient.shape) + ' ← axis 1(날짜)이 사라졌다 = "환자별" 평균'));

        root.appendChild(el('div', { class: 'panel-t', text: 'data.mean(axis=0) — 날짜별 평균, 길이 ' + meanByDay.shape[0] }));
        root.appendChild(UI.lineChart({
          series: [{ name: '날짜별 평균 염증', values: meanByDay.flatValues() }],
          x: meanByDay.flatValues().map(function (_, i) { return i; }),
          xLabel: 'day', yLabel: '평균 염증', yMin: 0
        }));

        root.appendChild(el('div', { class: 'panel-t', text: 'data.mean(axis=1) — 환자별 평균, 길이 ' + meanByPatient.shape[0] }));
        root.appendChild(UI.lineChart({
          series: [{ name: '환자별 평균 염증', values: meanByPatient.flatValues() }],
          x: meanByPatient.flatValues().map(function (_, i) { return i; }),
          xLabel: '환자 번호', yLabel: '평균 염증', yMin: 0
        }));

        root.appendChild(UI.callout('why',
          '두 그래프는 <b>모양 자체가 다르다.</b> 날짜별 평균(길이 40)은 시간이 지나며 염증이 오르내리는 patterns 을 보여 주고, ' +
          '환자별 평균(길이 60)은 환자마다 전반적인 염증 수준이 다르다는 것을 보여 준다. ' +
          '어느 축을 없앴는지가 그래프가 무엇을 말하는지를 결정한다.'));

        var amaxDay = ND.argmax(data, 1); // 환자별 최고 염증 날짜, (60,)
        var first12 = amaxDay.flatValues().slice(0, 12);
        root.appendChild(el('div', { class: 'panel-t', text: 'data.argmax(axis=1) — 환자마다 염증이 최고였던 날짜' }));
        root.appendChild(UI.code('data.argmax(axis=1)   # shape ' + ND.shapeStr(amaxDay.shape) + ' — 환자 60명, 각자의 "최고 염증 날짜"'));
        root.appendChild(UI.table(
          [{ k: 'p', label: '환자 번호' }, { k: 'd', label: '최고 염증 날짜 (argmax)' }],
          first12.map(function (v, i) { return { p: i, d: v }; })
        ));
        root.appendChild(UI.callout('tip',
          '<code>argmax(axis=1)</code> 은 <code>argmax(arr5)</code> 처럼 그냥 부르는 것보다 훨씬 유용하다. ' +
          '환자마다 <b>날짜 축(axis=1)만 따로</b> 최댓값 위치를 찾아 주기 때문이다 — 축을 지정하지 않으면 60×40칸을 통째로 편 뒤 ' +
          '하나의 평평한 위치만 알려 준다.'));
      }

      /* ==================================================== 8.2 수학 함수 */

      root.appendChild(el('h2', { class: 'h-sec', text: '8.2 수학 함수 — ufunc' }));
      root.appendChild(el('p', {
        html: 'NumPy 는 <code>np.함수(배열)</code> 형태로 쓰는 수학 함수를 아주 많이 제공한다. ' +
          '모두 배열의 <b>칸마다</b> 적용되는 ufunc(universal function)다.'
      }));

      root.appendChild(UI.table(
        [{ k: 'f', label: '함수' }, { k: 'd', label: '설명' }],
        [
          { f: 'np.sqrt', d: '제곱근 (음수 입력 → nan)' },
          { f: 'np.exp', d: '자연상수 e 의 거듭제곱' },
          { f: 'np.log / log2 / log10', d: '자연로그 / 밑2 / 밑10 로그' },
          { f: 'np.power(a, n)', d: 'a 의 n 제곱' },
          { f: 'np.abs', d: '절댓값' },
          { f: 'np.sign', d: '부호(-1, 0, 1)' },
          { f: 'np.round / floor / ceil / trunc', d: '반올림(은행가 방식) / 내림 / 올림 / 버림' },
          { f: 'np.sin / cos / tan / arcsin', d: '삼각함수 — 입력은 항상 라디안' },
          { f: 'np.deg2rad / rad2deg', d: '도(°) ↔ 라디안 변환' },
          { f: 'np.clip(a, lo, hi)', d: '범위를 벗어난 값을 lo·hi 로 잘라낸다' },
          { f: 'np.gcd / lcm', d: '최대공약수 / 최소공배수' },
          { f: 'np.cumsum', d: '누적합' }
        ]));

      /* ------------------------------------------------- 시뮬레이터 ③: 함수 적용기 */

      function bankersRound(x) {
        var f = Math.floor(x), diff = x - f;
        if (diff < 0.5) return f;
        if (diff > 0.5) return f + 1;
        return (f % 2 === 0) ? f : f + 1;
      }
      function gcdOf(a, b) { a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b)); while (b) { var t = b; b = a % b; a = t; } return a; }
      function lcmOf(a, b) { a = Math.trunc(a); b = Math.trunc(b); if (a === 0 || b === 0) return 0; return Math.abs(a * b) / gcdOf(a, b); }

      var FUNCS = [
        { v: 'sqrt', label: 'sqrt', kind: 'u', fn: Math.sqrt, py: 'np.sqrt(a)' },
        { v: 'exp', label: 'exp', kind: 'u', fn: Math.exp, py: 'np.exp(a)' },
        { v: 'log', label: 'log', kind: 'u', fn: Math.log, py: 'np.log(a)' },
        { v: 'log2', label: 'log2', kind: 'u', fn: Math.log2, py: 'np.log2(a)' },
        { v: 'log10', label: 'log10', kind: 'u', fn: Math.log10, py: 'np.log10(a)' },
        { v: 'abs', label: 'abs', kind: 'u', fn: Math.abs, py: 'np.abs(a)' },
        { v: 'sign', label: 'sign', kind: 'u', fn: Math.sign, py: 'np.sign(a)' },
        { v: 'round', label: 'round(은행가)', kind: 'u', fn: bankersRound, py: 'np.round(a)' },
        { v: 'floor', label: 'floor', kind: 'u', fn: Math.floor, py: 'np.floor(a)' },
        { v: 'ceil', label: 'ceil', kind: 'u', fn: Math.ceil, py: 'np.ceil(a)' },
        { v: 'trunc', label: 'trunc', kind: 'u', fn: Math.trunc, py: 'np.trunc(a)' },
        { v: 'sin', label: 'sin(라디안)', kind: 'u', fn: Math.sin, py: 'np.sin(a)' },
        { v: 'cos', label: 'cos(라디안)', kind: 'u', fn: Math.cos, py: 'np.cos(a)' },
        { v: 'arcsin', label: 'arcsin', kind: 'u', fn: Math.asin, py: 'np.arcsin(a)' },
        { v: 'deg2rad', label: 'deg2rad', kind: 'u', fn: function (x) { return x * Math.PI / 180; }, py: 'np.deg2rad(a)' },
        { v: 'rad2deg', label: 'rad2deg', kind: 'u', fn: function (x) { return x * 180 / Math.PI; }, py: 'np.rad2deg(a)' },
        { v: 'power', label: 'power(n제곱)', kind: 'power', py: 'np.power(a, n)' },
        { v: 'clip', label: 'clip(자르기)', kind: 'clip', py: 'np.clip(a, lo, hi)' },
        { v: 'gcd', label: 'gcd(vs 12)', kind: 'u', fn: function (x) { return gcdOf(x, 12); }, py: 'np.gcd(a, 12)' },
        { v: 'lcm', label: 'lcm(vs 12)', kind: 'u', fn: function (x) { return lcmOf(x, 12); }, py: 'np.lcm(a, 12)' },
        { v: 'cumsum', label: 'cumsum', kind: 'cumsum', py: 'np.cumsum(a)' }
      ];
      function funcOf(v) { for (var i = 0; i < FUNCS.length; i++) if (FUNCS[i].v === v) return FUNCS[i]; return FUNCS[0]; }

      (function () {
        var state = { input: 'range', fnv: 'sqrt', n: 2, lo: -1, hi: 1 };
        var host = el('div');
        var extraHost = el('div');

        function inputArr() {
          return state.input === 'range' ? ND.arange(-3, 4, 1, 'float64') : ND.linspace(0, 360, 13);
        }

        function computeResult(a) {
          var f = funcOf(state.fnv);
          if (f.kind === 'power') return ND.ops.pow(a, state.n);
          if (f.kind === 'clip') return ND.unop(a, function (x) { return Math.min(state.hi, Math.max(state.lo, x)); });
          if (f.kind === 'cumsum') return ND.cumsum(a);
          return ND.unop(a, f.fn);
        }

        function buildExtra() {
          UI.clear(extraHost);
          var f = funcOf(state.fnv);
          if (f.kind === 'power') {
            extraHost.appendChild(UI.controls([UI.slider({
              label: 'n', min: -3, max: 5, step: 1, value: state.n,
              format: function (v) { return String(v); },
              onChange: function (v) { state.n = v; rebuild(); }
            })]));
          } else if (f.kind === 'clip') {
            extraHost.appendChild(UI.controls([
              UI.slider({ label: 'lo', min: -3, max: 3, step: 1, value: state.lo, format: function (v) { return String(v); }, onChange: function (v) { state.lo = v; rebuild(); } }),
              UI.slider({ label: 'hi', min: -3, max: 3, step: 1, value: state.hi, format: function (v) { return String(v); }, onChange: function (v) { state.hi = v; rebuild(); } })
            ]));
          }
        }

        function rebuild() {
          UI.clear(host);
          var a = inputArr();
          var r = computeResult(a);
          var xs = a.flatValues();

          host.appendChild(UI.code((state.input === 'range' ? 'a = np.arange(-3, 4)' : 'a = np.linspace(0, 360, 13)') + '\n' + funcOf(state.fnv).py));
          host.appendChild(UI.out(ND.format(r)));
          host.appendChild(UI.lineChart({
            series: [{ name: funcOf(state.fnv).label, values: r.flatValues() }],
            x: xs, xLabel: '입력값', yLabel: '출력값'
          }));
          host.appendChild(UI.table(
            [{ k: 'i', label: '입력', num: true }, { k: 'o', label: '출력', num: true }],
            xs.map(function (xv, i) { return { i: fmtN(xv), o: fmtN(r.flatValues()[i]) }; })
          ));
        }

        var inputSeg = UI.seg({
          label: '입력 배열', value: state.input,
          options: [{ value: 'range', label: 'np.arange(-3, 4)' }, { value: 'deg', label: 'np.linspace(0, 360, 13)' }],
          onChange: function (v) { state.input = v; rebuild(); }
        });
        var fnSeg2 = UI.seg({
          label: '함수', value: state.fnv,
          options: FUNCS.map(function (f) { return { value: f.v, label: f.label }; }),
          onChange: function (v) { state.fnv = v; buildExtra(); rebuild(); }
        });

        buildExtra();
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '함수 적용기',
          note: '함수를 골라 입력 배열에 적용해 보라. 입력 → 출력 대응을 그래프와 표로 함께 보여 준다. ' +
            '<code>sqrt</code>·<code>log</code> 에 음수나 0을 넣으면 실제 NumPy 처럼 <code>nan</code>·<code>-inf</code> 가 나온다.',
          body: [UI.controls([inputSeg, fnSeg2]), extraHost, host]
        }));
      })();

      // 도(deg) vs 라디안(rad)
      root.appendChild(el('h3', { class: 'h-sub', text: '삼각함수는 라디안을 쓴다' }));
      (function () {
        var wrongVal = Math.sin(30);
        var rightVal = Math.sin(30 * Math.PI / 180);
        root.appendChild(el('p', {
          html: '<code>np.sin(30)</code> 은 <b>sin 30°</b> 가 아니다. NumPy 의 삼각함수는 항상 <b>라디안</b> 입력을 기대한다. ' +
            '30 을 그대로 넣으면 "30 라디안(약 1719°)의 sin" 을 계산하는 것이다.'
        }));
        root.appendChild(UI.code('np.sin(30)                  # 30 라디안의 sin — 원하는 값이 아니다\nnp.sin(np.deg2rad(30))       # 30°를 라디안으로 바꾼 뒤 sin — sin 30° = 0.5'));
        root.appendChild(UI.table(
          [{ k: 'e', label: '식' }, { k: 'v', label: '값' }, { k: 'm', label: '의미' }],
          [
            { e: 'np.sin(30)', v: UI.round2(wrongVal), m: '30 라디안의 sin — 도(°) 로 계산한 게 아니다' },
            { e: 'np.sin(np.deg2rad(30))', v: UI.round2(rightVal), m: 'sin 30° — 원하던 값' }
          ]));
        root.appendChild(UI.callout('trap',
          '각도(°) 를 넣고 싶으면 반드시 <code>np.deg2rad()</code> 로 먼저 라디안으로 바꿔야 한다. ' +
          '이걸 잊는 것이 과학고 학생이 삼각함수를 쓸 때 가장 흔히 저지르는 실수다.'));
      })();

      // 은행가 반올림
      root.appendChild(el('h3', { class: 'h-sub', text: 'np.round 는 은행가 반올림이다' }));
      (function () {
        var xs = [0.5, 1.5, 2.5, 3.5];
        root.appendChild(el('p', {
          html: '학교에서 배운 반올림은 0.5 를 항상 위로 올린다. <b>NumPy 의 <code>np.round</code> 는 다르다</b> — ' +
            '.5 를 만나면 <b>가까운 짝수</b>로 반올림한다("은행가 반올림", banker’s rounding).'
        }));
        root.appendChild(UI.code('np.round([0.5, 1.5, 2.5, 3.5])'));
        root.appendChild(UI.table(
          [{ k: 'x', label: '입력', num: true }, { k: 'np', label: 'np.round(x)', num: true }, { k: 'js', label: 'JS Math.round(x) (참고)', num: true }],
          xs.map(function (x) { return { x: x, np: bankersRound(x).toFixed(1), js: Math.round(x).toFixed(1) }; })
        ));
        root.appendChild(UI.callout('trap',
          '<code>np.round(0.5)</code> → <b>0.0</b>, <code>np.round(2.5)</code> → <b>2.0</b> 이다(모두 가까운 짝수로). ' +
          '자바스크립트의 <code>Math.round</code> 는 반대로 .5 를 항상 위로 올린다(<code>Math.round(0.5) === 1</code>). ' +
          '두 언어가 서로 다른 규칙을 쓴다는 것을 알아 두지 않으면 반올림 결과가 안 맞는 버그를 만든다.'));
      })();

      // exp 표기
      (function () {
        var big = ND.unop(arr5, Math.exp);
        root.appendChild(el('h3', { class: 'h-sub', text: 'np.exp 의 큰 수는 지수 표기로 나온다' }));
        root.appendChild(UI.code('np.exp(arr5)'));
        root.appendChild(UI.out(ND.format(big)));
        root.appendChild(UI.callout('tip',
          '값이 커지면 NumPy 는 출력을 <b>지수 표기</b>(<code>1.23e+05</code> 같은 형태)로 자동 전환한다. ' +
          '출력 형식만 그런 것이고 값 자체가 바뀌는 것은 아니다. ' +
          '표기 방식은 <code>np.set_printoptions(precision=…, suppress=True)</code> 로 조절할 수 있다 ' +
          '(<code>suppress=True</code> 는 지수 표기를 끄고 일반 소수로 보여 준다).'));
      })();

      // pi, e
      root.appendChild(UI.statRow([
        { k: 'np.pi', v: Math.PI.toFixed(10) },
        { k: 'np.e', v: Math.E.toFixed(10) }
      ]));

      // 과제 3번 추천 조합
      root.appendChild(el('h3', { class: 'h-sub', text: '과제 3번(수학 함수 예제)에 참고할 조합' }));
      root.appendChild(el('p', {
        html: '과제는 <b>학생이 직접 5개를 골라야</b> 한다. 여기서는 조합 하나만 완성 예제로 보여 준다 — 그대로 베끼지 말고 참고만 하라.'
      }));
      (function () {
        var s16 = ND.array([16, 25, 36]);
        var sq = ND.unop(s16, Math.sqrt);
        var rr = [2.5, 3.5].map(bankersRound);
        var cosv = Math.cos(60 * Math.PI / 180);
        var powv = ND.ops.pow(ND.arange(1, 6), 2);
        var cumv = ND.cumsum(ND.arange(1, 6));
        root.appendChild(UI.table(
          [{ k: 'f', label: '함수' }, { k: 'c', label: '코드' }, { k: 'r', label: '결과' }],
          [
            { f: 'sqrt', c: 'np.sqrt([16, 25, 36])', r: ND.format(sq) },
            { f: 'round', c: 'np.round([2.5, 3.5])', r: '[' + rr.join('. ') + '.]' },
            { f: 'cos + deg2rad', c: 'np.cos(np.deg2rad(60))', r: UI.round2(cosv) },
            { f: 'power', c: 'np.power(np.arange(1, 6), 2)', r: ND.format(powv) },
            { f: 'cumsum', c: 'np.cumsum(np.arange(1, 6))', r: ND.format(cumv) }
          ]));
      })();

      /* ===================================================================== 퀴즈 */

      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
      root.appendChild(UI.quiz([
        {
          q: 'shape <code>(3, 4)</code> 인 배열에 <code>np.sum(a, axis=1)</code> 을 하면 결과의 shape 는?',
          choices: ['<code>(4,)</code>', '<code>(3,)</code>', '<code>(3, 4)</code>', '스칼라 (shape 없음)'],
          answer: 1,
          explain: 'axis=1 은 shape 튜플의 <b>1번째 자리(값 4)</b>가 사라진다는 뜻이다. 남는 것은 0번째 자리인 3 뿐이므로 결과 shape 는 <code>(3,)</code> 이다.'
        },
        {
          q: 'shape <code>(3, 4)</code> 인 배열에 <code>a.sum(axis=0, keepdims=True)</code> 를 하면 결과의 shape 는?',
          choices: ['<code>(4,)</code>', '<code>(1, 4)</code>', '<code>(3, 1)</code>', '<code>(3, 4)</code>'],
          answer: 1,
          explain: 'axis=0 이 사라지는 대신 keepdims=True 는 그 자리를 <b>지우지 않고 크기 1 로 남긴다.</b> 그래서 <code>(3, 4)</code> 의 0번째 자리가 1 이 되어 <code>(1, 4)</code> 다.'
        },
        {
          q: '<code>np.round(2.5)</code> 의 결과는?',
          choices: ['<code>2.0</code>', '<code>3.0</code>', '<code>2</code> (정수)', '에러가 난다'],
          answer: 0,
          explain: 'NumPy 의 반올림은 은행가 반올림이라 .5 는 <b>가까운 짝수</b>로 간다. 2 와 3 중 짝수인 2 로 반올림되어 <code>2.0</code> 이다.'
        },
        {
          q: '2차원 배열 <code>a</code>(shape (3,4))에 대해 <code>a.argmax()</code>(axis 없이)가 돌려주는 것은?',
          choices: [
            '최댓값이 있는 (행, 열) 튜플',
            '배열을 1차원으로 편 뒤의 평평한 위치 하나(정수)',
            '최댓값 그 자체',
            '축마다 하나씩, 총 2개의 위치'
          ],
          answer: 1,
          explain: 'axis 를 주지 않은 <code>argmax</code> 는 배열 전체를 1차원으로 편 뒤의 <b>평평한 인덱스</b> 하나만 준다. ' +
            '(행, 열) 위치로 되돌리려면 <code>np.unravel_index(idx, a.shape)</code> 를 따로 써야 한다.'
        }
      ], { id: 'axis' }));
    }
  });
})();
