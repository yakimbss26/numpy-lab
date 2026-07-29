# 화면 모듈 작성 계약 (module authoring contract)

이 문서는 `src/modules/*.js` 를 쓰는 사람이 지켜야 할 규칙 전부다. **여기 없는 API 는 없다고 생각하라.**
빌드는 `node webapp/build.js` → `C:/numpy/numpy-lab.html` (단일 파일).

---

## 0. 모듈 골격

파일 하나 = 장(chapter) 하나. 순수 스크립트(ES 모듈 아님). 파일명이 곧 순서다(`ch01-…` ~ `ch11-…`).

```js
(function () {
  'use strict';
  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  Lab.register({
    id: 'axis',                    // 해시 경로 (#/axis). 배정된 값을 그대로 쓴다
    n: '8',                        // 장 번호
    title: '축(axis)과 수학·통계 함수',
    blurb: '한 문장 소개. 홈 타일과 장 머리말에 쓰인다.',
    sim: 'axis 축소 애니메이션 · 3D 층 뷰',   // 시뮬레이터 요약 (홈 표에 나온다)
    render: function (root) {
      // root 에 DOM 을 채운다. 반환값은 쓰지 않는다.
    }
  });
})();
```

- `render` 는 **매번 새로 호출된다**(다른 장에 갔다 오면 다시 그린다). 전역 상태를 두지 말고 `render` 안에서 지역 변수로 관리하라.
- `render` 안에서 예외가 나면 셸이 잡아서 에러 블록을 보여 준다. 그래도 나지 않게 짜라.
- **외부 리소스(CDN, 폰트, 이미지 URL)를 절대 쓰지 마라.** 이미지가 필요하면 SVG 나 셀 격자로 직접 그려라.
- 모든 텍스트는 **한국어**. 교과서 문체("~한다"), 학생에게 권할 때만 "~해 보자".

---

## 1. `ND` — 미니 NumPy 엔진

브라우저에서 실제로 계산한다. **숫자를 문자열로 하드코딩하지 마라. 엔진으로 계산해서 보여라.**
(`nd.js` 는 실제 NumPy 출력값 대조 테스트 187개를 통과한 상태다.)

### 생성

```js
ND.array([[1,2,3],[4,5,6]])            // 중첩 배열 → ND. dtype 자동(정수면 int64)
ND.array([1,2,3], 'float64')
ND.arange(5)                            // [0 1 2 3 4]
ND.arange(1, 13)                        // start, stop
ND.arange(0, 2, 0.5)                    // step (실수 가능 → float64)
ND.linspace(0, 1, 5)
ND.zeros([2,5])            ND.zeros(10, 'int64')
ND.ones([3], 'float64')    ND.full([2,3], 7)
ND.empty([3,5], 'int64')                // 값이 매번 다르다 — 절대 특정 값을 설명하지 마라
ND.zerosLike(a)  ND.onesLike(a)  ND.fullLike(a, 9)
ND.eye(3, 5, 2, 'int64')                // N, M, k, dtype
ND.identity(3, 'int64')
ND.diag(a)      // 2D→대각추출(1D) / 1D→대각행렬(2D)
ND.diag(a, 1)
```

### 속성 (getter)

```js
a.shape      // [3, 4]  (배열)
a.ndim  a.size  a.dtype  a.itemsize  a.nbytes
a.strides    // [4, 1]  — 원소 단위 보폭. 뷰 설명에 쓴다
a.offset
a.base       // 뷰면 원본 ND, 아니면 null
a.T          // 전치 (뷰)
```

### 값 읽기/쓰기

```js
a.get([1, 2])         // 또는 a.get(1, 2)
a.set([1, 2], 99)
a.toNested()          // 중첩 JS 배열 (0차원이면 스칼라)
a.flatValues()        // C 순서 평평한 값 배열
a.indices()           // [[0,0],[0,1],…] C 순서 인덱스 목록
a.flatBufIndices()    // 각 원소가 앉은 buf 위치 — 메모리 시각화용
a.unravel(11)         // 평평한 인덱스 → [i, j]  (np.unravel_index)
```

### 모양 바꾸기

