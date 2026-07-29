/* ===========================================================================
 * build.js — NumPy Lab 빌드
 *
 *   node webapp/build.js              index.html + numpy-lab.html + data.js 생성
 *   node webapp/build.js --watch      소스가 바뀌면 다시 생성
 *   node webapp/build.js --check      문법 검사만 (파일을 쓰지 않는다)
 *
 * 산출물
 *   C:/numpy/index.html            ← 웹서버의 메인 페이지. npm start 가 여기를 띄운다.
 *                                     소스 파일을 각각 <script src> 로 불러온다
 *                                     (소스를 고치면 새로고침만 하면 된다)
 *   C:/numpy/numpy-lab.html        ← 모든 것을 인라인한 단일 배포본. 서버 없이
 *                                     더블클릭으로 열린다. 학생 배포용으로 계속 유지한다.
 *   webapp/src/core/data.js        ← 수업자료 CSV 에서 생성된 실습 데이터
 *
 * 2026-07-29 정책 변경: 오프라인 단일 파일 원칙과 CDN 금지가 해제되었다.
 * index.html 이 기본 진입점이고, numpy-lab.html 은 배포 편의를 위한 부가 산출물이다.
 * =========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');          // C:/numpy
const WEBAPP = __dirname;                         // C:/numpy/webapp
const SRC = path.join(WEBAPP, 'src');
const DATA_DIR = path.join(ROOT, '수업자료');
const OUT_INDEX = path.join(ROOT, 'index.html');
const OUT_STANDALONE = path.join(ROOT, 'numpy-lab.html');
const OUT_DATA = path.join(SRC, 'core', 'data.js');

const argv = process.argv.slice(2);
const WATCH = argv.includes('--watch');
const CHECK_ONLY = argv.includes('--check');

const read = p => fs.readFileSync(p, 'utf8');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

/* ------------------------------------------------- 1. 실습 데이터 생성 */

