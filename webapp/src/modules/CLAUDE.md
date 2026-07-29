# C:\numpy\webapp\src\modules — 장별 화면

파일 하나 = 학습 앱의 한 장(chapter). **파일명 사전순이 곧 표시 순서**이므로 `chNN-` 접두사를 유지하라.

## 먼저 읽어라

**`../../API.md`** — 작성 계약. 쓸 수 있는 API 전부와 내용·시각화 규칙이 거기 있다. 읽지 않고 짜면 깨진다.

## 골격

```js
(function () {
  'use strict';
  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;
  Lab.register({
    id: 'axis', n: '8', title: '…', blurb: '…', sim: '…',
    render: function (root) { /* root 에 DOM 을 채운다 */ }
  });
})();
```

`render` 는 **장을 다시 방문할 때마다 호출된다.** 모듈 전역에 가변 상태를 두면 두 번째 방문에서 깨진다. `render` 안의 지역 변수 + `rebuild()` 패턴을 써라.

## 장 구성

| 파일 | id | 주제 |
|:---|:---|:---|
| `ch01-why.js` | `why` | 왜 NumPy인가 (연립방정식 훅, 메모리 배치, 벡터화, 속도) |
| `ch02-vector.js` | `vector` | 벡터와 행렬 — 수학 기초 (드래그 벡터판, 행렬곱 단계별, 미니 신경망) |
| `ch03-ndarray.js` | `ndarray` | 배열의 표현과 dtype (차원 탐험기, dtype 실험실) |
| `ch04-reshape.js` | `reshape` | 모양 바꾸기와 **뷰** (reshape 시뮬레이터, 뷰 vs 사본 실험실) |
| `ch05-indexing.js` | `indexing` | 인덱싱과 슬라이싱 (**슬라이싱 플레이그라운드**) |
| `ch06-create.js` | `create` | 배열 만들기 (생성 함수 갤러리, 난수 실험실, 합치기) |
| `ch07-broadcast.js` | `broadcast` | 연산과 **브로드캐스팅** (브로드캐스팅 시뮬레이터) |
| `ch08-axis.js` | `axis` | **축(axis)** 과 통계 (axis 축소기, 통계 탐색기) |
| `ch09-condition.js` | `condition` | 조건·논리·결측치 + 파일 입출력 (마스크·where·nan 전파) |
| `ch10-project.js` | `project` | 종합 실습 — 관절염 데이터 대시보드 |
| `ch11-playground.js` | `playground` | 코드 실습실 (표현식 평가기 + Pyodide) |

가장 중요한 세 시뮬레이터: **5장 슬라이싱 플레이그라운드**, **7장 브로드캐스팅 시뮬레이터**, **8장 axis 축소기**. 학생이 가장 많이 틀리는 세 개념이다. 여기를 손볼 때는 특히 조심하라.

## 지켜야 할 것

- **숫자를 하드코딩하지 마라.** `ND` 엔진으로 계산해서 보여라. 그래야 슬라이더를 움직였을 때 진짜 값이 따라온다.
- **색 역할은 전 장에서 동일하다**: A=파랑 `'a'`, B=주황 `'b'`, 결과=초록 `'r'`, 강조축=노랑 `'x'`, 에러=`'err'`, 무관=`'dim'`, 브로드캐스팅 가상칸=`'ghost'`. 학생이 색으로 역할을 익히므로 절대 바꾸지 마라.
- **에러도 교육 내용이다.** `try { … } catch (e) { UI.errBlock(e.message) }` 로 실제 NumPy 메시지를 보여라.
- 장마다 시뮬레이터/시각화 최소 2개, 맨 끝에 `UI.quiz(..., { id: '<이 장의 id>' })`. `id` 를 빠뜨리면 사이드바 진도 점이 켜지지 않는다.
- **ES 모듈 문법(`import`/`export`) 금지** — `numpy-lab.html` 인라인 배포본이 깨진다. IIFE 를 유지하라.
- **CDN 링크는 허용된다**(2026-07-29 정책 변경). 단 CDN 이 없어도 장의 나머지가 동작해야 한다 — 지연 로딩 + 실패 시 안내.

## 확인

```bash
node --check webapp/src/modules/ch05-indexing.js
npm run build
npm start          # http://localhost:5173/index.html
```

그다음 브라우저에서 **실제로 눌러 봐라.** 문법이 통과해도 런타임에 깨질 수 있다.

기대값이 헷갈리면 **실제 NumPy 로 확인할 수 있다**:

```bash
"C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe" -c "import numpy as np; print(np.arange(12).reshape(3,4).sum(axis=1))"
```

(`py` / `python` 은 스텁이라 numpy 를 못 찾는다.)