```js
a.reshape([3, 4])   a.reshape([-1, 2])   // 연속이면 뷰, 아니면 사본
a.ravel()           // 가능하면 뷰
a.flatten()         // 항상 사본
a.transpose()  a.transpose([1,0,2])  a.swapaxes(0,1)
a.copy()   a.astype('int64')
a.isContiguous()   a.isView()   a.root()
ND.sharesMemory(a, b)     // 메모리 공유 여부
```

### 인덱싱 — 문자열 파서가 핵심 기능이다

```js
a.idx('1:4, ::2')       // 문자열을 파싱해서 뷰를 준다. a[…] 껍질도 허용
a.idx('0')              // 정수 → 축이 사라진다
a.idx('0:1')            // 슬라이스 → 축이 남는다
a.idx(':, None')        // np.newaxis
a.idx('..., 1')         // Ellipsis
ND.parseIndex('1:4, ::2')    // → spec 배열. 잘못되면 ND.NDError 를 던진다
ND.specToString(spec)
a.index(spec)                // spec 으로 직접
```

**슬라이싱은 범위를 넘어도 에러가 아니다**(빈 배열). **정수 인덱싱은 `out of bounds` 에러**다. 이 차이를 보여 주는 게 5장의 핵심.

### 연산

```js
ND.ops.add(a, b)   sub  mul  div  floordiv  mod  pow
ND.ops.gt(a, 5)    ge  lt  le  eq  ne          // → bool 배열
ND.ops.and(m1, m2)  or  xor  not
ND.binop(a, b, function (x, y) { return x * y; })    // 임의 연산 + 브로드캐스팅
ND.unop(a, Math.sqrt)
ND.matmul(a, b)     ND.dot(a, b)
ND.matmul(a, b, { steps: true })
//   → { result, steps: [{i, j, terms:[{k, a, b, prod}], value}], m, n, p }
//   행렬곱 단계별 시각화에 이걸 쓴다
```

### 브로드캐스팅

```js
ND.broadcastShapes([4,1], [3])
//  성공 → { ok:true, shape:[4,3], padded:[[4,1],[1,3]],
//           steps:[{axis, a, b, result, how:'same'|'stretchA'|'stretchB'}] }
//  실패 → { ok:false, padded:[…], failAxis:1, error:"operands could not be…", reason:"축 1 에서 …" }
ND.broadcastTo(b, [4,3])   // 늘어난 축의 stride 가 0 인 뷰. 복사 안 한다는 걸 보여줄 때 쓴다
```

### 집계 · axis

```js
ND.sum(a)         ND.sum(a, 0)    ND.sum(a, 1)     // axis 생략/null = 전체
ND.mean  ND.min  ND.max  ND.argmin  ND.argmax  ND.median  ND.ptp  ND.prodOf  ND.all  ND.any
ND.std(a, axis, ddof)          // ddof 기본 0 (모표준편차!)
ND.variance(a, axis, ddof)
ND.percentile(a, 25, axis)
ND.cumsum(a)
ND.reduce(a, { op:'sum', axis:1, keepdims:true })   // keepdims 는 이걸로
```

집계 결과는 **항상 ND**다. 스칼라가 필요하면 `.toNested()`.

### 조건 · 선택

```js
ND.maskSelect(a, mask)      // a[mask] — 사본, 1차원
ND.maskAssign(a, mask, 0)   // a[mask] = 0 — 원본을 고친다
ND.fancySelect(a, idxArr)   // a[idx] — 사본, shape 는 idx 를 따른다
ND.whereIdx(mask)           // np.where(cond) 의 인덱스
ND.where(cond, x, y)        // 3항 where
```

### 합치기 · 선형대수

```js
ND.concatenate([a, b], axis)   ND.vstack([a,b])   ND.hstack([a,b])   ND.stack([a,b], axis)
ND.norm(v)      ND.solve(A, b)     ND.inv(A)     ND.det(A)
```

### 출력 문자열 · 기타

