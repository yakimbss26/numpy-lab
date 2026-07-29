# -*- coding: utf-8 -*-
"""numpy.md 에 적힌 출력값을 실제 NumPy 출력과 대조한다.

교재의 관례:
    print(expr)
    # 기대 출력
    # (여러 줄이면 이어서)
또는
    expr
    # 기대 출력

각 문장을 실행해 실제 출력을 얻고, 바로 뒤에 붙은 주석 줄과 비교한다.
공백은 정규화해서 비교하되, 정렬 자체가 교육 내용인 경우가 있어
'느슨한 불일치'(공백만 다름)와 '진짜 불일치'(값이 다름)를 구분해 보고한다.

실행:
  "C:/.../python.exe" -X utf8 webapp/test/verify_outputs.py [장번호 ...]
"""
import io, os, re, sys, ast, contextlib, warnings

HERE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(HERE, '..', '..', 'numpy.md')
os.chdir(os.path.join(HERE, '..', '..'))

want = set(sys.argv[1:]) or None
src = io.open(MD, encoding='utf-8').read()
lines = src.split('\n')

chapters = []
for i, l in enumerate(lines):
    m = re.match(r'^## (\d+)\.', l)
    if m:
        chapters.append((int(m.group(1)), i, l.strip()))
chapters.append((999, len(lines), ''))

SKIP_BLOCK = re.compile(r'(^|\n)\s*(!pip|%timeit|%%timeit|import keras|from keras|'
                        r'import matplotlib|import tensorflow|plt\.|mnist\.)')
# 값을 단정할 수 없는 것들 — 대조 대상에서 뺀다
NONDET = re.compile(r'(random|empty|timeit|getsizeof|time\(|perf_counter|id\()')
# 출력이 아니라 설명인 주석
NOT_OUTPUT = re.compile(r'^#\s*(→|->|즉|여기서|왜|주의|참고|이때|이제|위|아래|'
                        r'\w+\s*=|[가-힣]{4,}.*(다|까|라|자)\.?$)')

def norm(s):
    return re.sub(r'\s+', ' ', s.strip())

strict_bad, loose_bad, matched, skipped = [], [], 0, 0

for k in range(len(chapters) - 1):
    num, start, title = chapters[k]
    end = chapters[k + 1][1]
    if want and str(num) not in want:
        continue
    body = '\n'.join(lines[start:end])

    ns = {}
    exec('import numpy as np', ns)
    # 교재가 앞 장에서 로딩한 것으로 가정하는 변수들을 미리 준비
    try:
        exec("data = np.loadtxt('수업자료/lab_inflammation-01.csv', delimiter=',')", ns)
    except Exception:
        pass

    for m in re.finditer(r'```python\n(.*?)```', body, re.S):
        code = m.group(1)
        base_line = body[:m.start()].count('\n') + start + 1
        if SKIP_BLOCK.search(code):
            continue

        clines = code.split('\n')
        i = 0
        while i < len(clines):
            line = clines[i]
            if not line.strip() or line.lstrip().startswith('#'):
                i += 1
                continue
            # 들여쓰기된 블록(함수/for)은 통째로 실행만
            stmt = [line]
            i += 1
            while i < len(clines) and (clines[i].startswith((' ', '\t')) and clines[i].strip()):
                stmt.append(clines[i]); i += 1
            stmt_src = '\n'.join(stmt)

            # 바로 뒤의 주석 줄들을 기대 출력으로 모은다
            exp = []
            jj = i
            while jj < len(clines) and clines[jj].lstrip().startswith('#'):
                c = clines[jj].lstrip()
                if NOT_OUTPUT.match(c):
                    break
                exp.append(re.sub(r'^#\s?', '', c))
                jj += 1

            buf = io.StringIO()
            try:
                with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
                    with warnings.catch_warnings():
                        warnings.simplefilter('ignore')
                        try:
                            tree = ast.parse(stmt_src, mode='eval')
                            val = eval(compile(tree, '<md>', 'eval'), ns)
                            if val is not None:
                                print(repr(val))
                        except SyntaxError:
                            exec(stmt_src, ns)
            except Exception:
                i = jj
                continue

            actual = buf.getvalue().rstrip('\n')
            if not exp or not actual:
                i = jj
                continue
            if NONDET.search(stmt_src) or NONDET.search('\n'.join(exp)):
                skipped += 1
                i = jj
                continue

            want_s = '\n'.join(exp)
            if actual == want_s:
                matched += 1
            elif norm(actual) == norm(want_s):
                matched += 1                                  # 공백만 다름 → 정렬 이슈
                loose_bad.append((base_line, title, stmt_src, want_s, actual))
            else:
                strict_bad.append((base_line, title, stmt_src, want_s, actual))
            i = jj

print('=' * 74)
print('numpy.md 출력값 대조   (numpy %s)' % __import__('numpy').__version__)
print('=' * 74)
print('일치 %d · 값 불일치 %d · 공백/정렬만 다름 %d · 비결정적이라 건너뜀 %d'
      % (matched, len(strict_bad), len(loose_bad), skipped))

def show(items, label):
    if not items:
        return
    print('\n' + '=' * 74)
    print(label)
    print('=' * 74)
    for lineno, title, stmt, w, a in items:
        print('\nnumpy.md:%d  (%s)' % (lineno, title))
        for s in stmt.split('\n')[:3]:
            print('    코드 | %s' % s)
        print('    교재 | %s' % w.replace('\n', '\n         | '))
        print('    실제 | %s' % a.replace('\n', '\n         | '))

show(strict_bad, '값이 다른 곳 — 반드시 고쳐야 한다')
show(loose_bad, '공백·정렬만 다른 곳 — 값은 맞다')

sys.exit(1 if strict_bad else 0)