function buildData() {
  const out = [];
  out.push('/* data.js — 빌드가 수업자료 CSV 에서 생성한다. 손으로 고치지 마라.');
  out.push(' * 다시 만들기: node webapp/build.js');
  out.push(' */');
  out.push('(function (g) {\n  "use strict";\n  var D = {};');

  // 관절염 데이터: 60×40 = 2400개. 전부 넣는다.
  const infPath = path.join(DATA_DIR, 'lab_inflammation-01.csv');
  if (fs.existsSync(infPath)) {
    const rows = read(infPath).trim().split(/\r?\n/).map(l => l.split(',').map(Number));
    const nRow = rows.length, nCol = rows[0].length;
    if (!rows.every(r => r.length === nCol)) throw new Error('관절염 CSV 의 행 길이가 서로 다르다');
    if (rows.flat().some(Number.isNaN)) throw new Error('관절염 CSV 에 숫자가 아닌 값이 있다');
    out.push(`  D.inflammation = { shape: [${nRow}, ${nCol}], flat: [${rows.flat().join(',')}] };`);
    out.push(`  D.inflammationMeta = {
    file: "lab_inflammation-01.csv", header: false,
    rowMeaning: "환자", colMeaning: "날짜(day)",
    note: "관절염 환자에게 신약을 투여한 뒤 기록한 염증 수치."
  };`);
    log(`  관절염 데이터 ${nRow}×${nCol} = ${nRow * nCol}개 값`);
  } else if (fs.existsSync(OUT_DATA)) {
    // 저장소에는 수업자료/ 가 없다(공개 배포에서 제외). 이미 만들어져 커밋된 data.js 가
    // 있으면 그것을 그대로 쓴다 — 여기서 덮어쓰면 앱이 데이터를 잃는다.
    log('  수업자료/ 가 없다 → 이미 있는 webapp/src/core/data.js 를 그대로 쓴다');
    return null;
  } else {
    warn('  관절염 CSV 도 없고 data.js 도 없다 — 데이터 없이 빌드한다');
    warn('  수업자료/lab_inflammation-01.csv 를 넣고 다시 빌드하면 실습 데이터가 살아난다');
    out.push('  D.inflammation = null; D.inflammationMeta = null;');
  }

  // 영화 평점(MovieLens).
  //
  // ★ 실제 데이터를 임베드하지 않는다. MovieLens 라이선스가 재배포를 금지한다
  //   ("may not be redistributed without separate permission"). 이 저장소는 공개이므로
  //   구조만 같은 **합성 데이터**를 만들어 넣고, 화면에 합성이라는 사실을 밝힌다.
  //   집계값(사용자 수·영화 수·평점 평균·분포)은 데이터가 아니라 사실 요약이므로 그대로 적는다.
  //   출처: https://grouplens.org/datasets/movielens/
  {
    const HEADER = 'userId,movieId,rating,timestamp';
    const N = 1200;
    // 재현 가능한 의사난수 (빌드마다 같은 결과가 나오게)
    let seed = 20260729;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    const TS_MIN = 828124615, TS_MAX = 1537799250;   // 실제 파일의 시간 범위(사실)
    const rows = [];
    let uid = 1, left = 8 + Math.floor(rnd() * 25);
    for (let i = 0; i < N; i++) {
      if (left === 0) { uid++; left = 8 + Math.floor(rnd() * 45); }
      left--;
      const movieId = 1 + Math.floor(Math.pow(rnd(), 2.2) * 8000);
      const rating = (Math.min(10, Math.max(1, Math.round(3.5 * 2 + (rnd() - rnd()) * 3)))) / 2;
      const ts = Math.floor(TS_MIN + rnd() * (TS_MAX - TS_MIN));
      rows.push([uid, movieId, rating, ts]);
    }

    out.push(`  D.ratingsSample = { shape: [${rows.length}, 4], flat: [${rows.flat().join(',')}] };`);
    out.push(`  D.ratingsMeta = {
    file: "ra.csv", header: ${JSON.stringify(HEADER)}, headerRows: 1,
    trueShape: [100836, 4], sampleRows: ${rows.length},
    users: 610, movies: 9724,
    ratingMean: 3.501557,
    ratingMin: 0.5, ratingMax: 5,
    tsMin: ${TS_MIN}, tsMax: ${TS_MAX},
    ratingHist: [[0.5,1370],[1,2811],[1.5,1791],[2,7551],[2.5,5550],[3,20047],[3.5,13136],[4,26818],[4.5,8551],[5,13211]],
    sampleIsSynthetic: true,
    source: "https://grouplens.org/datasets/movielens/",
    sampleNote: "MovieLens 라이선스가 재배포를 금지하므로, 이 페이지에 든 표본은 실제 파일이 아니라 구조(4열: userId, movieId, rating, timestamp)만 같게 만든 합성 데이터다. 아래 집계값은 실제 전체 데이터에서 계산한 사실이다."
  };`);
    log(`  영화 평점: 합성 표본 ${rows.length}행 (MovieLens 재배포 금지 — 실제 데이터는 넣지 않는다)`);
    log(`    집계값(사용자 610명 · 영화 9724편 · 평균 3.501557)은 사실이므로 그대로 기재`);
  }

  out.push(`
  /** 임베드된 평평한 배열을 ND 배열로 만든다 */
  D.nd = function (key) {
    var d = D[key];
    if (!d || !g.ND) return null;
    return new g.ND.ND(d.flat.slice(), d.shape, null, 0, 'float64', null);
  };
  g.LabData = D;
})(typeof window !== 'undefined' ? window : globalThis);
`);
  return out.join('\n');
}

/* ------------------------------------------------------- 2. 소스 수집 */

