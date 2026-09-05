/* ===========================================================================
 * app.js — NumPy Lab 셸: 챕터 등록소, 해시 라우터, 사이드바, 진도, 테마
 * 화면 모듈은 Lab.register({...}) 로 자기를 등록한다.
 * 전역: window.Lab
 * =========================================================================== */
(function (global) {
  'use strict';

  var UI = global.UI, el = null;

  var chapters = [];      // 등록 순서 유지
  var extras = [];        // 장이 아닌 화면(과제 등)
  var byId = {};

  /**
   * 화면 모듈 등록.
   * {
   *   id: 'axis',                       // 해시 경로
   *   n: '8',                           // 표시용 장 번호
   *   title: '축(axis) 완전 정복',
   *   blurb: '한 줄 소개 (홈 타일)',
   *   sim: '축소 애니메이션 · 3D 층 뷰',  // 이 장에 든 시뮬레이터 요약 (없으면 생략)
   *   render(root)                      // root 에 DOM 을 채운다
   * }
   */
  function register(mod) {
    if (byId[mod.id]) { console.warn('중복 등록:', mod.id); return; }
    byId[mod.id] = mod;
    /* extra: 장이 아닌 화면. 학습 과정 목록·홈 타일·이전/다음 줄에 끼지 않는다 */
    if (mod.extra) extras.push(mod); else chapters.push(mod);
  }

  /* ------------------------------------------------------------- 테마 */

  var THEME_KEY = 'numpy-lab-theme';
  function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ------------------------------------------------------------ 사이드바 */

  var navLinks = {};

  function buildSidebar() {
    el = UI.el;
    var nav = el('nav', { class: 'nav' });
    nav.appendChild(el('a', { href: '#/', class: 'home-link' }, [
      el('span', { class: 'num', text: '⌂' }), '처음 화면'
    ]));
    nav.appendChild(el('div', { class: 'nav-group', text: '학습 과정' }));
    chapters.forEach(function (c) {
      var dot = el('span', { class: 'dot' });
      var a = el('a', { href: '#/' + c.id, 'data-id': c.id }, [
        el('span', { class: 'num', text: c.n }), el('span', { text: c.title }), dot
      ]);
      navLinks[c.id] = { a: a, dot: dot };
      nav.appendChild(a);
    });

    if (extras.length) {
      nav.appendChild(el('div', { class: 'nav-group', text: '스스로 하기' }));
      extras.forEach(function (c) {
        var dot = el('span', { class: 'dot' });
        var a = el('a', { href: '#/' + c.id, 'data-id': c.id }, [
          el('span', { class: 'num', text: '✎' }), el('span', { text: '과제' }), dot
        ]);
        navLinks[c.id] = { a: a, dot: dot };
        nav.appendChild(a);
      });
    }

    var progLine = el('div', { class: 'prog-line' });
    var progBar = el('i');

    var side = el('aside', { class: 'sidebar', id: 'sidebar' }, [
      el('div', { class: 'brand' }, [
        el('a', { href: '#/', class: 'logo', style: { color: 'inherit' } }, [
          el('span', { class: 'mark', text: 'np' }), 'NumPy Lab'
        ]),
        el('div', { class: 'tag', text: '과학고 1학년 심화 학습 · 시뮬레이터 내장' })
      ]),
      nav,
      el('div', { class: 'side-foot' }, [
        UI.seg({
          label: null, value: getTheme(),
          options: [{ value: 'auto', label: '자동' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }],
          onChange: setTheme
        }),
        UI.btn('진도 초기화', function () {
          if (confirm('풀었던 문제 기록을 모두 지워요 — 과제의 답·예측·메모도 함께 사라져요. 계속하겠나요?')) UI.progress.reset();
        }),
        el('div', { class: 'prog-line' }, [progLine, el('div', { class: 'prog-bar' }, [progBar])])
      ])
    ]);

    function refresh() {
      var seen = 0, solved = 0, totalQ = 0, okQ = 0;
      chapters.forEach(function (c) {
        var st = UI.progress.stats(c.id);
        var d = navLinks[c.id].dot;
        d.className = 'dot' + (st.total && st.correct === st.total ? ' done' : (st.visited ? ' seen' : ''));
        if (st.visited) seen++;
        totalQ += st.total; okQ += st.correct;
        if (st.total && st.correct === st.total) solved++;
      });
      extras.forEach(function (c) {
        if (!navLinks[c.id]) return;
        var st = UI.progress.stats(c.id);
        navLinks[c.id].dot.className = 'dot' +
          (st.total && st.correct === st.total ? ' done' : (st.visited ? ' seen' : ''));
      });
      progLine.textContent = '방문 ' + seen + '/' + chapters.length +
        ' · 문제 ' + okQ + '문 정답';
      progBar.style.width = (chapters.length ? (seen / chapters.length * 100) : 0).toFixed(0) + '%';
    }
    UI.progress.onChange(refresh);
    refresh();
    return side;
  }

  /* ------------------------------------------------------------- 홈 화면 */

  function renderHome(root) {
    root.appendChild(el('div', { class: 'hero' }, [
      el('h1', { text: 'NumPy Lab' }),
      el('p', { class: 'sub', html:
        'NumPy 를 <b>읽어서 외우는 대신 직접 움직여 보며</b> 배우는 실습장이에요. ' +
        '축(axis)이 어떻게 사라지는지, 브로드캐스팅이 배열을 어떻게 늘리는지, ' +
        '슬라이싱한 배열이 왜 원본을 바꿔 버리는지 — 모두 화면에서 직접 확인할 수 있어요.' }),
      el('p', { class: 'sub small', html:
        '이 페이지 안에는 브라우저에서 도는 <b>미니 NumPy 엔진</b>이 들어 있어요. ' +
        '보이는 숫자는 미리 적어 둔 값이 아니라 <b>그 자리에서 계산한 결과</b>예요. ' +
        '설치도, 인터넷도 필요 없어요.' })
    ]));

    var tiles = el('div', { class: 'tiles' });
    chapters.forEach(function (c) {
      tiles.appendChild(el('a', { class: 'tile', href: '#/' + c.id }, [
        el('div', { class: 'n', text: c.n + '장' }),
        el('div', { class: 't', text: c.title }),
        el('div', { class: 'd', text: c.blurb || '' }),
        c.sim ? el('div', { class: 'sim', text: '▸ ' + c.sim }) : null
      ]));
    });
    root.appendChild(tiles);

    extras.forEach(function (c) {
      root.appendChild(el('a', { class: 'tile quest-cta', href: '#/' + c.id }, [
        el('div', { class: 'n', text: '과제' }),
        el('div', { class: 't', text: c.title }),
        el('div', { class: 'd', text: c.blurb || '' }),
        c.sim ? el('div', { class: 'sim', text: '▸ ' + c.sim }) : null
      ]));
    });

    root.appendChild(UI.callout('tip',
      '왼쪽 목록의 점은 진도 표시예요. 회색은 방문한 장, 초록은 확인 문제를 모두 맞힌 장이에요. ' +
      '기록은 서버가 아니라 <b>이 컴퓨터의 브라우저</b>에 저장돼요. 그래서 다른 사람의 컴퓨터와는 절대 섞이지 않지만, ' +
      '<b>한 컴퓨터를 여러 사람이 쓰면 같은 기록을 보게 돼요.</b> ' +
      '실습실처럼 공용 컴퓨터라면 <a href="#/quest">과제</a> 화면에서 이름을 넣어 자기 기록을 따로 둬요 ' +
      '(장별 확인 문제 진도는 이름과 무관하게 이 컴퓨터에 하나로 쌓여요).', '기록은 어디에 남나'));

    root.appendChild(UI.callout('why',
      '화면에 나오는 파이썬 코드는 오른쪽 위 <b>복사</b> 버튼을 누르면 그대로 가져갈 수 있어요. ' +
      '<code>import numpy as np</code> 가 빠진 코드에는 복사할 때 자동으로 붙여 줘요. ' +
      '장 맨 아래에는 <b>그 장의 코드를 전부 모아 <code>.py</code> 파일로 저장</b>하는 버튼도 있어요.' +
      '<ol style="margin:.5rem 0 0 1.15rem;padding:0">' +
      '<li>파이썬을 설치해요 — <a href="https://www.python.org/downloads/">python.org/downloads</a> ' +
      '(설치할 때 <b>Add python.exe to PATH</b> 를 켜세요)</li>' +
      '<li>명령 프롬프트에서 <code>pip install numpy</code> 를 한 번 실행해요</li>' +
      '<li>저장한 <code>.py</code> 파일을 우클릭 → <b>Edit with IDLE</b> 로 열어요</li>' +
      '<li><b>F5</b> 를 누르면 결과가 IDLE 셸 창에 나와요</li>' +
      '</ol>' +
      '<b>블록 하나만 복사했을 때</b>는 IDLE <b>셸</b>(<code>&gt;&gt;&gt;</code> 창)에 붙여넣어 주세요. ' +
      '셸은 <code>arr5</code> 처럼 값만 쓴 줄도 결과를 바로 보여 줘요. ' +
      '반대로 <b>편집창</b>에 붙여넣고 F5 를 누르면 <code>print()</code> 로 감싼 것만 보여요 — ' +
      '주피터와 다른 점이에요. 장 아래 <code>.py</code> 파일에는 이 감싸기를 자동으로 해 두었어요.' +
      '설치 없이 바로 해 보려면 11장 <b>코드 실습실</b>을 쓰면 돼요. 브라우저 안에서 바로 실행돼요.',
      'IDLE 에서 직접 실행하는 방법'));

    root.appendChild(el('h2', { class: 'h-sec', text: '이 실습장에 든 시뮬레이터' }));
    var simRows = chapters.filter(function (c) { return c.sim; }).map(function (c) {
      return { ch: c.n + '장', t: c.title, s: c.sim };
    });
    root.appendChild(UI.table(
      [{ k: 'ch', label: '장' }, { k: 't', label: '주제' }, { k: 's', label: '시뮬레이터 · 시각화' }],
      simRows
    ));
  }

  /* ------------------------------------------- 이 장의 파이썬 코드 모으기 */

  /**
   * 장에 그려진 코드 블록을 순서대로 모아 IDLE 에서 바로 돌릴 수 있는
   * 하나의 .py 스크립트로 만든다. 주피터·Colab 전용 블록은 주석으로 넣는다.
   */
  /**
   * 관절염 데이터를 파이썬 리터럴로 만든다.
   * 이 장의 코드가 `data` 를 쓰는데 정의가 없으면 붙여 준다 — 안 붙이면
   * 학생이 IDLE 에서 NameError 를 만난다. (출처: Software Carpentry, CC-BY 4.0)
   */
  function inflammationPreamble() {
    var D = global.LabData;
    if (!D || !D.inflammation) return null;
    var flat = D.inflammation.flat, sh = D.inflammation.shape;
    var rows = [];
    for (var i = 0; i < flat.length; i += 40) {
      rows.push('    ' + flat.slice(i, i + 40).join(','));
    }
    return [
      '# ── 이 장은 관절염 환자 염증 수치(' + sh[0] + '명 × ' + sh[1] + '일)를 써요 ──',
      '# 수업에서 받은 CSV 가 있으면 아래 한 줄로 읽는 것이 원래 방식이에요:',
      "#   data = np.loadtxt('lab_inflammation-01.csv', delimiter=',')",
      '# 파일이 없어도 되게, 같은 값을 그대로 적어 두었어요.',
      '# 출처: Software Carpentry, Programming with Python (CC-BY 4.0)',
      'data = np.array([',
      rows.join(',\n'),
      '], dtype=float).reshape(' + sh[0] + ', ' + sh[1] + ')',
      ''
    ].join('\n');
  }

  /* 대입문인가? 괄호 안과 문자열 안의 `=` 는 세지 않는다(dtype=float 등). */
  function isAssignment(t) {
    var depth = 0, str = null;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (str) { if (ch === str && t[i - 1] !== '\\') str = null; continue; }
      if (ch === '"' || ch === "'") { str = ch; continue; }
      if ('([{'.indexOf(ch) >= 0) depth++;
      else if (')]}'.indexOf(ch) >= 0) depth--;
      else if (ch === '=' && depth === 0) {
        if (t[i + 1] === '=') { i++; continue; }                 // ==
        if ('!<>'.indexOf(t[i - 1]) >= 0) continue;              // != <= >=
        return true;                                             // = 또는 += 등
      }
    }
    return false;
  }

  var STMT_START = /^(import|from|def|class|if|elif|else|for|while|return|print|try|except|finally|with|del|pass|raise|assert|global|nonlocal|yield|break|continue|match|case|@)\b/;

  /**
   * 맨 표현식을 print(...) 로 감싼다.
   * 주피터는 셀의 마지막 표현식을 자동으로 보여 주지만, IDLE 편집창에서
   * F5 로 돌리면 아무것도 안 나온다. 그래서 스크립트에서는 감싸 준다.
   */
  /** 그 줄에서 늘어난(줄어든) 괄호 깊이. 문자열과 주석 안은 세지 않는다. */
  function bracketDelta(line) {
    var d = 0, str = null;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (str) { if (ch === str && line[i - 1] !== '\\') str = null; continue; }
      if (ch === '"' || ch === "'") { str = ch; continue; }
      if (ch === '#') break;
      if ('([{'.indexOf(ch) >= 0) d++;
      else if (')]}'.indexOf(ch) >= 0) d--;
    }
    return d;
  }

  function splitComment(line) {
    var m = /^([^#]*?)(\s*#.*)$/.exec(line);
    return m ? [m[1], m[2]] : [line, ''];
  }

  function autoPrint(src) {
    var lines = src.split('\n'), out = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim() || /^\s/.test(line) || /^\s*#/.test(line)) { out.push(line); i++; continue; }

      // 괄호가 닫힐 때까지 모아 "논리적 한 줄" 을 만든다
      var group = [line], d = bracketDelta(line);
      while (d > 0 && i + 1 < lines.length) { i++; group.push(lines[i]); d += bracketDelta(lines[i]); }
      i++;

      var head = splitComment(group[0])[0].trim();
      var joined = group.map(function (l) { return splitComment(l)[0]; }).join(' ').trim();
      var skip = !head || STMT_START.test(head) || /[:\\]$/.test(joined) || isAssignment(joined);
      if (skip) { group.forEach(function (l) { out.push(l); }); continue; }

      if (group.length === 1) {
        var p = splitComment(group[0]);
        out.push('print(' + p[0].trim() + ')' + p[1]);
      } else {
        // 여러 줄 식: 첫 줄 앞에 print( , 마지막 줄 뒤에 )
        var last = group.length - 1;
        group.forEach(function (l, k) {
          if (k === 0) out.push('print(' + l);
          else if (k === last) { var q = splitComment(l); out.push(q[0].replace(/\s+$/, '') + ')' + q[1]); }
          else out.push(l);
        });
      }
    }
    return out.join('\n');
  }

  function chapterScript(body, mod) {
    var wraps = [].slice.call(body.querySelectorAll('.codewrap'));
    var lines = [
      '# ' + mod.n + '. ' + mod.title,
      '# NumPy Lab (https://yakimbss26.github.io/numpy-lab/) — 이 장에 나온 파이썬 코드를',
      '# 화면에 나온 순서대로 모은 것이에요.',
      '#',
      '# IDLE 에서 실행하려면',
      '#   1) 이 파일을 IDLE 로 열어요 (파일 우클릭 → Edit with IDLE)',
      '#   2) F5 를 눌러요',
      '#   3) numpy 가 없다면 명령 프롬프트에서 먼저:  pip install numpy',
      '#',
      '# 앞 블록에서 만든 변수를 뒤 블록이 쓰는 곳이 있으므로 위에서부터 순서대로 두었어요.',
      '# 일부러 에러를 보여 주는 예제도 섞여 있어요 — 거기서 멈추면 그 줄을 주석 처리하고 계속하세요.',
      '',
      'import numpy as np',
      ''
    ];
    // 없는 파일을 읽는 코드는 IDLE 에서 그대로 돌지 않는다.
    //  · 관절염 CSV → 같은 값을 리터럴로 넣어 주고 그 줄만 주석 처리
    //  · ra.csv, gaps.csv 등 → 배포하지 않는 파일이라 블록 전체를 주석 처리
    var READ_FILE = /np\.(loadtxt|genfromtxt)\s*\(/;
    var INFLAM = /lab_inflammation[^'"]*\.csv/;

    var all = wraps.map(function (w) { return w.__raw || ''; }).join('\n');
    var usesData = /(^|[^.\w])data\b/.test(all) && !/\bdata\s*=\s*\[/.test(all);
    var withData = false;
    if (usesData) {
      var pre = inflammationPreamble();
      if (pre) { lines.push(pre); withData = true; }
    }

    var n = 0, commented = 0;
    wraps.forEach(function (w) {
      var raw = (w.__raw || '').replace(/\s+$/, '');
      if (!raw.trim()) return;
      n++;

      var b = raw.replace(/^[ \t]*import[ \t]+numpy[^\n]*\n?/gm, '').replace(/^\n+/, '');
      // import 만 있던 블록은 알맹이가 없어진다 → 맨 위 import 로 갈음하고 주석만 남긴다
      if (!b.trim()) {
        lines.push('# ' + new Array(60).join('-'));
        lines.push('# [' + n + ']   맨 위에서 이미 import 했어요');
        lines.push('# ' + raw.split('\n').join('\n# '));
        lines.push('');
        commented++;
        return;
      }
      var note = '';
      // 파이썬이 아닌 것(셸 명령), 주피터·Colab 전용, keras/tensorflow 필요 → 전체 주석
      var skipAll = w.__notPython || w.__jupyterOnly || w.__needsExtra;
      // 배포하지 않는 파일을 읽는 블록 → 전체 주석
      if (!skipAll && READ_FILE.test(b) && !INFLAM.test(b)) {
        skipAll = true;
        note = '   이 파일은 함께 배포하지 않아요 — 주석으로 넣었어요';
      } else if (skipAll) {
        note = w.__notPython
          ? '   파이썬 코드가 아니에요(명령 프롬프트) — 주석으로 넣었어요'
          : '   IDLE 에서 실행되지 않는 코드 — 주석으로 넣었어요';
      }

      lines.push('# ' + new Array(60).join('-'));
      lines.push('# [' + n + ']' + note);

      if (skipAll) {
        commented++;
        lines.push(b.split('\n').map(function (l) { return '# ' + l; }).join('\n'));
      } else {
        if (withData && READ_FILE.test(b) && INFLAM.test(b)) {
          // data 는 이미 위에서 만들어 두었으니 읽는 줄만 주석으로 바꾼다
          b = b.split('\n').map(function (l) {
            return READ_FILE.test(l)
              ? '# ' + l + '        # ← data 는 맨 위에서 이미 만들어 두었어요'
              : l;
          }).join('\n');
        }
        // 블록마다 try 로 감싼다. 일부러 에러를 보여 주는 예제가 섞여 있어서,
        // 감싸지 않으면 거기서 스크립트가 멈춰 뒤쪽을 볼 수 없다.
        // (try 는 새 이름공간을 만들지 않으므로 여기서 만든 변수는 뒤에서도 쓸 수 있다.)
        lines.push('try:');
        lines.push(autoPrint(b).split('\n').map(function (l) { return l.length ? '    ' + l : ''; }).join('\n'));
        lines.push('except Exception as _e:');
        lines.push('    print("  [' + n + '] " + type(_e).__name__ + ": " + str(_e))');
      }
      lines.push('');
    });
    return { text: lines.join('\n'), blocks: n, commented: commented, withData: withData };
  }

  function buildCodeBar(body, mod) {
    var wraps = body.querySelectorAll('.codewrap');
    if (wraps.length < 2) return null;
    var built = chapterScript(body, mod);
    if (!built.blocks) return null;

    var fname = 'numpy-lab-' + String(mod.n).padStart(2, '0') + '-' + mod.id + '.py';

    var copyBtn = UI.btn('전체 복사', function () {
      UI.copyText(built.text).then(function () {
        copyBtn.textContent = '복사됨';
        setTimeout(function () { copyBtn.textContent = '전체 복사'; }, 1400);
      }, function () {
        copyBtn.textContent = '복사 실패';
        setTimeout(function () { copyBtn.textContent = '전체 복사'; }, 2000);
      });
    }, { primary: true });

    var saveBtn = UI.btn('.py 파일로 저장', function () {
      try {
        var blob = new Blob(['﻿' + built.text], { type: 'text/x-python;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = el('a', { href: url, download: fname });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      } catch (e) {
        alert('파일로 저장할 수 없어요. "전체 복사" 를 눌러 IDLE 에 붙여넣어 주세요.');
      }
    });

    return el('div', { class: 'code-bar' }, [
      el('span', { class: 'cb-t', text: 'IDLE 에서 직접 해 보기' }),
      el('span', { class: 'cb-d', html:
        '이 장의 파이썬 코드 <b>' + built.blocks + '개</b>를 순서대로 모았어요. ' +
        '<code>' + UI.esc(fname) + '</code> 로 저장해 IDLE 로 열고 F5 를 누르면 돼요.' +
        (built.withData ? ' 실습 데이터도 함께 넣어 두었으니 CSV 파일이 없어도 돌아가요.' : '') +
        (built.commented ? ' (주피터 전용 ' + built.commented + '개는 주석으로 넣었어요.)' : '') }),
      copyBtn, saveBtn
    ]);
  }

  /* -------------------------------------------------------------- 라우터 */

  function currentId() {
    var h = location.hash.replace(/^#\/?/, '').split('?')[0];
    return h || '';
  }

  function route() {
    var id = currentId();
    var main = document.getElementById('main-inner');
    UI.clear(main);
    window.scrollTo(0, 0);

    Object.keys(navLinks).forEach(function (k) { navLinks[k].a.classList.remove('on'); });
    var homeLink = document.querySelector('.home-link');
    if (homeLink) homeLink.classList.toggle('on', !id);

    if (!id) {
      var oldToc = document.querySelector('.toc'); if (oldToc) oldToc.remove();
      renderHome(main); document.title = 'NumPy Lab'; closeSidebar(); return;
    }

    var mod = byId[id];
    if (!mod) {
      main.appendChild(el('h1', { class: 'h-chapter', text: '없는 페이지' }));
      main.appendChild(el('p', null, [el('a', { href: '#/', text: '처음 화면으로 돌아가기' })]));
      return;
    }
    if (navLinks[id]) navLinks[id].a.classList.add('on');
    document.title = (mod.extra ? mod.title : mod.n + '. ' + mod.title) + ' · NumPy Lab';

    main.appendChild(el('div', { class: 'crumb', text: mod.extra ? mod.n : mod.n + '장' }));
    main.appendChild(el('h1', { class: 'h-chapter', text: mod.title }));
    if (mod.blurb) main.appendChild(el('p', { class: 'lede', text: mod.blurb }));

    var body = el('div', { class: 'chapter-body' });
    main.appendChild(body);
    try {
      mod.render(body);
    } catch (e) {
      body.appendChild(UI.errBlock('이 장을 그리는 중 오류가 났어요: ' + (e && e.message), 'RenderError'));
      console.error(e);
    }

    // 이 장의 코드를 IDLE 로 가져가는 줄 (장에만 붙인다)
    if (!mod.extra) {
      try {
        var bar = buildCodeBar(body, mod);
        if (bar) main.appendChild(bar);
      } catch (e) { console.error(e); }
    }

    // 이전/다음
    var i = chapters.indexOf(mod);
    var navEl = el('div', { class: 'chapter-nav' });
    if (i >= 0) {
      if (i > 0) navEl.appendChild(el('a', { href: '#/' + chapters[i - 1].id }, [
        el('span', { class: 'k', text: '← 이전' }), chapters[i - 1].n + '. ' + chapters[i - 1].title
      ]));
      if (i < chapters.length - 1) navEl.appendChild(el('a', { class: 'next', href: '#/' + chapters[i + 1].id }, [
        el('span', { class: 'k', text: '다음 →' }), chapters[i + 1].n + '. ' + chapters[i + 1].title
      ]));
    } else {
      navEl.appendChild(el('a', { href: '#/' }, [
        el('span', { class: 'k', text: '← 돌아가기' }), '처음 화면'
      ]));
    }
    main.appendChild(navEl);

    buildToc(main);
    UI.progress.visit(id);
    closeSidebar();
  }

  function buildToc(main) {
    var old = document.querySelector('.toc'); if (old) old.remove();
    var heads = main.querySelectorAll('.h-sec');
    if (heads.length < 2) return;
    var tocTitle = (byId[currentId()] && byId[currentId()].extra) ? '이 과제의 차례' : '이 장의 내용';
    var toc = el('nav', { class: 'toc' }, [el('div', { class: 'nav-group', style: { padding: '0 0 .3rem' }, text: tocTitle })]);
    Array.prototype.forEach.call(heads, function (h, i) {
      if (!h.id) h.id = 'sec-' + i;
      toc.appendChild(el('a', { href: '#' + h.id, text: h.textContent,
        onclick: function (e) { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
    });
    document.body.appendChild(toc);
  }

  function closeSidebar() {
    var sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('open');
    var sc = document.getElementById('scrim');
    if (sc) sc.hidden = true;
  }

  /* ---------------------------------------------------------------- 시작 */

  function start() {
    el = UI.el;
    setTheme(getTheme());

    var scrim = el('div', { class: 'scrim', id: 'scrim', hidden: true, onclick: closeSidebar });
    var topbar = el('div', { class: 'topbar' }, [
      UI.btn('☰', function () {
        var sb = document.getElementById('sidebar');
        sb.classList.toggle('open');
        document.getElementById('scrim').hidden = !sb.classList.contains('open');
      }),
      el('span', { class: 'logo', text: 'NumPy Lab' })
    ]);

    var main = el('main', { class: 'main' }, [
      topbar,
      el('div', { class: 'main-inner', id: 'main-inner' })
    ]);

    document.body.appendChild(el('div', { class: 'shell' }, [buildSidebar(), main]));
    document.body.appendChild(scrim);

    window.addEventListener('hashchange', route);
    route();
  }

  global.Lab = {
    register: register, start: start, chapters: chapters, extras: extras, byId: byId,
    // 테스트용: 장을 렌더한 DOM 을 주면 IDLE 용 .py 스크립트를 만들어 준다
    chapterScript: chapterScript
  };
})(typeof window !== 'undefined' ? window : globalThis);
