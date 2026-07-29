# C:\numpy\webapp\src\core — 공용 기반

화면 모듈이 전부 이 위에 올라간다. **여기를 고치면 11개 장이 함께 영향을 받는다.** 신중하게.

| 파일 | 전역 | 역할 |
|:---|:---|:---|
| `nd.js` | `window.ND` | 미니 NumPy 엔진. 의존성 없음. |
| `ui.js` | `window.UI` | 위젯. `ND` 에 의존. |
| `app.js` | `window.Lab` | 셸: 챕터 등록소·해시 라우터·진도·테마. `UI` 에 의존. |

`data.js`(`window.LabData`)는 여기 없다 — `build.js` 가 수업자료 CSV 에서 생성해 넣는다.

## nd.js — 설계의 핵심

NumPy 와 똑같이 **(buffer, shape, strides, offset)** 으로 배열을 모델링한다. 이게 이 앱의 교육적 무기다.

```js
new ND.ND(buf, shape, strides, offset, dtype, base)
```

- `buf` 는 **공유되는 평평한 JS 배열** = "메모리". 뷰는 같은 `buf` 를 다른 shape/strides/offset 으로 본다.
- `base` 는 뷰의 원본. `sharesMemory(a, b)` 는 `a.buf === b.buf` 다.
- `broadcastTo` 는 늘어난 축의 **stride 를 0 으로** 만든 뷰를 준다 — NumPy 의 실제 동작 그대로다.

이 구조 덕분에 "뷰를 고치면 원본이 바뀐다", "브로드캐스팅은 복사하지 않는다" 를 **말이 아니라 실행으로** 보여줄 수 있다. 구조를 단순화(예: 값을 복사하는 방식)하면 앱의 절반이 가르칠 것을 잃는다.

**고치면 반드시 `node webapp/test/nd.test.js` 를 돌려라.** 187개 단정이 실제 NumPy 값과 대조한다.

### 손대기 전에 알아 둘 것

- `resolveSlice` 의 음수 step 처리는 파이썬 규칙이라 까다롭다. 테스트가 `::-1`, `-2:`, `:-2`, `1:5:2` 를 지키고 있다.
- `format()` 은 NumPy 출력 표기를 흉내 낸다: `print` 는 콤마 없음, repr 은 콤마 있음, float 정수값은 `1.`, bool 은 `[ True False]`(True 를 5칸으로 정렬). 테스트가 이 문자열을 정확히 비교한다.
- `reduce()` 는 axis 를 정수·배열·null 로 받고 `keepdims` 를 지원한다. `argmin`/`argmax` 는 int64, `all`/`any` 는 bool 을 반환하도록 dtype 이 분기된다.
- `castValue` 가 int8/16/32 랩어라운드를 재현한다(int64 는 JS 정밀도 한계로 안 한다). dtype 실험실이 이걸 쓴다.

## ui.js — 위젯을 추가할 때

`API.md` 에도 반드시 적어라. 적지 않으면 모듈 작성자가 그 위젯의 존재를 모른다.

가장 많이 쓰이는 것은 `UI.grid(nd, opts)` 다. 0~3차원을 그리고, 3차원은 **axis 0 을 층으로 펼친다** — axis 설명이 여기에 의존한다.
