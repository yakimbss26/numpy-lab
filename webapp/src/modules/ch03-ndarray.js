/* ===========================================================================
 * ch03-ndarray.js — 3장 「배열의 표현과 dtype」
 * 원본 수업 노트북 셀 3~31 대응 (Live Coding 1·2, 데이터 표현 종류,
 * 배열 생성, dtype, 속성).
 *
 * 이 파일의 모든 숫자는 ND 엔진이 그 자리에서 계산한다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* ------------------------------------------------------------ 작은 도우미 */

  function h2(t) { return el('h2', { class: 'h-sec', text: t }); }
  function h3(t) { return el('h3', { class: 'h-sub', text: t }); }
  function p(html) { return el('p', { html: html }); }
  function note(html) { return el('p', { class: 'small muted', html: html }); }

  /** 제목 붙은 작은 패널. tone: 'a'(파랑) 'b'(주황) 'r'(초록) */
  function panel(title, tone, kids) {
    return el('div', null,
      [el('div', { class: 'panel-t' + (tone ? ' ' + tone : ''), text: title })].concat(kids || []));
  }

  /** 엔진이 던지는 예외를 학생이 보는 에러 블록으로 바꾼다 */
  function shown(fn) {
    try { return fn(); } catch (e) { return UI.errBlock(e.message); }
  }

  function num(v) { return Number(v).toLocaleString('en-US'); }

  /** 파랑 단일 색조 가로 막대 (분포 그리기용) */
  function barRows(pairs, opts) {
    opts = opts || {};
    var mx = pairs.reduce(function (m, q) { return Math.max(m, q[1]); }, 0) || 1;
    return el('div', { class: 'small' }, pairs.map(function (q) {
      return el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.18rem 0' }
      }, [
        el('span', {
          class: 'mono', style: { width: '2.8rem', textAlign: 'right', flex: '0 0 auto' },
          text: opts.fmtKey ? opts.fmtKey(q[0]) : String(q[0])
        }),
        el('span', {
          style: {
            flex: '1 1 auto', height: '13px', background: 'var(--surface-3)',
            borderRadius: '3px', overflow: 'hidden', display: 'block'
          }
        }, [
          el('i', {
            style: {
              display: 'block', width: (q[1] / mx * 100).toFixed(2) + '%', height: '100%',
              background: 'var(--s1)'
            }
          })
        ]),
        el('span', {
          class: 'mono muted', style: { width: '5.2rem', flex: '0 0 auto' },
          text: num(q[1]) + '개'
        })
      ]);
    }));
  }

  /* ==========================================================================
   * 1. 차원으로 데이터를 바라보기
   * ======================================================================== */

  var DIMS = [
    {
      d: 0, kind: 'Scalar (0D tensor)', general: '()',
      real: '오늘 낮 최고기온 <b>23.5 ℃</b> — 숫자 하나. 축이 하나도 없으니 인덱스를 붙일 자리가 없다.',
      code: 'temp = np.array(23.5)\ntemp.shape   # ()\ntemp.ndim    # 0\ntemp.size    # 1',
      make: function () { return ND.array(23.5); },
      pic: function (a) {
        return panel('스칼라 — 칸 한 개', 'a', [UI.grid(a, { highlight: function () { return 'a'; } })]);
      }
    },
    {
      d: 1, kind: 'Vector (1D tensor)', general: '(n,)',
      real: '<b>한 학생</b>의 과목별 점수 5개. 축이 하나 — 「몇 번째 과목」만 고르면 값이 나온다.',
      code: 'scores = np.array([88, 92, 75, 100, 67])\nscores.shape   # (5,)\nscores[3]      # 100',
      make: function () { return ND.array([88, 92, 75, 100, 67]); },
      pic: function (a) {
        return panel('벡터 — 축 1개(axis 0)', 'a', [
          UI.grid(a, { axisLabels: true, highlight: function () { return 'a'; } }),
          note('머리글 숫자가 axis 0 의 인덱스다.')
        ]);
      }
    },
    {
      d: 2, kind: 'Matrix (2D tensor)', general: '(m, n)',
      real: '<b>반 성적표</b> — 학생 4명 × 과목 5개. 축이 둘이라 (학생, 과목) 두 개를 골라야 값 하나가 나온다. ' +
        '관절염 데이터(환자 × 날짜)도, 영화 평점표도 모두 2차원이다.',
      code: 'scores = np.array([[88, 92, 75, 100, 67],\n' +
        '                   [70, 65, 80,  55, 90],\n' +
        '                   [95, 99, 91,  88, 100],\n' +
        '                   [60, 72, 68,  74, 71]])\n' +
        'scores.shape      # (4, 5)\nscores[2, 4]      # 100',
      make: function () {
        return ND.array([[88, 92, 75, 100, 67], [70, 65, 80, 55, 90],
          [95, 99, 91, 88, 100], [60, 72, 68, 74, 71]]);
      },
      pic: function (a) {
        return panel('행렬 — 행(axis 0) × 열(axis 1)', 'a', [
          UI.grid(a, { axisLabels: true, highlight: function () { return 'a'; } }),
          note('세로 머리글이 axis 0(학생), 가로 머리글이 axis 1(과목)이다.')
        ]);
      }
    },
    {
      d: 3, kind: '3D Tensor', general: '(a, b, c)',
      real: '<b>흑백 이미지 묶음</b> — (장수, 높이, 너비). mnist 손글씨가 대표적으로 (60000, 28, 28) 이다. ' +
        '아래 그림은 (2, 3, 4) 짜리 축소판이고, 실제 이미지라면 칸의 숫자가 밝기(0~255)가 된다.',
      code: 'imgs = np.arange(24).reshape(2, 3, 4)\nimgs.shape       # (2, 3, 4)\nimgs[1, 2, 3]    # 23',
      make: function () { return ND.arange(24).reshape([2, 3, 4]); },
      pic: function (a) {
        return panel('3차원 — axis 0 을 층(層)으로 펼친 모습', 'a', [
          UI.grid(a, {
            axisLabels: true, highlight: function () { return 'a'; },
            layerLabel: function (L) { return 'imgs[' + L + ']  ← ' + (L + 1) + '번째 장'; }
          }),
          note('층 하나가 이미지 한 장이다. 층 안은 (높이, 너비) 2차원이다.')
        ]);
      }
    },
    {
      d: 4, kind: '4D Tensor', general: '(a, b, c, d)',
      real: '<b>컬러 이미지 묶음</b> — (장수, 높이, 너비, 채널). 색은 빨강·초록·파랑 세 장을 겹쳐 만들므로 ' +
        '흑백보다 축이 하나 더 필요하다. 동영상은 여기에 시간축까지 붙어 (장면, 프레임, 높이, 너비, 채널) 5차원이 된다.',
      code: 'imgs = np.arange(36).reshape(2, 2, 3, 3)\nimgs.shape          # (2, 2, 3, 3)\n' +
        'imgs[0, :, :, 1]    # 0번째 사진의 초록 채널만 → shape (2, 3)\nimgs[1, 1, 2, 0]    # 35',
      make: function () { return ND.arange(36).reshape([2, 2, 3, 3]); },
      pic: function (a) {
        var CH = ['채널 0 (R)', '채널 1 (G)', '채널 2 (B)'];
        var box = el('div');
        for (var s = 0; s < a.shape[0]; s++) {
          var planes = [];
          for (var c = 0; c < a.shape[3]; c++) {
            var pl = a.idx(s + ', :, :, ' + c);
            planes.push(panel(CH[c], c === 1 ? 'r' : (c === 2 ? 'a' : 'b'), [
              UI.grid(pl, { axisLabels: true, cellSize: 30 })
            ]));
          }
          box.appendChild(el('div', { class: 'panel-t', text: 'imgs[' + s + '] — ' + (s + 1) + '번째 사진 (높이 2 × 너비 3)' }));
          box.appendChild(el('div', { class: 'stack-3', style: { marginBottom: '1rem' } }, planes));
        }
        box.appendChild(note('4차원은 한 장으로 못 그린다. 그래서 채널마다 2차원 판을 따로 떼어 나열했다. ' +
          '같은 자리(같은 행·열)의 세 숫자가 한 픽셀의 색이다.'));
        return box;
      }
    }
  ];

  function simDimExplorer() {
    var state = { d: 2 };
    var host = el('div');

    function rebuild() {
      UI.clear(host);
      var info = DIMS[state.d];
      var a = info.make();

      host.appendChild(el('div', { class: 'flow', style: { marginBottom: '.4rem' } }, [
        el('span', { class: 'shape-badge' }, [
          el('span', { class: 'muted', text: '일반형' }), el('b', { text: info.general })
        ]),
        UI.shapeBadge(a),
        el('span', { class: 'small muted', text: info.kind })
      ]));
      host.appendChild(info.pic(a));
      host.appendChild(el('div', { class: 'stack-2', style: { marginTop: '.9rem' } }, [
        panel('만드는 코드', null, [UI.code(info.code), UI.out(ND.format(a), { label: 'print(a)' })]),
        panel('실제로 이런 데이터', null, [p(info.real)])
      ]));
    }

    var seg = UI.seg({
      label: '차원',
      options: DIMS.map(function (x) { return { value: String(x.d), label: x.d + '차원' }; }),
      value: '2',
      onChange: function (v) { state.d = parseInt(v, 10); rebuild(); }
    });

    rebuild();
    return UI.card({
      kicker: '시뮬레이터',
      title: '차원 탐험기',
      note: '0차원부터 4차원까지 골라 보자. shape 표기 · 실제 배열 그림 · 사례 · 만드는 코드가 함께 바뀐다. ' +
        '<b>차원(ndim)이란 값 하나를 집으려면 인덱스를 몇 개 대야 하는가</b>이다.',
      body: [UI.controls([seg]), host]
    });
  }

  function secDims(root) {
    root.appendChild(h2('1. 차원으로 데이터를 바라보기'));
    root.appendChild(p('NumPy 배열(ndarray)은 <b>같은 자료형의 숫자들을 격자에 담은 것</b>이다. ' +
      '담긴 값이 무엇이든 배열의 성격은 <b>shape</b> 하나로 결정된다. ' +
      '기온 한 개, 점수 다섯 개, 성적표, 사진 묶음이 모두 같은 자료구조로 표현된다.'));

    root.appendChild(UI.table(
      [{ k: 'kind', label: '종류' }, { k: 'd', label: '차원', num: true },
        { k: 'sh', label: 'shape 일반형' }, { k: 'ex', label: '사례', raw: true }],
      [
        { kind: 'Scalar (0D tensor)', d: 0, sh: '()', ex: '기온 한 값, 손실(loss) 한 값' },
        { kind: 'Vector (1D tensor)', d: 1, sh: '(n,)', ex: '한 학생의 과목별 점수, 한 사람의 특징 벡터' },
        { kind: 'Matrix (2D tensor)', d: 2, sh: '(m, n)', ex: '반 성적표(학생×과목), 관절염 데이터(환자×날짜), 영화 평점표' },
        { kind: '3D Tensor', d: 3, sh: '(a, b, c)', ex: '흑백 이미지 묶음 (장수, 높이, 너비) — <b>mnist</b>' },
        { kind: '4D Tensor', d: 4, sh: '(a, b, c, d)', ex: '컬러 이미지 묶음 (장수, 높이, 너비, 채널)' }
      ]
    ));

    root.appendChild(UI.callout('why',
      '수업자료 표에는 shape 가 <code>( )</code>, <code>(1, )</code>, <code>(1, 10)</code>, ' +
      '<code>(1, 10, 100)</code> 으로 적혀 있다. 이건 「샘플 1개를 예로 든 것」이라는 뜻이었는데, ' +
      '<b>1차원 배열의 shape 가 항상 (1,) 인 것으로 오해</b>하기 쉽다. ' +
      '점수 5개를 담은 1차원 배열의 shape 는 <code>(5,)</code>이고, ' +
      '<code>(1,)</code>은 「원소가 딱 1개인 1차원 배열」이라는 전혀 다른 뜻이다. ' +
      '그래서 이 실습장에서는 <code>(n,)</code>, <code>(m, n)</code> 처럼 <b>일반형</b>으로 적는다.',
      '수업자료의 shape 표기를 바로잡았다'));

    root.appendChild(UI.callout('tip',
      '채널을 어디에 두는지는 도구마다 다르다. 케라스/텐서플로는 <b>채널을 뒤에</b> 두어 ' +
      '(장수, 높이, 너비, 채널)이고, 파이토치는 <b>채널을 앞에</b> 두어 (장수, 채널, 높이, 너비)다. ' +
      '수업자료의 (samples, channels, width, height) 는 파이토치식 표기다. ' +
      '<b>축의 개수가 아니라 축의 순서가 약속</b>이므로, 남의 코드를 가져올 때 shape 를 반드시 찍어 봐야 한다.',
      '축의 순서는 약속일 뿐이다'));

    root.appendChild(simDimExplorer());

    /* ---- (3,) vs (3,1) vs (1,3) ---- */
    root.appendChild(h3('(3,) 과 (3, 1) 과 (1, 3) 은 서로 다르다'));
    root.appendChild(p('값 세 개를 담은 배열은 세 가지 모양으로 만들 수 있다. 담긴 숫자는 똑같지만 ' +
      '<b>축의 개수와 역할이 다르므로 연산 결과가 완전히 달라진다.</b>'));

    var v1 = ND.array([1, 2, 3]);
    var col = v1.reshape([3, 1]);
    var row = v1.reshape([1, 3]);
    var hi = function () { return 'a'; };

    root.appendChild(el('div', { class: 'stack-3' }, [
      panel('v = np.array([1,2,3])', 'a', [
        UI.shapeBadge(v1), UI.grid(v1, { axisLabels: true, highlight: hi }),
        note('1차원. 행도 열도 아니다.')
      ]),
      panel('v.reshape(3, 1) — 열벡터', 'a', [
        UI.shapeBadge(col), UI.grid(col, { axisLabels: true, highlight: hi }),
        note('2차원. 3행 1열.')
      ]),
      panel('v.reshape(1, 3) — 행벡터', 'a', [
        UI.shapeBadge(row), UI.grid(row, { axisLabels: true, highlight: hi }),
        note('2차원. 1행 3열.')
      ])
    ]));

    var sum = ND.ops.add(v1, col);
    root.appendChild(el('div', { class: 'stack-2', style: { marginTop: '1rem' } }, [
      panel('차이가 드러나는 순간', null, [
        UI.code('v + v            # (3,)  + (3,)   → (3,)\nv + v.reshape(3, 1)   # (3,) + (3,1) → (3, 3) !'),
        UI.out(ND.format(sum), { label: 'v + v.reshape(3, 1)' }),
        note('shape 가 (3,) 과 (3,1) 로 다르면 브로드캐스팅이 일어나 ' +
          ND.shapeStr(sum.shape) + ' 표가 만들어진다. 자세한 규칙은 6장에서 다룬다.')
      ]),
      panel('1차원 배열의 T 는 아무 일도 하지 않는다', null, [
        UI.code('v.shape              # ' + ND.shapeStr(v1.shape) +
          '\nv.T.shape            # ' + ND.shapeStr(v1.T.shape) + '  ← 그대로!\n' +
          'v.reshape(3,1).T.shape   # ' + ND.shapeStr(col.T.shape)),
        UI.callout('trap',
          '「전치하면 가로가 세로가 된다」고 외우면 1차원에서 반드시 틀린다. ' +
          '<b>축이 하나뿐이면 뒤집을 순서가 없다.</b> 열벡터가 필요하면 ' +
          '<code>reshape(-1, 1)</code> 이나 <code>v[:, None]</code> 을 써야 한다.')
      ])
    ]));
  }

  /* ==========================================================================
   * 2. 첫 실습 — 영화 평점 데이터 (셀 3~8)
   * ======================================================================== */

  function simColumnPick(sample) {
    var EXPRS = [
      { v: 'data[:, 0]', why: '정수 0 으로 열을 지정 → <b>열 축이 사라져</b> 1차원이 된다.' },
      { v: 'data[:, :1]', why: '슬라이스 <code>:1</code> 로 열을 지정 → <b>열 축이 길이 1로 남아</b> 2차원이다.' },
      { v: 'data[:, 2]', why: 'rating 열만 1차원으로 뽑았다. 통계를 낼 때 보통 이 모양을 쓴다.' },
      { v: 'data[0, :]', why: '0번 행 하나 → 행 축이 사라져 1차원 (열 개수만 남는다).' },
      { v: 'data[0:1, :]', why: '0번 행 하나지만 슬라이스라서 행 축이 남아 2차원이다.' }
    ];
    var state = { i: 0 };
    var host = el('div');
    var head = sample.idx('0:6, :');

    function rebuild() {
      UI.clear(host);
      var ex = EXPRS[state.i];
      var expr = ex.v.replace('data', '');
      var view, err = null;
      try { view = sample.idx(expr); } catch (e) { err = e; }
      if (err) { host.appendChild(UI.errBlock(err.message)); return; }

      var sel = {};
      view.flatBufIndices().forEach(function (b) { sel[b] = 1; });

      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('원본 data 의 앞 6행 — 뽑히는 칸이 노랑', 'a', [
          UI.grid(head, {
            axisLabels: true,
            highlight: function (idx) { return sel[head.bufIndex(idx)] ? 'x' : 'dim'; }
          }),
          note('열 0 userId · 열 1 movieId · 열 2 rating · 열 3 timestamp')
        ]),
        panel('결과 ' + ex.v, 'r', [
          UI.shapeBadge(view),
          UI.grid(view.idx('0:6'), { axisLabels: true, highlight: function () { return 'r'; } }),
          note('(전체 결과의 앞부분만 그렸다)'),
          p(ex.why)
        ])
      ]));
      host.appendChild(UI.out(
        ex.v + '.shape  →  ' + ND.shapeStr(view.shape) + '\n' +
        ex.v + '.ndim   →  ' + view.ndim + '\n' +
        ex.v + '.size   →  ' + view.size, { label: '엔진이 계산한 결과' }));
    }

    var seg = UI.seg({
      label: '인덱스식',
      options: EXPRS.map(function (e, i) { return { value: String(i), label: e.v }; }),
      value: '0',
      onChange: function (v) { state.i = parseInt(v, 10); rebuild(); }
    });

    rebuild();
    return UI.card({
      kicker: '시뮬레이터',
      title: '열 하나 뽑기 — 정수와 슬라이스는 결과의 차원이 다르다',
      note: '수업 셀 5 는 <code>data[:, :1]</code> 을 쓴다. <code>data[:, 0]</code> 과 뽑히는 <b>숫자는 같은데 shape 가 다르다.</b> ' +
        '규칙은 하나다 — <b>정수는 축을 없애고, 슬라이스는 축을 남긴다.</b>',
      body: [UI.controls([seg]), host]
    });
  }

  function secRatings(root) {
    root.appendChild(h2('2. 첫 실습 — 영화 평점 데이터'));
    root.appendChild(p('MovieLens 는 미네소타 대학 GroupLens 연구팀이 모아 공개하는 영화 평점 자료다. ' +
      '이 실습에 쓰는 <code>ra.csv</code> 는 <b>사용자 610명이 영화 9,724편에 매긴 평점 100,836개</b>를 담고 있다. ' +
      '한 줄이 「누가 · 어떤 영화에 · 몇 점을 · 언제」 매겼는지를 기록한 <b>2차원</b> 데이터다. ' +
      '(출처: grouplens.org 의 MovieLens 데이터셋)'));

    var sample = (D && D.nd) ? D.nd('ratingsSample') : null;
    var meta = D ? D.ratingsMeta : null;

    if (!sample || !meta) {
      root.appendChild(UI.callout('trap',
        '이 빌드에는 영화 평점 데이터가 들어 있지 않다. <code>수업자료/ra.csv</code> 를 놓고 ' +
        '<code>node webapp/build.js</code> 를 다시 실행하면 이 절의 숫자가 살아난다.'));
      return;
    }

    /* ---- loadtxt ---- */
    root.appendChild(h3('가. np.loadtxt 로 읽어 들이기'));
    root.appendChild(UI.code("import numpy as np\n\n" +
      "data = np.loadtxt('수업자료/ra.csv', delimiter=',', skiprows=1)"));
    root.appendChild(UI.table(
      [{ k: 'a', label: '인자' }, { k: 'm', label: '뜻', raw: true }],
      [
        { a: "'수업자료/ra.csv'", m: '읽을 파일. 첫 인자라 이름 없이 넘긴다.' },
        { a: "delimiter=','", m: '값을 나누는 문자. <b>기본값은 공백</b>이므로 CSV 는 반드시 콤마를 지정해야 한다.' },
        { a: 'skiprows=1', m: '맨 앞 1줄(헤더)을 버린다. ' + '<code>' + UI.esc(meta.header) + '</code> 이 그 줄이다.' },
        { a: 'dtype (생략됨)', m: '기본값이 <code>float64</code>. 그래서 정수처럼 보이는 userId 도 <code>1.0</code> 으로 들어온다.' }
      ]
    ));
    root.appendChild(p('<code>skiprows=1</code> 을 빼면 어떻게 될까? 헤더 줄의 <code>userId</code> 라는 ' +
      '<b>글자를 실수로 바꿀 수 없으므로</b> 읽기 자체가 실패한다.'));
    root.appendChild(UI.code("np.loadtxt('수업자료/ra.csv', delimiter=',')   # skiprows 없이"));
    root.appendChild(UI.errBlock("could not convert string 'userId' to float64 at row 0, column 1."));
    root.appendChild(note('메시지 문구는 NumPy 버전에 따라 조금 다르지만 뜻은 같다 — 글자를 숫자로 바꿀 수 없다.'));

    /* ---- 형태 확인 ---- */
    root.appendChild(h3('나. 읽어 온 것이 무엇인지 확인하기 (셀 6~8)'));
    root.appendChild(UI.code('type(data)\ndata.ndim\ndata.shape'));
    root.appendChild(UI.out(
      "<class 'numpy.ndarray'>\n" +
      meta.trueShape.length + '\n' +
      ND.shapeStr(meta.trueShape)));
    root.appendChild(p('<code>type</code> 이 <code>numpy.ndarray</code> 라는 것이 중요하다. ' +
      '파이썬 <code>list</code> 가 아니라 <b>NumPy 배열</b>이라서 <code>.shape</code>, <code>.ndim</code> 같은 ' +
      '속성과 반복문 없는 계산을 쓸 수 있다.'));

    root.appendChild(UI.callout('ver',
      'MovieLens 데이터는 <b>재배포가 금지</b>되어 있다(라이선스 조건). 그래서 이 페이지에 실린 ' +
      num(meta.sampleRows) + '행은 실제 파일이 아니라 <b>구조만 같게 만든 합성 데이터</b>다 — ' +
      '열 구성(<code>userId, movieId, rating, timestamp</code>)과 값의 범위는 실제와 같지만 내용은 다르다. ' +
      '반면 전체 shape <code>' + ND.shapeStr(meta.trueShape) + '</code> 와 아래 집계값(사용자 수, 영화 수, 평점 평균, 분포)은 ' +
      '<b>실제 파일에서 계산한 사실</b>이다. ' +
      '실제 데이터로 실습하고 싶다면 grouplens.org/datasets/movielens 에서 직접 받아 ' +
      '주피터에서 <code>np.loadtxt</code> 로 열어 보라 — 그것이 이 절의 진짜 목표다.',
      '이 페이지의 평점 표본은 합성 데이터다'));

    var head = sample.idx('0:6, :');
    root.appendChild(panel('data[0:6, :] — 표본의 앞 6행', 'a', [
      UI.grid(head, {
        axisLabels: true,
        highlight: function (idx) { return idx[1] === 2 ? 'x' : 'a'; }
      }),
      note('열 0 userId · 열 1 movieId · <b>열 2 rating</b>(노랑) · 열 3 timestamp')
    ]));
    var ts0 = head.get([0, 3]);
    root.appendChild(note('열 3 의 <code>' + ts0 + '</code> 은 1970년 1월 1일부터 흐른 <b>초</b>다. ' +
      '날짜로 바꾸면 ' + new Date(ts0 * 1000).toISOString().slice(0, 10) + ' 이다. ' +
      '값이 모두 float64 라 <code>' + ND.fmtScalar(ts0, 'float64') + '</code> 처럼 소수점이 붙는다.'));

    root.appendChild(simColumnPick(sample));

    /* ---- 집계값 ---- */
    root.appendChild(h3('다. 전체 데이터의 집계값'));
    root.appendChild(UI.statRow([
      { k: '전체 shape', v: ND.shapeStr(meta.trueShape), sub: '평점 기록 × 열 4개' },
      { k: '사용자', v: num(meta.users) + '명', sub: 'userId 의 종류 수' },
      { k: '영화', v: num(meta.movies) + '편', sub: 'movieId 의 종류 수' },
      { k: '평점 평균', v: String(meta.ratingMean), sub: '10만 건 전체' },
      { k: '평점 범위', v: meta.ratingMin + ' ~ ' + ND.fmtScalar(meta.ratingMax, 'float64'), sub: '0.5점 단위' }
    ]));
    root.appendChild(note('이 다섯 값은 ' + num(meta.trueShape[0]) + '행 <b>전체</b>로 정확히 계산해 이 페이지에 새겨 넣은 값이다.'));

    /* ---- 분포 ---- */
    var metaHist = (meta.ratingHist || []).filter(function (e) { return e && e[1] !== null && e[1] !== undefined; });
    var metaTotal = metaHist.reduce(function (s, e) { return s + e[1]; }, 0);
    var useMeta = metaHist.length >= 10 && metaTotal === meta.trueShape[0];

    var pairs, srcLabel;
    if (useMeta) {
      pairs = metaHist;
      srcLabel = '전체 ' + num(meta.trueShape[0]) + '개 평점';
    } else {
      var rcol = sample.idx(':, 2');
      var cnt = {};
      rcol.flatValues().forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; });
      pairs = Object.keys(cnt).map(Number).sort(function (a, b) { return a - b; })
        .map(function (k) { return [k, cnt[k]]; });
      srcLabel = '이 페이지에 실린 표본 ' + num(meta.sampleRows) + '행';
    }

    root.appendChild(h3('라. 평점 분포 — 0.5점 단위'));
    root.appendChild(barRows(pairs, { fmtKey: function (k) { return k.toFixed(1); } }));
    root.appendChild(note('막대는 <b>' + srcLabel + '</b>을 이 자리에서 세어 그린 것이다. ' +
      '사람들은 3.0, 4.0 처럼 <b>정수 점수를 훨씬 많이 주고</b>, 0.5점 단위는 드물게 쓴다.'));

    var rcol2 = sample.idx(':, 2');
    var m = ND.mean(rcol2).toNested();
    root.appendChild(UI.code('rating = data[:, 2]\nnp.mean(rating), np.min(rating), np.max(rating)'));
    root.appendChild(UI.out(
      '평균  ' + m.toFixed(6) + '\n' +
      '최소  ' + ND.fmtScalar(ND.min(rcol2).toNested(), 'float64') + '\n' +
      '최대  ' + ND.fmtScalar(ND.max(rcol2).toNested(), 'float64') + '\n' +
      '중앙값 ' + ND.fmtScalar(ND.median(rcol2).toNested(), 'float64'),
      { label: '합성 표본 ' + num(meta.sampleRows) + '행으로 엔진이 계산' }));
    root.appendChild(note('여기 나온 평균 ' + m.toFixed(6) + ' 은 <b>합성 표본</b>에서 나온 값이므로, ' +
      '실제 전체 평균 ' + meta.ratingMean + ' 과 같을 이유가 없다. ' +
      '중요한 것은 숫자가 아니라 <b>계산하는 방법</b>이다 — <code>data[:, 2]</code> 로 평점 열만 꺼내 ' +
      '<code>.mean()</code> 을 부른다는 절차는 실제 파일에서도 똑같다.'));
  }

  /* ==========================================================================
   * 3. 두 번째 실습 — mnist 3차원 데이터 (셀 9~17)
   * ======================================================================== */

  /* 8×8 로 줄인 가짜 손글씨. 값은 0(검정)~255(흰 글씨). 손으로 찍은 그림이다. */
  var FAKE_DIGITS = [
    {
      label: '7',
      px: [
        [0, 200, 255, 255, 255, 255, 180, 0],
        [0, 0, 0, 0, 0, 220, 60, 0],
        [0, 0, 0, 0, 150, 200, 0, 0],
        [0, 0, 0, 90, 255, 40, 0, 0],
        [0, 0, 30, 240, 120, 0, 0, 0],
        [0, 0, 180, 220, 0, 0, 0, 0],
        [0, 0, 210, 110, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0]
      ]
    },
    {
      label: '1',
      px: [
        [0, 0, 0, 180, 255, 0, 0, 0],
        [0, 0, 150, 255, 255, 0, 0, 0],
        [0, 0, 0, 40, 255, 0, 0, 0],
        [0, 0, 0, 0, 255, 0, 0, 0],
        [0, 0, 0, 0, 255, 0, 0, 0],
        [0, 0, 0, 0, 255, 20, 0, 0],
        [0, 0, 190, 230, 255, 230, 190, 0],
        [0, 0, 0, 0, 0, 0, 0, 0]
      ]
    },
    {
      label: '3',
      px: [
        [0, 120, 255, 255, 230, 90, 0, 0],
        [0, 0, 0, 0, 60, 255, 0, 0],
        [0, 0, 0, 30, 200, 180, 0, 0],
        [0, 0, 140, 255, 220, 40, 0, 0],
        [0, 0, 0, 0, 80, 240, 0, 0],
        [0, 0, 0, 0, 0, 255, 80, 0],
        [0, 150, 255, 255, 200, 60, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0]
      ]
    }
  ];

  function simPixelExplorer() {
    var imgs = ND.stack(FAKE_DIGITS.map(function (d) { return ND.array(d.px, 'uint8'); }), 0);
    var state = { k: 0, i: 2, j: 4 };
    var host = el('div');

    function rebuild() {
      UI.clear(host);
      var layer = imgs.idx(state.k + ', :, :');
      var isSel = function (idx) { return idx[0] === state.i && idx[1] === state.j; };
      var val = imgs.get([state.k, state.i, state.j]);

      host.appendChild(el('div', { class: 'stack-2' }, [
        panel('그림으로 — imgs[' + state.k + ']', null, [
          el('div', { style: { maxWidth: '250px' } }, [
            UI.heatmap(layer, {
              vmin: 0, vmax: 255, rowLabel: '행 i', colLabel: '열 j',
              highlight: isSel, tableView: false
            })
          ]),
          note('밝을수록 큰 값이다. 진한 파랑 = 0(배경), 연한 파랑 = 255(글씨). 주황 테두리가 지금 고른 픽셀이다.')
        ]),
        panel('숫자로 — 같은 배열, 칸을 눌러 보자', 'a', [
          UI.grid(layer, {
            axisLabels: true, cellSize: 30,
            highlight: function (idx, v) {
              if (isSel(idx)) return 'x';
              return v > 0 ? 'a' : 'dim';
            },
            onClick: function (idx) { state.i = idx[0]; state.j = idx[1]; rebuild(); }
          })
        ])
      ]));

      host.appendChild(UI.code(
        'imgs.shape        # ' + ND.shapeStr(imgs.shape) + '   (장수, 높이, 너비)\n' +
        'imgs.dtype        # ' + imgs.dtype + '\n' +
        'imgs[' + state.k + '].shape     # ' + ND.shapeStr(layer.shape) + '   ← 인덱스 1개 → 장 하나(2차원)\n' +
        'imgs[' + state.k + ', ' + state.i + '].shape  # ' +
          ND.shapeStr(imgs.idx(state.k + ', ' + state.i).shape) + '   ← 인덱스 2개 → 행 하나(1차원)\n' +
        'imgs[' + state.k + ', ' + state.i + ', ' + state.j + ']     # ' + val +
          '   ← 인덱스 3개 → 픽셀 하나(0차원)'));
      host.appendChild(UI.out(
        '고른 픽셀: imgs[' + state.k + ', ' + state.i + ', ' + state.j + '] = ' + val +
        '   (' + (val === 0 ? '배경' : '글씨') + ')', { label: '지금 상태' }));
      host.appendChild(UI.fold('이 장을 숫자로 통째로 보기 — print(imgs[' + state.k + '])',
        UI.out(ND.format(layer), { label: false })));
    }

    var sl = UI.slider({
      label: '장 index k', min: 0, max: imgs.shape[0] - 1, step: 1, value: 0,
      format: function (v) { return 'k = ' + v + ' (숫자 ' + FAKE_DIGITS[v].label + ' 모양)'; },
      onChange: function (v) { state.k = Math.round(v); rebuild(); }
    });

    rebuild();
    return UI.card({
      kicker: '시뮬레이터',
      title: '가짜 손글씨 픽셀 탐험기',
      note: '<b>솔직히 밝힌다 — 이 데이터는 진짜 mnist 가 아니다.</b> 이 페이지는 인터넷에 연결하지 않고 ' +
        '혼자 도는 파일이라 60,000장을 담을 수 없다. 그래서 28×28 대신 <b>8×8 로 줄인 숫자 모양 3장을 손으로 찍어</b> ' +
        '(장수, 높이, 너비) = ' + '(3, 8, 8) 3차원 배열로 쌓았다. 구조는 mnist 와 완전히 같다.',
      body: [UI.controls([sl]), host]
    });
  }

  function secMnist(root) {
    root.appendChild(h2('3. 두 번째 실습 — mnist 3차원 데이터'));
    root.appendChild(p('mnist 는 사람이 손으로 쓴 숫자 0~9 를 <b>28×28 흑백 이미지</b>로 모아 둔 자료다. ' +
      '학습용 60,000장과 시험용 10,000장으로 나뉘어 있어, 학습 데이터의 shape 는 <code>(60000, 28, 28)</code> 이 된다. ' +
      '머신러닝 입문에서 가장 많이 쓰이는 3차원 데이터다.'));
    root.appendChild(p('<b>케라스(Keras)</b>는 딥러닝 모델을 간단하게 만들고 훈련시키는 프레임워크다. ' +
      '쓰기 쉬운 고수준 API 를 제공하고, 실제 계산은 백엔드 엔진인 텐서플로가 맡는다. ' +
      'mnist 는 케라스에 예제 데이터로 딸려 있어 한 줄로 불러올 수 있다.'));

    root.appendChild(UI.code(
      '!pip install keras\n' +
      '!pip install tensorflow          # 코랩(Colab)에는 이미 깔려 있다\n\n' +
      'from keras.datasets import mnist\n' +
      '(train_imgs, train_labels), (test_imgs, test_labels) = mnist.load_data()\n\n' +
      'train_imgs.shape     # (60000, 28, 28)   ← 3차원\n' +
      'train_imgs.dtype     # uint8             ← 픽셀은 0~255\n' +
      'test_imgs.shape      # (10000, 28, 28)\n' +
      'train_labels.shape   # (60000,)          ← 정답 숫자는 1차원\n\n' +
      'train_imgs[6]        # 7번째 이미지 한 장 → shape (28, 28)\n\n' +
      'import matplotlib.pyplot as plt\n' +
      'plt.imshow(test_imgs[6], cmap=plt.cm.binary)\n' +
      'test_labels[6]       # 그 이미지의 정답 숫자'));

    root.appendChild(UI.callout('tip',
      '이 절은 <b>NumPy 를 배우는 데 꼭 필요한 부분이 아니다.</b> keras 와 tensorflow 를 설치해야 하고, ' +
      '설치는 느리고 자주 실패한다. 목적은 딱 하나 — <b>3차원 배열이 실제로 어디에 쓰이는지 눈으로 보는 것</b>이다. ' +
      '그 목적은 아래 시뮬레이터로도 충분히 달성된다.'));

    var px = 60000 * 28 * 28;
    var one = ND.dtypeInfo('uint8').itemsize, eight = ND.dtypeInfo('float64').itemsize;
    root.appendChild(p('숫자로 감을 잡아 보자. 학습 이미지의 원소 개수는 ' +
      '<code>60000 × 28 × 28 = ' + num(px) + '</code> 개다. ' +
      'dtype 이 <code>uint8</code>(1바이트)이니 <code>nbytes</code> 는 ' + num(px * one) + ' 바이트, 약 ' +
      (px * one / 1024 / 1024).toFixed(1) + ' MiB 다. ' +
      '만약 이걸 <code>float64</code>(8바이트)로 바꿔 담으면 ' + num(px * eight) + ' 바이트 = 약 ' +
      (px * eight / 1024 / 1024 / 1024).toFixed(2) + ' GiB 로 <b>8배</b>가 된다. ' +
      '<b>dtype 선택이 곧 메모리 선택</b>이라는 것을 여기서 알 수 있다.'));

    root.appendChild(UI.callout('trap',
      '<code>test_labels[6]</code> 이 몇인지는 <b>여기서 단정하지 않는다.</b> ' +
      '이 실습장 안에는 실제 mnist 파일이 없으므로 확인할 방법이 없고, ' +
      '확인하지 않은 값을 적어 두면 그것부터 외우게 된다. ' +
      '코랩에서 직접 불러와 <code>plt.imshow</code> 로 그린 그림과 라벨이 맞는지 눈으로 확인해 보자.',
      '확인할 수 없는 값은 적지 않는다'));

    root.appendChild(simPixelExplorer());

    root.appendChild(UI.callout('why',
      '이미지가 왜 3차원인가? 흑백 이미지 한 장은 (높이, 너비) 2차원이다. ' +
      '거기에 <b>「몇 번째 장인가」라는 축이 앞에 하나 붙어</b> 3차원이 된다. ' +
      'NumPy 에서 <b>맨 앞 축(axis 0)은 관례적으로 「샘플 번호」</b>다. ' +
      '그래서 <code>imgs[7]</code> 처럼 정수 하나만 주면 이미지 한 장이 통째로 나온다.'));
  }

  /* ==========================================================================
   * 4. 배열 만들기와 dtype (셀 19~31)
   * ======================================================================== */

  /** NumPy 가 문자열을 float 로 바꾸는 과정을 그대로 흉내 낸다 */
  function pyFloatList(list) {
    return list.map(function (v) {
      if (typeof v !== 'string') return v;
      var t = v.trim();
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
        throw new ND.NDError("could not convert string to float: '" + v + "'");
      }
      return parseFloat(t);
    });
  }

  /** np.round 와 같은 은행가 반올림(round-half-to-even) */
  function bankersRound(x) {
    var fl = Math.floor(x), diff = x - fl;
    if (diff > 0.5) return fl + 1;
    if (diff < 0.5) return fl;
    return (fl % 2 === 0) ? fl : fl + 1;
  }

  function fmtRound(v, r) {
    if (r === 0 && v < 0) return '-0.0';
    return ND.fmtScalar(r, 'float64');
  }

  /* ---- 함정 1: 정수 오버플로 ---- */

  function trapOverflow() {
    var RANGE = {
      int8: { min: -400, max: 400, step: 1, def: 200 },
      uint8: { min: -400, max: 400, step: 1, def: 300 },
      int16: { min: -100000, max: 100000, step: 250, def: 40000 },
      int32: { min: -6000000000, max: 6000000000, step: 50000000, def: 3000000000 }
    };
    var state = { dt: 'int8', v: RANGE.int8.def };
    var ctlHost = el('div'), outHost = el('div');

    var dtSeg = UI.seg({
      label: 'dtype', options: ['int8', 'uint8', 'int16', 'int32'], value: 'int8',
      onChange: function (v) { state.dt = v; state.v = RANGE[v].def; buildCtl(); rebuild(); }
    });

    function buildCtl() {
      UI.clear(ctlHost);
      var r = RANGE[state.dt];
      ctlHost.appendChild(UI.controls([dtSeg, UI.slider({
        label: '넣을 값', min: r.min, max: r.max, step: r.step, value: state.v,
        format: function (v) { return num(v); },
        onChange: function (v) { state.v = v; rebuild(); }
      })]));
    }

    function rebuild() {
      UI.clear(outHost);
      var info = ND.DTYPES[state.dt];
      var bits = info.itemsize * 8, span = Math.pow(2, bits);
      var stored = ND.castValue(state.v, state.dt);
      var wrapped = stored !== Math.trunc(state.v);

      var src = ND.array([state.v], 'float64');
      var got = src.astype(state.dt);

      outHost.appendChild(UI.statRow([
        { k: 'dtype', v: state.dt, sub: info.itemsize + '바이트 = ' + bits + '비트' },
        { k: '담을 수 있는 값', v: num(info.min) + ' ~ ' + num(info.max), sub: '가짓수 2^' + bits + ' = ' + num(span) },
        { k: '넣은 값', v: num(state.v), sub: '파이썬 정수' },
        { k: '실제로 저장된 값', v: num(stored), sub: wrapped ? '접혔다!' : '그대로 들어갔다' }
      ]));

      outHost.appendChild(UI.code(
        'a = np.array([' + state.v + ']).astype(np.' + state.dt + ')\n' +
        'a          # ' + ND.format(got, { mode: 'repr' })));

      if (wrapped) {
        outHost.appendChild(UI.steps([
          bits + '비트로는 서로 다른 값 <b>' + num(span) + '가지</b>밖에 구별할 수 없다.',
          num(state.v) + ' 를 ' + num(span) + ' 로 나눈 나머지: <b>' +
            num(((Math.trunc(state.v) % span) + span) % span) + '</b>',
          info.kind === 'u'
            ? '<code>' + state.dt + '</code> 은 부호가 없으니 나머지가 그대로 저장값 <b>' + num(stored) + '</b> 이 된다.'
            : '나머지가 ' + num(span / 2) + ' 이상이면 음수 쪽으로 넘어간다 → ' +
              num(((Math.trunc(state.v) % span) + span) % span) + ' − ' + num(span) + ' = <b>' + num(stored) + '</b>'
        ]));
        outHost.appendChild(UI.grid(got, { highlight: function () { return 'err'; } }));
      } else {
        outHost.appendChild(UI.grid(got, { highlight: function () { return 'r'; } }));
        outHost.appendChild(note('아직 범위 안이다. 슬라이더를 더 밀어 ' + num(info.max) + ' 를 넘겨 보자.'));
      }

      // 연산 중에도 넘친다
      var i8 = ND.array([100, 100], 'int8');
      outHost.appendChild(el('div', { style: { marginTop: '1rem' } }, [
        el('div', { class: 'panel-t', text: '덧셈만으로도 넘친다' }),
        UI.code('b = np.array([100, 100], dtype=np.int8)\nb + b'),
        UI.out(ND.format(ND.ops.add(i8, i8), { mode: 'repr' }) +
          '\nRuntimeWarning: overflow encountered in add'),
        note('100 + 100 = 200 은 int8 의 127 을 넘는다. NumPy 는 <b>경고만 띄우고 계산을 멈추지 않는다.</b> ' +
          '경고를 못 보고 지나가면 −56 을 정답으로 믿게 된다.')
      ]));
    }

    buildCtl();
    rebuild();
    return el('div', null, [
      p('정수 dtype 은 <b>쓸 수 있는 비트 수가 정해져 있다.</b> 범위를 넘는 값을 넣으면 시계처럼 한 바퀴 돌아 ' +
        '엉뚱한 값이 된다. 이걸 <b>오버플로(overflow)</b> 또는 랩어라운드라고 한다.'),
      ctlHost, outHost,
      UI.callout('ver',
        'NumPy 2.0 부터 <b>파이썬 정수를 범위 밖 dtype 에 직접 넣으면 예외</b>가 난다: ' +
        '<code>np.array(300, dtype=np.int8)</code> → <code>OverflowError</code>. ' +
        '1.x 에서는 조용히 44 가 되었다. 하지만 <code>astype</code> 이나 배열끼리의 연산은 ' +
        '<b>2.x 에서도 여전히 조용히 접힌다.</b> 즉 위험이 사라진 게 아니라 한 곳만 막힌 것이다.')
    ]);
  }

  /* ---- 함정 2: astype 은 버림이다 ---- */

  function trapAstype() {
    var state = { v: 1.7 };
    var outHost = el('div');

    function rebuild() {
      UI.clear(outHost);
      var v = state.v;
      var a = ND.array([v], 'float64');
      var cut = a.astype('int64');
      var r = bankersRound(v);

      outHost.appendChild(el('div', { class: 'stack-3' }, [
        panel('원래 값', 'a', [UI.grid(a, { highlight: function () { return 'a'; } })]),
        panel('astype(int) — 버림', 'r', [UI.grid(cut, { highlight: function () { return 'r'; } }),
          note('소수점 아래를 <b>0 쪽으로 그냥 버린다</b>')]),
        panel('np.round — 반올림', 'r', [
          UI.grid(ND.array([r], 'float64'), { highlight: function () { return 'x'; } }),
          note('결과는 실수(float)로 남는다')])
      ]));
      outHost.appendChild(UI.code(
        'v = ' + v.toFixed(1) + '\n' +
        'np.array([v]).astype(int)   # ' + ND.format(cut, { mode: 'repr' }) + '\n' +
        'np.round(v)                 # ' + fmtRound(v, r)));
      if (v < 0) {
        outHost.appendChild(note('음수에서 차이가 확 드러난다. ' + v.toFixed(1) +
          ' 의 버림은 ' + cut.get([0]) + ' 이다 — <b>내림(floor)이 아니라 0 쪽으로 자르기</b>다. ' +
          'floor 는 ' + Math.floor(v) + ' 가 된다.'));
      }
    }

    var sl = UI.slider({
      label: '값 v', min: -3, max: 3, step: 0.1, value: 1.7,
      format: function (v) { return v.toFixed(1); },
      onChange: function (v) { state.v = Math.round(v * 10) / 10; rebuild(); }
    });

    // 은행가 반올림 표 — 계산해서 만든다
    var cases = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
    var rows = cases.map(function (v) {
      var school = (v < 0 ? -1 : 1) * Math.round(Math.abs(v));   // 학교에서 배운 식
      var np = bankersRound(v);
      return {
        v: v.toFixed(1),
        np: fmtRound(v, np),
        sc: (school === 0 && v < 0 ? '-0.0' : ND.fmtScalar(school, 'float64')),
        same: np === school ? '같다' : '다르다!'
      };
    });

    rebuild();
    return el('div', null, [
      p('<code>astype(int)</code> 은 <b>반올림이 아니라 버림</b>이다. 1.7 은 1 이 되고 −1.7 은 −1 이 된다. ' +
        '반올림이 필요하면 <code>np.round</code> 를 써야 하는데, 이쪽도 학교에서 배운 반올림과 다르다.'),
      UI.controls([sl]), outHost,
      h3('np.round 는 「.5 는 짝수 쪽으로」 반올림한다'),
      UI.table(
        [{ k: 'v', label: '값', num: true }, { k: 'np', label: 'np.round(v)', num: true },
          { k: 'sc', label: '학교에서 배운 반올림', num: true }, { k: 'same', label: '비교' }],
        rows
      ),
      UI.callout('trap',
        '<code>np.round(0.5)</code> 는 <b>1.0 이 아니라 0.0</b> 이고, <code>np.round(2.5)</code> 는 ' +
        '<b>3.0 이 아니라 2.0</b> 이다. 이것을 <b>은행가 반올림</b>(round-half-to-even)이라고 한다. ' +
        '.5 를 항상 위로 올리면 많은 값을 더할 때 합이 조금씩 커지는 <b>편향</b>이 생기는데, ' +
        '짝수 쪽으로 번갈아 보내면 그 편향이 상쇄된다. ' +
        '파이썬 내장 <code>round()</code> 도 같은 규칙이다 — 이건 NumPy 의 변덕이 아니라 IEEE 754 표준이다.')
    ]);
  }

  /* ---- 함정 3: 부동소수 오차 ---- */

  function trapFloat() {
    var CASES = [
      { code: '0.1 + 0.2', calc: function () { return 0.1 + 0.2; }, t: 0.3, tc: '0.3' },
      { code: '0.1 * 3', calc: function () { return 0.1 * 3; }, t: 0.3, tc: '0.3' },
      { code: '1 - 0.9', calc: function () { return 1 - 0.9; }, t: 0.1, tc: '0.1' },
      { code: '0.1 + 0.7', calc: function () { return 0.1 + 0.7; }, t: 0.8, tc: '0.8' },
      { code: 'np.sqrt(2) ** 2', calc: function () { return Math.sqrt(2) * Math.sqrt(2); }, t: 2, tc: '2.0' }
    ];
    var state = { i: 0 };
    var outHost = el('div');

    function rebuild() {
      UI.clear(outHost);
      var c = CASES[state.i];
      var left = c.calc();
      var eq = ND.ops.eq(ND.array([left], 'float64'), ND.array([c.t], 'float64'));
      var diff = left - c.t;
      var close = ND.isclose(left, c.t);

      outHost.appendChild(UI.code(
        c.code + ' == ' + c.tc + '\n' +
        'np.isclose(' + c.code + ', ' + c.tc + ')'));
      outHost.appendChild(UI.out(
        ND.format(eq).replace(/[[\]]/g, '') + '\n' + (close ? 'True' : 'False')));

      outHost.appendChild(UI.statRow([
        { k: c.code, v: String(left), sub: '컴퓨터가 실제로 가진 값' },
        { k: c.tc, v: String(c.t), sub: '우리가 기대한 값' },
        { k: '차이', v: diff === 0 ? '0' : diff.toExponential(4), sub: diff === 0 ? '정확히 같다' : '0 이 아니다' },
        { k: '== 결과', v: (left === c.t) ? 'True' : 'False', sub: 'np.isclose 는 ' + (close ? 'True' : 'False') }
      ]));

      if (left !== c.t) {
        outHost.appendChild(UI.callout('why',
          '<code>' + c.code + '</code> 의 참값은 <code>' + c.tc + '</code> 이지만 컴퓨터는 ' +
          '<b>' + String(left) + '</b> 을 갖고 있다. 차이는 ' + diff.toExponential(4) + ' — ' +
          '눈에 보이지 않을 만큼 작지만 <b>0 이 아니므로 <code>==</code> 는 False</b> 다.'));
      }
    }

    var sel = UI.select({
      label: '비교식',
      options: CASES.map(function (c, i) { return { value: String(i), label: c.code + ' == ' + c.tc }; }),
      value: '0',
      onChange: function (v) { state.i = parseInt(v, 10); rebuild(); }
    });

    // 0.1 을 열 번 더하기 — 엔진으로 실제 계산
    var ten = ND.full([10], 0.1, 'float64');
    var tenSum = ND.sum(ten).toNested();
    var cum = ND.cumsum(ten);

    rebuild();
    return el('div', null, [
      p('컴퓨터는 실수를 <b>2진 소수</b>로 저장한다. 10진수 0.1 은 2진수로 쓰면 ' +
        '0.0001100110011… 처럼 <b>끝나지 않는 소수</b>라서, float64 는 유효숫자 약 15~17자리에서 잘라 저장한다. ' +
        '그래서 아주 작은 오차가 항상 남는다. 아래 계산은 이 브라우저가 지금 한 것이다 — ' +
        'NumPy 도 같은 IEEE 754 규격을 쓰므로 결과가 같다.'),
      UI.controls([sel]), outHost,
      h3('0.1 을 열 번 더하면 1.0 이 아니다'),
      UI.code('a = np.full(10, 0.1)\na.sum()          # ?\na.sum() == 1.0\nnp.isclose(a.sum(), 1.0)'),
      UI.out(String(tenSum) + '\n' +
        ((tenSum === 1) ? 'True' : 'False') + '\n' +
        (ND.isclose(tenSum, 1) ? 'True' : 'False')),
      note('누적합을 보면 오차가 어디서 생기는지 보인다: ' +
        cum.flatValues().slice(0, 4).map(String).join(' → ') + ' → …'),
      UI.callout('tip',
        '실수를 <code>==</code> 로 비교하지 마라. <code>np.isclose(a, b)</code> 로 값 하나를, ' +
        '<code>np.allclose(A, B)</code> 로 배열 전체를 비교한다. ' +
        '두 함수는 <b>상대오차 rtol=1e-05, 절대오차 atol=1e-08</b> 안에 들면 같다고 본다. ' +
        '물리 실험값을 다루거나 수치해석 코드를 검증할 때 반드시 필요하다.'),
      UI.callout('why',
        '왜 float64 는 <b>정확한</b> 값을 안 쓰는가? 유리수를 정확히 담으려면 분모·분자를 따로 저장해야 하고 ' +
        '연산할 때마다 자리수가 불어난다. 과학 계산은 <b>고정된 8바이트로 일정한 속도</b>를 내는 것이 더 중요하다. ' +
        '정확한 10진 계산이 꼭 필요하면 파이썬 <code>decimal</code>, <code>fractions</code> 모듈을 쓴다.')
    ]);
  }

  function simDtypeLab() {
    var TABS = [
      { id: '0', label: '정수 오버플로', build: trapOverflow },
      { id: '1', label: 'astype vs round', build: trapAstype },
      { id: '2', label: '부동소수 오차', build: trapFloat }
    ];
    var state = { t: '0' };
    var host = el('div');

    function rebuild() {
      UI.clear(host);
      var tab = TABS.filter(function (x) { return x.id === state.t; })[0];
      host.appendChild(tab.build());
    }

    var seg = UI.seg({
      label: '함정', options: TABS.map(function (t) { return { value: t.id, label: t.label }; }),
      value: '0', onChange: function (v) { state.t = v; rebuild(); }
    });

    rebuild();
    return UI.card({
      kicker: '시뮬레이터',
      title: 'dtype 실험실 — 세 가지 함정',
      note: 'dtype 은 「그냥 자료형」이 아니다. <b>값을 조용히 바꿔 버리는 규칙</b>이다. ' +
        '세 함정을 직접 건드려 보자. 여기서 놓치면 나중에 계산 결과가 왜 틀렸는지 절대 못 찾는다.',
      body: [UI.controls([seg]), host]
    });
  }

  function secDtype(root) {
    root.appendChild(h2('4. 배열 만들기와 dtype'));
    root.appendChild(p('배열은 <code>np.array(리스트)</code> 로 만든다. 여기서 list 와 결정적으로 갈린다 — ' +
      '<b>NumPy 배열은 한 가지 dtype 만 담는다.</b> 정수와 문자열을 섞어 넣을 수 없다. ' +
      '이 제약 덕분에 값들을 메모리에 빈틈없이 나란히 놓을 수 있고, ' +
      'C 로 짜인 계산 루틴이 반복문 없이 한꺼번에 처리할 수 있다. ' +
      '<b>NumPy 의 속도는 이 제약을 받아들인 대가로 얻은 것이다.</b>'));

    /* ---- 셀 22~29 ---- */
    root.appendChild(h3('가. 섞인 리스트를 넣으면 (셀 22~29)'));
    root.appendChild(UI.code("arr = np.array([1, 2, 3, 4, '9'], float)\narr"));
    var arr = ND.array(pyFloatList([1, 2, 3, 4, '9']), 'float64');
    root.appendChild(UI.out(ND.format(arr, { mode: 'repr' })));
    root.appendChild(p('두 번째 인자 <code>float</code> 가 dtype 지정이다. ' +
      '<b>문자열 <code>\'9\'</code> 가 숫자 9.0 으로 바뀌었고</b>, 원래 정수였던 1, 2, 3, 4 도 모두 실수가 되었다. ' +
      '한 배열에 두 dtype 이 있을 수 없으니 <b>전부 하나로 맞춘 것</b>이다.'));
    root.appendChild(UI.out(
      'arr[3]        →  ' + ND.fmtScalar(arr.get([3]), arr.dtype) + '\n' +
      "type(arr)     →  <class 'numpy.ndarray'>\n" +
      'arr.dtype     →  ' + arr.dtype + '\n' +
      'arr.ndim      →  ' + arr.ndim + '\n' +
      'arr.size      →  ' + arr.size, { label: '셀 23~29' }));

    root.appendChild(el('div', { class: 'stack-2' }, [
      panel('dtype 을 빼면 — 전부 문자열이 된다', 'b', [
        UI.code("arr2 = np.array([1, 2, 3, 4, '9'])   # float 을 안 줬다\narr2\narr2.dtype\narr2 + 1"),
        UI.out("array(['1', '2', '3', '4', '9'], dtype='<U21')\ndtype('<U21')"),
        UI.errBlock("ufunc 'add' did not contain a loop with signature matching types " +
          "(dtype('<U21'), dtype('int64')) -> None", 'UFuncTypeError'),
        note('숫자 하나가 문자열이면 <b>NumPy 는 숫자를 문자열로 끌어올린다</b>(그 반대가 아니다). ' +
          '<code>&lt;U21</code> 은 「유니코드 문자 최대 21자」라는 뜻이다. 21 은 int64 를 글자로 적을 때 필요한 최대 자리수다. ' +
          '이 실습장의 엔진에는 문자열 dtype 이 없어서 이 출력만은 실제 NumPy 결과를 옮겨 적었다.')
      ]),
      panel('숫자가 아닌 글자는 실수로 못 바꾼다', 'b', [
        UI.code("np.array([1, 2, 'abc'], float)"),
        shown(function () { return UI.grid(ND.array(pyFloatList([1, 2, 'abc']), 'float64')); }),
        note("<code>'9'</code> 는 숫자로 읽히지만 <code>'abc'</code> 는 읽히지 않는다. " +
          '<b>변환 규칙이 있는 것과 없는 것의 차이</b>다.')
      ])
    ]));

    root.appendChild(h3('나. 들쭉날쭉한 리스트는 배열이 될 수 없다'));
    root.appendChild(p('NumPy 배열은 <b>빈틈 없는 직사각형 격자</b>다. 행마다 길이가 다르면 격자가 되지 않는다.'));
    root.appendChild(el('div', { class: 'stack-2' }, [
      panel('길이가 같으면 (2, 2) 격자', 'r', [
        UI.code('np.array([[1, 2],\n          [3, 4]])'),
        shown(function () {
          var ok = ND.array([[1, 2], [3, 4]]);
          return el('div', null, [UI.shapeBadge(ok), UI.grid(ok, { axisLabels: true, highlight: function () { return 'r'; } })]);
        })
      ]),
      panel('길이가 다르면 오류', 'b', [
        UI.code('np.array([[1, 2],\n          [3]])'),
        shown(function () { return UI.grid(ND.array([[1, 2], [3]])); }),
        note('둘째 행에 칸이 하나 비는데, 배열에는 「빈 칸」이 없다.')
      ])
    ]));

    root.appendChild(simDtypeLab());

    /* ---- dtype 표 ---- */
    root.appendChild(h3('다. 자주 쓰는 dtype'));
    function rng(dt) {
      var i = ND.DTYPES[dt];
      return num(i.min) + ' ~ ' + num(i.max);
    }
    root.appendChild(UI.table(
      [{ k: 'd', label: 'dtype' }, { k: 'b', label: 'itemsize', num: true },
        { k: 'r', label: '담을 수 있는 값', raw: true }, { k: 'u', label: '언제 쓰나', raw: true }],
      [
        { d: 'int8', b: ND.dtypeInfo('int8').itemsize, r: rng('int8'), u: '아주 작은 정수. 메모리를 극도로 아낄 때' },
        { d: 'int16', b: ND.dtypeInfo('int16').itemsize, r: rng('int16'), u: '음향 샘플, 작은 좌표' },
        { d: 'int32', b: ND.dtypeInfo('int32').itemsize, r: rng('int32'), u: '±21억. 예전 Windows NumPy 의 기본 정수형' },
        { d: 'int64', b: ND.dtypeInfo('int64').itemsize, r: '−2<sup>63</sup> ~ 2<sup>63</sup>−1 (약 ±9.2×10<sup>18</sup>)', u: '<b>기본 정수형.</b> 웬만한 정수는 여기 다 들어간다' },
        { d: 'uint8', b: ND.dtypeInfo('uint8').itemsize, r: rng('uint8'), u: '<b>이미지 픽셀(0~255).</b> mnist 가 이 dtype 이다' },
        { d: 'float32', b: ND.dtypeInfo('float32').itemsize, r: '유효숫자 약 7자리', u: 'GPU 딥러닝. 메모리·속도가 두 배 유리하다' },
        { d: 'float64', b: ND.dtypeInfo('float64').itemsize, r: '유효숫자 약 15~17자리', u: '<b>기본 실수형.</b> np.loadtxt 도 이걸로 읽는다' },
        { d: 'bool', b: ND.dtypeInfo('bool').itemsize, r: 'True / False', u: '조건 마스크(7장). 1바이트를 쓴다' },
        { d: '&lt;U21 등', b: '4×문자수', r: '유니코드 문자열', u: '계산 불가. 숫자 데이터에 섞이면 사고의 원인' },
        { d: 'object', b: 8, r: '파이썬 객체 아무거나', u: '최후의 수단. 사실상 list 라서 NumPy 의 장점이 사라진다' }
      ]
    ));

    root.appendChild(UI.callout('ver',
      '수업자료(2024년 3월, NumPy 1.x 기준)에는 <b>NumPy 2.0 에서 삭제된 이름들</b>이 있다. ' +
      '<code>np.NaN</code> → <code>np.nan</code>, <code>np.Inf</code> → <code>np.inf</code>, ' +
      '<code>np.float_</code> → <code>np.float64</code>, <code>np.int</code> → 그냥 <code>int</code>. ' +
      '옛 코드를 그대로 실행하면 <code>AttributeError: np.NaN was removed in the NumPy 2.0 release. ' +
      'Use np.nan instead.</code> 가 난다. 다행히 메시지가 고칠 방법까지 알려 준다.'));
  }

  /* ==========================================================================
   * 5. 속성 총정리 + 계산기
   * ======================================================================== */

  function simAttrCalc() {
    var DTS = ['int8', 'uint8', 'int16', 'int32', 'int64', 'float32', 'float64'];
    var state = { nd: 2, dims: [5, 6, 2], dt: 'int64' };
    var ctlHost = el('div'), outHost = el('div');

    var ndSeg = UI.seg({
      label: '축 개수(ndim)', options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }],
      value: '2', onChange: function (v) { state.nd = parseInt(v, 10); buildCtl(); rebuild(); }
    });
    var dtSel = UI.select({
      label: 'dtype', options: DTS, value: 'int64',
      onChange: function (v) { state.dt = v; rebuild(); }
    });

    function buildCtl() {
      UI.clear(ctlHost);
      var items = [ndSeg];
      for (var k = 0; k < state.nd; k++) {
        items.push(makeAxisSlider(k));
      }
      items.push(dtSel);
      ctlHost.appendChild(UI.controls(items));
    }

    function makeAxisSlider(k) {
      return UI.slider({
        label: 'shape[' + k + ']', min: 1, max: 6, step: 1, value: state.dims[k],
        format: function (v) { return String(v); },
        onChange: function (v) { state.dims[k] = Math.round(v); rebuild(); }
      });
    }

    function rebuild() {
      UI.clear(outHost);
      var shape = state.dims.slice(0, state.nd);
      var size = shape.reduce(function (s, x) { return s * x; }, 1);
      var a = ND.arange(size, null, null, state.dt).reshape(shape);
      var item = a.itemsize;

      outHost.appendChild(UI.code(
        'a = np.arange(' + size + ', dtype=np.' + state.dt + ').reshape(' + shape.join(', ') +
        (shape.length === 1 ? ',' : '') + ')'));

      outHost.appendChild(UI.statRow([
        { k: 'a.shape', v: ND.shapeStr(a.shape), sub: '각 축의 길이' },
        { k: 'a.ndim', v: String(a.ndim), sub: 'len(shape)' },
        { k: 'a.size', v: num(a.size), sub: shape.join(' × ') + ' = ' + num(size) },
        { k: 'a.itemsize', v: String(item), sub: state.dt + ' 한 칸의 바이트' },
        { k: 'a.nbytes', v: num(a.nbytes), sub: num(size) + ' × ' + item + ' = ' + num(size * item) }
      ]));

      var ok = a.nbytes === a.size * a.itemsize;
      outHost.appendChild(el('p', {
        class: 'small', style: { color: ok ? 'var(--good)' : 'var(--critical)', fontWeight: '650' },
        html: ok
          ? '검증 통과 — <code>nbytes(' + num(a.nbytes) + ') = size(' + num(a.size) +
            ') × itemsize(' + item + ')</code> 가 엔진에서 실제로 성립한다.'
          : '검증 실패 — 엔진 버그다.'
      }));

      outHost.appendChild(UI.out(
        'a.shape     ' + ND.shapeStr(a.shape) + '\n' +
        'a.ndim      ' + a.ndim + '\n' +
        'a.size      ' + a.size + '\n' +
        'a.dtype     ' + a.dtype + '\n' +
        'a.itemsize  ' + a.itemsize + '\n' +
        'a.nbytes    ' + a.nbytes + '\n' +
        'a.T.shape   ' + ND.shapeStr(a.T.shape), { label: '엔진이 계산한 속성' }));

      if (size <= 48) {
        outHost.appendChild(panel('실제 배열', 'a', [
          UI.grid(a, { axisLabels: true, highlight: function () { return 'a'; } })
        ]));
        if (a.ndim === 2) {
          outHost.appendChild(panel('a.T — 축 순서를 뒤집은 뷰 ' + ND.shapeStr(a.T.shape), 'r', [
            UI.grid(a.T, { axisLabels: true, highlight: function () { return 'r'; } }),
            note('값을 복사하지 않고 <b>같은 메모리를 다른 순서로 읽을 뿐</b>이다. 자세한 것은 4·5장에서 다룬다.')
          ]));
        }
      } else {
        outHost.appendChild(note('원소가 ' + size + '개라 격자는 생략했다.'));
      }

      if (ND.isIntDtype(state.dt) && size - 1 > ND.DTYPES[state.dt].max) {
        outHost.appendChild(UI.callout('trap',
          '<code>' + state.dt + '</code> 의 최댓값 ' + num(ND.DTYPES[state.dt].max) + ' 를 넘는 순번이 있어 ' +
          '<code>np.arange</code> 가 만든 값들이 <b>중간에 접혔다.</b> 격자를 보라. ' +
          'shape·size·nbytes 는 영향을 받지 않는다 — 하지만 값은 이미 망가졌다.'));
      }
    }

    buildCtl();
    rebuild();
    return UI.card({
      kicker: '시뮬레이터',
      title: '속성 계산기 — size 와 nbytes 는 어디서 오는가',
      note: '축 개수와 각 축의 길이, dtype 을 바꿔 보자. ' +
        '<b>size = shape 원소들의 곱</b>, <b>nbytes = size × itemsize</b> 라는 관계가 실제 숫자로 맞아떨어지는지 ' +
        '매번 확인한다.',
      body: [ctlHost, outHost]
    });
  }

  function secAttrs(root) {
    root.appendChild(h2('5. 배열의 속성 총정리'));
    root.appendChild(p('배열을 받으면 <b>가장 먼저 속성을 찍어 본다.</b> ' +
      '이 일곱 개면 배열의 정체가 거의 다 드러난다. 아래 값들은 ' +
      '<code>np.arange(30).reshape(5, 6)</code> 을 엔진이 실제로 만들어 읽은 것이다.'));

    var a3 = ND.arange(30).reshape([5, 6]);
    root.appendChild(UI.table(
      [{ k: 'p', label: '속성' }, { k: 'm', label: '뜻', raw: true }, { k: 'v', label: '이 배열에서', num: true }],
      [
        { p: 'a.dtype', m: '원소 하나의 자료형. <b>배열 전체가 같은 dtype</b>이다', v: a3.dtype },
        { p: 'a.shape', m: '각 축의 길이를 담은 <b>튜플</b>', v: ND.shapeStr(a3.shape) },
        { p: 'a.ndim', m: '축의 개수 = <code>len(a.shape)</code>', v: String(a3.ndim) },
        { p: 'a.size', m: '원소의 총 개수 = <b>shape 원소들의 곱</b>', v: String(a3.size) },
        { p: 'a.itemsize', m: '원소 하나가 쓰는 바이트 수', v: String(a3.itemsize) },
        { p: 'a.nbytes', m: '데이터가 쓰는 총 바이트 = <b>size × itemsize</b>', v: String(a3.nbytes) },
        { p: 'a.T', m: '축 순서를 뒤집은 <b>뷰</b>(전치). 값을 복사하지 않는다', v: ND.shapeStr(a3.T.shape) }
      ]
    ));
    root.appendChild(note('shape 는 리스트가 아니라 <b>튜플</b>이라 <code>a.shape[0] = 3</code> 처럼 ' +
      '고칠 수 없다. 모양을 바꾸려면 <code>reshape</code> 를 써야 한다(4장).'));

    root.appendChild(h3('가. 셀 31 의 출력 형식'));
    root.appendChild(UI.code(
      "arr1 = np.array([[1, 2, 3],\n" +
      "                 [4.5, 5, 6]], dtype=float)\n\n" +
      "print('데이터 type: {}'.format(arr1.dtype))\n" +
      "print('데이터 shape: {}'.format(arr1.shape))\n" +
      "print('데이터 ndim: {}'.format(arr1.ndim))\n" +
      "print('데이터 size: {}'.format(arr1.size))\n" +
      "print('데이터 nbytes: {}'.format(arr1.nbytes))"));
    var arr1 = ND.array([[1, 2, 3], [4.5, 5, 6]], 'float64');
    root.appendChild(UI.out(
      '데이터 type: ' + arr1.dtype + '\n' +
      '데이터 shape: ' + ND.shapeStr(arr1.shape) + '\n' +
      '데이터 ndim: ' + arr1.ndim + '\n' +
      '데이터 size: ' + arr1.size + '\n' +
      '데이터 nbytes: ' + arr1.nbytes));
    root.appendChild(note('<code>4.5</code> 하나 때문에 1, 2, 3, 5, 6 도 모두 실수가 되었다. ' +
      'size ' + arr1.size + ' × itemsize ' + arr1.itemsize + ' = nbytes ' + arr1.nbytes + ' 로 맞아떨어진다.'));

    root.appendChild(simAttrCalc());

    root.appendChild(UI.callout('ver',
      '<b>NumPy 2.0 부터 Windows 에서도 기본 정수형이 <code>int64</code></b> 다. ' +
      '1.x 시절 Windows 에서는 <code>np.arange(30).dtype</code> 이 <code>int32</code> 였기 때문에, ' +
      '같은 코드가 Windows 에서 nbytes 120, 리눅스·맥에서 240 으로 <b>다르게 나왔다.</b> ' +
      '옛 교재나 블로그에서 nbytes 값이 이 실습장과 다르면 이것이 원인일 수 있다.'));
  }

  /* ==========================================================================
   * 확인 문제
   * ======================================================================== */

  function secQuiz(root) {
    root.appendChild(h2('6. 확인 문제'));
    root.appendChild(UI.quiz([
      {
        q: '<code>data</code> 의 shape 가 <code>(100836, 4)</code> 일 때, ' +
          '<code>data[:, :1].shape</code> 와 <code>data[:, 0].shape</code> 는 각각 무엇인가?',
        choices: [
          '둘 다 <code>(100836,)</code> — 어차피 같은 숫자가 나오니 모양도 같다',
          '<code>data[:, :1]</code> → <code>(100836, 1)</code>, <code>data[:, 0]</code> → <code>(100836,)</code>',
          '<code>data[:, :1]</code> → <code>(100836,)</code>, <code>data[:, 0]</code> → <code>(100836, 1)</code>',
          '둘 다 <code>(100836, 1)</code> — 열 하나를 뽑았으니 열 축은 남는다'
        ],
        answer: 1,
        explain: '뽑히는 <b>숫자는 같지만 shape 가 다르다.</b> 규칙은 하나다 — ' +
          '<b>정수 인덱스는 그 축을 없애고, 슬라이스는 그 축을 길이 1로 남긴다.</b> ' +
          '<code>:1</code> 은 슬라이스라서 열 축이 남아 2차원, <code>0</code> 은 정수라서 열 축이 사라져 1차원이다. ' +
          '수업 셀 5 는 <code>data[:, :1]</code> 을 쓰므로 결과가 2차원이라는 점을 알고 있어야 한다.'
      },
      {
        q: '<code>np.array([200, 100]).astype(np.int8)</code> 의 결과는?',
        choices: [
          '<code>array([127, 100], dtype=int8)</code> — 범위를 넘으면 최댓값으로 잘린다',
          '<code>array([-56, 100], dtype=int8)</code>',
          '<code>array([200, 100], dtype=int8)</code> — dtype 만 바뀌고 값은 그대로다',
          '<code>OverflowError</code> 가 나서 실행이 멈춘다'
        ],
        answer: 1,
        explain: 'int8 은 8비트라 서로 다른 값 2<sup>8</sup> = 256 가지만 구별한다. ' +
          '200 을 256 으로 나눈 나머지는 200 이고, 이것이 128 이상이므로 음수 쪽으로 넘어가 ' +
          '<b>200 − 256 = −56</b> 이 된다. 잘리는(clip) 것이 아니라 <b>시계처럼 한 바퀴 도는(wrap)</b> 것이다. ' +
          '더 무서운 것은 <code>astype</code> 이 <b>경고도 없이</b> 이렇게 한다는 점이다. ' +
          '<code>OverflowError</code> 는 <code>np.array(200, dtype=np.int8)</code> 처럼 ' +
          '파이썬 정수를 직접 넣을 때 NumPy 2.0 이 내는 예외로, 경우가 다르다.'
      },
      {
        q: '<code>np.round(2.5)</code>, <code>np.round(3.5)</code>, ' +
          '<code>np.array([2.7]).astype(int)</code> 의 값을 차례로 고르면?',
        choices: [
          '<code>3.0</code>, <code>4.0</code>, <code>array([3])</code>',
          '<code>2.0</code>, <code>4.0</code>, <code>array([2])</code>',
          '<code>3.0</code>, <code>4.0</code>, <code>array([2])</code>',
          '<code>2.0</code>, <code>3.0</code>, <code>array([3])</code>'
        ],
        answer: 1,
        explain: '<code>np.round</code> 는 <b>은행가 반올림</b>이다 — .5 는 <b>짝수 쪽</b>으로 보낸다. ' +
          '그래서 2.5 → 2.0(2가 짝수), 3.5 → 4.0(4가 짝수)이다. ' +
          '<code>astype(int)</code> 은 반올림이 아니라 <b>버림</b>이므로 2.7 → 2 다. ' +
          '학교에서 배운 「.5 는 올린다」를 그대로 적용하면 첫 값에서 반드시 틀린다.'
      },
      {
        q: '파이썬에서 <code>0.1 + 0.2 == 0.3</code> 을 실행하면?',
        choices: [
          '<code>True</code> — 수학적으로 같으니 컴퓨터도 같다고 본다',
          '<code>False</code> — 0.1 과 0.2 를 2진수로 정확히 담을 수 없어 아주 작은 오차가 남는다',
          '<code>False</code> — 파이썬은 실수끼리의 <code>==</code> 를 항상 False 로 처리한다',
          '오류가 난다. 실수는 <code>np.isclose</code> 로만 비교할 수 있다'
        ],
        answer: 1,
        explain: '0.1 과 0.2 는 2진 소수로 쓰면 끝나지 않는 소수라서 float64 는 근삿값만 저장한다. ' +
          '그 결과 <code>0.1 + 0.2</code> 는 <b>0.30000000000000004</b> 가 되고, ' +
          '<code>0.3</code> 과 약 5.55×10<sup>−17</sup> 만큼 다르다. ' +
          '실수끼리의 <code>==</code> 자체가 금지된 것은 아니지만(<code>0.5 + 0.25 == 0.75</code> 는 True 다), ' +
          '<b>언제 맞고 언제 틀릴지 예측할 수 없으므로 쓰지 않는 것이 원칙</b>이다. ' +
          '<code>np.isclose</code>, <code>np.allclose</code> 를 쓰자.'
      }
    ], { id: 'ndarray' }));
  }

  /* ========================================================================== */

  var mod = {
    id: 'ndarray',
    n: '3',
    title: '배열과 dtype',
    blurb: '기온 한 값부터 4차원 컬러 이미지 묶음까지, 데이터를 shape 로 바라보는 법을 익히고 ' +
      'dtype 이 값을 조용히 바꿔 버리는 세 가지 순간을 직접 확인한다.',
    sim: '차원 탐험기 · 열 뽑기 · 가짜 손글씨 픽셀 탐험기 · dtype 실험실 · 속성 계산기',
    render: function (root) {
      root.appendChild(p('배열을 처음 만나면 세 가지를 물어야 한다 — ' +
        '<b>축이 몇 개인가(ndim), 각 축이 얼마나 긴가(shape), 칸 하나에 무엇이 들었나(dtype).</b> ' +
        '이 장은 그 세 질문을 실제 데이터 두 개(영화 평점 · 손글씨 이미지)로 끝까지 따라간다. ' +
        'dtype 은 특히 조심해야 한다 — <b>틀린 답을 오류 없이 조용히 내놓는 유일한 부분</b>이기 때문이다.'));
      secDims(root);
      secRatings(root);
      secMnist(root);
      secDtype(root);
      secAttrs(root);
      secQuiz(root);
    }
  };

  // 셸(app.js)이 아직 로드되지 않았을 수도 있다 — 그럴 때는 DOM 준비 시점에 등록한다.
  if (window.Lab && window.Lab.register) window.Lab.register(mod);
  else document.addEventListener('DOMContentLoaded', function () { window.Lab.register(mod); });
})();
