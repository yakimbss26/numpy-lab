/* idle.test.js — 각 장의 "IDLE 에서 직접 해 보기" 스크립트가 실제로 실행되는지 검증한다.
 *
 *   node webapp/test/idle.test.js
 *
 * jsdom 으로 앱을 띄워 장마다 코드바가 만드는 .py 를 뽑아 파일로 쓴 뒤,
 * 실제 파이썬으로 실행해 본다. 파이썬이 없으면 문법 검사까지만 한다.
 *
 * 이 테스트가 있는 이유: 학생이 복사·저장한 코드가 IDLE 에서 NameError 나
 * FileNotFoundError 로 죽으면 "IDLE 에서 실행할 수 있다"는 약속이 깨진다.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'webapp', 'src');
const OUTDIR = path.join(os.tmpdir(), 'numpy-lab-idle-test');

const PY_CANDIDATES = [
  'C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe',
  process.env.PYTHON || ''
].filter(Boolean);

function findPython() {
  for (const p of PY_CANDIDATES) {
    try {
      execFileSync(p, ['-c', 'import numpy'], { stdio: 'pipe' });
      return p;
    } catch (e) { /* 다음 후보 */ }
  }
  return null;
}

/* ---------------------------------------------- jsdom 으로 앱 띄우기 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true, url: 'http://localhost/',
  // outside-only: 페이지 안의 <script> 는 실행하지 않지만 window.eval 이 창의
  // 전역(window, document …)을 공유한다. 이게 없으면 모듈이 window 를 못 찾는다.
  runScripts: 'outside-only'
});
const win = dom.window;

// 브라우저에만 있는 것 몇 개를 채워 준다
win.matchMedia = win.matchMedia || function () {
  return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
};
if (!win.HTMLCanvasElement.prototype.getContext) {
  win.HTMLCanvasElement.prototype.getContext = function () { return null; };
}
win.URL.createObjectURL = win.URL.createObjectURL || function () { return 'blob:x'; };
win.URL.revokeObjectURL = win.URL.revokeObjectURL || function () {};

const files = [
  'core/nd.js', 'core/ui.js', 'core/data.js', 'core/app.js',
  ...fs.readdirSync(path.join(SRC, 'modules')).filter(f => f.endsWith('.js')).sort()
    .map(f => 'modules/' + f)
];
for (const f of files) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  try {
    win.eval(code);
  } catch (e) {
    console.error(`소스 로드 실패: ${f}\n  ${e.message}`);
    process.exit(1);
  }
}

const Lab = win.Lab;
if (!Lab || !Lab.chapters.length) {
  console.error('장이 하나도 등록되지 않았다. 스크립트 로드 순서를 확인하라.');
  process.exit(1);
}
if (!Lab.chapterScript) {
  console.error('Lab.chapterScript 가 없다. app.js 에서 내보내야 한다.');
  process.exit(1);
}

/* ------------------------------------------- 장별 스크립트 생성 */

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });

const made = [];
for (const c of Lab.chapters) {
  const body = win.document.createElement('div');
  win.document.body.appendChild(body);
  try {
    c.render(body);
  } catch (e) {
    console.error(`${c.n}장 렌더 실패: ${e.message}`);
    process.exit(1);
  }
  const built = Lab.chapterScript(body, c);
  body.remove();
  if (!built.blocks) continue;
  const file = path.join(OUTDIR, `ch${String(c.n).padStart(2, '0')}-${c.id}.py`);
  fs.writeFileSync(file, built.text, 'utf8');
  made.push({ c, file, built });
}

/* ------------------------------------------------------ 실행 검증 */

const PY = findPython();
console.log('='.repeat(70));
console.log(`IDLE 스크립트 검증 — 장 ${made.length}개`);
console.log(PY ? `파이썬: ${PY}` : '파이썬(+numpy)을 찾지 못했다 → 문법 검사만 한다');
console.log('='.repeat(70));

let pass = 0, fail = 0;
const fails = [];

for (const { c, file, built } of made) {
  const label = `${c.n}장 ${c.id}`.padEnd(20);
  const meta = `블록 ${String(built.blocks).padStart(2)}개` +
    (built.withData ? ' · 데이터포함' : '') +
    (built.commented ? ` · 주석 ${built.commented}개` : '');

  if (!PY) {
    try {
      execFileSync('node', ['-e', '1'], { stdio: 'pipe' });   // no-op
      console.log(`  ?    ${label} ${meta}  (실행 검증 생략)`);
    } catch (e) { }
    continue;
  }

  // 1) 문법 검사
  try {
    execFileSync(PY, ['-X', 'utf8', '-m', 'py_compile', file], { stdio: 'pipe' });
  } catch (e) {
    fail++;
    fails.push(`${label} 문법 오류\n${(e.stderr || '').toString().split('\n').slice(0, 5).join('\n')}`);
    console.log(`  FAIL ${label} ${meta}  ← 문법 오류`);
    continue;
  }

  // 2) 실제 실행 (경고는 무시, 작업 폴더는 임시 폴더)
  try {
    execFileSync(PY, ['-X', 'utf8', '-W', 'ignore', file],
      { stdio: 'pipe', cwd: OUTDIR, timeout: 60000 });
    pass++;
    console.log(`  OK   ${label} ${meta}`);
  } catch (e) {
    fail++;
    const err = (e.stderr || '').toString().trim().split('\n');
    fails.push(`${label} 실행 실패\n    ` + err.slice(-4).join('\n    '));
    console.log(`  FAIL ${label} ${meta}  ← ${err[err.length - 1] || '실행 실패'}`);
  }
}

if (fails.length) {
  console.log('\n' + '='.repeat(70));
  fails.forEach(f => console.log('\n' + f));
}
console.log('');
if (PY) console.log(`실행 성공 ${pass} / 실패 ${fail}`);
console.log(`생성 위치: ${OUTDIR}`);
process.exit(fail ? 1 : 0);