```js
ND.format(a)                      // print(a) 스타일 — 콤마 없음:  [[1 2]\n [3 4]]
ND.format(a, { mode:'repr' })     // array([[1, 2], …]) — 콤마 있음
ND.fmtScalar(6.5, 'float64')      // '6.5'
ND.shapeStr([3])                  // '(3,)'
ND.castValue(200, 'int8')         // -56  ← 정수 오버플로 재현
ND.promote('int64','float64')     // 'float64'
ND.NDError                        // 엔진이 던지는 예외
ND.errLabel(msg)                  // 'ValueError' 같은 파이썬 예외 이름 추정
```

**에러는 반드시 try/catch 해서 `UI.errBlock(e.message)` 로 보여라.** 학생이 실제 NumPy 에서 볼 메시지를 그대로 배우게 하는 것이 목적이다.

---

## 2. `UI` — 위젯

### DOM

```js
UI.el('div', { class:'x', text:'hi', onclick:fn, style:{color:'red'} }, [child1, child2])
UI.el('p', { html:'<b>진한</b> 글씨' })
UI.clear(node)   UI.esc(str)   UI.svgEl('circle', { cx:1, cy:2, r:3 })
```

### 코드 / 출력

```js
UI.code("import numpy as np\na = np.arange(6)")   // 파이썬 문법 강조
UI.out(ND.format(a))                              // '출력' 라벨 + 점선 블록
UI.out(text, { label:'결과' })   UI.out(text, { label:false })
UI.errBlock('cannot reshape array of size 8 into shape (…)')   // 예외처럼 보이는 블록
```

### 배열 격자 — 가장 많이 쓸 위젯

```js
UI.grid(a, {
  highlight: function (idx, val) { return 'a'; },   // 'a'(파랑) 'b'(주황) 'r'(초록) 'x'(노랑)
                                                    // 'err'(빨강) 'dim'(흐리게) 'ghost'(점선=가상)
  label:     function (idx, val) { return String(val); },   // 기본은 값
  showIndex: true,        // 셀 좌상단에 인덱스
  axisLabels: true,       // 행/열 번호 머리글
  onHover:   function (idx, val, ev) {},   // idx 가 null 이면 벗어남
  onClick:   function (idx, val, ev) {},
  cellSize:  34,
  layerLabel: function (L) { return 'layer ' + L; }   // 3차원일 때 층 제목
})
```

0~3차원을 지원한다. **3차원은 axis 0 을 층으로 펼쳐 나란히 그린다** — 3D axis 설명의 핵심.

```js
UI.shapeBadge(a)          // shape (3, 4) · ndim 2 · size 12 · int64
UI.shapeBadge([3, 4])     // shape 만
UI.legend([{ color:'var(--s1)', label:'A 배열' }, …])
```

### 구조

```js
UI.card({ kicker:'시뮬레이터', title:'축 축소기', note:'설명(html)', body:[el1, el2] })
UI.callout('why',  '본문 html')     // 파랑 — 왜 그런가
UI.callout('trap', '본문 html')     // 빨강 — 흔한 실수
UI.callout('tip',  '본문 html')     // 초록 — 알아두기
UI.callout('ver',  '본문 html')     // 노랑 — NumPy 버전 주의
UI.callout('tip',  '본문', '직접 제목')
UI.fold('정답 보기', bodyEl)
UI.ascii("┌───┐\n│ 0 │\n└───┘")     // 정렬 정확히 맞춰라
UI.steps(['1단계 html', { html:'2단계', state:'done' }, { html:'3단계', state:'failed' }])
UI.statRow([{ k:'shape', v:'(60, 40)', sub:'환자 × 날짜' }, …])
UI.table([{ k:'f', label:'함수' }, { k:'d', label:'설명' }, { k:'v', label:'값', num:true }], rows)
//   rows = [{ f:'np.sum', d:'합', v:78 }, …].  셀에 DOM 을 넣어도 된다.
//   HTML 을 넣으려면 컬럼에 raw:true
```

제목은 `UI.el('h2', { class:'h-sec', text:'…' })` (장 안의 절), `class:'h-sub'` (더 아래), `class:'lede'` (도입 문단).
`h-sec` 은 자동으로 오른쪽 목차(TOC)에 잡힌다.

### 컨트롤

