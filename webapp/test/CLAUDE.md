# C:\numpy\webapp\test — 검증

```bash
npm test              # nd.test.js + cross.test.js
npm run test:gen      # 실제 NumPy 로 expected.json 다시 뽑기
```

| 파일 | 무엇을 하나 | 상태 |
|:---|:---|:---|
| `nd.test.js` | 엔진 단위 테스트. 기대값은 NumPy 동작을 손으로 계산한 것. | **187건 통과** |
| `gen_expected.py` | 실제 NumPy 2.5.1 로 기대값 152개를 뽑아 `expected.json` 에 쓴다. | — |
| `cross.test.js` | `expected.json` 과 엔진 결과를 대조. | **151건 전부 일치** |
| `verify_md.py` | `../../numpy.md` 의 파이썬 코드 블록을 실제 NumPy 로 실행. | 실행 오류 없음 |
| `verify_outputs.py` | `numpy.md` 에 적힌 **출력값**을 실제 NumPy 출력과 대조. | 값 오류 없음 |

`expected.json` 은 생성물이다. 손으로 고치지 마라.

## 파이썬 경로

```
C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe
```

`py` / `python` 은 Microsoft Store 스텁이라 numpy 를 못 찾는다. 한글 출력이 깨지면 `-X utf8` 을 붙여라.

## 이 테스트가 존재하는 이유

앱의 모든 숫자는 이 엔진이 계산한다. 엔진이 틀리면 **학생에게 거짓을 가르친다.**

`nd.test.js` 의 기대값은 손계산이라 사람의 착각이 섞일 수 있다. 그래서 **실제 NumPy 와 대조하는 `cross.test.js` 가 더 강한 보증**이다. 손계산 기대값과 실제 NumPy 가 어긋나면 `cross.test.js` 를 믿어라.

`nd.js` 를 고쳤으면 반드시 `npm test` 를 돌려라. 통과하지 않으면 빌드하지 마라.

## 교재(`numpy.md`) 검증

`verify_md.py` 는 장별로 이름공간을 누적해 코드 블록을 실행한다. 다음은 **오탐이므로 무시해도 된다**:
- Colab 전용 코드(`from google.colab import files`), 주피터 매직(`np.linspace?`), keras/matplotlib 예제
- 앞 장에서 만든 변수(`data`, `train_imgs`)를 쓰는 블록

`verify_outputs.py` 의 "값 불일치" 대부분도 오탐이다 — 출력 뒤에 붙은 **설명 주석**을 기대 출력으로 묶기 때문이다. 보고된 `실제` 값이 `교재` 첫 줄과 같으면 정상이다. 또 경고(RuntimeWarning)는 억제해서 실행하므로 교재가 적어 둔 경고 줄은 잡히지 않는다.

## 무엇을 지키고 있나

- `arange(1,13).reshape(3,4)` 계열: sum 78, mean 6.5, std(ddof=0) 3.452052529534663, percentile 3.75/6.5/9.25, argmax 11
- **3차원 axis**: `axis=0` → `[[15,18],[21,24]]` / `axis=1` → `[[4,6],[12,14],[20,22]]` / `axis=2` → `[[3,7],[11,15],[19,23]]`
- **행렬곱**: `(2,3)@(3,2)` → `[[58,64],[139,154]]`, 항별 곱 `[7,18,33]`
- **브로드캐스팅**: `(4,1)+(3,)` → `(4,3)`, 늘어난 축 stride **0**, 메모리 공유 True
- **뷰/사본**: 슬라이싱·reshape·ravel·T = 뷰 / flatten·copy·팬시·불리언 = 사본. 뷰를 고치면 원본이 바뀌는 것까지
- **슬라이싱 파서**: `::-1`, `-2:`, `:-2`, `1:5:2`, `..., 1`, `:, None`, `a[…]` 껍질 제거
- **슬라이싱은 범위를 넘어도 에러가 아니고, 정수 인덱싱은 IndexError** — 5장의 핵심 대비
- **출력 표기**: `print` 콤마 없음 `[1 2 3]` / repr `array([1, 2, 3])` / float `[1. 2. 3.]` / bool `[ True False]` / 2자리 정렬
- **dtype 함정**: int8 랩어라운드(200→−56, 128→−128), astype 버림(1.7→1, −1.7→−1)
- **관절염 CSV 실물 대조**: shape (60,40), mean 6.14875, std 4.6138, 0번 환자 max 18/argmax 19, 첫째 날 평균 0.0, argmax(axis=1) 앞 12개
- keepdims 없이 `(60,40) − (60,)` 은 브로드캐스팅 실패 — 7장이 가르치는 것

## 테스트를 추가할 때

`eq`(JSON 비교) · `close`(허용오차) · `throws`(에러 기대) · `str`(문자열 정확 비교) 헬퍼를 쓴다.
**기대값은 반드시 실제 NumPy 가 내는 값이어야 한다.** 엔진 출력을 그대로 기대값으로 복사하면 테스트가 아무것도 검증하지 않는다.
