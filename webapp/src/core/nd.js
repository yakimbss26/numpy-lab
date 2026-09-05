/* ===========================================================================
 * nd.js — 브라우저에서 도는 미니 NumPy 엔진
 * ---------------------------------------------------------------------------
 * 이 파일은 NumPy Lab의 모든 시뮬레이터가 올라서는 토대다.
 * 핵심 설계: NumPy와 똑같이 (buffer, shape, strides, offset) 4종 세트로
 * 배열을 모델링한다. 그래서 "뷰(view)는 같은 메모리를 다른 눈으로 보는 것",
 * "브로드캐스팅은 stride 0으로 늘리는 것"을 실제로 보여줄 수 있다.
 *
 * 전역: window.ND
 * 의존성 없음. 순수 스크립트(모듈 아님) — 빌드 시 그대로 인라인된다.
 * =========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- dtype */

  var DTYPES = {
    int8:    { name: 'int8',    itemsize: 1, kind: 'i', min: -128, max: 127 },
    int16:   { name: 'int16',   itemsize: 2, kind: 'i', min: -32768, max: 32767 },
    int32:   { name: 'int32',   itemsize: 4, kind: 'i', min: -2147483648, max: 2147483647 },
    int64:   { name: 'int64',   itemsize: 8, kind: 'i', min: -9223372036854775808, max: 9223372036854775807 },
    uint8:   { name: 'uint8',   itemsize: 1, kind: 'u', min: 0, max: 255 },
    float32: { name: 'float32', itemsize: 4, kind: 'f' },
    float64: { name: 'float64', itemsize: 8, kind: 'f' },
    bool:    { name: 'bool',    itemsize: 1, kind: 'b' }
  };

  function dtypeInfo(dt) { return DTYPES[dt] || DTYPES.float64; }
  function isIntDtype(dt) { var k = dtypeInfo(dt).kind; return k === 'i' || k === 'u'; }
  function isFloatDtype(dt) { return dtypeInfo(dt).kind === 'f'; }

  /** 두 dtype을 연산할 때의 결과 dtype (NumPy 승격 규칙의 단순화 버전) */
  function promote(a, b) {
    if (a === b) return a;
    if (isFloatDtype(a) || isFloatDtype(b)) {
      if (a === 'float64' || b === 'float64') return 'float64';
      return 'float32';
    }
    if (a === 'bool') return b;
    if (b === 'bool') return a;
    // 정수끼리: 더 큰 쪽
    return dtypeInfo(a).itemsize >= dtypeInfo(b).itemsize ? a : b;
  }

  /** int dtype으로 값을 저장할 때의 랩어라운드(오버플로) 재현 */
  function castValue(v, dt) {
    var info = dtypeInfo(dt);
    if (info.kind === 'b') return v ? true : false;
    if (info.kind === 'f') return v;
    if (v === null || v === undefined) return 0;
    if (!isFinite(v)) return 0;
    var t = Math.trunc(v);
    if (dt === 'int64') return t; // JS 정밀도 한계 — 랩어라운드 재현 안 함
    var bits = info.itemsize * 8;
    var span = Math.pow(2, bits);
    var m = ((t % span) + span) % span;          // [0, span)
    if (info.kind === 'u') return m;
    return m >= span / 2 ? m - span : m;          // 부호 있는 정수로 접기
  }

  /* --------------------------------------------------------------- strides */

  function cStrides(shape) {
    var n = shape.length, s = new Array(n), acc = 1;
    for (var i = n - 1; i >= 0; i--) { s[i] = acc; acc *= shape[i]; }
    return s;
  }

  function fStrides(shape) {
    var n = shape.length, s = new Array(n), acc = 1;
    for (var i = 0; i < n; i++) { s[i] = acc; acc *= shape[i]; }
    return s;
  }

  function prod(a) { var p = 1; for (var i = 0; i < a.length; i++) p *= a[i]; return p; }

  /* -------------------------------------------------------------------- ND */

  /**
   * @param {Array} buf     공유 메모리(평평한 JS 배열)
   * @param {number[]} shape
   * @param {number[]} strides  원소 단위 보폭
   * @param {number} offset     buf 안에서의 시작 위치
   * @param {string} dtype
   * @param {ND|null} base      이 배열이 뷰라면 원본
   */
  function ND(buf, shape, strides, offset, dtype, base) {
    this.buf = buf;
    this.shape = shape.slice();
    this.strides = strides ? strides.slice() : cStrides(shape);
    this.offset = offset | 0;
    this.dtype = dtype || 'float64';
    this.base = base || null;
  }

  Object.defineProperties(ND.prototype, {
    ndim:     { get: function () { return this.shape.length; } },
    size:     { get: function () { return prod(this.shape); } },
    itemsize: { get: function () { return dtypeInfo(this.dtype).itemsize; } },
    nbytes:   { get: function () { return this.size * this.itemsize; } },
    T:        { get: function () { return this.transpose(); } }
  });

  /** 다차원 인덱스 → buf 위치 */
  ND.prototype.bufIndex = function (idx) {
    var p = this.offset;
    for (var i = 0; i < idx.length; i++) p += idx[i] * this.strides[i];
    return p;
  };

  ND.prototype.get = function (idx) {
    if (!Array.isArray(idx)) idx = Array.prototype.slice.call(arguments);
    return this.buf[this.bufIndex(idx)];
  };

  ND.prototype.set = function (idx, v) {
    this.buf[this.bufIndex(idx)] = castValue(v, this.dtype);
    return this;
  };

  /** C 순서 논리 인덱스 목록 (작은 배열 전용 — 시각화 목적) */
  ND.prototype.indices = function () {
    var out = [], sh = this.shape, n = sh.length;
    if (this.size === 0) return out;
    if (n === 0) return [[]];
    var idx = new Array(n).fill(0);
    while (true) {
      out.push(idx.slice());
      var k = n - 1;
      while (k >= 0) { idx[k]++; if (idx[k] < sh[k]) break; idx[k] = 0; k--; }
      if (k < 0) break;
    }
    return out;
  };

  /** C 순서 평평한 인덱스 → 다차원 인덱스 */
  ND.prototype.unravel = function (flat) {
    var sh = this.shape, n = sh.length, idx = new Array(n);
    for (var i = n - 1; i >= 0; i--) { idx[i] = flat % sh[i]; flat = Math.floor(flat / sh[i]); }
    return idx;
  };

  /** C 순서 평평한 값 배열 */
  ND.prototype.flatValues = function () {
    var self = this;
    return this.indices().map(function (i) { return self.get(i); });
  };

  /** buf 위치 목록 (메모리 시각화용) */
  ND.prototype.flatBufIndices = function () {
    var self = this;
    return this.indices().map(function (i) { return self.bufIndex(i); });
  };

  ND.prototype.toNested = function () {
    var self = this;
    if (this.ndim === 0) return this.buf[this.offset];
    function build(dim, prefix) {
      var out = [];
      for (var i = 0; i < self.shape[dim]; i++) {
        var idx = prefix.concat([i]);
        out.push(dim === self.ndim - 1 ? self.get(idx) : build(dim + 1, idx));
      }
      return out;
    }
    return build(0, []);
  };

  ND.prototype.isContiguous = function () {
    var want = cStrides(this.shape);
    for (var i = 0; i < this.shape.length; i++) {
      if (this.shape[i] === 1) continue;           // 크기 1 축의 보폭은 의미 없음
      if (this.strides[i] !== want[i]) return false;
    }
    return true;
  };

  ND.prototype.copy = function () {
    var vals = this.flatValues();
    return new ND(vals.slice(), this.shape, null, 0, this.dtype, null);
  };

  ND.prototype.astype = function (dt) {
    var vals = this.flatValues().map(function (v) { return castValue(v, dt); });
    return new ND(vals, this.shape, null, 0, dt, null);
  };

  /** 뷰인가? */
  ND.prototype.isView = function () { return this.base !== null; };

  /** 최종 원본 */
  ND.prototype.root = function () {
    var a = this;
    while (a.base) a = a.base;
    return a;
  };

  /**
   * reshape — 연속(contiguous)이면 뷰, 아니면 사본.
   * -1 은 한 번만 쓸 수 있다.
   */
  ND.prototype.reshape = function (shape) {
    if (!Array.isArray(shape)) shape = Array.prototype.slice.call(arguments);
    shape = shape.slice();
    var neg = -1, known = 1;
    for (var i = 0; i < shape.length; i++) {
      if (shape[i] === -1) {
        if (neg !== -1) throw new NDError("can only specify one unknown dimension");
        neg = i;
      } else {
        if (shape[i] < 0) throw new NDError("negative dimensions are not allowed");
        known *= shape[i];
      }
    }
    if (neg !== -1) {
      if (known === 0 || this.size % known !== 0) {
        throw new NDError("cannot reshape array of size " + this.size + " into shape " + shapeStr(shape));
      }
      shape[neg] = this.size / known;
    } else if (prod(shape) !== this.size) {
      throw new NDError("cannot reshape array of size " + this.size + " into shape " + shapeStr(shape));
    }
    if (this.isContiguous()) {
      return new ND(this.buf, shape, cStrides(shape), this.offset, this.dtype, this.base || this);
    }
    var c = this.copy();
    return new ND(c.buf, shape, cStrides(shape), 0, this.dtype, null);
  };

  /** ravel — 가능하면 뷰 */
  ND.prototype.ravel = function () { return this.reshape([this.size]); };

  /** flatten — 항상 사본 */
  ND.prototype.flatten = function () {
    var vals = this.flatValues();
    return new ND(vals, [this.size], null, 0, this.dtype, null);
  };

  /** transpose — 항상 뷰 */
  ND.prototype.transpose = function (axes) {
    var n = this.ndim, i;
    if (!axes) { axes = []; for (i = n - 1; i >= 0; i--) axes.push(i); }
    if (axes.length !== n) throw new NDError("axes don't match array");
    var sh = [], st = [];
    for (i = 0; i < n; i++) { sh.push(this.shape[axes[i]]); st.push(this.strides[axes[i]]); }
    return new ND(this.buf, sh, st, this.offset, this.dtype, this.base || this);
  };

  ND.prototype.swapaxes = function (a, b) {
    var axes = []; for (var i = 0; i < this.ndim; i++) axes.push(i);
    var t = axes[a]; axes[a] = axes[b]; axes[b] = t;
    return this.transpose(axes);
  };

  /**
   * 인덱싱/슬라이싱. spec 은 parseIndex()가 만들어 준다.
   *   {k:'i', v:n}            정수 → 축이 사라진다
   *   {k:'s', start,stop,step} 슬라이스 → 축이 남는다
   *   {k:'n'}                 np.newaxis / None → 축이 추가된다
   *   {k:'e'}                 ... (Ellipsis)
   * 반환: 항상 뷰
   */
  ND.prototype.index = function (spec) {
    var i, nInt = 0, hasEll = false;
    for (i = 0; i < spec.length; i++) {
      if (spec[i].k === 'i' || spec[i].k === 's') nInt++;
      if (spec[i].k === 'e') hasEll = true;
    }
    if (nInt > this.ndim) {
      throw new NDError("too many indices for array: array is " + this.ndim +
        "-dimensional, but " + nInt + " were indexed");
    }
    // Ellipsis 를 필요한 개수의 전체 슬라이스로 풀어 쓴다
    var expanded = [];
    for (i = 0; i < spec.length; i++) {
      if (spec[i].k === 'e') {
        var fill = this.ndim - nInt;
        for (var f = 0; f < fill; f++) expanded.push({ k: 's', start: null, stop: null, step: null });
      } else expanded.push(spec[i]);
    }
    if (!hasEll) {
      // 지정하지 않은 뒤쪽 축은 전체 슬라이스
      var given = 0;
      for (i = 0; i < expanded.length; i++) if (expanded[i].k !== 'n') given++;
      for (i = given; i < this.ndim; i++) expanded.push({ k: 's', start: null, stop: null, step: null });
    }

    var shape = [], strides = [], offset = this.offset, ax = 0;
    for (i = 0; i < expanded.length; i++) {
      var s = expanded[i];
      if (s.k === 'n') { shape.push(1); strides.push(0); continue; }
      var dim = this.shape[ax], stride = this.strides[ax];
      if (s.k === 'i') {
        var v = s.v < 0 ? s.v + dim : s.v;
        if (v < 0 || v >= dim) {
          throw new NDError("index " + s.v + " is out of bounds for axis " + ax +
            " with size " + dim);
        }
        offset += v * stride;
        ax++;
        continue;
      }
      var r = resolveSlice(s, dim);
      shape.push(r.count);
      strides.push(stride * r.step);
      offset += r.start * stride;
      ax++;
    }
    return new ND(this.buf, shape, strides, offset, this.dtype, this.base || this);
  };

  /** 문자열로 바로 인덱싱: a.idx("1:4, ::2") */
  ND.prototype.idx = function (str) { return this.index(parseIndex(str)); };

  /** 슬라이스 정규화 — 파이썬 규칙 그대로 (범위를 넘어도 에러가 아니다) */
  function resolveSlice(s, dim) {
    var step = (s.step === null || s.step === undefined) ? 1 : s.step;
    if (step === 0) throw new NDError("slice step cannot be zero");
    var start, stop;
    if (step > 0) {
      start = (s.start === null || s.start === undefined) ? 0 : s.start;
      stop  = (s.stop  === null || s.stop  === undefined) ? dim : s.stop;
      if (start < 0) start += dim;
      if (stop  < 0) stop  += dim;
      start = Math.min(Math.max(start, 0), dim);
      stop  = Math.min(Math.max(stop, 0), dim);
      var cnt = Math.max(0, Math.ceil((stop - start) / step));
      return { start: start, count: cnt, step: step };
    }
    start = (s.start === null || s.start === undefined) ? dim - 1 : s.start;
    stop  = (s.stop  === null || s.stop  === undefined) ? -1 : s.stop;   // -1 = "끝까지"
    if (s.start !== null && s.start !== undefined && start < 0) start += dim;
    if (s.stop  !== null && s.stop  !== undefined && stop  < 0) stop  += dim;
    start = Math.min(Math.max(start, -1), dim - 1);
    if (s.stop === null || s.stop === undefined) stop = -1;
    else stop = Math.min(Math.max(stop, -1), dim);
    var c = Math.max(0, Math.ceil((stop - start) / step));
    return { start: Math.max(start, 0), count: c, step: step };
  }

  /* -------------------------------------------------------- 인덱스 문자열 파서 */

  /**
   * "1:4, ::2" / "0" / ":, 0" / "..., 1" / "None, :" / "a[1:, 0:1]" 을 spec 으로.
   * 실패하면 NDError 를 던진다. (플레이그라운드에서 잡아서 학생에게 보여준다)
   */
  function parseIndex(str) {
    var s = String(str).trim();
    var lb = s.indexOf('[');
    if (lb !== -1 && s[s.length - 1] === ']') s = s.slice(lb + 1, -1);   // a[...] 껍질 제거
    s = s.trim();
    if (s === '') return [{ k: 's', start: null, stop: null, step: null }];

    var parts = splitTop(s, ',');
    var spec = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p === '') continue;
      if (p === '...' || p === 'Ellipsis') { spec.push({ k: 'e' }); continue; }
      if (p === 'None' || p === 'np.newaxis' || p === 'newaxis') { spec.push({ k: 'n' }); continue; }
      if (p.indexOf(':') === -1) {
        var n = parseIntStrict(p);
        if (n === null) throw new NDError("인덱스로 쓸 수 없는 값: '" + p + "'");
        spec.push({ k: 'i', v: n });
        continue;
      }
      var bits = p.split(':');
      if (bits.length > 3) throw new NDError("슬라이스에 콜론이 너무 많다: '" + p + "'");
      var g = function (x) {
        x = (x || '').trim();
        if (x === '') return null;
        var v = parseIntStrict(x);
        if (v === null) throw new NDError("슬라이스 값이 정수가 아니다: '" + x + "'");
        return v;
      };
      spec.push({ k: 's', start: g(bits[0]), stop: g(bits[1]), step: bits.length > 2 ? g(bits[2]) : null });
    }
    if (!spec.length) spec.push({ k: 's', start: null, stop: null, step: null });
    return spec;
  }

  function parseIntStrict(x) {
    x = x.trim();
    if (!/^[+-]?\d+$/.test(x)) return null;
    return parseInt(x, 10);
  }

  /** 괄호 안의 콤마는 건드리지 않고 최상위에서만 쪼갠다 */
  function splitTop(s, sep) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === sep && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** spec 을 사람이 읽는 문자열로 (역방향) */
  function specToString(spec) {
    return spec.map(function (s) {
      if (s.k === 'i') return String(s.v);
      if (s.k === 'n') return 'None';
      if (s.k === 'e') return '...';
      var a = s.start === null ? '' : s.start;
      var b = s.stop === null ? '' : s.stop;
      var c = s.step === null ? '' : s.step;
      return c === '' ? a + ':' + b : a + ':' + b + ':' + c;
    }).join(', ');
  }

  /* ----------------------------------------------------------------- 생성기 */

  function array(nested, dtype) {
    var shape = [], probe = nested;
    while (Array.isArray(probe)) { shape.push(probe.length); probe = probe[0]; }
    var vals = [];
    (function walk(x, depth) {
      if (depth === shape.length) { vals.push(x); return; }
      if (!Array.isArray(x) || x.length !== shape[depth]) {
        throw new NDError("setting an array element with a sequence. " +
          "The requested array has an inhomogeneous shape — 들쭉날쭉한 리스트는 배열이 될 수 없다.");
      }
      for (var i = 0; i < x.length; i++) walk(x[i], depth + 1);
    })(nested, 0);

    if (!dtype) {
      var allBool = vals.every(function (v) { return typeof v === 'boolean'; });
      var allInt = vals.every(function (v) { return typeof v === 'number' && Number.isInteger(v); });
      dtype = allBool ? 'bool' : (allInt ? 'int64' : 'float64');
    }
    vals = vals.map(function (v) { return castValue(typeof v === 'boolean' ? (v ? 1 : 0) : v, dtype); });
    return new ND(vals, shape, null, 0, dtype, null);
  }

  function arange(a, b, step, dtype) {
    var start = 0, stop = a;
    if (b !== undefined && b !== null) { start = a; stop = b; }
    step = (step === undefined || step === null) ? 1 : step;
    if (step === 0) throw new NDError("arange: step cannot be zero");
    var n = Math.max(0, Math.ceil((stop - start) / step));
    var allInt = Number.isInteger(start) && Number.isInteger(step);
    var dt = dtype || (allInt ? 'int64' : 'float64');
    var vals = new Array(n);
    for (var i = 0; i < n; i++) vals[i] = castValue(start + i * step, dt);
    return new ND(vals, [n], null, 0, dt, null);
  }

  function linspace(start, stop, num, endpoint) {
    num = (num === undefined) ? 50 : num;
    endpoint = endpoint !== false;
    var vals = new Array(num);
    if (num === 1) { vals[0] = start; }
    else {
      var div = endpoint ? num - 1 : num;
      for (var i = 0; i < num; i++) vals[i] = start + (stop - start) * i / div;
    }
    return new ND(vals, [num], null, 0, 'float64', null);
  }

  function filled(shape, v, dtype) {
    if (typeof shape === 'number') shape = [shape];
    var n = prod(shape), dt = dtype || (typeof v === 'boolean' ? 'bool' : (Number.isInteger(v) ? 'int64' : 'float64'));
    var vals = new Array(n).fill(castValue(v, dt));
    return new ND(vals, shape, null, 0, dt, null);
  }

  function zeros(shape, dtype) { return filled(shape, 0, dtype || 'float64'); }
  function ones(shape, dtype) { return filled(shape, 1, dtype || 'float64'); }
  function full(shape, v, dtype) { return filled(shape, v, dtype); }

  /** np.empty — 초기화하지 않는다. 예측 불가한 값을 흉내 낸다. */
  function empty(shape, dtype) {
    if (typeof shape === 'number') shape = [shape];
    var n = prod(shape), dt = dtype || 'float64', vals = new Array(n);
    for (var i = 0; i < n; i++) {
      // "메모리에 남아 있던 쓰레기" 를 재현: 대부분 0, 간간이 이상한 값
      vals[i] = Math.random() < 0.55 ? 0 : castValue(Math.floor((Math.random() - 0.3) * 1e9), dt);
    }
    return new ND(vals, shape, null, 0, dt, null);
  }

  function zerosLike(a) { return zeros(a.shape, a.dtype); }
  function onesLike(a) { return ones(a.shape, a.dtype); }
  function fullLike(a, v) { return full(a.shape, v, a.dtype); }

  function eye(N, M, k, dtype) {
    M = (M === undefined || M === null) ? N : M;
    k = k || 0;
    var dt = dtype || 'float64', a = zeros([N, M], dt);
    for (var i = 0; i < N; i++) { var j = i + k; if (j >= 0 && j < M) a.set([i, j], 1); }
    return a;
  }

  function identity(n, dtype) { return eye(n, n, 0, dtype); }

  /** np.diag — 2D면 대각 성분 추출(1D 반환), 1D면 대각 행렬 생성(2D 반환) */
  function diag(a, k) {
    k = k || 0;
    if (a.ndim === 2) {
      var out = [];
      for (var i = 0; i < a.shape[0]; i++) {
        var j = i + k;
        if (j >= 0 && j < a.shape[1]) out.push(a.get([i, j]));
      }
      return new ND(out, [out.length], null, 0, a.dtype, null);
    }
    if (a.ndim === 1) {
      var n = a.shape[0] + Math.abs(k), m = zeros([n, n], a.dtype);
      for (var t = 0; t < a.shape[0]; t++) {
        var r = k >= 0 ? t : t - k, c = k >= 0 ? t + k : t;
        m.set([r, c], a.get([t]));
      }
      return m;
    }
    throw new NDError("Input must be 1- or 2-d.");
  }

  /* ------------------------------------------------------------ 브로드캐스팅 */

  /**
   * 두 shape 의 브로드캐스팅 결과. 실패하면 {error} 를 담아 돌려준다.
   * steps 에 각 단계를 기록해 두어 시뮬레이터가 그대로 그릴 수 있다.
   */
  function broadcastShapes(sa, sb) {
    var n = Math.max(sa.length, sb.length);
    var pa = new Array(n - sa.length).fill(1).concat(sa.slice());
    var pb = new Array(n - sb.length).fill(1).concat(sb.slice());
    var out = new Array(n), steps = [];
    for (var i = 0; i < n; i++) {
      var x = pa[i], y = pb[i];
      if (x === y) { out[i] = x; steps.push({ axis: i, a: x, b: y, result: x, how: 'same' }); }
      else if (x === 1) { out[i] = y; steps.push({ axis: i, a: x, b: y, result: y, how: 'stretchA' }); }
      else if (y === 1) { out[i] = x; steps.push({ axis: i, a: x, b: y, result: x, how: 'stretchB' }); }
      else {
        return {
          ok: false, padded: [pa, pb], failAxis: i,
          error: "operands could not be broadcast together with shapes " +
                 shapeStr(sa) + " " + shapeStr(sb),
          reason: "축 " + i + " 에서 " + x + " 와 " + y + " 는 서로 다르고 둘 다 1이 아니다."
        };
      }
    }
    return { ok: true, shape: out, padded: [pa, pb], steps: steps };
  }

  /**
   * broadcastTo — 늘어난 축의 stride 를 0 으로 만든 **뷰**를 준다.
   * 메모리를 복사하지 않는다는 NumPy 의 실제 동작 그대로다.
   */
  function broadcastTo(a, shape) {
    var n = shape.length;
    if (a.ndim > n) throw new NDError("cannot broadcast a " + a.ndim + "-d array to " + n + " dimensions");
    var pad = n - a.ndim;
    var sh = new Array(pad).fill(1).concat(a.shape);
    var st = new Array(pad).fill(0).concat(a.strides);
    var outSt = new Array(n);
    for (var i = 0; i < n; i++) {
      if (sh[i] === shape[i]) outSt[i] = st[i];
      else if (sh[i] === 1) outSt[i] = 0;            // ← 여기가 핵심: 늘리기 = stride 0
      else throw new NDError("operands could not be broadcast together with shapes " +
        shapeStr(a.shape) + " " + shapeStr(shape));
    }
    return new ND(a.buf, shape, outSt, a.offset, a.dtype, a.base || a);
  }

  function asND(x, likeDtype) {
    if (x instanceof ND) return x;
    if (typeof x === 'number') return new ND([x], [], [], 0, Number.isInteger(x) ? 'int64' : 'float64', null);
    if (typeof x === 'boolean') return new ND([x ? 1 : 0], [], [], 0, 'bool', null);
    return array(x, likeDtype);
  }

  /* -------------------------------------------------------------- 원소별 연산 */

  function binop(a, b, fn, opts) {
    opts = opts || {};
    a = asND(a); b = asND(b);
    var bc = broadcastShapes(a.shape, b.shape);
    if (!bc.ok) throw new NDError(bc.error + "\n  → " + bc.reason);
    var A = broadcastTo(a, bc.shape), B = broadcastTo(b, bc.shape);
    var dt = opts.dtype || promote(a.dtype, b.dtype);
    if (opts.boolResult) dt = 'bool';
    var idxs = A.indices(), vals = new Array(idxs.length);
    for (var i = 0; i < idxs.length; i++) {
      var r = fn(A.get(idxs[i]), B.get(idxs[i]));
      vals[i] = opts.boolResult ? !!r : castValue(r, dt);
    }
    return new ND(vals, bc.shape, null, 0, dt, null);
  }

  function unop(a, fn, dtype) {
    a = asND(a);
    var vals = a.flatValues().map(fn);
    var dt = dtype || (isIntDtype(a.dtype) ? 'float64' : a.dtype);
    if (dt !== 'bool') vals = vals.map(function (v) { return castValue(v, dt); });
    return new ND(vals, a.shape, null, 0, dt, null);
  }

  var OPS = {
    add: function (a, b) { return binop(a, b, function (x, y) { return x + y; }); },
    sub: function (a, b) { return binop(a, b, function (x, y) { return x - y; }); },
    mul: function (a, b) { return binop(a, b, function (x, y) { return x * y; }); },
    div: function (a, b) { return binop(a, b, function (x, y) { return x / y; }, { dtype: 'float64' }); },
    floordiv: function (a, b) { return binop(a, b, function (x, y) { return Math.floor(x / y); }); },
    mod: function (a, b) { return binop(a, b, function (x, y) { return ((x % y) + y) % y; }); },
    pow: function (a, b) { return binop(a, b, function (x, y) { return Math.pow(x, y); }); },
    gt: function (a, b) { return binop(a, b, function (x, y) { return x > y; }, { boolResult: true }); },
    ge: function (a, b) { return binop(a, b, function (x, y) { return x >= y; }, { boolResult: true }); },
    lt: function (a, b) { return binop(a, b, function (x, y) { return x < y; }, { boolResult: true }); },
    le: function (a, b) { return binop(a, b, function (x, y) { return x <= y; }, { boolResult: true }); },
    eq: function (a, b) { return binop(a, b, function (x, y) { return x === y; }, { boolResult: true }); },
    ne: function (a, b) { return binop(a, b, function (x, y) { return x !== y; }, { boolResult: true }); },
    and: function (a, b) { return binop(a, b, function (x, y) { return !!x && !!y; }, { boolResult: true }); },
    or: function (a, b) { return binop(a, b, function (x, y) { return !!x || !!y; }, { boolResult: true }); },
    xor: function (a, b) { return binop(a, b, function (x, y) { return !!x !== !!y; }, { boolResult: true }); },
    not: function (a) { return unop(a, function (x) { return !x; }, 'bool'); }
  };

  /* ----------------------------------------------------------------- 행렬곱 */

  /**
   * matmul. steps:true 를 주면 각 출력 원소의 계산 과정을 함께 돌려준다
   * (행렬곱 시각화기가 이걸 그린다).
   */
  function matmul(a, b, opts) {
    opts = opts || {};
    a = asND(a); b = asND(b);
    var a2 = a, b2 = b, squeezeRow = false, squeezeCol = false;
    if (a.ndim === 1) { a2 = a.reshape([1, a.shape[0]]); squeezeRow = true; }
    if (b.ndim === 1) { b2 = b.reshape([b.shape[0], 1]); squeezeCol = true; }
    if (a2.ndim !== 2 || b2.ndim !== 2) throw new NDError("matmul: 2차원까지만 지원한다");
    var m = a2.shape[0], n = a2.shape[1], n2 = b2.shape[0], p = b2.shape[1];
    if (n !== n2) {
      throw new NDError("matmul: Input operand 1 has a mismatch in its core dimension\n" +
        "  " + shapeStr(a.shape) + " @ " + shapeStr(b.shape) + " → 안쪽 차원 " + n +
        " 와 " + n2 + " 가 다르다. (m×n) @ (n×p) 여야 한다.");
    }
    var dt = promote(a.dtype, b.dtype);
    if (dt === 'bool') dt = 'int64';
    var out = zeros([m, p], dt), steps = opts.steps ? [] : null;
    for (var i = 0; i < m; i++) {
      for (var j = 0; j < p; j++) {
        var s = 0, terms = [];
        for (var k = 0; k < n; k++) {
          var x = a2.get([i, k]), y = b2.get([k, j]);
          s += x * y;
          if (steps) terms.push({ k: k, a: x, b: y, prod: x * y });
        }
        out.set([i, j], s);
        if (steps) steps.push({ i: i, j: j, terms: terms, value: s });
      }
    }
    var res = out;
    if (squeezeRow && squeezeCol) res = out.reshape([]);
    else if (squeezeRow) res = out.reshape([p]);
    else if (squeezeCol) res = out.reshape([m]);
    return opts.steps ? { result: res, steps: steps, m: m, n: n, p: p } : res;
  }

  function dot(a, b) { return matmul(a, b); }

  /* ------------------------------------------------------------- 집계(reduce) */

  var REDUCERS = {
    sum:  function (v) { return v.reduce(function (a, b) { return a + b; }, 0); },
    prod: function (v) { return v.reduce(function (a, b) { return a * b; }, 1); },
    mean: function (v) { return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : NaN; },
    min:  function (v) { return v.length ? Math.min.apply(null, v) : NaN; },
    max:  function (v) { return v.length ? Math.max.apply(null, v) : NaN; },
    ptp:  function (v) { return Math.max.apply(null, v) - Math.min.apply(null, v); },
    argmin: function (v) { var b = 0; for (var i = 1; i < v.length; i++) if (v[i] < v[b]) b = i; return b; },
    argmax: function (v) { var b = 0; for (var i = 1; i < v.length; i++) if (v[i] > v[b]) b = i; return b; },
    all:  function (v) { return v.every(function (x) { return !!x; }); },
    any:  function (v) { return v.some(function (x) { return !!x; }); },
    median: function (v) {
      var s = v.slice().sort(function (a, b) { return a - b; }), n = s.length;
      if (!n) return NaN;
      return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    }
  };

  function variance(v, ddof) {
    ddof = ddof || 0;
    var n = v.length; if (n - ddof <= 0) return NaN;
    var m = v.reduce(function (a, b) { return a + b; }, 0) / n;
    return v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - ddof);
  }

  /** NumPy 기본 방식(linear interpolation)의 백분위수 */
  function percentileOf(v, q) {
    var s = v.slice().sort(function (a, b) { return a - b; });
    if (!s.length) return NaN;
    var pos = (s.length - 1) * q / 100;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  var INT_RESULT = { argmin: 1, argmax: 1 };
  var BOOL_RESULT = { all: 1, any: 1 };

  /**
   * reduce(a, {op, axis, keepdims, ddof, q})
   * axis: null(전체) | 정수 | 정수배열
   * 반환: ND (axis=null 이면 0차원)
   */
  function reduce(a, opts) {
    opts = opts || {};
    var op = opts.op || 'sum';
    var axis = (opts.axis === undefined) ? null : opts.axis;
    var keepdims = !!opts.keepdims;

    var fn = REDUCERS[op];
    if (op === 'std') fn = function (v) { return Math.sqrt(variance(v, opts.ddof)); };
    if (op === 'var') fn = function (v) { return variance(v, opts.ddof); };
    if (op === 'percentile' || op === 'quantile') {
      var q = op === 'quantile' ? opts.q * 100 : opts.q;
      fn = function (v) { return percentileOf(v, q); };
    }
    if (!fn) throw new NDError("알 수 없는 집계 함수: " + op);

    var outDtype;
    if (BOOL_RESULT[op]) outDtype = 'bool';
    else if (INT_RESULT[op]) outDtype = 'int64';
    else if (op === 'sum' || op === 'prod' || op === 'min' || op === 'max' || op === 'ptp') {
      outDtype = a.dtype === 'bool' ? 'int64' : a.dtype;
    } else outDtype = 'float64';
    if (opts.dtype) outDtype = opts.dtype;

    if (axis === null) {
      var v = a.flatValues();
      var r = fn(v);
      var res = new ND([castValue(BOOL_RESULT[op] ? (r ? 1 : 0) : r, outDtype)], [], [], 0, outDtype, null);
      if (keepdims) return res.reshape(new Array(a.ndim).fill(1));
      return res;
    }

    var axes = Array.isArray(axis) ? axis.slice() : [axis];
    axes = axes.map(function (x) { return x < 0 ? x + a.ndim : x; });
    axes.forEach(function (x) {
      if (x < 0 || x >= a.ndim) {
        throw new NDError("axis " + x + " is out of bounds for array of dimension " + a.ndim);
      }
    });

    var keep = [], i;
    for (i = 0; i < a.ndim; i++) if (axes.indexOf(i) === -1) keep.push(i);
    var outShape = keep.map(function (i) { return a.shape[i]; });
    var out = zeros(outShape.length ? outShape : [], outDtype);
    if (!outShape.length) out = new ND([0], [], [], 0, outDtype, null);

    var outIdxs = outShape.length ? out.indices() : [[]];
    for (var oi = 0; oi < outIdxs.length; oi++) {
      var base = new Array(a.ndim).fill(0);
      for (i = 0; i < keep.length; i++) base[keep[i]] = outIdxs[oi][i];
      // 축소되는 축들을 전부 훑는다
      var redShape = axes.map(function (x) { return a.shape[x]; });
      var vals = [], counter = new Array(redShape.length).fill(0);
      var total = prod(redShape);
      for (var t = 0; t < total; t++) {
        var idx = base.slice();
        for (i = 0; i < axes.length; i++) idx[axes[i]] = counter[i];
        vals.push(a.get(idx));
        var k = redShape.length - 1;
        while (k >= 0) { counter[k]++; if (counter[k] < redShape[k]) break; counter[k] = 0; k--; }
      }
      var rv = fn(vals);
      if (BOOL_RESULT[op]) rv = rv ? 1 : 0;
      if (outShape.length) out.set(outIdxs[oi], rv);
      else out.buf[0] = castValue(rv, outDtype);
    }

    if (keepdims) {
      var ks = a.shape.slice();
      axes.forEach(function (x) { ks[x] = 1; });
      return out.reshape(ks);
    }
    return out;
  }

  // 편의 래퍼
  function mk(op) {
    return function (a, axis, extra) {
      var o = { op: op, axis: (axis === undefined ? null : axis) };
      if (extra) for (var k in extra) o[k] = extra[k];
      return reduce(a, o);
    };
  }
  var sum = mk('sum'), mean = mk('mean'), min = mk('min'), max = mk('max'),
      argmin = mk('argmin'), argmax = mk('argmax'), all = mk('all'), any = mk('any'),
      median = mk('median'), prodR = mk('prod'), ptp = mk('ptp');
  function std(a, axis, ddof) { return reduce(a, { op: 'std', axis: axis === undefined ? null : axis, ddof: ddof || 0 }); }
  function varr(a, axis, ddof) { return reduce(a, { op: 'var', axis: axis === undefined ? null : axis, ddof: ddof || 0 }); }
  function percentile(a, q, axis) { return reduce(a, { op: 'percentile', q: q, axis: axis === undefined ? null : axis }); }

  function cumsum(a) {
    var v = a.flatValues(), acc = 0, out = v.map(function (x) { return (acc += x); });
    return new ND(out, [a.size], null, 0, a.dtype === 'bool' ? 'int64' : a.dtype, null);
  }

  /* --------------------------------------------------- 불리언 / 팬시 인덱싱 */

  /** 불리언 마스크로 뽑기 → 항상 사본, 1차원 */
  function maskSelect(a, mask) {
    if (mask.size !== a.size) {
      throw new NDError("boolean index did not match indexed array: 마스크 크기 " +
        mask.size + " ≠ 배열 크기 " + a.size);
    }
    var av = a.flatValues(), mv = mask.flatValues(), out = [];
    for (var i = 0; i < av.length; i++) if (mv[i]) out.push(av[i]);
    return new ND(out, [out.length], null, 0, a.dtype, null);
  }

  /** 마스크 자리에 값 대입 → 원본이 바뀐다 */
  function maskAssign(a, mask, value) {
    var idxs = a.indices(), mv = mask.flatValues();
    for (var i = 0; i < idxs.length; i++) if (mv[i]) a.set(idxs[i], value);
    return a;
  }

  /** 팬시 인덱싱(1차원) → 사본. 결과 shape 는 인덱스 배열의 shape 를 따른다 */
  function fancySelect(a, indexArr) {
    var iv = indexArr.flatValues(), n = a.shape[0], out = new Array(iv.length);
    for (var i = 0; i < iv.length; i++) {
      var j = iv[i] < 0 ? iv[i] + n : iv[i];
      if (j < 0 || j >= n) {
        throw new NDError("index " + iv[i] + " is out of bounds for axis 0 with size " + n);
      }
      out[i] = a.get([j]);
    }
    return new ND(out, indexArr.shape, null, 0, a.dtype, null);
  }

  function whereIdx(mask) {
    var mv = mask.flatValues(), out = [];
    for (var i = 0; i < mv.length; i++) if (mv[i]) out.push(i);
    return new ND(out, [out.length], null, 0, 'int64', null);
  }

  function where3(cond, x, y) {
    cond = asND(cond); x = asND(x); y = asND(y);
    var s1 = broadcastShapes(cond.shape, x.shape);
    if (!s1.ok) throw new NDError(s1.error);
    var s2 = broadcastShapes(s1.shape, y.shape);
    if (!s2.ok) throw new NDError(s2.error);
    var C = broadcastTo(cond, s2.shape), X = broadcastTo(x, s2.shape), Y = broadcastTo(y, s2.shape);
    var dt = promote(x.dtype, y.dtype);
    var idxs = C.indices(), vals = idxs.map(function (i) {
      return castValue(C.get(i) ? X.get(i) : Y.get(i), dt);
    });
    return new ND(vals, s2.shape, null, 0, dt, null);
  }

  /* -------------------------------------------------------------- 합치기 */

  function concatenate(arrs, axis) {
    axis = axis || 0;
    if (!arrs.length) throw new NDError("need at least one array to concatenate");
    var ndim = arrs[0].ndim;
    arrs.forEach(function (a, k) {
      if (a.ndim !== ndim) throw new NDError("all the input array dimensions must match: " +
        "배열 0은 " + ndim + "차원, 배열 " + k + "는 " + a.ndim + "차원");
      for (var d = 0; d < ndim; d++) {
        if (d !== axis && a.shape[d] !== arrs[0].shape[d]) {
          throw new NDError("all the input array dimensions except for the concatenation axis " +
            "must match exactly: 축 " + d + " 에서 " + arrs[0].shape[d] + " ≠ " + a.shape[d]);
        }
      }
    });
    if (axis >= ndim) throw new NDError("axis " + axis + " is out of bounds for array of dimension " + ndim);
    var outShape = arrs[0].shape.slice();
    outShape[axis] = arrs.reduce(function (s, a) { return s + a.shape[axis]; }, 0);
    var dt = arrs.reduce(function (d, a) { return promote(d, a.dtype); }, arrs[0].dtype);
    var out = zeros(outShape, dt), base = 0;
    arrs.forEach(function (a) {
      a.indices().forEach(function (idx) {
        var o = idx.slice(); o[axis] += base;
        out.set(o, a.get(idx));
      });
      base += a.shape[axis];
    });
    return out;
  }

  function atLeast2D(a) { return a.ndim >= 2 ? a : a.reshape([1, a.size]); }
  function vstack(arrs) { return concatenate(arrs.map(atLeast2D), 0); }
  function hstack(arrs) {
    if (arrs[0].ndim === 1) return concatenate(arrs, 0);
    return concatenate(arrs, 1);
  }
  function stack(arrs, axis) {
    axis = axis || 0;
    var expanded = arrs.map(function (a) {
      var sh = a.shape.slice(); sh.splice(axis, 0, 1); return a.reshape(sh);
    });
    return concatenate(expanded, axis);
  }

  /* ------------------------------------------------------------- 선형대수 */

  function norm(a) {
    var v = a.flatValues();
    return Math.sqrt(v.reduce(function (s, x) { return s + x * x; }, 0));
  }

  function det2(a) { return a.get([0, 0]) * a.get([1, 1]) - a.get([0, 1]) * a.get([1, 0]); }

  /** 가우스 소거법 — det, solve, inv 공용 */
  function gauss(Ain, Bin) {
    var n = Ain.shape[0], i, j, k;
    var A = [], B = [];
    for (i = 0; i < n; i++) {
      A.push([]); for (j = 0; j < n; j++) A[i].push(Ain.get([i, j]));
      B.push([]); for (j = 0; j < (Bin ? Bin.shape[1] : 0); j++) B[i].push(Bin.get([i, j]));
    }
    var det = 1;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      if (Math.abs(A[piv][i]) < 1e-12) return { singular: true, det: 0 };
      if (piv !== i) { var t = A[piv]; A[piv] = A[i]; A[i] = t; var tb = B[piv]; B[piv] = B[i]; B[i] = tb; det = -det; }
      det *= A[i][i];
      for (k = i + 1; k < n; k++) {
        var f = A[k][i] / A[i][i];
        for (j = i; j < n; j++) A[k][j] -= f * A[i][j];
        for (j = 0; j < B[k].length; j++) B[k][j] -= f * B[i][j];
      }
    }
    // 후진 대입
    for (i = n - 1; i >= 0; i--) {
      for (j = 0; j < B[i].length; j++) {
        var s = B[i][j];
        for (k = i + 1; k < n; k++) s -= A[i][k] * B[k][j];
        B[i][j] = s / A[i][i];
      }
    }
    return { singular: false, det: det, X: B };
  }

  function solve(A, b) {
    var vec = b.ndim === 1;
    var B = vec ? b.reshape([b.shape[0], 1]) : b;
    var g = gauss(A, B);
    if (g.singular) throw new NDError("Singular matrix — 해가 유일하지 않다(행렬식이 0).");
    var out = zeros([A.shape[0], B.shape[1]], 'float64');
    for (var i = 0; i < A.shape[0]; i++) for (var j = 0; j < B.shape[1]; j++) out.set([i, j], g.X[i][j]);
    return vec ? out.reshape([A.shape[0]]) : out;
  }

  function inv(A) {
    var n = A.shape[0], g = gauss(A, identity(n, 'float64'));
    if (g.singular) throw new NDError("Singular matrix");
    var out = zeros([n, n], 'float64');
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) out.set([i, j], g.X[i][j]);
    return out;
  }

  function det(A) {
    if (A.shape[0] === 2) return det2(A);
    var g = gauss(A, zeros([A.shape[0], 0], 'float64'));
    return g.singular ? 0 : g.det;
  }

  /* ---------------------------------------------------------------- 포맷 */

  function shapeStr(sh) {
    if (!sh.length) return '()';
    if (sh.length === 1) return '(' + sh[0] + ',)';
    return '(' + sh.join(', ') + ')';
  }

  function decimalsNeeded(v, maxDec) {
    if (!isFinite(v)) return 0;
    for (var d = 0; d <= maxDec; d++) {
      if (Math.abs(v - parseFloat(v.toFixed(d))) < 1e-12) return d;
    }
    return maxDec;
  }

  /**
   * NumPy 스타일 문자열.
   * mode 'print' → print(a) 처럼 콤마 없음.  mode 'repr' → array([...]) 처럼 콤마 있음.
   */
  function format(a, opts) {
    opts = opts || {};
    var mode = opts.mode || 'print';
    var precision = opts.precision === undefined ? 8 : opts.precision;
    var vals = a.flatValues();

    if (a.ndim === 0) {
      var sv = fmtScalar(vals[0], a.dtype, precision);
      return mode === 'repr' ? sv : sv;
    }

    var isB = a.dtype === 'bool', isI = isIntDtype(a.dtype);
    var dec = 0, useExp = false;
    if (!isB && !isI) {
      var finite = vals.filter(isFinite).map(Math.abs).filter(function (x) { return x > 0; });
      var mx = finite.length ? Math.max.apply(null, finite) : 0;
      var mn = finite.length ? Math.min.apply(null, finite) : 0;
      useExp = mx >= 1e8 || (mn > 0 && mn < 1e-4);
      if (!useExp) {
        vals.forEach(function (v) { dec = Math.max(dec, decimalsNeeded(v, precision)); });
      }
    }

    var strs = vals.map(function (v) {
      if (isB) return v ? 'True' : 'False';
      if (isI) return String(v);
      if (!isFinite(v)) return isNaN(v) ? 'nan' : (v > 0 ? 'inf' : '-inf');
      if (useExp) return v.toExponential(Math.min(precision, 8));
      return dec === 0 ? String(v) + '.' : v.toFixed(dec);
    });
    var w = strs.reduce(function (m, s) { return Math.max(m, s.length); }, 0);
    var pad = function (s) { return new Array(w - s.length + 1).join(' ') + s; };

    var sep = mode === 'repr' ? ', ' : ' ';
    var sh = a.shape;

    function build(dim, base) {
      if (dim === sh.length - 1) {
        var row = [];
        for (var i = 0; i < sh[dim]; i++) row.push(pad(strs[base + i]));
        return ['[' + row.join(sep) + ']'];
      }
      var stride = 1;
      for (var d = dim + 1; d < sh.length; d++) stride *= sh[d];
      var lines = [];
      for (var j = 0; j < sh[dim]; j++) {
        var sub = build(dim + 1, base + j * stride);
        for (var t = 0; t < sub.length; t++) {
          var prefix = (t === 0) ? (j === 0 ? '[' : ' ') : ' ';
          lines.push(prefix + sub[t]);
        }
        if (j < sh[dim] - 1) {
          lines[lines.length - 1] += (mode === 'repr' ? ',' : '');
          // 3차원 이상은 블록 사이에 빈 줄
          if (sh.length - dim > 2) lines.push('');
        }
      }
      lines[lines.length - 1] += ']';
      return lines;
    }

    var body = build(0, 0).join('\n');
    if (mode === 'repr') {
      var ind = new Array('array('.length + 1).join(' ');
      body = body.split('\n').map(function (l, i) { return i === 0 ? l : ind + l; }).join('\n');
      var suffix = (a.dtype !== 'int64' && a.dtype !== 'float64' && a.dtype !== 'bool')
        ? ', dtype=' + a.dtype : '';
      return 'array(' + body + suffix + ')';
    }
    return body;
  }

  function fmtScalar(v, dtype, precision) {
    if (dtype === 'bool') return v ? 'True' : 'False';
    if (isIntDtype(dtype)) return String(v);
    if (!isFinite(v)) return isNaN(v) ? 'nan' : (v > 0 ? 'inf' : '-inf');
    if (Number.isInteger(v)) return String(v) + '.0';
    var s = v.toFixed(precision === undefined ? 8 : precision);
    s = s.replace(/0+$/, ''); if (s[s.length - 1] === '.') s += '0';
    return s;
  }

  /* ---------------------------------------------------------------- 에러 */

  function NDError(msg) { this.name = 'NDError'; this.message = msg; }
  NDError.prototype = Object.create(Error.prototype);
  NDError.prototype.constructor = NDError;

  /** NumPy 가 실제로 내는 예외 이름을 흉내 낸 표시용 라벨 */
  function errLabel(msg) {
    if (/reshape|broadcast|dimension|axis .* out of bounds|inhomogeneous|match/i.test(msg)) return 'ValueError';
    if (/out of bounds for axis|too many indices/i.test(msg)) return 'IndexError';
    if (/Singular/i.test(msg)) return 'LinAlgError';
    return 'ValueError';
  }

  /* --------------------------------------------------------------- 유틸 */

  function sharesMemory(a, b) { return a.buf === b.buf; }

  function isclose(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-8); }

  /* --------------------------------------------------------------- export */

  var NDapi = {
    ND: ND, NDError: NDError, errLabel: errLabel,
    DTYPES: DTYPES, dtypeInfo: dtypeInfo, isIntDtype: isIntDtype, isFloatDtype: isFloatDtype,
    promote: promote, castValue: castValue,
    cStrides: cStrides, fStrides: fStrides, shapeStr: shapeStr, prod: prod,

    array: array, arange: arange, linspace: linspace,
    zeros: zeros, ones: ones, full: full, empty: empty,
    zerosLike: zerosLike, onesLike: onesLike, fullLike: fullLike,
    eye: eye, identity: identity, diag: diag,

    parseIndex: parseIndex, specToString: specToString,
    broadcastShapes: broadcastShapes, broadcastTo: broadcastTo, asND: asND,
    binop: binop, unop: unop, ops: OPS,
    matmul: matmul, dot: dot,

    reduce: reduce, sum: sum, mean: mean, min: min, max: max,
    argmin: argmin, argmax: argmax, all: all, any: any, median: median,
    prodOf: prodR, ptp: ptp, std: std, variance: varr, percentile: percentile, cumsum: cumsum,

    maskSelect: maskSelect, maskAssign: maskAssign, fancySelect: fancySelect,
    whereIdx: whereIdx, where: where3,

    concatenate: concatenate, vstack: vstack, hstack: hstack, stack: stack,

    norm: norm, solve: solve, inv: inv, det: det,

    format: format, fmtScalar: fmtScalar,
    sharesMemory: sharesMemory, isclose: isclose
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = NDapi;
  global.ND = NDapi;
})(typeof window !== 'undefined' ? window : globalThis);