```js
UI.controls([ctl1, ctl2])          // 컨트롤들을 한 줄 패널로 묶는다 (차트/격자 위에 둔다)
UI.slider({ label:'axis', min:0, max:2, step:1, value:0,
            format: function (v) { return 'axis=' + v; }, onChange: fn })
UI.select({ label:'함수', options:['sum','mean',{value:'std',label:'표준편차'}], value:'sum', onChange:fn })
UI.textInput({ label:'인덱스식', value:'1:3, ::2', wide:true, placeholder:'…',
               onChange:fn, onEnter:fn })
UI.seg({ label:'차수', options:[{value:'2',label:'2차원'},{value:'3',label:'3차원'}],
         value:'2', onChange:fn })
UI.chips(['a[0]', 'a[:, 0]', { value:'x', label:'보기' }], onPick)
UI.btn('실행', fn)   UI.btn('실행', fn, { primary:true })
```

컨트롤 객체에는 `.setValue(v)` 가 있다(칩으로 값을 밀어 넣을 때 쓴다).

### 메모리 시각화 (뷰 vs 사본)

```js
UI.memBar(a.root().buf, { 0:'a', 1:'ab', 2:'b' }, { dtype:'int64' })
UI.memShare(a, b, ['a 가 보는 칸', 'b 가 보는 칸'])
//   두 배열이 실제로 같은 buf 를 쓰는지 칸 색으로 보여 주고
//   np.shares_memory 결과 문장까지 붙여 준다
```

### 차트

```js
UI.lineChart({
  series: [{ name:'날짜별 평균', values:[…] }],   // 2개 이상이면 범례가 자동으로 붙는다
  x: [0,1,2,…],  xLabel:'day', yLabel:'염증',
  height: 240, yMin: 0, markMax: true,           // markMax 는 최댓값만 직접 라벨
  fmtY: function (v) { return v.toFixed(1); },
  tableView: true                                // 기본 true — 표 보기 twin
})
UI.heatmap(a2d, { vmin:0, vmax:20, rowLabel:'환자', colLabel:'day', unit:'',
                  highlight: function (idx, val) { return true; },   // 주황 외곽선
                  tableView: true })
UI.vectorPlot({
  vectors: [{ x:3, y:4, name:'u' }, { x:-1, y:2, name:'v', dashed:true }],
  extras: [{ type:'line', x1:0, y1:0, x2:3, y2:4, dashed:true }],
  range: 6, height: 340,
  draggable: [0, 1], onDrag: function (i, x, y) { /* 상태 갱신 후 rebuild */ }
})
// vectorPlot 은 .redraw() 를 가진다. 값이 바뀌면 vectors 배열을 고치고 .redraw() 를 부른다.
UI.seqColor(0.5)     // 순차 램프 색 (0~1)
UI.round2(v)
```

### 확인 문제

```js
UI.quiz([
  { q: '문제 html', choices: ['보기1', '보기2', '보기3'], answer: 1, explain: '해설 html' }
], { id: 'axis' })     // id 는 이 장의 id 를 그대로 — 진도 저장에 쓰인다
```

**모든 장의 맨 끝에 확인 문제 2~4개를 넣어라.** `id` 를 반드시 넘겨야 사이드바 진도 점이 켜진다.

---

## 3. `LabData` — 실습 데이터 (빌드 시 CSV 에서 임베드됨)

```js
D.nd('inflammation')      // ND 배열 (60, 40) float64 — 관절염 데이터 전체
D.inflammation.shape      // [60, 40]
D.inflammationMeta        // { file, header:false, rowMeaning:'환자', colMeaning:'날짜(day)', note }

D.nd('ratingsSample')     // ND (1200, 4) — 영화 평점 앞 1200행 표본
D.ratingsMeta             // { file:'ra.csv', header:'userId,movieId,rating,timestamp', headerRows:1,
                          //   trueShape:[100836,4], sampleRows:1200, users:610, movies:9724,
                          //   ratingMean:3.501557, ratingMin:0.5, ratingMax:5,
                          //   tsMin, tsMax, ratingHist:[[0.5,n],[1,n],…] }
```

**영화 평점은 표본만 들어 있다.** 전체 shape 를 말할 때는 `D.ratingsMeta.trueShape` 를 쓰고,
"이 페이지에는 앞 1200행만 들어 있다"고 반드시 밝혀라. 집계값(`users`, `ratingMean` 등)은 **전체 데이터로 정확히 계산된 값**이니 그대로 써도 된다.

