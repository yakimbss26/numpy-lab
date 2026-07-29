# C:\numpy\webapp\src — 앱 소스

빌드(`node webapp/build.js`)가 이 폴더의 파일을 아래 순서로 인라인해 `../../numpy-lab.html` 을 만든다.
**순서가 곧 의존 순서다.** 뒤 파일은 앞 파일의 전역(`window.ND` 등)에 의존한다.

```
1. theme.css        디자인 시스템 (팔레트·타이포·컴포넌트)
2. app.css          셸 레이아웃
3. core/nd.js       → window.ND    미니 NumPy 엔진 (의존성 없음)
4. core/ui.js       → window.UI    위젯 (ND 사용)
5. core/data.js     → window.LabData   빌드가 CSV 에서 생성 (디스크에 없다)
6. modules/*.js     파일명 사전순. Lab.register() 로 자기를 등록
7. core/app.js      → window.Lab   셸. 마지막에 Lab.start()
```

`core/data.js` 는 **빌드가 생성한다**(`build.js` 의 `buildData()`). 디스크에 파일로 남지만 손으로 고치지 마라 — 다음 빌드에서 덮어써진다. 수업자료 CSV 가 바뀌었으면 `npm run build`.

이 순서는 두 산출물에 똑같이 적용된다:
- `../../index.html` — 각 파일을 `<script src>` 로 불러온다
- `../../numpy-lab.html` — 같은 순서로 인라인한다

## 규칙

- **ES 모듈 문법(`import`/`export`) 금지.** `numpy-lab.html` 단일 파일 배포본에 인라인되므로 모듈 문법은 깨진다. 모든 파일은 `window.X` 에 붙는 IIFE 로 쓴다. (2026-07-29 정책 변경으로 CDN·의존성은 허용됐지만 **이 규칙은 그대로다.**)
- **CDN 링크는 허용된다.** 단 CDN 에 의존하는 기능은 없어도 나머지가 동작해야 한다 — 지연 로딩 + 실패 시 명확한 안내. (예: 11장의 Pyodide)
- 모듈이 쓸 수 있는 API 는 `../API.md` 에 있는 것 전부다. 새 위젯이 필요하면 `core/ui.js` 에 추가하고 `API.md` 에도 적어라.
