/* ===========================================================================
 * app.js — NumPy Lab 셸: 챕터 등록소, 해시 라우터, 사이드바, 진도, 테마
 * 화면 모듈은 Lab.register({...}) 로 자기를 등록한다.
 * 전역: window.Lab
 * =========================================================================== */
(function (global) {
  'use strict';

  var UI = global.UI, el = null;

  var chapters = [];      // 등록 순서 유지
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
    chapters.push(mod); byId[mod.id] = mod;
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
          if (confirm('풀었던 문제 기록을 모두 지운다. 계속하겠는가?')) UI.progress.reset();
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
        'NumPy 를 <b>읽어서 외우는 대신 직접 움직여 보며</b> 배우는 실습장이다. ' +
        '축(axis)이 어떻게 사라지는지, 브로드캐스팅이 배열을 어떻게 늘리는지, ' +
        '슬라이싱한 배열이 왜 원본을 바꿔 버리는지 — 모두 화면에서 직접 확인할 수 있다.' }),
      el('p', { class: 'sub small', html:
        '이 페이지 안에는 브라우저에서 도는 <b>미니 NumPy 엔진</b>이 들어 있다. ' +
        '보이는 숫자는 미리 적어 둔 값이 아니라 <b>그 자리에서 계산한 결과</b>다. ' +
        '설치도, 인터넷도 필요 없다.' })
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

    root.appendChild(UI.callout('tip',
      '왼쪽 목록의 점은 진도 표시다. 회색은 방문한 장, 초록은 확인 문제를 모두 맞힌 장이다. ' +
      '기록은 이 브라우저에만 저장되므로 다른 사람과 섞이지 않는다.', '사용법'));

    root.appendChild(el('h2', { class: 'h-sec', text: '이 실습장에 든 시뮬레이터' }));
    var simRows = chapters.filter(function (c) { return c.sim; }).map(function (c) {
      return { ch: c.n + '장', t: c.title, s: c.sim };
    });
    root.appendChild(UI.table(
      [{ k: 'ch', label: '장' }, { k: 't', label: '주제' }, { k: 's', label: '시뮬레이터 · 시각화' }],
      simRows
    ));
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

    if (!id) { renderHome(main); document.title = 'NumPy Lab'; closeSidebar(); return; }

    var mod = byId[id];
    if (!mod) {
      main.appendChild(el('h1', { class: 'h-chapter', text: '없는 페이지' }));
      main.appendChild(el('p', null, [el('a', { href: '#/', text: '처음 화면으로 돌아가기' })]));
      return;
    }
    if (navLinks[id]) navLinks[id].a.classList.add('on');
    document.title = mod.n + '. ' + mod.title + ' · NumPy Lab';

    main.appendChild(el('div', { class: 'crumb', text: mod.n + '장' }));
    main.appendChild(el('h1', { class: 'h-chapter', text: mod.title }));
    if (mod.blurb) main.appendChild(el('p', { class: 'lede', text: mod.blurb }));

    var body = el('div', { class: 'chapter-body' });
    main.appendChild(body);
    try {
      mod.render(body);
    } catch (e) {
      body.appendChild(UI.errBlock('이 장을 그리는 중 오류가 났다: ' + (e && e.message), 'RenderError'));
      console.error(e);
    }

    // 이전/다음
    var i = chapters.indexOf(mod);
    var navEl = el('div', { class: 'chapter-nav' });
    if (i > 0) navEl.appendChild(el('a', { href: '#/' + chapters[i - 1].id }, [
      el('span', { class: 'k', text: '← 이전' }), chapters[i - 1].n + '. ' + chapters[i - 1].title
    ]));
    if (i < chapters.length - 1) navEl.appendChild(el('a', { class: 'next', href: '#/' + chapters[i + 1].id }, [
      el('span', { class: 'k', text: '다음 →' }), chapters[i + 1].n + '. ' + chapters[i + 1].title
    ]));
    main.appendChild(navEl);

    buildToc(main);
    UI.progress.visit(id);
    closeSidebar();
  }

  function buildToc(main) {
    var old = document.querySelector('.toc'); if (old) old.remove();
    var heads = main.querySelectorAll('.h-sec');
    if (heads.length < 2) return;
    var toc = el('nav', { class: 'toc' }, [el('div', { class: 'nav-group', style: { padding: '0 0 .3rem' }, text: '이 장의 내용' })]);
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

  global.Lab = { register: register, start: start, chapters: chapters, byId: byId };
})(typeof window !== 'undefined' ? window : globalThis);
