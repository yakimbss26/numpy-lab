# -*- coding: utf-8 -*-
"""numpy.md 의 파이썬 코드 블록을 실제 NumPy 로 실행해 본다.

목적: 교재에 실행되지 않는 코드(삭제된 API, 오타, 잘못된 인자)가 남아 있는지 찾는다.
장별로 이름공간을 누적해 실행한다(앞 블록에서 만든 변수를 뒤 블록이 쓴다).

실행:
  "C:/.../python.exe" webapp/test/verify_md.py [장번호 ...]
  예) webapp/test/verify_md.py 7 8 9 10 11 12
"""
import io, os, re, sys, contextlib, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(HERE, '..', '..', 'numpy.md')
os.chdir(os.path.join(HERE, '..', '..'))          # 상대경로 수업자료/… 가 먹히게

want = set(sys.argv[1:]) or None

src = io.open(MD, encoding='utf-8').read()
lines = src.split('\n')

# 장 경계 찾기
chapters = []
for i, l in enumerate(lines):
    m = re.match(r'^## (\d+)\.', l)
    if m:
        chapters.append((int(m.group(1)), i, l.strip()))
chapters.append((999, len(lines), ''))

# "일부러 에러를 보여 주는 블록" 판정에 쓰는 신호
ERR_HINT = re.compile(
    r'(Error|error|에러|예외|Traceback|실패|안 된다|되지 않는다|나지 않는다|'
    r'AttributeError|ValueError|IndexError|TypeError|OverflowError|'
    r'ZeroDivisionError|FileNotFoundError|AxisError|LinAlgError|경고|Warning)')

# 실행을 건너뛸 블록 (외부 패키지·시간 측정·파일 쓰기)
SKIP = re.compile(r'(^|\n)\s*(!pip|%timeit|%%timeit|import keras|from keras|'
                  r'import matplotlib|import tensorflow|plt\.|mnist\.)')

total = ok = errored = expected_err = skipped = 0
report = []

for k in range(len(chapters) - 1):
    num, start, title = chapters[k]
    end = chapters[k + 1][1]
    if want and str(num) not in want:
        continue

    body = '\n'.join(lines[start:end])
    # ```python … ``` 블록 추출 (앞뒤 문맥도 같이 확보)
    blocks = []
    for m in re.finditer(r'```python\n(.*?)```', body, re.S):
        code = m.group(1)
        ctx_start = max(0, m.start() - 400)
        ctx = body[ctx_start:m.start()] + code[:200]
        blocks.append((code, ctx, body[:m.start()].count('\n') + start + 1))

    ns = {}
    exec('import numpy as np', ns)
    chapter_issues = []

    for code, ctx, lineno in blocks:
        total += 1
        if SKIP.search(code):
            skipped += 1
            continue
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    exec(code, ns)
            ok += 1
        except Exception as e:
            msg = '%s: %s' % (type(e).__name__, e)
            if ERR_HINT.search(ctx) or ERR_HINT.search(code):
                expected_err += 1          # 교재가 의도한 에러 예제
            else:
                errored += 1
                chapter_issues.append((lineno, msg, code.strip()[:220]))

    if chapter_issues:
        report.append((num, title, chapter_issues))

print('=' * 72)
print('numpy.md 코드 블록 실행 검사   (numpy %s)' % __import__('numpy').__version__)
print('=' * 72)
print('블록 %d개 · 정상 실행 %d · 의도된 에러 %d · 건너뜀 %d · **예상 못한 에러 %d**'
      % (total, ok, expected_err, skipped, errored))

if report:
    for num, title, issues in report:
        print('\n' + '-' * 72)
        print('%s   — 예상 못한 에러 %d건' % (title, len(issues)))
        print('-' * 72)
        for lineno, msg, code in issues:
            print('  numpy.md:%d' % lineno)
            print('    %s' % msg)
            for cl in code.split('\n')[:6]:
                print('      | %s' % cl)
            print('')
else:
    print('\n예상 못한 에러 없음.')

sys.exit(1 if errored else 0)