function collect() {
  const cssFiles = ['theme.css', 'app.css'].map(f => path.join(SRC, f));

  const modDir = path.join(SRC, 'modules');
  const modFiles = fs.existsSync(modDir)
    ? fs.readdirSync(modDir).filter(f => f.endsWith('.js')).sort().map(f => path.join(modDir, f))
    : [];

  // 순서가 의존 순서다: 엔진 → 위젯 → 데이터 → 셸 → 화면 모듈
  //
  // app.js 가 모듈보다 **먼저** 와야 한다. app.js 가 window.Lab 을 정의하고
  // 각 모듈은 로드 시점에 Lab.register(...) 를 부르기 때문이다. 순서가 뒤바뀌면
  // 모듈들이 조용히 "Lab is not defined" 로 죽어서 장이 하나도 등록되지 않는다.
  // (Lab.start() 는 index.html 맨 끝의 boot 스크립트가 부른다.)
  const jsFiles = [
    path.join(SRC, 'core', 'nd.js'),
    path.join(SRC, 'core', 'ui.js'),
    OUT_DATA,
    path.join(SRC, 'core', 'app.js'),
    ...modFiles
  ];

  return { cssFiles, jsFiles, modFiles };
}

/* ------------------------------------------------------- 3. 문법 검사 */

function checkSyntax(files) {
  const bad = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      bad.push({ file: rel(f), msg: (e.stderr || '').toString().split('\n').slice(0, 4).join('\n') });
    }
  }
  return bad;
}

/* ----------------------------------------------------- 4. index.html */

const BOOT = `(function () {
  function fail(msg) {
    document.body.innerHTML = '<div style="padding:2rem;font:15px/1.7 system-ui,sans-serif;max-width:40rem">' +
      '<h1 style="font-size:1.3rem">NumPy Lab 을 시작할 수 없다</h1><p>' + msg + '</p>' +
      '<pre style="background:#f2f2ee;padding:.8rem;border-radius:6px">npm install\\nnpm start</pre></div>';
  }
  function boot() {
    if (!window.ND)      return fail('미니 NumPy 엔진(nd.js)을 불러오지 못했다.');
    if (!window.UI)      return fail('위젯(ui.js)을 불러오지 못했다.');
    if (!window.LabData) return fail('실습 데이터(data.js)가 없다. <code>npm run build</code> 를 먼저 실행하라.');
    if (!window.Lab)     return fail('셸(app.js)을 불러오지 못했다.');
    if (!window.Lab.chapters.length) return fail('학습 화면 모듈이 하나도 등록되지 않았다. webapp/src/modules/ 를 확인하라.');
    window.Lab.start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();`;

const HEAD_META = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>NumPy Lab — 과학고 NumPy 심화 학습</title>
<meta name="description" content="브라우저에서 도는 미니 NumPy 엔진과 시뮬레이터로 배우는 NumPy 심화 학습 실습장.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232a78d6'/%3E%3Ctext x='16' y='22' font-family='monospace' font-size='15' font-weight='bold' fill='white' text-anchor='middle'%3Enp%3C/text%3E%3C/svg%3E">`;

function buildIndex(cssFiles, jsFiles) {
  return `<!doctype html>
<html lang="ko">
<head>
${HEAD_META}
<!--
  이 파일은 자동 생성된다.  다시 만들기: npm run build
  소스는 webapp/src/ 에 있고 아래에서 각각 불러온다.
  소스를 고쳤으면 브라우저 새로고침만 하면 된다(모듈 파일을 새로 추가했을 때만 다시 빌드).
