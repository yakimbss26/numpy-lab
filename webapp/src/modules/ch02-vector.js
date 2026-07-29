/* ===========================================================================
 * ch02-vector.js — 2장 벡터와 행렬 — NumPy를 위한 수학
 * 슬라이드 21장(벡터 1~9, 행렬 10~21) 전체 대응.
 * 이 장은 4~9장에서 쓸 "축(axis)", "브로드캐스팅", "행렬곱" 의 수학적 뿌리다.
 * 벡터·행렬을 아직 배우지 않은 학생 기준으로, 그림에 의존했던 슬라이드를
 * 조작 가능한 시뮬레이터로 대체한다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* ------------------------------------------------------------ 공용 도우미 */

  function panel(kind, title, body) {
    return el('div', null, [el('div', { class: 'panel-t' + (kind ? ' ' + kind : ''), text: title })]
      .concat(body || []));
  }
  function op(sym) { return el('span', { class: 'op', text: sym }); }
  function r2(v) { return UI.round2(v); }
  function bad(text) { return el('b', { style: { color: 'var(--critical)' }, text: text }); }

  var SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '-': '₋', n: 'ₙ' };
  function sub(n) { return String(n).split('').map(function (c) { return SUB[c] || c; }).join(''); }
  /** 음수는 괄호로 감싸 "-1²" 같은 부호 오독을 막는다 */
  function pnum(v) { return v < 0 ? '(' + r2(v) + ')' : r2(v); }

  function cellsOf(node) { return Array.prototype.slice.call(node.querySelectorAll('.cell')); }
  var HLC = { a: 'hl-a', b: 'hl-b', r: 'hl-r', x: 'hl-x', err: 'hl-err', dim: 'hl-dim', ghost: 'hl-ghost' };
  function repaint(cells, arr, fn) {
    var idxs = arr.indices();
    for (var i = 0; i < cells.length && i < idxs.length; i++) {
      cells[i].className = 'cell';
      var h = fn(idxs[i]);
      if (h && HLC[h]) cells[i].classList.add(HLC[h]);
    }
  }

  Lab.register({
    id: 'vector',
    n: '2',
    title: '벡터와 행렬 — NumPy를 위한 수학',
    blurb: '벡터의 크기·내적·사잇각부터 행렬곱이 한 칸씩 채워지는 과정까지, NumPy 가 다루는 수의 정체를 손으로 만져 본다.',
    sim: '벡터 실험판 · K-최근접 이웃(K-NN) 데모 · 행렬곱 단계별 시각화 · 미니 신경망 한 층',

    render: function (root) {

      root.appendChild(el('p', {
        class: 'lede',
        html: '이 장은 코드보다 <b>수학이 먼저</b>다. 벡터·행렬을 한 번도 배우지 않았어도 괜찮다 — ' +
          '이 앱의 모든 배열 연산은 결국 여기서 정의하는 몇 가지 개념(크기, 내적, 행렬곱)의 반복이다. ' +
          '4장 이후에 나올 "축(axis)", "브로드캐스팅", "행렬곱" 은 전부 이 장에서 만든 그림 위에 쌓인다.'
      }));

      /* =======================================================================
       * 2.1 스칼라와 벡터
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '2.1 스칼라와 벡터' }));
      root.appendChild(el('p', {
        html: '<b>스칼라(scalar)</b>는 크기만 있는 양이다 — 속력, 압력, 삼각형의 넓이처럼 숫자 하나로 끝난다. ' +
          '<b>벡터(vector)</b>는 크기에 <b>방향</b>까지 더해진 양이다 — 속도, 힘, 가속도가 그렇다. ' +
          '벡터는 굵은 소문자 <b>u, v, w</b> 로 쓰고, 시점 P 에서 종점 Q 로 가는 화살표로 그린다.'
      }));

      var v0 = ND.array([3, 4]);
      root.appendChild(el('div', { class: 'stack-2' }, [
        el('div', null, [
          el('div', { class: 'panel-t', text: '스칼라 — 0차원' }),
          UI.code('speed = np.array(5)\nspeed.ndim, speed.shape'),
          UI.out('(0, ' + ND.shapeStr([]) + ')')
        ]),
        el('div', null, [
          el('div', { class: 'panel-t a', text: '벡터 — 1차원' }),
          UI.code('v = np.array([3, 4])\nv.ndim, v.shape'),
          UI.out('(' + v0.ndim + ', ' + ND.shapeStr(v0.shape) + ')')
        ])
      ]));
      root.appendChild(UI.callout('why',
        '숫자 하나(스칼라)는 <code>shape ()</code>, 즉 축이 <b>0개</b>다. ' +
        '벡터는 축이 <b>1개</b>인 배열이다. "차원이 늘어난다"는 것은 결국 "축이 늘어난다"는 뜻이고, ' +
        '이 대응은 이 교재 전체에서 한 번도 깨지지 않는다.'));

      /* --------------------------------------------------- 시뮬레이터 ①: 벡터 실험판 */

      (function () {
        var PRESETS = [
          { l: '수직 (u·v=0)', u: { x: 3, y: 4 }, v: { x: 4, y: -3 } },
          { l: '같은 방향', u: { x: 2, y: 3 }, v: { x: 4, y: 6 } },
          { l: '반대 방향', u: { x: 2, y: 3 }, v: { x: -2, y: -3 } },
          { l: '3-4-5 직각삼각형', u: { x: 4, y: 0 }, v: { x: 0, y: 3 } },
          { l: '45°', u: { x: 2, y: 0 }, v: { x: 2, y: 2 } },
          { l: '거리 예 (1,2)-(4,6)→5', u: { x: 1, y: 2 }, v: { x: 4, y: 6 } }
        ];

        var state = { u: { x: 3, y: 4 }, v: { x: -1, y: 2 }, k: 2, overlay: 'sum' };
        var vectors = [
          { x: state.u.x, y: state.u.y, name: 'u', color: 'var(--s1)' },
          { x: state.v.x, y: state.v.y, name: 'v', color: 'var(--s2)' }
        ];
        var extras = [];

        function syncOverlay() {
          vectors.length = 2;
          vectors[0].x = state.u.x; vectors[0].y = state.u.y;
          vectors[1].x = state.v.x; vectors[1].y = state.v.y;
          extras.length = 0;
          if (state.overlay === 'sum') {
            var sx = state.u.x + state.v.x, sy = state.u.y + state.v.y;
            vectors.push({ x: sx, y: sy, name: 'u+v', color: 'var(--s3)' });
            extras.push({ type: 'line', x1: state.u.x, y1: state.u.y, x2: sx, y2: sy, dashed: true, color: 'var(--s2)' });
            extras.push({ type: 'line', x1: state.v.x, y1: state.v.y, x2: sx, y2: sy, dashed: true, color: 'var(--s1)' });
          } else if (state.overlay === 'diff') {
            var dx = state.u.x - state.v.x, dy = state.u.y - state.v.y;
            vectors.push({ x: dx, y: dy, name: 'u−v', color: 'var(--s3)' });
            extras.push({ type: 'line', x1: state.v.x, y1: state.v.y, x2: state.u.x, y2: state.u.y, dashed: true, color: 'var(--s3)' });
          } else if (state.overlay === 'scalar') {
            vectors.push({ x: state.k * state.u.x, y: state.k * state.u.y, name: r2(state.k) + '·u', color: 'var(--s3)' });
          } else if (state.overlay === 'distance') {
            extras.push({ type: 'line', x1: state.u.x, y1: state.u.y, x2: state.v.x, y2: state.v.y, dashed: true, color: 'var(--ink-muted)' });
          }
        }
        syncOverlay();

        var plot = UI.vectorPlot({
          vectors: vectors, extras: extras, range: 8, height: 340,
          draggable: [0, 1],
          onDrag: function (i, x, y) {
            if (i === 0) { state.u.x = x; state.u.y = y; } else { state.v.x = x; state.v.y = y; }
            syncOverlay(); plot.redraw(); updateReadout();
          }
        });

        var readout = el('div');

        function updateReadout() {
          UI.clear(readout);
          var U = ND.array([state.u.x, state.u.y], 'float64');
          var V = ND.array([state.v.x, state.v.y], 'float64');
          var normU = ND.norm(U), normV = ND.norm(V);
          var sum = ND.ops.add(U, V), diff = ND.ops.sub(U, V), scal = ND.ops.mul(U, state.k);
          var dot1 = ND.matmul(U, V).toNested();
          var dot2 = ND.sum(ND.ops.mul(U, V)).toNested();
          var sameDot = Math.abs(dot1 - dot2) < 1e-9;
          var dist = ND.norm(diff);

          readout.appendChild(UI.statRow([
            { k: 'u', v: '(' + r2(state.u.x) + ', ' + r2(state.u.y) + ')', sub: 'shape (2,)' },
            { k: 'v', v: '(' + r2(state.v.x) + ', ' + r2(state.v.y) + ')', sub: 'shape (2,)' }
          ]));

          readout.appendChild(el('h3', { class: 'h-sub', text: '크기(노름) ‖u‖, ‖v‖' }));
          readout.appendChild(UI.code('np.linalg.norm(u)   # 이 앱에서는 ND.norm(u)'));
          readout.appendChild(UI.out(
            '‖u‖ = √(' + pnum(state.u.x) + '² + ' + pnum(state.u.y) + '²) = √' + r2(state.u.x * state.u.x + state.u.y * state.u.y) + ' = ' + r2(normU) + '\n' +
            '‖v‖ = √(' + pnum(state.v.x) + '² + ' + pnum(state.v.y) + '²) = √' + r2(state.v.x * state.v.x + state.v.y * state.v.y) + ' = ' + r2(normV)
          ));
          readout.appendChild(UI.callout('why',
            '피타고라스 정리와 완전히 같은 식이다. 직각삼각형의 빗변 길이를 구하듯, ' +
            '원점에서 종점까지의 화살표 길이를 성분의 제곱합의 제곱근으로 구한다.'));

          readout.appendChild(el('h3', { class: 'h-sub', text: '합과 차 — 성분끼리' }));
          readout.appendChild(UI.table(
            [{ k: 'e', label: '식' }, { k: 'c', label: '성분별 계산' }, { k: 'r', label: '결과' }],
            [
              { e: 'u + v', c: '(' + r2(state.u.x) + '+' + pnum(state.v.x) + ',  ' + r2(state.u.y) + '+' + pnum(state.v.y) + ')', r: '(' + r2(sum.get([0])) + ', ' + r2(sum.get([1])) + ')' },
              { e: 'u − v', c: '(' + r2(state.u.x) + '−' + pnum(state.v.x) + ',  ' + r2(state.u.y) + '−' + pnum(state.v.y) + ')', r: '(' + r2(diff.get([0])) + ', ' + r2(diff.get([1])) + ')' }
            ]));

          readout.appendChild(el('h3', { class: 'h-sub', text: '스칼라배 k·u' }));
          readout.appendChild(UI.code('k = ' + r2(state.k) + '\nk * u'));
          readout.appendChild(UI.out('(' + r2(scal.get([0])) + ', ' + r2(scal.get([1])) + ')   (원래 u = (' + r2(state.u.x) + ', ' + r2(state.u.y) + '))'));
          readout.appendChild(UI.callout('tip',
            state.k < 0
              ? '<b>k 가 음수</b>면 방향이 정반대로 뒤집힌다. 길이는 |k| 배가 된다.'
              : (Math.abs(state.k) > 1
                ? '<b>|k| > 1</b> 이면 방향은 그대로, 길이만 <b>' + r2(Math.abs(state.k)) + '배</b> 늘어난다.'
                : '<b>|k| < 1</b> 이면 방향은 그대로, 길이만 줄어든다.')));

          readout.appendChild(el('h3', { class: 'h-sub', text: '내적 u·v — 결과는 벡터가 아니라 스칼라' }));
          readout.appendChild(UI.code('np.dot(u, v)\nu @ v\nnp.sum(u * v)'));
          readout.appendChild(UI.table(
            [{ k: 'e', label: '식' }, { k: 'v', label: '값' }],
            [
              { e: '전개: u₁v₁ + u₂v₂', v: pnum(state.u.x) + '×' + pnum(state.v.x) + ' + ' + pnum(state.u.y) + '×' + pnum(state.v.y) + ' = ' + r2(dot1) },
              { e: 'np.dot(u, v)  ·  u @ v', v: r2(dot1) },
              { e: 'np.sum(u * v)', v: r2(dot2) }
            ]));
          readout.appendChild(UI.statRow([{ k: '세 식의 값이 모두 같은가', v: sameDot ? 'True' : 'False' }]));
          readout.appendChild(UI.callout('why',
            '내적의 결과에는 <b>shape 가 없다</b> — 0차원, 즉 <b>스칼라</b> 하나다. ' +
            '두 벡터를 "하나의 숫자"로 접어 버리는 연산이라고 생각하면 된다. ' +
            '<code>np.dot</code>, <code>@</code>, <code>np.sum(u*v)</code> 는 이름만 다를 뿐 완전히 같은 계산이다.'));
          if (Math.abs(dot1) < 1e-9) {
            readout.appendChild(UI.callout('tip', '<b>u·v = 0 → 두 벡터는 정확히 수직이다.</b>', '수직!'));
          }

          readout.appendChild(el('h3', { class: 'h-sub', text: '사잇각 θ' }));
          if (normU < 1e-9 || normV < 1e-9) {
            readout.appendChild(UI.callout('trap', '길이가 0인 벡터와는 사잇각을 정의할 수 없다.'));
          } else {
            var cosT = Math.max(-1, Math.min(1, dot1 / (normU * normV)));
            var deg = Math.acos(cosT) * 180 / Math.PI;
            readout.appendChild(UI.code('theta = np.degrees(np.arccos(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v))))'));
            readout.appendChild(UI.out('θ = arccos(' + r2(dot1) + ' / (' + r2(normU) + ' × ' + r2(normV) + ')) = ' + r2(deg) + '°'));
            readout.appendChild(UI.callout('why',
              dot1 > 1e-9 ? '내적이 <b>양수</b> → 사잇각이 90° 보다 작다. 두 벡터가 대체로 같은 방향을 향한다.'
                : (dot1 < -1e-9 ? '내적이 <b>음수</b> → 사잇각이 90° 보다 크다. 두 벡터가 대체로 반대 방향을 향한다.'
                  : '내적이 <b>0</b> → 사잇각이 정확히 90°다.')));
          }

          readout.appendChild(el('h3', { class: 'h-sub', text: '유클리드 거리 d(u, v) = ‖u − v‖' }));
          readout.appendChild(UI.code('np.linalg.norm(u - v)'));
          readout.appendChild(UI.out('d(u, v) = ‖(' + r2(diff.get([0])) + ', ' + r2(diff.get([1])) + ')‖ = ' + r2(dist)));
        }
        updateReadout();

        var overlaySeg = UI.seg({
          label: '주 그림에서 보여줄 것', value: 'sum',
          options: [{ value: 'sum', label: 'u+v' }, { value: 'diff', label: 'u−v' }, { value: 'scalar', label: 'k·u' }, { value: 'distance', label: '거리' }],
          onChange: function (v) { state.overlay = v; syncOverlay(); plot.redraw(); updateReadout(); }
        });
        var kSlider = UI.slider({
          label: 'k (스칼라배)', min: -3, max: 3, step: 0.5, value: 2,
          onChange: function (v) { state.k = v; if (state.overlay === 'scalar') { syncOverlay(); plot.redraw(); } updateReadout(); }
        });
        var chipRow = UI.chips(PRESETS.map(function (p, i) { return { value: String(i), label: p.l }; }), function (i) {
          var p = PRESETS[Number(i)];
          state.u = { x: p.u.x, y: p.u.y }; state.v = { x: p.v.x, y: p.v.y };
          syncOverlay(); plot.redraw(); updateReadout();
        });

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '벡터 실험판 — u, v 를 손으로 끌어 보라',
          note: '파란 화살표 <b>u</b> 와 주황 화살표 <b>v</b> 를 마우스로 끌면 아래 모든 값이 그 자리에서 다시 계산된다. ' +
            '위 버튼으로 주 그림에 무엇을 겹쳐 그릴지 고르고, 아래 칩으로 딱 맞는 예를 불러와 보라.',
          body: [
            UI.controls([overlaySeg, kSlider]),
            chipRow,
            plot,
            UI.legend([
              { color: 'var(--s1)', label: 'u' }, { color: 'var(--s2)', label: 'v' },
              { color: 'var(--s3)', label: '합 · 차 · 스칼라배의 결과' }
            ]),
            readout
          ]
        }));

        root.appendChild(el('h3', { class: 'h-sub', text: '크기가 다른 벡터끼리는 애초에 더할 수 없다' }));
        root.appendChild(UI.code('u = np.array([1, 2])       # shape (2,)\nv = np.array([1, 2, 3])    # shape (3,)\nu + v'));
        try {
          ND.ops.add(ND.array([1, 2]), ND.array([1, 2, 3]));
        } catch (e) {
          root.appendChild(UI.errBlock(e.message));
        }
        root.appendChild(UI.callout('why',
          '벡터의 합은 "같은 개수의 성분끼리" 라는 정의 자체가 전제다. ' +
          '7장에서 배울 브로드캐스팅 규칙으로 봐도 마지막 축이 <b>2와 3으로 다르고 둘 다 1이 아니므로</b> 실패한다. ' +
          '수학의 정의와 NumPy 의 에러가 정확히 같은 이유에서 나온다.'));
      })();

      /* =======================================================================
       * 2.2 유클리드 거리의 일반화
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '2.2 유클리드 거리의 일반화' }));
      root.appendChild(el('p', {
        html: '2차원에서 본 거리 개념은 <b>n차원</b>으로 그대로 확장된다. ' +
          '점 P(p₁, …, pₙ) 와 Q(q₁, …, qₙ) 사이의 거리는 각 성분 차이의 제곱을 모두 더해 제곱근을 씌운 것이다.'
      }));
      root.appendChild(UI.ascii(
        'd(P, Q) = √( (p' + sub(1) + ' − q' + sub(1) + ')² + (p' + sub(2) + ' − q' + sub(2) + ')² + … + (p' + sub('n') + ' − q' + sub('n') + ')² )\n' +
        '        = √ Σᵢ (pᵢ − qᵢ)²\n' +
        '        = ‖P − Q‖                    <- 노름(norm)과 완전히 같은 식이다'
      ));
      root.appendChild(UI.callout('tip',
        '이 거리 개념은 <b>K-평균(K-means)</b>, <b>K-최근접 이웃(K-NN)</b> 같은 분류·클러스터링 알고리즘의 재료다. ' +
        '"가깝다" 를 숫자로 정의하는 방법이 바로 이 유클리드 거리이기 때문이다.'));

      (function () {
        var W = 320, H = 320, pad = 24, domain = 10;
        function X(x) { return pad + x / domain * (W - 2 * pad); }
        function Y(y) { return H - pad - y / domain * (H - 2 * pad); }
        function invX(px) { return (px - pad) / (W - 2 * pad) * domain; }
        function invY(py) { return domain - (py - pad) / (H - 2 * pad) * domain; }

        var classA = [[2, 2], [3, 3], [2, 4], [4, 2], [3, 1]].map(function (p) { return { x: p[0], y: p[1], cls: 'A' }; });
        var classB = [[7, 7], [8, 6], [7, 8], [8, 8], [6, 7]].map(function (p) { return { x: p[0], y: p[1], cls: 'B' }; });
        var pts = classA.concat(classB);
        function classColor(c) { return c === 'A' ? 'var(--s1)' : 'var(--s2)'; }

        var state = { k: 3, query: null };
        var svg = UI.svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', style: 'max-width:' + W + 'px;touch-action:none;' });
        var host = el('div', { class: 'chart' }, [svg]);
        var info = el('div');
        var tableHost = el('div');

        function distancesFromQuery() {
          var qArr = ND.array([state.query.x, state.query.y], 'float64');
          return pts.map(function (p) {
            var d = ND.norm(ND.ops.sub(qArr, ND.array([p.x, p.y], 'float64')));
            return { p: p, d: d };
          }).sort(function (a, b) { return a.d - b.d; });
        }

        function draw() {
          UI.clear(svg);
          svg.appendChild(UI.svgEl('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'none', stroke: 'var(--border)' }));
          for (var g = 0; g <= domain; g += 2) {
            svg.appendChild(UI.svgEl('line', { class: 'gridline', x1: X(g), y1: pad, x2: X(g), y2: H - pad }));
            svg.appendChild(UI.svgEl('line', { class: 'gridline', x1: pad, y1: Y(g), x2: W - pad, y2: Y(g) }));
          }
          var neighbors = state.query ? distancesFromQuery().slice(0, state.k) : [];
          if (state.query) {
            neighbors.forEach(function (n) {
              svg.appendChild(UI.svgEl('line', {
                x1: X(state.query.x), y1: Y(state.query.y), x2: X(n.p.x), y2: Y(n.p.y),
                stroke: 'var(--ink-muted)', 'stroke-dasharray': '4 3', 'stroke-width': 1.3
              }));
            });
          }
          pts.forEach(function (p) {
            var isN = neighbors.some(function (n) { return n.p === p; });
            svg.appendChild(UI.svgEl('circle', {
              cx: X(p.x), cy: Y(p.y), r: 7, fill: classColor(p.cls),
              stroke: isN ? 'var(--s4)' : 'none', 'stroke-width': isN ? 3 : 0
            }));
          });
          if (state.query) {
            svg.appendChild(UI.svgEl('circle', { cx: X(state.query.x), cy: Y(state.query.y), r: 8, fill: 'var(--s4)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
            svg.appendChild(UI.svgEl('text', { class: 'tick', x: X(state.query.x) + 10, y: Y(state.query.y) - 10, text: '새 점' }));
          }
          var hit = UI.svgEl('rect', { x: pad, y: pad, width: W - 2 * pad, height: H - 2 * pad, fill: 'transparent', style: 'cursor:crosshair' });
          hit.addEventListener('click', function (ev) {
            var r = svg.getBoundingClientRect();
            var px = (ev.clientX - r.left) / r.width * W, py = (ev.clientY - r.top) / r.height * H;
            var x = Math.round(invX(px) * 10) / 10, y = Math.round(invY(py) * 10) / 10;
            state.query = { x: Math.max(0, Math.min(domain, x)), y: Math.max(0, Math.min(domain, y)) };
            draw(); updateInfo();
          });
          svg.appendChild(hit);
        }

        function updateInfo() {
          UI.clear(info); UI.clear(tableHost);
          if (!state.query) {
            info.appendChild(el('p', { class: 'small', text: '평면을 클릭해 분류할 새 점을 놓아 보라.' }));
            return;
          }
          var rows = distancesFromQuery();
          var kRows = rows.slice(0, state.k);
          var voteA = kRows.filter(function (r) { return r.p.cls === 'A'; }).length;
          var voteB = kRows.length - voteA;
          var pred = voteA > voteB ? 'A (파랑)' : (voteB > voteA ? 'B (주황)' : '동률');
          info.appendChild(UI.statRow([
            { k: '새 점', v: '(' + state.query.x + ', ' + state.query.y + ')' },
            { k: 'k', v: state.k },
            { k: 'k개 중 A', v: voteA },
            { k: 'k개 중 B', v: voteB },
            { k: '예측 부류', v: pred }
          ]));
          var cols = [
            { k: 'cls', label: '부류' }, { k: 'x', label: 'x', num: true }, { k: 'y', label: 'y', num: true },
            { k: 'd', label: 'd(새 점, p)', num: true }, { k: 'in', label: 'k에 포함' }
          ];
          var trows = rows.map(function (rr, i) {
            return { cls: rr.p.cls, x: rr.p.x, y: rr.p.y, d: r2(rr.d), in: i < state.k ? 'O' : '' };
          });
          tableHost.appendChild(UI.table(cols, trows));
        }
        draw(); updateInfo();

        var kSlider = UI.slider({ label: 'k (홀수 권장)', min: 1, max: 9, step: 2, value: 3, onChange: function (v) { state.k = v; draw(); updateInfo(); } });
        var resetBtn = UI.btn('점 지우기', function () { state.query = null; draw(); updateInfo(); });

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: 'K-최근접 이웃(K-NN) 미니 데모',
          note: '파란 점 5개는 부류 A, 주황 점 5개는 부류 B다. 평면을 클릭해 새 점(노랑)을 놓으면 ' +
            '<b>모든 점까지의 유클리드 거리를 ND 로 계산</b>해 가장 가까운 k개를 찾고, 그 안에서 다수인 부류로 새 점을 분류한다.',
          body: [UI.controls([kSlider, resetBtn]), host, info, UI.fold('전체 점과의 거리 표 (거리순 정렬)', tableHost)]
        }));
        root.appendChild(UI.callout('why',
          '뉴런 하나의 판단(9쪽)도, K-NN 의 판단도 결국 "거리 계산 + 비교" 다. ' +
          '벡터의 노름과 거리 개념 하나가 분류(classification)와 클러스터링(clustering)의 공통 재료가 된다.'));
      })();

      /* =======================================================================
       * 2.3 행렬
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '2.3 행렬' }));
      root.appendChild(el('p', {
        html: '<b>행렬(matrix)</b>은 수를 직사각형으로 배열한 것이다. m, n 이 양의 정수일 때 A 를 ' +
          '<b>m × n 행렬</b>(또는 (m, n) 행렬)이라 부르고, <b>행(row)은 가로, 열(column)은 세로</b>다. ' +
          '이 방향을 거꾸로 외우는 것이 가장 흔한 실수다.'
      }));

      (function () {
        var A = ND.arange(1, 13).reshape([3, 4]);
        var note = el('p', { class: 'small', style: { marginTop: '.6rem' }, text: '셀을 클릭해 보라 — 수학 표기와 NumPy 표기가 어떻게 대응하는지 보여준다.' });
        var g = UI.grid(A, {
          axisLabels: true, cellSize: 40,
          highlight: function () { return 'a'; },
          onClick: function (idx, val) {
            note.innerHTML = '수학 표기 <b>a' + sub(idx[0] + 1) + sub(idx[1] + 1) + '</b> = NumPy <code>A[' + idx[0] + ', ' + idx[1] + ']</code> = <b>' + val + '</b>';
          }
        });
        root.appendChild(UI.card({
          kicker: '시뮬레이터', title: '행·열, 그리고 1부터 세는 수학 vs 0부터 세는 NumPy',
          note: 'A 는 3 × 4 행렬이다. <b>행은 가로줄, 열은 세로줄.</b> 위 머리글의 숫자는 NumPy 의 축 번호(0부터)다.',
          body: [g, note]
        }));
        root.appendChild(UI.callout('trap',
          '수학은 <b>a₁₁ 부터 1로 세지만</b>, NumPy 는 <b>A[0, 0] 부터 0으로 센다.</b> ' +
          '그래서 수학의 aᵢⱼ 는 NumPy 의 <code>A[i−1, j−1]</code> 이다. 이 어긋남을 잊으면 인덱스가 통째로 하나씩 밀린다.'));
      })();

      root.appendChild(el('h3', { class: 'h-sub', text: '행벡터와 열벡터 — 그리고 그 어느 쪽도 아닌 것' }));
      root.appendChild(el('p', {
        html: '행렬의 한 행(1 × n)을 <b>행벡터(row vector)</b>, 한 열(m × 1)을 <b>열벡터(column vector)</b>라 부른다. ' +
          '그런데 <code>np.array([1, 2, 3])</code> 은 shape 가 <code>(3,)</code> 이라 <b>행벡터도 열벡터도 아니다.</b>'
      }));

      (function () {
        var w = ND.arange(1, 4);
        var wRow = w.reshape([1, -1]);
        var wCol = w.reshape([-1, 1]);
        root.appendChild(UI.code('w = np.arange(1, 4)          # shape ' + ND.shapeStr(w.shape) + '  ← 행도 열도 아니다\nw.reshape(1, -1)              # shape ' + ND.shapeStr(wRow.shape) + '  ← 행벡터\nw.reshape(-1, 1)              # shape ' + ND.shapeStr(wCol.shape) + '  ← 열벡터'));
        root.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'w  ' + ND.shapeStr(w.shape), [UI.grid(w, { highlight: function () { return 'a'; }, axisLabels: true, cellSize: 38 })]),
          panel('r', 'w.reshape(1,-1)  ' + ND.shapeStr(wRow.shape), [UI.grid(wRow, { highlight: function () { return 'r'; }, axisLabels: true, cellSize: 38 })]),
          panel('r', 'w.reshape(-1,1)  ' + ND.shapeStr(wCol.shape), [UI.grid(wCol, { highlight: function () { return 'r'; }, axisLabels: true, cellSize: 38 })])
        ]));
        root.appendChild(UI.callout('why',
          '<code>(3,)</code> 은 축이 하나뿐이라 "가로/세로" 개념 자체가 없다. ' +
          '진짜 행벡터·열벡터가 필요하면 <code>reshape</code> 로 축을 <b>2개</b>로 만들어야 한다. ' +
          '이 함정은 7장 브로드캐스팅에서 그대로 다시 나온다.'));
      })();

      /* =======================================================================
       * 2.4 행렬의 합과 곱
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '2.4 행렬의 합과 곱' }));
      root.appendChild(el('p', { html: '행렬의 <b>합</b>은 <b>같은 크기일 때만</b> 정의되고, 성분끼리 더한다.' } ));

      (function () {
        var M1 = ND.array([[1, 2], [3, 4]]);
        var M2 = ND.array([[5, 6], [7, 8]]);
        root.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'M1  (2,2)', [UI.grid(M1, { highlight: function () { return 'a'; }, cellSize: 38 })]),
          op('+'),
          panel('b', 'M2  (2,2)', [UI.grid(M2, { highlight: function () { return 'b'; }, cellSize: 38 })]),
          op('='),
          panel('r', 'M1 + M2', [UI.grid(ND.ops.add(M1, M2), { highlight: function () { return 'r'; }, cellSize: 38 })])
        ]));
        root.appendChild(el('h3', { class: 'h-sub', text: '크기가 다르면 애초에 더할 수 없다' }));
        var M3 = ND.array([[1, 2, 3], [4, 5, 6]]);
        root.appendChild(UI.code('M1 = np.array([[1, 2], [3, 4]])          # (2, 2)\nM3 = np.array([[1, 2, 3], [4, 5, 6]])   # (2, 3)\nM1 + M3'));
        try { ND.ops.add(M1, M3); } catch (e) { root.appendChild(UI.errBlock(e.message)); }
        root.appendChild(UI.callout('why',
          '행렬의 합은 "자리가 맞는 성분끼리" 라는 정의부터 크기가 같아야 함을 요구한다. ' +
          '7장의 브로드캐스팅은 <b>특정 조건(한쪽 축이 1)에서만</b> 이 규칙을 완화해 주는 것이지, 아무 크기나 봐주는 것이 아니다.'));
      })();

      root.appendChild(el('h3', { class: 'h-sub', text: '행렬의 곱 — cᵢⱼ = Σₖ aᵢₖ bₖⱼ' }));
      root.appendChild(el('p', {
        html: 'A 가 m × n, B 가 n × p 행렬이면 곱 AB = C 는 m × p 행렬이다. ' +
          'C 의 (i, j) 성분은 <b>A 의 i번째 행 전체와 B 의 j번째 열 전체를 내적한 값</b>이다 — 이 장 앞부분의 내적이 그대로 재사용된다.'
      }));
      root.appendChild(UI.ascii(
        '      m   n         n   p           m   p\n' +
        '    ( A ) @ ( B )   =   ( C )\n' +
        '  cᵢⱼ = aᵢ₁b₁ⱼ + aᵢ₂b₂ⱼ + … + aᵢₙbₙⱼ   <- A 의 i행 · B 의 j열'
      ));

      /* --------------------------------------------- 시뮬레이터 ②: 행렬곱 단계별 시각화 */

      (function () {
        var state = { m: 2, nA: 3, nB: 3, p: 2, revealed: null };
        var host = el('div');
        var mSlider, nASlider, nBSlider, pSlider;

        function makeAB() {
          var A = ND.arange(1, state.m * state.nA + 1).reshape([state.m, state.nA]);
          var startB = state.m * state.nA + 1;
          var B = ND.arange(startB, startB + state.nB * state.p).reshape([state.nB, state.p]);
          return { A: A, B: B };
        }

        function rebuild() {
          UI.clear(host);
          var ab = makeAB(), A = ab.A, B = ab.B;
          var mismatch = state.nA !== state.nB;

          host.appendChild(UI.ascii(
            '      m   n         n   p           m   p\n' +
            '    ( ' + state.m + ' , ' + state.nA + ' )  @  ( ' + state.nB + ' , ' + state.p + ' )   ' +
            (mismatch ? '=   ?' : '=   ( ' + state.m + ' , ' + state.p + ' )') + '\n' +
            '          ^         ^\n' +
            (mismatch
              ? '          +----X----+  <- 안쪽 두 수가 다르다: ' + state.nA + ' ≠ ' + state.nB + '  → 계산 불가'
              : '          +---------+  <- 안쪽 두 수가 같다: ' + state.nA + ' = ' + state.nB)
          ));

          var gA = UI.grid(A, { highlight: function () { return 'a'; }, axisLabels: true, cellSize: 34 });
          var gB = UI.grid(B, { highlight: function () { return 'b'; }, axisLabels: true, cellSize: 34 });

          if (mismatch) {
            host.appendChild(el('div', { class: 'flow' }, [
              panel('a', 'A  ' + ND.shapeStr(A.shape), [gA]),
              op('@'), panel('b', 'B  ' + ND.shapeStr(B.shape), [gB]), op('='), bad(' 에러')
            ]));
            try { ND.matmul(A, B); } catch (e) { host.appendChild(UI.errBlock(e.message)); }
            host.appendChild(UI.callout('trap',
              '(m, n) @ (n, p) 규칙에서 <b>안쪽 두 수(n)가 같아야 한다.</b> ' +
              'A 의 열 개수와 B 의 행 개수가 다르면, A 의 행과 B 의 열을 짝지어 곱할 방법 자체가 없다.'));
            return;
          }

          var mm = ND.matmul(A, B, { steps: true });
          var C = mm.result;
          if (state.revealed === null) state.revealed = state.m * state.p;
          var revealed = Math.max(0, Math.min(state.revealed, state.m * state.p));

          var cA = cellsOf(gA), cB = cellsOf(gB);
          var detail = el('div', { class: 'small mono', style: { marginTop: '.5rem', minHeight: '1.4em' }, text: '결과 칸에 마우스를 올려 보라.' });

          function resetC(cCells) {
            repaint(cA, A, function () { return 'a'; });
            repaint(cB, B, function () { return 'b'; });
            repaint(cCells, C, function (idx) {
              var flat = idx[0] * state.p + idx[1];
              return flat < revealed ? 'r' : 'dim';
            });
            detail.textContent = '결과 칸에 마우스를 올려 보라.';
          }

          var gC = UI.grid(C, {
            axisLabels: true, cellSize: 40,
            highlight: function (idx) { var flat = idx[0] * state.p + idx[1]; return flat < revealed ? 'r' : 'dim'; },
            label: function (idx, val) { var flat = idx[0] * state.p + idx[1]; return flat < revealed ? UI.fmtCell(val, C.dtype) : '·'; },
            onHover: function (idx) {
              if (!idx) { resetC(cC); return; }
              var flat = idx[0] * state.p + idx[1];
              if (flat >= revealed) { resetC(cC); detail.textContent = '아직 채워지지 않은 칸이다 — "다음 칸 채우기" 를 눌러 보라.'; return; }
              repaint(cA, A, function (i) { return i[0] === idx[0] ? 'x' : 'dim'; });
              repaint(cB, B, function (i) { return i[1] === idx[1] ? 'x' : 'dim'; });
              repaint(cC, C, function (i) { return (i[0] === idx[0] && i[1] === idx[1]) ? 'r' : 'dim'; });
              var st = null;
              mm.steps.forEach(function (s) { if (s.i === idx[0] && s.j === idx[1]) st = s; });
              var parts = st.terms.map(function (t) { return t.a + '·' + t.b; });
              detail.textContent = 'c[' + idx.join(', ') + '] = ' + parts.join(' + ') + ' = ' + st.value + '   (A 의 ' + idx[0] + '행 · B 의 ' + idx[1] + '열)';
            }
          });
          var cC = cellsOf(gC);

          host.appendChild(el('div', { class: 'flow' }, [
            panel('a', 'A  ' + ND.shapeStr(A.shape), [gA]),
            op('@'),
            panel('b', 'B  ' + ND.shapeStr(B.shape), [gB]),
            op('='),
            panel('r', 'C = A @ B  ' + ND.shapeStr(C.shape), [gC])
          ]));
          host.appendChild(detail);
          host.appendChild(UI.controls([
            UI.btn('처음부터', function () { state.revealed = 0; rebuild(); }),
            UI.btn('다음 칸 채우기', function () { state.revealed = Math.min(revealed + 1, state.m * state.p); rebuild(); }, { primary: true }),
            UI.btn('전체 보기', function () { state.revealed = state.m * state.p; rebuild(); })
          ]));

          if (state.m === 2 && state.nA === 3 && state.nB === 3 && state.p === 2) {
            host.appendChild(UI.callout('tip',
              '지금 값은 수업 노트북 96번 셀 그대로다: <code>a = np.arange(1,7).reshape(2,3)</code>, ' +
              '<code>b = np.arange(7,13).reshape(3,2)</code> → <code>a @ b</code> = ' + ND.format(C, { mode: 'repr' }) + '.'));
          }
        }

        mSlider = UI.slider({ label: 'm (A 의 행)', min: 1, max: 4, step: 1, value: 2, onChange: function (v) { state.m = v; state.revealed = null; rebuild(); } });
        nASlider = UI.slider({ label: 'n (A 의 열)', min: 1, max: 4, step: 1, value: 3, onChange: function (v) { state.nA = v; state.revealed = null; rebuild(); } });
        nBSlider = UI.slider({ label: 'n (B 의 행)', min: 1, max: 4, step: 1, value: 3, onChange: function (v) { state.nB = v; state.revealed = null; rebuild(); } });
        pSlider = UI.slider({ label: 'p (B 의 열)', min: 1, max: 4, step: 1, value: 2, onChange: function (v) { state.p = v; state.revealed = null; rebuild(); } });
        var resetPreset = UI.btn('셀 96 예제로 리셋', function () {
          state.m = 2; state.nA = 3; state.nB = 3; state.p = 2; state.revealed = null;
          mSlider.setValue(2); nASlider.setValue(3); nBSlider.setValue(3); pSlider.setValue(2);
          rebuild();
        });
        rebuild();

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '행렬곱 단계별 시각화',
          note: '슬라이더로 A, B 의 크기를 바꿔 보라. <b>n(A 의 열)과 n(B 의 행)을 다르게</b> 만들면 실제 에러가 난다. ' +
            '결과 칸에 마우스를 올리면 그 칸을 만든 A 의 행·B 의 열이 노랑으로 켜지고 계산식이 펼쳐진다.',
          body: [UI.controls([mSlider, nASlider, nBSlider, pSlider]), UI.controls([resetPreset]), host]
        }));
      })();

      /* -------------------------------------------- * 는 성분별 곱, @ 는 행렬곱 */

      (function () {
        var A = ND.array([[1, 2], [3, 4]]);
        var B = ND.array([[0, 1], [1, 1]]);
        var had = ND.ops.mul(A, B);
        var mm = ND.matmul(A, B);
        var mmR = ND.matmul(B, A);
        var sameShape = ND.shapeStr(had.shape) === ND.shapeStr(mm.shape);
        var sameValue = ND.all(ND.ops.eq(had, mm)).toNested();

        root.appendChild(el('h3', { class: 'h-sub', text: 'A * B 는 행렬곱이 아니다' }));
        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [el('div', { class: 'panel-t', text: 'A * B — 성분별 곱' }), UI.code('A * B'), UI.out(ND.format(had), { label: false })]),
          el('div', null, [el('div', { class: 'panel-t r', text: 'A @ B — 행렬곱' }), UI.code('A @ B'), UI.out(ND.format(mm), { label: false })])
        ]));
        root.appendChild(UI.statRow([
          { k: 'shape 는 같은가', v: sameShape ? 'True' : 'False' },
          { k: '값도 같은가', v: sameValue ? 'True' : 'False', sub: '같은 shape 라도 값은 다르다' }
        ]));
        root.appendChild(UI.callout('trap',
          '수학 시간의 "행렬의 곱"은 <code>@</code> 다. <code>*</code> 는 성분별 곱(아다마르 곱)이며 ' +
          '<b>수학에서 배우는 행렬곱과는 전혀 다른 연산</b>이다. NumPy 연산자 관점의 자세한 대비는 7장에서 더 다룬다.'));

        root.appendChild(el('h3', { class: 'h-sub', text: '교환법칙이 성립하지 않는다 — AB ≠ BA' }));
        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [UI.code('A @ B'), UI.out(ND.format(mm), { label: false })]),
          el('div', null, [UI.code('B @ A'), UI.out(ND.format(mmR), { label: false })])
        ]));
        root.appendChild(UI.callout('why',
          'A 의 행과 B 의 열을 짝짓는 순서(A @ B)와 B 의 행과 A 의 열을 짝짓는 순서(B @ A)는 서로 다른 계산이다. ' +
          '숫자의 곱셈은 순서를 바꿔도 되지만(3×5 = 5×3), 행렬의 곱은 <b>일반적으로 순서를 바꿀 수 없다.</b>'));
      })();

      /* =======================================================================
       * 2.5 전치·단위행렬·역행렬
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '2.5 전치·단위행렬·역행렬' }));

      (function () {
        var A = ND.array([[1, 2, 3], [4, 5, 6]]);
        root.appendChild(el('p', { html: '<b>전치(transpose)</b> A<sup>T</sup> 는 행과 열을 맞바꾼 행렬이다. <code>.T</code> 와 <code>.transpose()</code> 는 같다.' }));
        root.appendChild(el('div', { class: 'flow' }, [
          panel('a', 'A  ' + ND.shapeStr(A.shape), [UI.grid(A, { highlight: function () { return 'a'; }, showIndex: true, cellSize: 38 })]),
          op('→'),
          panel('r', 'A.T  ' + ND.shapeStr(A.T.shape), [UI.grid(A.T, { highlight: function () { return 'r'; }, showIndex: true, cellSize: 38 })])
        ]));
        root.appendChild(UI.statRow([
          { k: 'np.shares_memory(A, A.T)', v: ND.sharesMemory(A, A.T) ? 'True' : 'False', sub: '값을 옮기지 않고 strides 순서만 뒤집은 뷰다 — 4장에서 다시 나온다' }
        ]));

        root.appendChild(el('h3', { class: 'h-sub', text: '(AB)ᵀ = BᵀAᵀ' }));
        var B2 = ND.array([[0, 1], [1, 1]]);
        var A2 = ND.array([[1, 2], [3, 4]]);
        var lhs = ND.matmul(A2, B2).T;
        var rhs = ND.matmul(B2.T, A2.T);
        var eqTr = ND.all(ND.ops.eq(lhs, rhs)).toNested();
        root.appendChild(UI.code('(A2 @ B2).T\nB2.T @ A2.T'));
        root.appendChild(el('div', { class: 'stack-2' }, [
          el('div', null, [UI.out(ND.format(lhs), { label: '(A2 @ B2).T' })]),
          el('div', null, [UI.out(ND.format(rhs), { label: 'B2.T @ A2.T' })])
        ]));
        root.appendChild(UI.statRow([{ k: '두 결과가 같은가', v: eqTr ? 'True' : 'False' }]));

        root.appendChild(el('h3', { class: 'h-sub', text: '함정 — 1차원 배열의 .T 는 아무 일도 하지 않는다' }));
        var w = ND.arange(3);
        root.appendChild(UI.code('w = np.arange(3)\nw.shape       # ' + ND.shapeStr(w.shape) + '\nw.T.shape     # ' + ND.shapeStr(w.T.shape) + '   ← 그대로다!'));
        root.appendChild(UI.callout('trap',
          '1차원 배열은 뒤집을 축이 <b>하나뿐</b>이라 <code>.T</code> 가 자기 자신을 그대로 돌려준다. ' +
          '"행벡터를 열벡터로" 만들려면 2.3절에서 본 것처럼 <code>reshape(-1, 1)</code> 로 <b>축을 늘려야</b> 한다.'));

        root.appendChild(el('h3', { class: 'h-sub', text: '단위행렬과 역행렬' }));
        var I3 = ND.identity(3);
        var A3 = ND.arange(1, 10).reshape([3, 3]);
        var idOk = ND.all(ND.ops.eq(ND.matmul(A3, I3), A3)).toNested() && ND.all(ND.ops.eq(ND.matmul(I3, A3), A3)).toNested();
        root.appendChild(UI.code('I = np.identity(3)\nnp.array_equal(A3 @ I, A3) and np.array_equal(I @ A3, A3)'));
        root.appendChild(UI.out((idOk ? 'True' : 'False') + '   # A @ I = I @ A = A'));
        root.appendChild(UI.callout('tip', '단위행렬 I 는 곱셈의 <b>1</b> 과 같은 역할이다 — 어느 쪽에 곱해도 원래 행렬이 그대로 나온다.'));

        root.appendChild(el('h3', { class: 'h-sub', text: '연립방정식을 행렬로 — 역행렬과 solve' }));
        root.appendChild(el('p', { html: '다음 연립방정식을 행렬로 쓰면 <code>Ax = b</code> 다.' }));
        root.appendChild(UI.ascii(
          '2x + 2y +  z = 9\n' +
          '2x −  y + 2z = 6\n' +
          ' x −  y + 2z = 5'
        ));
        var LA = ND.array([[2, 2, 1], [2, -1, 2], [1, -1, 2]], 'float64');
        var Lb = ND.array([9, 6, 5], 'float64');
        var det = ND.det(LA);
        var xSolve = ND.solve(LA, Lb);
        var xInv = ND.matmul(ND.inv(LA), Lb);
        root.appendChild(UI.code('A = np.array([[2, 2, 1], [2, -1, 2], [1, -1, 2]])\nb = np.array([9, 6, 5])\n\nnp.linalg.det(A)\nnp.linalg.solve(A, b)     # 권장\nnp.linalg.inv(A) @ b      # 되긴 하지만 비권장'));
        root.appendChild(UI.statRow([
          { k: 'det(A)', v: r2(det) },
          { k: 'solve(A, b)', v: '(' + r2(xSolve.get([0])) + ', ' + r2(xSolve.get([1])) + ', ' + r2(xSolve.get([2])) + ')', sub: 'x, y, z' },
          { k: 'inv(A) @ b', v: '(' + r2(xInv.get([0])) + ', ' + r2(xInv.get([1])) + ', ' + r2(xInv.get([2])) + ')', sub: '같은 값이 나온다' }
        ]));
        root.appendChild(UI.callout('why',
          'det(A) ≠ 0 이므로 이 연립방정식은 <b>유일한 해</b>를 가진다 — x=1, y=2, z=3. ' +
          '<code>inv(A) @ b</code> 로도 같은 답을 얻지만, <code>np.linalg.solve</code> 는 역행렬을 실제로 만들지 않고 ' +
          '가우스 소거법으로 방정식을 직접 풀기 때문에 <b>반올림 오차가 덜 쌓이고 계산량도 적다.</b> ' +
          '역행렬이 필요한 게 아니라 해만 필요하다면 <code>solve</code> 를 쓴다.'));
      })();

      /* =======================================================================
       * 2.6 인공지능과의 연결
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '2.6 인공지능과의 연결 — 뉴런과 행렬곱' }));
      root.appendChild(el('p', {
        html: '뉴런 하나는 입력 벡터 x 와 가중치 벡터 w 의 <b>내적</b>에 편향(bias) b 를 더해 값을 만든다. ' +
          '뉴런이 여러 개(한 "층")면, 그 계산은 벡터의 내적이 아니라 <b>행렬곱</b>으로 한꺼번에 처리된다. ' +
          '"인공지능 관련 지식에는 문과와 이과의 구별이 없다" — 이 장의 벡터·행렬이 그 최소 공통분모다.'
      }));

      (function () {
        var state = { x: [1, -1, 2], W: [[0.5, -1], [1, 0.5], [-0.5, 1]], b: [0, 0.5] };
        var host = el('div');

        function rebuild() {
          UI.clear(host);
          var X = ND.array([state.x.slice()], 'float64');
          var W = ND.array(state.W.map(function (row) { return row.slice(); }), 'float64');
          var Bv = ND.array(state.b.slice(), 'float64');
          var mm = ND.matmul(X, W, { steps: true });
          var Z = ND.ops.add(mm.result, Bv);

          var gX = UI.grid(X, { highlight: function () { return 'a'; }, axisLabels: true, cellSize: 38 });
          var gW = UI.grid(W, { highlight: function () { return 'b'; }, axisLabels: true, cellSize: 38 });
          var cX = cellsOf(gX), cW = cellsOf(gW);
          var detail = el('div', { class: 'small mono', style: { marginTop: '.4rem', minHeight: '1.4em' }, text: '뉴런 칸에 마우스를 올려 보라.' });

          var gZ = UI.grid(Z, {
            highlight: function () { return 'r'; }, axisLabels: true, cellSize: 42,
            onHover: function (idx) {
              if (!idx) {
                repaint(cX, X, function () { return 'a'; }); repaint(cW, W, function () { return 'b'; });
                detail.textContent = '뉴런 칸에 마우스를 올려 보라.'; return;
              }
              var j = idx[1];
              repaint(cX, X, function () { return 'x'; });
              repaint(cW, W, function (i) { return i[1] === j ? 'x' : 'dim'; });
              var st = null;
              mm.steps.forEach(function (s) { if (s.i === 0 && s.j === j) st = s; });
              var parts = st.terms.map(function (t) { return t.a + '×' + t.b; });
              detail.textContent = 'z[' + j + '] = ' + parts.join(' + ') + ' + ' + state.b[j] + ' = ' + Z.get([0, j]);
            }
          });

          host.appendChild(el('div', { class: 'flow' }, [
            panel('a', 'x  ' + ND.shapeStr(X.shape), [gX]),
            op('@'),
            panel('b', 'W  ' + ND.shapeStr(W.shape), [gW]),
            op('+'),
            panel('', 'b  ' + ND.shapeStr(Bv.shape), [UI.grid(Bv, { highlight: function () { return 'b'; }, cellSize: 38 })]),
            op('='),
            panel('r', 'z  ' + ND.shapeStr(Z.shape), [gZ])
          ]));
          host.appendChild(detail);
          host.appendChild(UI.callout('tip',
            '<code>' + ND.shapeStr(X.shape) + ' @ ' + ND.shapeStr(W.shape) + ' + ' + ND.shapeStr(Bv.shape) + ' = ' + ND.shapeStr(Z.shape) + '</code> — ' +
            '(배치, 입력수) @ (입력수, 뉴런수) = (배치, 뉴런수). 입력이 3개, 뉴런이 2개인 층 하나를 한 번의 행렬곱으로 처리했다.'));
        }
        rebuild();

        var xSliders = state.x.map(function (v, i) {
          return UI.slider({ label: 'x' + sub(i + 1), min: -3, max: 3, step: 0.5, value: v, onChange: function (nv) { state.x[i] = nv; rebuild(); } });
        });
        var wSliders = [];
        for (var i = 0; i < 3; i++) {
          for (var j = 0; j < 2; j++) {
            (function (ii, jj) {
              wSliders.push(UI.slider({
                label: 'w' + sub(ii + 1) + sub(jj + 1), min: -2, max: 2, step: 0.5, value: state.W[ii][jj],
                onChange: function (nv) { state.W[ii][jj] = nv; rebuild(); }
              }));
            })(i, j);
          }
        }
        var bSliders = state.b.map(function (v, i) {
          return UI.slider({ label: 'b' + sub(i + 1), min: -2, max: 2, step: 0.5, value: v, onChange: function (nv) { state.b[i] = nv; rebuild(); } });
        });

        root.appendChild(UI.card({
          kicker: '시뮬레이터',
          title: '미니 신경망 한 층 — 입력 3개 → 뉴런 2개',
          note: '슬라이더로 입력 x, 가중치 W, 편향 b 를 바꾸면 <code>x @ W + b</code> 가 실시간으로 다시 계산된다. ' +
            '결과 z 의 칸에 마우스를 올리면 그 뉴런이 어떤 내적에서 나왔는지 노랑으로 보여준다.',
          body: [
            UI.controls(xSliders),
            UI.controls(wSliders),
            UI.controls(bSliders),
            host
          ]
        }));
      })();

      /* =======================================================================
       * 확인 문제
       * ===================================================================== */

      root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
      root.appendChild(UI.quiz([
        {
          q: '4×4 행렬 <code>A</code> 에서 <code>A[1, 2]</code> 가 가리키는 것은 수학 표기로 무엇인가?',
          choices: ['a₁₂ (1행 2열)', 'a₂₃ (2행 3열)', 'a₂₁ (2행 1열)', 'A 의 3번째 행 전체'],
          answer: 1,
          explain: 'NumPy 는 0부터 세므로 <code>A[1, 2]</code> 는 <b>2번째 행, 3번째 열</b>이다. 수학 표기로는 aᵢⱼ 의 i, j 에 각각 1을 더한 <b>a₂₃</b> 와 같다.'
        },
        {
          q: '(3, 4) 행렬과 (4, 2) 행렬을 <code>@</code> 로 곱한 결과의 shape 는?',
          choices: ['(3, 2)', '(4, 4)', '(3, 4)', '에러가 난다 — 크기가 안 맞는다'],
          answer: 0,
          explain: '(m, n) @ (n, p) → (m, p) 규칙 그대로다. 안쪽 두 수 4 = 4 로 같으므로 계산되고, 바깥 두 수 3, 2 가 결과 shape 가 된다.'
        },
        {
          q: '벡터 u, v 의 내적 <code>u · v</code> 의 결과는 무엇인가?',
          choices: ['u, v 와 같은 shape 의 벡터', '축이 없는 스칼라(0차원) 값', '항상 양수인 값', 'u 또는 v 중 더 긴 쪽의 복사본'],
          answer: 1,
          explain: '내적은 두 벡터를 성분끼리 곱해 모두 더한 값 하나다. <code>np.dot(u,v)</code>, <code>u @ v</code>, <code>np.sum(u*v)</code> 모두 같은 스칼라를 돌려준다.'
        },
        {
          q: '<code>w = np.arange(3)</code> (shape (3,)) 에 대해 <code>w.T</code> 의 shape 는?',
          choices: ['(3, 1) — 열벡터가 된다', '(1, 3) — 행벡터가 된다', '(3,) 그대로다 — 아무 일도 일어나지 않는다', '에러가 난다'],
          answer: 2,
          explain: '1차원 배열은 뒤집을 축이 하나뿐이라 <code>.T</code> 가 아무 효과를 내지 못한다. 열벡터가 필요하면 <code>w.reshape(-1, 1)</code> 처럼 축을 직접 늘려야 한다.'
        }
      ], { id: 'vector' }));

    }
  });
})();
