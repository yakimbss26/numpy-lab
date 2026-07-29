/* ===========================================================================
 * ui.js — NumPy Lab 공용 위젯
 * 모든 화면 모듈은 이 API 만 써서 만든다. (직접 CSS 를 쓰지 말고 여기 클래스를 쓴다)
 * 전역: window.UI
 * =========================================================================== */
(function (global) {
  'use strict';

  var ND = global.ND;

  /* ------------------------------------------------------------- DOM 기본 */

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') { for (var s in v) e.style[s] = v[s]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    append(e, kids);
    return e;
  }

  function append(parent, kids) {
    if (kids === null || kids === undefined || kids === false) return parent;
    if (Array.isArray(kids)) { kids.forEach(function (k) { append(parent, k); }); return parent; }
    if (typeof kids === 'string' || typeof kids === 'number') {
      parent.appendChild(document.createTextNode(String(kids)));
      return parent;
    }
    parent.appendChild(kids);
    return parent;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ---------------------------------------------------- 파이썬 코드 하이라이트 */

  var PY_KW = ('False None True and as assert async await break class continue def del elif else ' +
    'except finally for from global if import in is lambda nonlocal not or pass raise return try ' +
    'while with yield print').split(' ');

  function highlightPy(src) {
    var out = '', i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      // 주석
      if (c === '#') {
        var j = src.indexOf('\n', i); if (j === -1) j = n;
        out += '<span class="tok-com">' + esc(src.slice(i, j)) + '</span>'; i = j; continue;
      }
      // 문자열
      if (c === '"' || c === "'") {
        var q = c, k = i + 1;
        while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
        out += '<span class="tok-str">' + esc(src.slice(i, Math.min(k + 1, n))) + '</span>'; i = k + 1; continue;
      }
      // 숫자
      if (/[0-9]/.test(c) && !/[A-Za-z_.]/.test(src[i - 1] || ' ')) {
        var m = /^[0-9][0-9_]*\.?[0-9]*(e[+-]?[0-9]+)?/i.exec(src.slice(i));
        out += '<span class="tok-num">' + esc(m[0]) + '</span>'; i += m[0].length; continue;
      }
      // 식별자
      if (/[A-Za-z_]/.test(c)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        var after = src.slice(i + w.length);
        var before = src[i - 1];
        if (PY_KW.indexOf(w) !== -1) out += '<span class="tok-kw">' + w + '</span>';
        else if (/^\s*\(/.test(after)) out += '<span class="tok-fn">' + w + '</span>';
        else if (before === '.') out += '<span class="tok-attr">' + w + '</span>';
        else out += esc(w);
        i += w.length; continue;
      }
      out += esc(c); i++;
    }
    return out;
  }

  /** 파이썬 코드 블록 */
  function code(src, opts) {
    opts = opts || {};
    return el('pre', {
      class: 'code' + (opts.class ? ' ' + opts.class : ''),
      html: highlightPy(String(src).replace(/\s+$/, ''))
    });
  }

  /** 출력 블록 (라벨 + 점선 테두리) */
  function out(text, opts) {
    opts = opts || {};
    var body = el('pre', { class: 'code out', text: String(text) });
    if (opts.label === false) return body;
    return el('div', null, [
      el('div', { class: 'out-label', text: opts.label || '출력' }),
      body
    ]);
  }

  /** 파이썬 예외처럼 보이는 에러 블록 */
  function errBlock(msg, kind) {
    var label = kind || (ND ? ND.errLabel(msg) : 'ValueError');
    return el('pre', {
      class: 'code err',
      html: '<span class="tok-kw">' + esc(label) + '</span>: ' + esc(msg)
    });
  }

  /* ----------------------------------------------------------- 배열 그리드 */

  var HL = { a: 'hl-a', b: 'hl-b', r: 'hl-r', x: 'hl-x', err: 'hl-err', dim: 'hl-dim', ghost: 'hl-ghost' };

  /**
   * ND 배열을 셀 격자로 그린다. 0~3차원 지원.
   * opts = {
   *   highlight(idx, val) -> 'a'|'b'|'r'|'x'|'err'|'dim'|'ghost'|null
   *   label(idx, val) -> string        (기본: 값)
   *   showIndex: bool                 (셀 좌상단에 인덱스 표시)
   *   axisLabels: bool                (행/열 번호 머리글)
   *   onHover(idx, val, ev)
   *   onClick(idx, val, ev)
   *   cellSize: px (기본 auto)
   *   title: string
   * }
   */
  function grid(a, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'grid-wrap' });
    if (a.ndim === 0) {
      var v = a.toNested();
      wrap.appendChild(el('div', { class: 'gridv' }, [
        el('div', { class: 'gridv-row' }, [cellFor(a, [], v, opts)])
      ]));
      return wrap;
    }
    if (a.ndim === 3) {
      var layers = el('div', { class: 'layers' });
      for (var L = 0; L < a.shape[0]; L++) {
        var sub = a.index([{ k: 'i', v: L }]);
        var subOpts = Object.create(opts);
        subOpts.highlight = opts.highlight ? wrapIdx(opts.highlight, L) : null;
        subOpts.label = opts.label ? wrapIdx(opts.label, L) : null;
        subOpts.onHover = opts.onHover ? wrapIdx3(opts.onHover, L) : null;
        subOpts.onClick = opts.onClick ? wrapIdx3(opts.onClick, L) : null;
        layers.appendChild(el('div', { class: 'layer' }, [
          el('div', { class: 'layer-t', text: (opts.layerLabel ? opts.layerLabel(L) : '[' + L + ']') }),
          grid2(sub, subOpts)
        ]));
      }
      wrap.appendChild(layers);
      return wrap;
    }
    wrap.appendChild(grid2(a, opts));
    return wrap;
  }

  function wrapIdx(fn, L) { return function (idx, val) { return fn([L].concat(idx), val); }; }
  function wrapIdx3(fn, L) { return function (idx, val, ev) { return fn([L].concat(idx), val, ev); }; }

  function grid2(a, opts) {
    var is1D = a.ndim === 1;
    var rows = is1D ? 1 : a.shape[0];
    var cols = is1D ? a.shape[0] : a.shape[1];
    var g = el('div', { class: 'gridv' });

    if (opts.axisLabels) {
      var head = el('div', { class: 'gridv-row' });
      if (!is1D) head.appendChild(el('div', { class: 'axis-lab' }));
      for (var c0 = 0; c0 < cols; c0++) head.appendChild(el('div', { class: 'axis-lab', text: c0 }));
      g.appendChild(head);
    }

    for (var r = 0; r < rows; r++) {
      var row = el('div', { class: 'gridv-row' });
      if (opts.axisLabels && !is1D) row.appendChild(el('div', { class: 'axis-lab', text: r }));
      else if (opts.axisLabels && is1D) row.appendChild(el('div', { class: 'axis-lab' }));
      for (var c = 0; c < cols; c++) {
        var idx = is1D ? [c] : [r, c];
        row.appendChild(cellFor(a, idx, a.get(idx), opts));
      }
      g.appendChild(row);
    }
    return g;
  }

  function cellFor(a, idx, val, opts) {
    var cls = 'cell';
    if (opts.highlight) { var h = opts.highlight(idx, val); if (h && HL[h]) cls += ' ' + HL[h]; }
    var txt = opts.label ? opts.label(idx, val) : fmtCell(val, a.dtype);
    var attrs = { class: cls, text: txt };
    if (opts.cellSize) attrs.style = { minWidth: opts.cellSize + 'px', height: opts.cellSize + 'px' };
    var e = el('div', attrs);
    if (opts.showIndex) e.appendChild(el('span', { class: 'cell-idx', text: idx.join(',') }));
    if (opts.onHover) {
      e.addEventListener('mouseenter', function (ev) { opts.onHover(idx, val, ev); });
      e.addEventListener('mouseleave', function (ev) { opts.onHover(null, null, ev); });
    }
    if (opts.onClick) { e.style.cursor = 'pointer'; e.addEventListener('click', function (ev) { opts.onClick(idx, val, ev); }); }
    return e;
  }

  function fmtCell(v, dtype) {
    if (typeof v === 'boolean') return v ? 'T' : 'F';
    if (dtype === 'bool') return v ? 'T' : 'F';
    if (v === null || v === undefined) return '';
    if (!isFinite(v)) return isNaN(v) ? 'nan' : (v > 0 ? 'inf' : '-inf');
    if (Number.isInteger(v)) return String(v);
    return (Math.abs(v) < 1000 ? v.toFixed(2) : v.toExponential(1));
  }

  /** shape 배지 */
  function shapeBadge(a, extra) {
    var sh = Array.isArray(a) ? a : a.shape;
    var kids = [el('span', { class: 'muted', text: 'shape' }), el('b', { text: ND.shapeStr(sh) })];
    if (!Array.isArray(a)) {
      kids.push(el('span', { class: 'muted', text: '· ndim ' }));
      kids.push(el('b', { text: a.ndim }));
      kids.push(el('span', { class: 'muted', text: '· size ' }));
      kids.push(el('b', { text: a.size }));
      if (extra !== false) {
        kids.push(el('span', { class: 'muted', text: '· ' }));
        kids.push(el('b', { text: a.dtype }));
      }
    }
    return el('span', { class: 'shape-badge' }, kids);
  }

  function legend(items) {
    return el('div', { class: 'legend' }, items.map(function (it) {
      return el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: it.color } }),
        it.label
      ]);
    }));
  }

  /* -------------------------------------------------------- 카드 / 콜아웃 */

  function card(o) {
    var head = el('div', { class: 'card-head' }, [
      o.kicker ? el('span', { class: 'card-kicker', text: o.kicker }) : null,
      el('span', { class: 'card-title', text: o.title || '' })
    ]);
    var c = el('div', { class: 'card' + (o.class ? ' ' + o.class : '') }, [head]);
    if (o.note) c.appendChild(el('div', { class: 'card-note', html: o.note }));
    append(c, o.body);
    return c;
  }

  var CALLOUT_T = { why: '왜 그런가', trap: '흔한 실수', tip: '알아두기', ver: 'NumPy 버전 주의' };

  function callout(kind, html, title) {
    return el('div', { class: 'callout ' + kind }, [
      el('span', { class: 'callout-t', text: title || CALLOUT_T[kind] || '' }),
      el('span', { html: html })
    ]);
  }

  function fold(summary, body) {
    return el('details', { class: 'fold' }, [el('summary', { text: summary }), body]);
  }

  function ascii(text) { return el('pre', { class: 'ascii', text: text }); }

  function steps(items) {
    return el('ol', { class: 'steps' }, items.map(function (s) {
      if (typeof s === 'string') return el('li', { html: s });
      return el('li', { class: s.state || '', html: s.html });
    }));
  }

  function statRow(stats) {
    return el('div', { class: 'stat-row' }, stats.map(function (s) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: s.k }),
        el('div', { class: 'v', text: s.v }),
        s.sub ? el('div', { class: 'sub', text: s.sub }) : null
      ]);
    }));
  }

  /** 표. cols: [{k, label, num?}] */
  function table(cols, rows, opts) {
    opts = opts || {};
    var thead = el('thead', null, [el('tr', null, cols.map(function (c) {
      return el('th', { class: c.num ? 'num' : '', text: c.label });
    }))]);
    var tbody = el('tbody', null, rows.map(function (r) {
      return el('tr', null, cols.map(function (c) {
        var v = r[c.k];
        var td = el('td', { class: c.num ? 'num' : '' });
        if (v && v.nodeType) td.appendChild(v);
        else td.innerHTML = (c.raw ? String(v == null ? '' : v) : esc(v == null ? '' : v));
        return td;
      }));
    }));
    return el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [thead, tbody])]);
  }

  /* ------------------------------------------------------------- 컨트롤 */

  function controls(items) { return el('div', { class: 'controls' }, items); }

  function slider(o) {
    var valLab = el('span', { class: 'val', text: o.format ? o.format(o.value) : o.value });
    var input = el('input', {
      type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value,
      oninput: function () {
        var v = parseFloat(input.value);
        valLab.textContent = o.format ? o.format(v) : v;
        o.onChange(v);
      }
    });
    var wrap = el('div', { class: 'ctl' }, [
      el('label', null, [o.label, ' ', valLab]), input
    ]);
    wrap.setValue = function (v) { input.value = v; valLab.textContent = o.format ? o.format(v) : v; };
    return wrap;
  }

  function select(o) {
    var sel = el('select', {
      onchange: function () { o.onChange(sel.value); }
    }, o.options.map(function (op) {
      var val = (typeof op === 'string') ? op : op.value;
      var lab = (typeof op === 'string') ? op : op.label;
      return el('option', { value: val, selected: String(val) === String(o.value) ? true : null, text: lab });
    }));
    var w = el('div', { class: 'ctl' }, [el('label', { text: o.label }), sel]);
    w.setValue = function (v) { sel.value = v; };
    w.getValue = function () { return sel.value; };
    return w;
  }

  function textInput(o) {
    var inp = el('input', {
      type: 'text', value: o.value || '', placeholder: o.placeholder || '',
      class: o.wide ? 'wide' : '',
      oninput: function () { o.onChange(inp.value); },
      onkeydown: function (e) { if (e.key === 'Enter' && o.onEnter) o.onEnter(inp.value); }
    });
    var w = el('div', { class: 'ctl' }, [o.label ? el('label', { text: o.label }) : null, inp]);
    w.setValue = function (v) { inp.value = v; if (o.onChange) o.onChange(v); };
    w.focus = function () { inp.focus(); };
    return w;
  }

  /** 세그먼트 버튼(탭). options: [{value,label}] 또는 문자열 배열 */
  function seg(o) {
    var cur = o.value;
    var btns = o.options.map(function (op) {
      var val = (typeof op === 'string') ? op : op.value;
      var lab = (typeof op === 'string') ? op : op.label;
      return el('button', {
        type: 'button', 'aria-pressed': String(val) === String(cur) ? 'true' : 'false',
        text: lab, title: (op && op.title) || null,
        onclick: function () { set(val); o.onChange(val); }
      });
    });
    var box = el('div', { class: 'seg', role: 'group' }, btns);
    function set(val) {
      cur = val;
      btns.forEach(function (b, i) {
        var v = (typeof o.options[i] === 'string') ? o.options[i] : o.options[i].value;
        b.setAttribute('aria-pressed', String(v) === String(val) ? 'true' : 'false');
      });
    }
    var w = el('div', { class: 'ctl' }, [o.label ? el('label', { text: o.label }) : null, box]);
    w.setValue = set;
    return w;
  }

  function chips(items, onPick) {
    return el('div', { class: 'chips' }, items.map(function (t) {
      var val = (typeof t === 'string') ? t : t.value;
      var lab = (typeof t === 'string') ? t : t.label;
      return el('button', { class: 'chip', type: 'button', text: lab, onclick: function () { onPick(val); } });
    }));
  }

  function btn(label, onClick, o) {
    o = o || {};
    return el('button', {
      class: 'btn' + (o.primary ? ' primary' : ''), type: 'button', text: label, onclick: onClick
    });
  }

  /* --------------------------------------------------------------- 퀴즈 */

  /**
   * quiz([{ q, choices:[...], answer: idx, explain }], {id})
   * localStorage 에 정답 여부를 저장한다.
   */
  function quiz(items, o) {
    o = o || {};
    var box = el('div', { class: 'quiz' });
    items.forEach(function (it, qi) {
      var explain = el('div', { class: 'q-explain', hidden: true, html: it.explain || '' });
      var choiceEls = it.choices.map(function (ch, ci) {
        return el('button', {
          class: 'q-choice', type: 'button',
          onclick: function () {
            choiceEls.forEach(function (e, i) {
              e.setAttribute('data-state', i === it.answer ? 'right' : (i === ci ? 'wrong' : ''));
            });
            explain.hidden = false;
            if (o.id) progress.mark(o.id + ':q' + qi, ci === it.answer);
          }
        }, [
          el('span', { class: 'mk', text: 'ABCDE'[ci] }),
          el('span', { html: ch })
        ]);
      });
      box.appendChild(el('div', { class: 'q' }, [
        el('div', { class: 'q-stem', html: it.q }),
        el('div', { class: 'q-choices' }, choiceEls),
        explain
      ]));
    });
    return box;
  }

  /* ----------------------------------------------------- 메모리 시각화 */

  /**
   * 버퍼(메모리)를 칸으로 그린다. 뷰 vs 사본 실험실의 핵심 위젯.
   * marks: {index -> 'a'|'b'|'ab'}
   */
  function memBar(buf, marks, opts) {
    opts = opts || {};
    var bar = el('div', { class: 'membar' });
    for (var i = 0; i < buf.length; i++) {
      var m = marks ? marks[i] : null;
      bar.appendChild(el('div', {
        class: 'memcell' + (m ? ' used-' + m : ''),
        text: fmtCell(buf[i], opts.dtype || 'int64'),
        title: 'buf[' + i + ']'
      }));
    }
    return bar;
  }

  /** 배열 두 개가 공유하는 메모리를 표시 */
  function memShare(a, b, labels) {
    var root = a.root();
    var marks = {};
    a.flatBufIndices().forEach(function (i) { marks[i] = 'a'; });
    b.flatBufIndices().forEach(function (i) { marks[i] = marks[i] === 'a' ? 'ab' : 'b'; });
    var shared = ND.sharesMemory(a, b);
    return el('div', null, [
      memBar(root.buf, marks, { dtype: a.dtype }),
      legend([
        { color: 'var(--s1)', label: (labels && labels[0]) || 'a 가 보는 칸' },
        { color: 'var(--s2)', label: (labels && labels[1]) || 'b 가 보는 칸' },
        { color: 'var(--s7)', label: '둘 다 보는 칸 (공유)' }
      ]),
      el('p', { class: 'small', style: { marginTop: '.6rem', color: shared ? 'var(--s7)' : 'var(--ink-muted)' },
        html: shared
          ? '<b>np.shares_memory(a, b) → True</b> — 같은 메모리다. 한쪽을 고치면 다른 쪽도 바뀐다.'
          : '<b>np.shares_memory(a, b) → False</b> — 서로 다른 메모리다. 독립적이다.' })
    ]);
  }

  /* ----------------------------------------------------------- 툴팁 */

  function tipLayer(host) {
    var t = el('div', { class: 'tooltip' });
    host.style.position = host.style.position || 'relative';
    host.appendChild(t);
    return {
      show: function (html, x, y) {
        t.innerHTML = html; t.classList.add('on');
        var w = t.offsetWidth, h = t.offsetHeight, hw = host.clientWidth;
        var left = Math.min(Math.max(x - w / 2, 2), Math.max(hw - w - 2, 2));
        t.style.left = left + 'px';
        t.style.top = Math.max(y - h - 10, 2) + 'px';
      },
      hide: function () { t.classList.remove('on'); }
    };
  }

  /* ----------------------------------------------------------- 선 그래프 */

  var SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

  /**
   * lineChart({series:[{name, values:[...], color?}], x:[...], xLabel, yLabel,
   *            height, yMin, yMax, markMax:bool, tableView:bool, fmtY})
   * 크로스헤어 + 툴팁 기본 제공. 2개 이상 계열이면 범례를 항상 넣는다.
   */
  function lineChart(o) {
    var W = 720, H = o.height || 240;
    var padL = 46, padR = 18, padT = 14, padB = 34;
    var series = o.series, xs = o.x || series[0].values.map(function (_, i) { return i; });
    var all = series.reduce(function (a, s) { return a.concat(s.values.filter(isFinite)); }, []);
    var yMin = o.yMin !== undefined ? o.yMin : Math.min.apply(null, all.concat([0]));
    var yMax = o.yMax !== undefined ? o.yMax : Math.max.apply(null, all);
    if (yMax === yMin) yMax = yMin + 1;
    var xMin = xs[0], xMax = xs[xs.length - 1];

    function X(v) { return padL + (v - xMin) / (xMax - xMin || 1) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - yMin) / (yMax - yMin) * (H - padT - padB); }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img' });

    // y 격자 + 눈금 (실선 헤어라인)
    var nT = 4;
    for (var t = 0; t <= nT; t++) {
      var yv = yMin + (yMax - yMin) * t / nT, y = Y(yv);
      svg.appendChild(svgEl('line', { class: 'gridline', x1: padL, y1: y, x2: W - padR, y2: y }));
      svg.appendChild(svgEl('text', { class: 'tick', x: padL - 7, y: y + 3.5, 'text-anchor': 'end',
        text: (o.fmtY ? o.fmtY(yv) : round2(yv)) }));
    }
    // x 눈금
    var nX = Math.min(8, xs.length);
    for (var k = 0; k < nX; k++) {
      var xi = Math.round(k * (xs.length - 1) / (nX - 1 || 1));
      svg.appendChild(svgEl('text', { class: 'tick', x: X(xs[xi]), y: H - padB + 15, 'text-anchor': 'middle',
        text: xs[xi] }));
    }
    svg.appendChild(svgEl('line', { class: 'axisline', x1: padL, y1: H - padB, x2: W - padR, y2: H - padB }));

    if (o.yLabel) svg.appendChild(svgEl('text', { class: 'axis-title', x: 2, y: 11, text: o.yLabel }));
    if (o.xLabel) svg.appendChild(svgEl('text', { class: 'axis-title', x: W - padR, y: H - 2,
      'text-anchor': 'end', text: o.xLabel }));

    // 선
    series.forEach(function (s, si) {
      var d = '';
      s.values.forEach(function (v, i) {
        if (!isFinite(v)) return;
        d += (d ? ' L' : 'M') + X(xs[i]).toFixed(1) + ',' + Y(v).toFixed(1);
      });
      svg.appendChild(svgEl('path', { class: 'series-line', d: d, stroke: s.color || SERIES_COLORS[si % 4] }));
    });

    // 최댓값 직접 라벨(선택적 — 모든 점에 숫자를 쓰지 않는다)
    if (o.markMax) {
      series.forEach(function (s, si) {
        var mi = 0; s.values.forEach(function (v, i) { if (v > s.values[mi]) mi = i; });
        svg.appendChild(svgEl('circle', { class: 'dot', cx: X(xs[mi]), cy: Y(s.values[mi]), r: 4.5,
          fill: s.color || SERIES_COLORS[si % 4] }));
        svg.appendChild(svgEl('text', {
          class: 'tick', x: X(xs[mi]), y: Y(s.values[mi]) - 9, 'text-anchor': 'middle',
          text: '최대 ' + round2(s.values[mi])
        }));
      });
    }

    // 크로스헤어 + 툴팁
    var cross = svgEl('line', { class: 'crosshair', x1: 0, y1: padT, x2: 0, y2: H - padB, opacity: 0 });
    svg.appendChild(cross);
    var dots = series.map(function (s, si) {
      var c = svgEl('circle', { class: 'dot', r: 4, fill: s.color || SERIES_COLORS[si % 4], opacity: 0 });
      svg.appendChild(c); return c;
    });
    var hit = svgEl('rect', { class: 'hit', x: padL, y: padT, width: W - padL - padR, height: H - padT - padB });
    svg.appendChild(hit);

    var host = el('div', { class: 'chart' }, [svg]);
    var tip = tipLayer(host);
    hit.addEventListener('mousemove', function (ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width * W;
      var frac = (px - padL) / (W - padL - padR);
      var i = Math.round(frac * (xs.length - 1));
      i = Math.max(0, Math.min(xs.length - 1, i));
      cross.setAttribute('x1', X(xs[i])); cross.setAttribute('x2', X(xs[i]));
      cross.setAttribute('opacity', 1);
      var rows = '<b>' + (o.xLabel || 'x') + ' ' + xs[i] + '</b>';
      series.forEach(function (s, si) {
        dots[si].setAttribute('cx', X(xs[i])); dots[si].setAttribute('cy', Y(s.values[i]));
        dots[si].setAttribute('opacity', 1);
        rows += '<br><span class="tt-k">' + esc(s.name) + '</span> ' +
          (o.fmtY ? o.fmtY(s.values[i]) : round2(s.values[i]));
      });
      tip.show(rows, (ev.clientX - r.left) / r.width * host.clientWidth, (ev.clientY - r.top) / r.height * host.clientHeight);
    });
    hit.addEventListener('mouseleave', function () {
      cross.setAttribute('opacity', 0);
      dots.forEach(function (d) { d.setAttribute('opacity', 0); });
      tip.hide();
    });

    var parts = [host];
    if (series.length >= 2) {
      parts.push(legend(series.map(function (s, si) {
        return { color: s.color || SERIES_COLORS[si % 4], label: s.name };
      })));
    }
    // 표 보기 twin (툴팁이 값을 읽는 유일한 경로가 되지 않게)
    if (o.tableView !== false) {
      var cols = [{ k: 'x', label: o.xLabel || 'x', num: true }].concat(series.map(function (s, i) {
        return { k: 's' + i, label: s.name, num: true };
      }));
      var rows2 = xs.map(function (xv, i) {
        var r = { x: xv };
        series.forEach(function (s, si) { r['s' + si] = o.fmtY ? o.fmtY(s.values[i]) : round2(s.values[i]); });
        return r;
      });
      parts.push(fold('표로 보기 (' + xs.length + '행)', table(cols, rows2)));
    }
    return el('div', null, parts);
  }

  function round2(v) {
    if (!isFinite(v)) return String(v);
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
  }

  /* -------------------------------------------------------------- 히트맵 */

  var SEQ = ['--seq-100', '--seq-150', '--seq-200', '--seq-250', '--seq-300', '--seq-350',
    '--seq-400', '--seq-450', '--seq-500', '--seq-550', '--seq-600', '--seq-650', '--seq-700'];

  function seqColor(t) {
    var i = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))));
    return 'var(' + SEQ[i] + ')';
  }

  /**
   * heatmap(nd2d, {vmin,vmax, rowLabel, colLabel, unit, highlight(idx), tableView})
   * 순차 램프(파랑 단일 색조) + 스케일 범례 + 표 보기. 셀 호버 툴팁.
   */
  function heatmap(a, o) {
    o = o || {};
    var rows = a.shape[0], cols = a.shape[1];
    var vals = a.flatValues().filter(isFinite);
    var vmin = o.vmin !== undefined ? o.vmin : Math.min.apply(null, vals);
    var vmax = o.vmax !== undefined ? o.vmax : Math.max.apply(null, vals);
    var g = el('div', { class: 'heat', style: { gridTemplateColumns: 'repeat(' + cols + ', 1fr)' } });
    var host = el('div', { class: 'chart' }, [g]);
    var tip = tipLayer(host);

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var v = a.get([r, c]);
        var t = (v - vmin) / (vmax - vmin || 1);
        var cell = el('div', {
          class: 'heat-c', style: { background: seqColor(t) },
          'data-r': r, 'data-c': c
        });
        if (o.highlight && o.highlight([r, c], v)) {
          cell.style.outline = '2px solid var(--s2)';
          cell.style.outlineOffset = '-1px';
          cell.style.zIndex = '2';
          cell.style.position = 'relative';
        }
        g.appendChild(cell);
      }
    }
    g.addEventListener('mousemove', function (ev) {
      var t = ev.target;
      if (!t.classList.contains('heat-c')) { tip.hide(); return; }
      var r0 = +t.getAttribute('data-r'), c0 = +t.getAttribute('data-c');
      var hb = host.getBoundingClientRect(), tb = t.getBoundingClientRect();
      tip.show('<span class="tt-k">' + (o.rowLabel || '행') + '</span> ' + r0 +
        ' <span class="tt-k">' + (o.colLabel || '열') + '</span> ' + c0 +
        '<br><b>' + round2(a.get([r0, c0])) + (o.unit ? ' ' + o.unit : '') + '</b>',
        tb.left - hb.left + tb.width / 2, tb.top - hb.top);
    });
    g.addEventListener('mouseleave', function () { tip.hide(); });

    var ramp = el('span', { class: 'ramp' }, SEQ.map(function (s) {
      return el('i', { style: { background: 'var(' + s + ')' } });
    }));
    var bar = el('div', { class: 'scalebar' }, [
      el('span', { text: round2(vmin) }), ramp, el('span', { text: round2(vmax) }),
      o.unit ? el('span', { class: 'muted', text: o.unit }) : null
    ]);

    var parts = [host, bar];
    if (o.tableView !== false && rows * cols <= 4000) {
      var cols2 = [{ k: 'r', label: o.rowLabel || '행', num: true }];
      for (var cc = 0; cc < cols; cc++) cols2.push({ k: 'c' + cc, label: String(cc), num: true });
      var trows = [];
      for (var rr = 0; rr < rows; rr++) {
        var row = { r: rr };
        for (var c2 = 0; c2 < cols; c2++) row['c' + c2] = round2(a.get([rr, c2]));
        trows.push(row);
      }
      parts.push(fold('표로 보기 (' + rows + '×' + cols + ')', table(cols2, trows)));
    }
    return el('div', null, parts);
  }

  /* ------------------------------------------------------- 벡터 평면 (2D) */

  /**
   * vectorPlot({vectors:[{x,y,name,color,dashed}], range, extras:[...], height,
   *             onDrag(i,x,y), draggable:[0,1]})
   * 격자 좌표평면에 벡터를 화살표로 그린다. 드래그 가능.
   */
  function vectorPlot(o) {
    var R = o.range || 6, H = o.height || 340, W = H;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      style: 'max-width:' + H + 'px;touch-action:none;' });
    function px(x) { return W / 2 + x / R * (W / 2 - 18); }
    function py(y) { return H / 2 - y / R * (H / 2 - 18); }
    function ux(sx) { return (sx - W / 2) / (W / 2 - 18) * R; }
    function uy(sy) { return -(sy - H / 2) / (H / 2 - 18) * R; }

    for (var g = -R; g <= R; g++) {
      if (g === 0) continue;
      svg.appendChild(svgEl('line', { class: 'gridline', x1: px(g), y1: 0, x2: px(g), y2: H }));
      svg.appendChild(svgEl('line', { class: 'gridline', x1: 0, y1: py(g), x2: W, y2: py(g) }));
    }
    svg.appendChild(svgEl('line', { class: 'axisline', x1: 0, y1: py(0), x2: W, y2: py(0) }));
    svg.appendChild(svgEl('line', { class: 'axisline', x1: px(0), y1: 0, x2: px(0), y2: H }));
    svg.appendChild(svgEl('text', { class: 'tick', x: W - 10, y: py(0) - 5, 'text-anchor': 'end', text: 'x' }));
    svg.appendChild(svgEl('text', { class: 'tick', x: px(0) + 5, y: 12, text: 'y' }));

    var defs = svgEl('defs');
    svg.appendChild(defs);
    var layer = svgEl('g'); svg.appendChild(layer);

    var host = el('div', { class: 'chart' }, [svg]);

    function draw() {
      clear(layer);
      (o.extras || []).forEach(function (e) {
        if (e.type === 'line') {
          layer.appendChild(svgEl('line', { x1: px(e.x1), y1: py(e.y1), x2: px(e.x2), y2: py(e.y2),
            stroke: e.color || 'var(--axis)', 'stroke-width': 1.5,
            'stroke-dasharray': e.dashed ? '4 4' : null }));
        }
      });
      o.vectors.forEach(function (v, i) {
        var col = v.color || SERIES_COLORS[i % 4];
        var mid = 'ar' + i + '-' + Math.random().toString(36).slice(2, 7);
        var mk = svgEl('marker', { id: mid, viewBox: '0 0 10 10', refX: 8, refY: 5,
          markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
        mk.appendChild(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: col }));
        defs.appendChild(mk);
        layer.appendChild(svgEl('line', {
          x1: px(0), y1: py(0), x2: px(v.x), y2: py(v.y),
          stroke: col, 'stroke-width': v.dashed ? 1.6 : 2.4,
          'stroke-dasharray': v.dashed ? '5 4' : null,
          'marker-end': 'url(#' + mid + ')'
        }));
        layer.appendChild(svgEl('text', {
          class: 'tick', x: px(v.x) + (v.x >= 0 ? 8 : -8), y: py(v.y) + (v.y >= 0 ? -8 : 14),
          'text-anchor': v.x >= 0 ? 'start' : 'end',
          fill: col, 'font-weight': 700, 'font-size': 12,
          text: v.name + ' (' + round2(v.x) + ', ' + round2(v.y) + ')'
        }));
        if (o.draggable && o.draggable.indexOf(i) !== -1) {
          var h = svgEl('circle', { cx: px(v.x), cy: py(v.y), r: 13, fill: col, opacity: .001,
            style: 'cursor:grab' });
          h.addEventListener('pointerdown', function (ev) {
            ev.preventDefault(); h.setPointerCapture(ev.pointerId);
            function move(e2) {
              var r = svg.getBoundingClientRect();
              var sx = (e2.clientX - r.left) / r.width * W, sy = (e2.clientY - r.top) / r.height * H;
              o.onDrag(i, Math.round(ux(sx) * 2) / 2, Math.round(uy(sy) * 2) / 2);
            }
            h.addEventListener('pointermove', move);
            h.addEventListener('pointerup', function () { h.removeEventListener('pointermove', move); }, { once: true });
          });
          layer.appendChild(h);
        }
      });
    }
    draw();
    host.redraw = draw;
    return host;
  }

  /* --------------------------------------------------------- 진도 저장 */

  var KEY = 'numpy-lab-progress-v1';
  var progress = {
    load: function () {
      try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
    },
    save: function (d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { } },
    mark: function (k, ok) { var d = this.load(); d[k] = !!ok; this.save(d); emit(); },
    visit: function (id) { var d = this.load(); d['visit:' + id] = true; this.save(d); emit(); },
    stats: function (id) {
      var d = this.load(), tot = 0, ok = 0;
      for (var k in d) if (k.indexOf(id + ':q') === 0) { tot++; if (d[k]) ok++; }
      return { total: tot, correct: ok, visited: !!d['visit:' + id] };
    },
    reset: function () { this.save({}); emit(); }
  };
  var listeners = [];
  function emit() { listeners.forEach(function (f) { f(); }); }
  progress.onChange = function (f) { listeners.push(f); };

  /* --------------------------------------------------------------- export */

  global.UI = {
    el: el, append: append, svgEl: svgEl, esc: esc, clear: clear,
    code: code, out: out, errBlock: errBlock, highlightPy: highlightPy,
    grid: grid, shapeBadge: shapeBadge, legend: legend, fmtCell: fmtCell,
    card: card, callout: callout, fold: fold, ascii: ascii, steps: steps,
    statRow: statRow, table: table,
    controls: controls, slider: slider, select: select, textInput: textInput,
    seg: seg, chips: chips, btn: btn,
    quiz: quiz, memBar: memBar, memShare: memShare, tipLayer: tipLayer,
    lineChart: lineChart, heatmap: heatmap, vectorPlot: vectorPlot,
    seqColor: seqColor, round2: round2, SERIES_COLORS: SERIES_COLORS,
    progress: progress
  };
})(typeof window !== 'undefined' ? window : globalThis);