### 검증된 관절염 데이터 사실

엔진으로 계산해도 이 값이 나와야 한다. 어긋나면 버그다.

| 항목 | 값 |
|---|---|
| shape | (60, 40) — 환자 60명 × 40일, **헤더 없음** |
| max / min | 20.0 / 0.0 |
| mean | 6.14875 |
| std (ddof=0) | ≈ 4.6138 |
| 0번 환자 최댓값 | 18.0, 날짜 인덱스 19 |
| 첫째 날(0번 열) 평균 | 0.0 ← 모든 환자가 0에서 시작. 합성 데이터라는 단서 |
| `argmax(axis=1)` 앞 12개 | [19, 20, 20, 20, 19, 18, 21, 20, 18, 20, 19, 22] |

---

## 4. 내용 규칙

### 독자
과학고 1학년. 수학은 우수하지만 **벡터·행렬은 아직 안 배웠을 수 있다**. 파이썬 기본 문법(list, for, 함수, import)은 안다.
"그냥 이렇게 쓰면 된다"는 설명을 싫어한다 — **왜 그렇게 되는지**를 항상 붙여라.

### 원본 수업자료
`C:/numpy/수업자료` 의 노트북·PPT 를 근거로 한다. 텍스트로 뽑아 둔 것을 Read 로 읽어라:
- `<SCRATCH>/main.txt` — 수업 본 노트북 161셀 전체 (다루는 범위의 기준)
- `<SCRATCH>/hw1.txt` — 실습 과제
- `<SCRATCH>/slides.txt` — 강의 PPT 21장

수업자료에 나온 항목은 **하나도 빠뜨리지 마라.** 그것이 최소 범위다.

### NumPy 2.x 기준으로 바로잡을 것
수업자료는 2024년 3월 NumPy 1.x 기준이다.
- `np.NaN`, `np.Inf`, `np.float_`, `np.int` → **2.0 에서 삭제됨.** `np.nan`, `np.inf` 를 써야 한다.
  옛 자료를 그대로 실행하면 `AttributeError` 가 난다는 것을 짚어 줘라(`UI.callout('ver', …)`).
- 수업 셀 156 의 `'ratings.csv'` → 실제 파일명은 `ra.csv`.
- `np.std` 기본은 `ddof=0`(모표준편차) — 통계 시간에 배운 표본표준편차와 다르다.
- `np.round` 는 은행가 반올림: `np.round(0.5)` → 0.0, `np.round(2.5)` → 2.0.
- `np.random.normal` 은 0~1 에 갇히지 않는다(수업자료 설명이 부정확).

### 시각화 규칙 (지키지 않으면 접근성 위반이다)
- 계열이 2개 이상이면 **범례를 반드시** 넣는다(`UI.lineChart` 가 자동으로 해 준다).
- **y축을 두 개 쓰지 마라.** 스케일이 다른 두 값은 차트를 두 개로 나눈다.
- 크기(magnitude)는 **파랑 단일 색조 램프**(`UI.heatmap`, `UI.seqColor`). 무지개 램프 금지.
- 정체(identity)는 카테고리 색: A=`--s1`(파랑), B=`--s2`(주황), 결과=`--s3`(초록), 강조=`--s4`(노랑).
  이 배정을 **모든 장에서 똑같이** 지켜라 — 학생이 색으로 역할을 익힌다.
- 상태색(`--good`/`--critical`)은 좋음/나쁨·성공/에러에만. 계열색으로 쓰지 마라.
- 라이트 모드에서 초록·노랑 칸은 대비가 낮다 → **셀 안에 숫자 라벨을 반드시 함께** 보여라(`UI.grid` 기본 동작).
- 모든 점에 숫자를 찍지 마라. 최댓값 등 **의미 있는 것만** 직접 라벨.

### 분량
한 장은 스크롤 3~6화면. 설명 문단은 짧게(3~4문장), **핵심은 시뮬레이터로 보여 주고 글로 반복하지 마라.**
장마다 시뮬레이터/시각화 **최소 2개**, 확인 문제 2~4개.