-->
${cssFiles.map(f => `<link rel="stylesheet" href="${rel(f)}">`).join('\n')}
</head>
<body>
<noscript><p style="padding:2rem;font:15px system-ui,sans-serif">이 실습장은 자바스크립트가 필요하다. 브라우저에서 자바스크립트를 켜라.</p></noscript>
${jsFiles.filter(f => fs.existsSync(f)).map(f => `<script src="${rel(f)}"></script>`).join('\n')}
<script>
${BOOT}
</script>
</body>
</html>
`;
}

/* ------------------------------------------------- 5. numpy-lab.html */

function buildStandalone(cssFiles, jsFiles) {
  const css = cssFiles.map(f => `/* ===== ${rel(f)} ===== */\n${read(f)}`).join('\n\n');
  const js = jsFiles.filter(f => fs.existsSync(f))
    .map(f => `<script>\n/* ===== ${rel(f)} ===== */\n${read(f)}\n</script>`).join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
${HEAD_META}
<!--
  NumPy Lab 단일 파일 배포본 — 모든 CSS/JS 가 인라인되어 있다.
  서버 없이 더블클릭으로 열린다. 학생에게 이 파일만 주면 된다.
  자동 생성물이다. 고치려면 webapp/src/ 를 고치고 npm run build 를 실행하라.
-->
<style>
${css}
</style>
</head>
<body>
<noscript><p style="padding:2rem;font:15px system-ui,sans-serif">이 실습장은 자바스크립트가 필요하다.</p></noscript>
${js}
<script>
${BOOT}
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------- 실행 */

let quiet = false;
function log(m) { if (!quiet) console.log(m); }
function warn(m) { console.warn('  ! ' + m); }

function run() {
  const t0 = Date.now();
  log('NumPy Lab 빌드');

  // 데이터 먼저 (index/standalone 이 이 파일을 참조한다).
  // buildData() 가 null 을 주면 "기존 data.js 를 그대로 쓴다"는 뜻이다.
  const dataJs = buildData();
  if (dataJs !== null && !CHECK_ONLY) fs.writeFileSync(OUT_DATA, dataJs, 'utf8');
  else if (dataJs !== null && !fs.existsSync(OUT_DATA)) fs.writeFileSync(OUT_DATA, dataJs, 'utf8');
  if (!fs.existsSync(OUT_DATA)) throw new Error('data.js 를 만들지 못했다');

  const { cssFiles, jsFiles, modFiles } = collect();

  for (const f of [...cssFiles, path.join(SRC, 'core', 'nd.js'),
                   path.join(SRC, 'core', 'ui.js'), path.join(SRC, 'core', 'app.js')]) {
    if (!fs.existsSync(f)) throw new Error('필수 소스가 없다: ' + rel(f));
  }

  if (modFiles.length === 0) warn('학습 화면 모듈이 하나도 없다 (webapp/src/modules/*.js)');
  else log(`  화면 모듈 ${modFiles.length}개: ` + modFiles.map(f => path.basename(f, '.js')).join(', '));

  const bad = checkSyntax(jsFiles);
  if (bad.length) {
    console.error('\n문법 오류:');
    bad.forEach(b => console.error(`  ${b.file}\n${b.msg}`));
    if (CHECK_ONLY) process.exit(1);
    console.error('  → 그래도 빌드는 계속한다. 브라우저에서 해당 모듈이 깨진다.\n');
  } else {
    log('  문법 검사 통과');
  }

  if (CHECK_ONLY) { log('\n--check 모드: 파일을 쓰지 않았다.'); return; }

  fs.writeFileSync(OUT_INDEX, buildIndex(cssFiles, jsFiles), 'utf8');
  fs.writeFileSync(OUT_STANDALONE, buildStandalone(cssFiles, jsFiles), 'utf8');

  const kb = p => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
  log('');
  log(`  ${rel(OUT_INDEX)}       ${kb(OUT_INDEX)}   ← 웹서버 메인 페이지 (npm start)`);
  log(`  ${rel(OUT_STANDALONE)}   ${kb(OUT_STANDALONE)}   ← 단일 파일 배포본 (더블클릭)`);
  log(`  ${rel(OUT_DATA)}   ${kb(OUT_DATA)}`);
  log(`\n완료 (${Date.now() - t0}ms)`);
}

function watch() {
  const dirs = [SRC, path.join(SRC, 'core'), path.join(SRC, 'modules')];
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { quiet = true; run(); quiet = false; console.log('재빌드 ' + new Date().toTimeString().slice(0, 8)); }
      catch (e) { quiet = false; console.error('빌드 실패: ' + e.message); }
    }, 120);
  };
  dirs.forEach(d => {
    if (!fs.existsSync(d)) return;
    fs.watch(d, (ev, f) => { if (f && /\.(js|css)$/.test(f) && f !== 'data.js') rebuild(); });
  });
  console.log('\n소스 변경을 감시한다. 멈추려면 Ctrl+C.');
}

try {
  run();
  if (WATCH) watch();
} catch (e) {
  console.error('\n빌드 실패: ' + e.message);
  process.exit(1);
}
