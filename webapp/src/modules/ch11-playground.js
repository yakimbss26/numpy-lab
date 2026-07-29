/* ===========================================================================
 * ch11-playground.js — 11장 "코드 실습실"
 *
 * 학생이 직접 파이썬 비슷한 코드를 써서 돌려 보는 장이다. 두 탭으로 구성한다.
 *   탭 1: 브라우저 안 미니 엔진 위에서 도는 "제한된 파이썬 표현식 평가기".
 *         재귀 하강 파서를 직접 짰다(eval/new Function 없음). 인터넷 없이 항상 동작.
 *   탭 2: 버튼을 눌렀을 때만 Pyodide 를 CDN 에서 불러와 진짜 NumPy 를 돌린다.
 *         지연 로딩 + 실패 시 안내. 탭 1 은 이 기능과 무관하게 항상 동작한다.
 *
 * 화면의 숫자는 전부 이 파일의 평가기가 그 자리에서 계산한 값이다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el, D = window.LabData;

  /* =======================================================================
   * 0. 공용 값 표현
   *   ND 인스턴스 · JS number(파이썬 int) · {__float__} 래퍼(파이썬 float) ·
   *   JS boolean(True/False) · null(None) · JS string · {__pytype} 래퍼(list/tuple) ·
   *   {__dtypeval}(dtype) · {__call}(호출 가능한 값 — np 함수/메서드/print)
   * ===================================================================== */

  function PGErr(msg, pyType) {
    this.message = msg;
    this.pyType = pyType || null;
    this.unsupported = false;
  }
  PGErr.prototype = Object.create(Error.prototype);

  function unsupported(desc) {
    var e = new PGErr('지원하지 않는 문법이다: ' + desc);
    e.unsupported = true;
    throw e;
  }
  function nameError(name) {
    throw new PGErr("name '" + name + "' is not defined", 'NameError');
  }

  function mkFloat(x) { return { __float__: true, value: x }; }
  function isFloatVal(v) { return !!(v && typeof v === 'object' && v.__float__ === true); }
  function PyList(items) { return { __pytype: 'list', items: items }; }
  function PyTuple(items) { return { __pytype: 'tuple', items: items }; }
  function isListOrTuple(v) { return !!(v && typeof v === 'object' && (v.__pytype === 'list' || v.__pytype === 'tuple')); }
  function mkDtype(name) { return { __dtypeval: true, name: name }; }
  function makeCallable(fn, label) { return { __call: fn, __label: label }; }

  /* ---------------------------------------------------- 파이썬 스타일 표기 */

  function fmtPyFloat(x) {
    if (isNaN(x)) return 'nan';
    if (!isFinite(x)) return x > 0 ? 'inf' : '-inf';
    if (Number.isInteger(x)) return x.toFixed(1);
    return String(x);
  }

  function pyRepr(v) {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (isFloatVal(v)) return fmtPyFloat(v.value);
    if (typeof v === 'number') return String(Math.trunc(v));
    if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    if (v instanceof ND.ND) return ND.format(v, { mode: 'repr' });
    if (v && v.__dtypeval) return "dtype('" + v.name + "')";
    if (isListOrTuple(v)) {
      var inner = v.items.map(pyRepr).join(', ');
      if (v.__pytype === 'tuple') return v.items.length === 1 ? '(' + inner + ',)' : '(' + inner + ')';
      return '[' + inner + ']';
    }
    if (v && typeof v.__call === 'function') return '<built-in function ' + (v.__label || '?') + '>';
    return String(v);
  }
  function pyStr(v) {
    if (typeof v === 'string') return v;
    if (v instanceof ND.ND) return ND.format(v);
    return pyRepr(v);
  }

  /* =======================================================================
   * 1. 토크나이저
   * ===================================================================== */

  var TWO_CHAR_OPS = ['**', '//', '==', '!=', '<=', '>='];

  function tokenizeLine(line) {
    var toks = [], i = 0, n = line.length;
    while (i < n) {
      var c = line[i];
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c >= '0' && c <= '9') {
        var j = i, isFloat = false;
        while (j < n && line[j] >= '0' && line[j] <= '9') j++;
        if (line[j] === '.') { isFloat = true; j++; while (j < n && line[j] >= '0' && line[j] <= '9') j++; }
        if (line[j] === 'e' || line[j] === 'E') {
          var k = j + 1;
          if (line[k] === '+' || line[k] === '-') k++;
          if (line[k] >= '0' && line[k] <= '9') { isFloat = true; j = k; while (j < n && line[j] >= '0' && line[j] <= '9') j++; }
        }
        toks.push({ type: 'NUM', value: parseFloat(line.slice(i, j)), isFloat: isFloat, start: i, end: j });
        i = j; continue;
      }
      if (c === '"' || c === "'") {
        var q = c, jj = i + 1, buf = '';
        while (jj < n && line[jj] !== q) {
          if (line[jj] === '\\' && jj + 1 < n) { buf += line[jj + 1]; jj += 2; }
          else { buf += line[jj]; jj++; }
        }
        if (jj >= n) unsupported('문자열이 닫히지 않았다: ' + line.slice(i));
        jj++;
        toks.push({ type: 'STR', value: buf, start: i, end: jj });
        i = jj; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var jn = i + 1;
        while (jn < n && /[A-Za-z0-9_]/.test(line[jn])) jn++;
        toks.push({ type: 'NAME', value: line.slice(i, jn), start: i, end: jn });
        i = jn; continue;
      }
      var two = line.slice(i, i + 2);
      if (TWO_CHAR_OPS.indexOf(two) !== -1) { toks.push({ type: two, value: two, start: i, end: i + 2 }); i += 2; continue; }
      if ('()[],.:'.indexOf(c) !== -1) { toks.push({ type: c, value: c, start: i, end: i + 1 }); i++; continue; }
      if ('+-*/%@><&|^~='.indexOf(c) !== -1) { toks.push({ type: c, value: c, start: i, end: i + 1 }); i++; continue; }
      unsupported("알 수 없는 문자다: '" + c + "'");
    }
    toks.push({ type: 'EOF', value: null, start: n, end: n });
    return toks;
  }

  function stripComment(line) {
    var out = '', q = null;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        out += c;
        if (c === '\\' && i + 1 < line.length) { out += line[i + 1]; i++; }
        else if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") { q = c; out += c; continue; }
      if (c === '#') break;
      out += c;
    }
    return out;
  }

  function topLevelHasComma(s) {
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) return true;
    }
    return false;
  }

  /* =======================================================================
   * 2. 재귀 하강 파서
   *   우선순위(낮음→높음): 비교 < | < ^ < & < (+ -) < (* / // % @) < 단항(- ~) < ** < 후위(. () [])
   * ===================================================================== */

  function Parser(tokens, line) { this.t = tokens; this.i = 0; this.line = line; }
  Parser.prototype.peek = function (o) { return this.t[this.i + (o || 0)]; };
  Parser.prototype.at = function (ty) { var p = this.peek(); return !!p && p.type === ty; };
  Parser.prototype.next = function () { return this.t[this.i++]; };
  Parser.prototype.expect = function (ty) {
    if (!this.at(ty)) unsupported('"' + ty + '" 이(가) 필요한 자리에 다른 것이 왔다.');
    return this.next();
  };
  Parser.prototype.expectEOF = function () {
    if (!this.at('EOF')) unsupported('여기서부터 해석할 수 없다: "' + this.line.slice(this.peek().start) + '"');
  };

  Parser.prototype.parseArgs = function () {
    var args = [], kwargs = {};
    if (!this.at(')')) {
      while (true) {
        if (this.at('NAME') && this.peek(1) && this.peek(1).type === '=') {
          var kwname = this.next().value;
          this.next();
          kwargs[kwname] = this.parseExprFull();
        } else {
          args.push(this.parseExprFull());
        }
        if (this.at(',')) { this.next(); if (this.at(')')) break; continue; }
        break;
      }
    }
    this.expect(')');
    return { args: args, kwargs: kwargs };
  };

  Parser.prototype.parseAtom = function () {
    var t = this.peek();
    if (t.type === 'NUM') { this.next(); return { type: 'num', value: t.value, isFloat: !!t.isFloat }; }
    if (t.type === 'STR') { this.next(); return { type: 'str', value: t.value }; }
    if (t.type === 'NAME') {
      if (t.value === 'True') { this.next(); return { type: 'bool', value: true }; }
      if (t.value === 'False') { this.next(); return { type: 'bool', value: false }; }
      if (t.value === 'None') { this.next(); return { type: 'none' }; }
      this.next();
      return { type: 'name', value: t.value };
    }
    if (t.type === '(') {
      this.next();
      if (this.at(')')) { this.next(); return { type: 'tuple', elements: [] }; }
      var first = this.parseExprFull();
      if (this.at(',')) {
        var elems = [first];
        while (this.at(',')) {
          this.next();
          if (this.at(')')) break;
          elems.push(this.parseExprFull());
        }
        this.expect(')');
        return { type: 'tuple', elements: elems };
      }
      this.expect(')');
      return first;
    }
    if (t.type === '[') {
      this.next();
      var els = [];
      if (!this.at(']')) {
        els.push(this.parseExprFull());
        while (this.at(',')) {
          this.next();
          if (this.at(']')) break;
          els.push(this.parseExprFull());
        }
      }
      this.expect(']');
      return { type: 'list', elements: els };
    }
    unsupported('여기서 이해할 수 없는 표현이 나왔다: "' + (t.value !== null && t.value !== undefined ? t.value : t.type) + '"');
  };

  Parser.prototype.parsePostfix = function () {
    var node = this.parseAtom();
    while (true) {
      if (this.at('.')) {
        this.next();
        var nameTok = this.expect('NAME');
        node = { type: 'attr', obj: node, name: nameTok.value };
      } else if (this.at('(')) {
        this.next();
        var ca = this.parseArgs();
        node = { type: 'call', func: node, args: ca.args, kwargs: ca.kwargs };
      } else if (this.at('[')) {
        var lb = this.next();
        var depth = 1, j = this.i;
        while (j < this.t.length && depth > 0) {
          if (this.t[j].type === '[') depth++;
          else if (this.t[j].type === ']') depth--;
          if (depth > 0) j++;
        }
        if (depth !== 0 || !this.t[j] || this.t[j].type !== ']') {
          unsupported('대괄호가 맞지 않는다: [ 를 닫는 ] 를 찾지 못했다.');
        }
        var rb = this.t[j];
        var raw = this.line.slice(lb.end, rb.start);
        this.i = j + 1;
        node = { type: 'index', obj: node, raw: raw };
      } else break;
    }
    return node;
  };

  Parser.prototype.parseUnary = function () {
    if (this.at('-') || this.at('~')) {
      var op = this.next().type;
      var operand = this.parseUnary();
      return { type: 'unary', op: op, operand: operand };
    }
    return this.parsePower();
  };
  Parser.prototype.parsePower = function () {
    var base = this.parsePostfix();
    if (this.at('**')) {
      this.next();
      var exp = this.parseUnary();
      return { type: 'binop', op: '**', left: base, right: exp };
    }
    return base;
  };
  Parser.prototype.parseTerm = function () {
    var left = this.parseUnary();
    while (this.at('*') || this.at('/') || this.at('//') || this.at('%') || this.at('@')) {
      var op = this.next().type;
      left = { type: 'binop', op: op, left: left, right: this.parseUnary() };
    }
    return left;
  };
  Parser.prototype.parseArith = function () {
    var left = this.parseTerm();
    while (this.at('+') || this.at('-')) {
      var op = this.next().type;
      left = { type: 'binop', op: op, left: left, right: this.parseTerm() };
    }
    return left;
  };
  Parser.prototype.parseBitAnd = function () {
    var left = this.parseArith();
    while (this.at('&')) { this.next(); left = { type: 'binop', op: '&', left: left, right: this.parseArith() }; }
    return left;
  };
  Parser.prototype.parseBitXor = function () {
    var left = this.parseBitAnd();
    while (this.at('^')) { this.next(); left = { type: 'binop', op: '^', left: left, right: this.parseBitAnd() }; }
    return left;
  };
  Parser.prototype.parseBitOr = function () {
    var left = this.parseBitXor();
    while (this.at('|')) { this.next(); left = { type: 'binop', op: '|', left: left, right: this.parseBitXor() }; }
    return left;
  };
  Parser.prototype.parseComparison = function () {
    var left = this.parseBitOr();
    while (this.at('>') || this.at('>=') || this.at('<') || this.at('<=') || this.at('==') || this.at('!=')) {
      var op = this.next().type;
      left = { type: 'binop', op: op, left: left, right: this.parseBitOr() };
    }
    return left;
  };
  Parser.prototype.parseExprFull = function () { return this.parseComparison(); };

  function parseLine(line) {
    var tokens = tokenizeLine(line);
    if (tokens.length === 1) return null;
    var p = new Parser(tokens, line);
    if (p.at('NAME') && p.peek(1) && p.peek(1).type === '=') {
      var name = p.next().value;
      p.next();
      var expr = p.parseExprFull();
      p.expectEOF();
      return { type: 'assign', name: name, expr: expr };
    }
    var expr2 = p.parseExprFull();
    p.expectEOF();
    return { type: 'expr', expr: expr2 };
  }

  function evalExprString(str, env) {
    var toks = tokenizeLine(str);
    var p = new Parser(toks, str);
    var node = p.parseExprFull();
    p.expectEOF();
    return evalNode(node, env);
  }

  /* =======================================================================
   * 3. 값 변환 헬퍼
   * ===================================================================== */

  function toNum(v) {
    if (isFloatVal(v)) return v.value;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof ND.ND && v.ndim === 0) return v.toNested();
    unsupported('숫자가 필요한 자리에 숫자가 아닌 값이 왔다');
  }
  function toIntStrict(v) { return Math.trunc(toNum(v)); }
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (v instanceof ND.ND && v.ndim === 0) return !!v.toNested();
    if (isFloatVal(v)) return v.value !== 0;
    if (typeof v === 'number') return v !== 0;
    return !!v;
  }
  function toStr(v) {
    if (typeof v === 'string') return v;
    unsupported('문자열이 필요한 자리에 문자열이 아닌 값이 왔다');
  }
  function toNestedJS(v) {
    if (isListOrTuple(v)) return v.items.map(toNestedJS);
    if (isFloatVal(v)) return v.value;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v;
    if (v instanceof ND.ND) return v.toNested();
    unsupported('리스트 리터럴 안에 배열로 바꿀 수 없는 값이 있다');
  }
  function asNDArg(v) {
    if (v instanceof ND.ND) return v;
    if (isFloatVal(v)) return ND.asND(v.value);
    if (typeof v === 'number' || typeof v === 'boolean') return ND.asND(v);
    if (isListOrTuple(v)) return ND.array(toNestedJS(v));
    unsupported('배열이 필요한 자리에 배열이 아닌 값이 왔다');
  }
  function unwrapForND(v) {
    if (isFloatVal(v)) return v.value;
    if (typeof v === 'boolean' || typeof v === 'number') return v;
    if (isListOrTuple(v)) return ND.array(toNestedJS(v));
    if (v instanceof ND.ND) return v;
    unsupported('배열 연산에 쓸 수 없는 값이다');
  }
  function toShapeFromArgs(args) {
    if (args.length === 1 && isListOrTuple(args[0])) return args[0].items.map(toIntStrict);
    return args.map(toIntStrict);
  }
  function toShape(v) {
    if (isListOrTuple(v)) return v.items.map(toIntStrict);
    return [toIntStrict(v)];
  }
  function normAxis(v) {
    if (v === null || v === undefined) return null;
    if (isListOrTuple(v)) return v.items.map(toIntStrict);
    return toIntStrict(v);
  }
  function toArrList(v) {
    if (isListOrTuple(v)) return v.items.map(asNDArg);
    unsupported('배열의 리스트나 튜플이 필요하다');
  }
  function callReduce(op, self, restArgs, kw) {
    kw = kw || {};
    var axis = (kw.axis !== undefined) ? normAxis(kw.axis) : (restArgs[0] !== undefined ? normAxis(restArgs[0]) : null);
    var opts = { op: op, axis: axis };
    if (kw.keepdims !== undefined) opts.keepdims = toBool(kw.keepdims);
    if (op === 'std' || op === 'var') opts.ddof = (kw.ddof !== undefined) ? toIntStrict(kw.ddof) : 0;
    return ND.reduce(self, opts);
  }

  /* =======================================================================
   * 4. 연산자 평가
   * ===================================================================== */

  function scalarBinOp(op, L, R) {
    var lf = isFloatVal(L), rf = isFloatVal(R);
    var lb = typeof L === 'boolean', rb = typeof R === 'boolean';
    var lv = lf ? L.value : (lb ? (L ? 1 : 0) : L);
    var rv = rf ? R.value : (rb ? (R ? 1 : 0) : R);
    var bothInt = !lf && !rf;
    function wrapNum(x, isInt) { return isInt ? x : mkFloat(x); }
    switch (op) {
      case '+': return wrapNum(lv + rv, bothInt);
      case '-': return wrapNum(lv - rv, bothInt);
      case '*': return wrapNum(lv * rv, bothInt);
      case '/': return mkFloat(lv / rv);
      case '//': return wrapNum(Math.floor(lv / rv), bothInt);
      case '%': return wrapNum(((lv % rv) + rv) % rv, bothInt);
      case '**': { var r = Math.pow(lv, rv); return (bothInt && rv >= 0) ? wrapNum(r, true) : mkFloat(r); }
      case '>': return lv > rv;
      case '>=': return lv >= rv;
      case '<': return lv < rv;
      case '<=': return lv <= rv;
      case '==': return lv === rv;
      case '!=': return lv !== rv;
      case '&': return bothInt ? (lv & rv) : (!!lv && !!rv);
      case '|': return bothInt ? (lv | rv) : (!!lv || !!rv);
      case '^': return bothInt ? (lv ^ rv) : (!!lv !== !!rv);
    }
    unsupported('연산자 ' + op);
  }

  function bitwiseND(boolFn, intFn, a, b) {
    if (a.dtype === 'bool' && b.dtype === 'bool') return boolFn(a, b);
    return ND.binop(a, b, intFn);
  }

  function evalBinOp(op, L, R) {
    if (op === '@') return ND.matmul(asNDArg(L), asNDArg(R));
    var lArr = (L instanceof ND.ND) || isListOrTuple(L);
    var rArr = (R instanceof ND.ND) || isListOrTuple(R);
    if (lArr || rArr) {
      var a = unwrapForND(L), b = unwrapForND(R);
      switch (op) {
        case '+': return ND.ops.add(a, b);
        case '-': return ND.ops.sub(a, b);
        case '*': return ND.ops.mul(a, b);
        case '/': return ND.ops.div(a, b);
        case '//': return ND.ops.floordiv(a, b);
        case '%': return ND.ops.mod(a, b);
        case '**': return ND.binop(a, b, Math.pow);
        case '>': return ND.ops.gt(a, b);
        case '>=': return ND.ops.ge(a, b);
        case '<': return ND.ops.lt(a, b);
        case '<=': return ND.ops.le(a, b);
        case '==': return ND.ops.eq(a, b);
        case '!=': return ND.ops.ne(a, b);
        case '&': return bitwiseND(ND.ops.and, function (x, y) { return x & y; }, a, b);
        case '|': return bitwiseND(ND.ops.or, function (x, y) { return x | y; }, a, b);
        case '^': return bitwiseND(ND.ops.xor, function (x, y) { return x ^ y; }, a, b);
      }
      unsupported('연산자 ' + op);
    }
    return scalarBinOp(op, L, R);
  }

  function evalUnary(op, val) {
    if (val instanceof ND.ND) {
      if (op === '-') return ND.unop(val, function (x) { return -x; }, val.dtype);
      if (op === '~') return val.dtype === 'bool' ? ND.ops.not(val) : ND.unop(val, function (x) { return ~x; }, val.dtype);
    }
    if (op === '-') {
      if (isFloatVal(val)) return mkFloat(-val.value);
      if (typeof val === 'number') return -val;
      if (typeof val === 'boolean') return val ? -1 : 0;
    }
    if (op === '~') {
      if (typeof val === 'number') return ~val;
      if (typeof val === 'boolean') return ~(val ? 1 : 0);
    }
    unsupported('단항 연산자 ' + op + ' 를 이 값에는 쓸 수 없다');
  }

  /* =======================================================================
   * 5. 인덱싱 — 슬라이스 문자열은 ND.parseIndex 로, 그 외(불리언 마스크 ·
   *    팬시 인덱스 · 변수 하나)는 대괄호 안을 다시 파싱해 평가한다.
   * ===================================================================== */

  function evalIndexNode(node, env) {
    var obj = evalNode(node.obj, env);
    if (!(obj instanceof ND.ND)) unsupported('배열이 아닌 값은 인덱싱할 수 없다');
    var trimmed = node.raw.trim();
    if (trimmed === '') unsupported('빈 인덱스는 쓸 수 없다');
    var hasComma = topLevelHasComma(trimmed);
    try {
      var spec = ND.parseIndex(trimmed);
      return obj.index(spec);
    } catch (e1) {
      if (hasComma) throw e1;
      var val;
      try { val = evalExprString(trimmed, env); } catch (e2) { throw e1; }
      if (val instanceof ND.ND) {
        if (val.dtype === 'bool') return ND.maskSelect(obj, val);
        return ND.fancySelect(obj, val);
      }
      if (isFloatVal(val) || typeof val === 'number') {
        return obj.index([{ k: 'i', v: toIntStrict(val) }]);
      }
      throw e1;
    }
  }

  /* =======================================================================
   * 6. np / np.linalg / np.random 네임스페이스 + ND 메서드
   * ===================================================================== */

  var NP_NS = { __ns: 'np' };
  var NP_LINALG = { __ns: 'np.linalg' };
  var NP_RANDOM = { __ns: 'np.random' };

  function npRound(x, decimals) {
    decimals = decimals || 0;
    var m = Math.pow(10, decimals);
    var v = x * m;
    var f = Math.floor(v);
    var diff = v - f;
    var r;
    if (Math.abs(diff - 0.5) < 1e-9) r = (f % 2 === 0) ? f : f + 1;
    else r = Math.round(v);
    return r / m;
  }

  function npSort(a) {
    if (a.ndim <= 1) {
      var vals = a.flatValues().slice().sort(function (x, y) { return x - y; });
      return new ND.ND(vals, a.shape.slice(), null, 0, a.dtype, null);
    }
    var out = a.copy();
    var lastDim = a.shape[a.ndim - 1];
    var outerShape = a.shape.slice(0, -1);
    (function iterate(prefix, dim) {
      if (dim === outerShape.length) {
        var row = [];
        for (var k = 0; k < lastDim; k++) row.push(a.get(prefix.concat([k])));
        row.sort(function (x, y) { return x - y; });
        for (var k2 = 0; k2 < lastDim; k2++) out.set(prefix.concat([k2]), row[k2]);
        return;
      }
      for (var i = 0; i < outerShape[dim]; i++) iterate(prefix.concat([i]), dim + 1);
    })([], 0);
    return out;
  }

  function npArgsort(a) {
    if (a.ndim <= 1) {
      var vals = a.flatValues();
      var idx = vals.map(function (v, i) { return i; });
      idx.sort(function (p, q) { return vals[p] - vals[q]; });
      return new ND.ND(idx, [vals.length], null, 0, 'int64', null);
    }
    var out = ND.zeros(a.shape, 'int64');
    var lastDim = a.shape[a.ndim - 1];
    var outerShape = a.shape.slice(0, -1);
    (function iterate(prefix, dim) {
      if (dim === outerShape.length) {
        var row = [];
        for (var k = 0; k < lastDim; k++) row.push(a.get(prefix.concat([k])));
        var idx = row.map(function (v, i) { return i; });
        idx.sort(function (p, q) { return row[p] - row[q]; });
        for (var k2 = 0; k2 < lastDim; k2++) out.set(prefix.concat([k2]), idx[k2]);
        return;
      }
      for (var i = 0; i < outerShape[dim]; i++) iterate(prefix.concat([i]), dim + 1);
    })([], 0);
    return out;
  }

  function npUnique(a) {
    var vals = a.flatValues().slice().sort(function (x, y) { return x - y; });
    var out = [];
    for (var i = 0; i < vals.length; i++) if (i === 0 || vals[i] !== vals[i - 1]) out.push(vals[i]);
    return new ND.ND(out, [out.length], null, 0, a.dtype, null);
  }

  function whereMultiIdx(mask) {
    var hits = mask.indices().filter(function (ix) { return !!mask.get(ix); });
    var arrs = [];
    for (var d = 0; d < mask.ndim; d++) {
      var vals = hits.map(function (ix) { return ix[d]; });
      arrs.push(new ND.ND(vals, [vals.length], null, 0, 'int64', null));
    }
    return arrs;
  }

  function mathUnaryFn(jsFn) {
    return function (pos) {
      var x = pos[0];
      if (x instanceof ND.ND) return ND.unop(x, jsFn);
      return mkFloat(jsFn(toNum(x)));
    };
  }

  var NP_FUNCS = {};
  NP_FUNCS.array = function (pos, kw) {
    var nested = toNestedJS(pos[0]);
    var dtype = kw.dtype !== undefined ? toStr(kw.dtype) : (pos[1] !== undefined ? toStr(pos[1]) : undefined);
    return ND.array(nested, dtype);
  };
  NP_FUNCS.arange = function (pos, kw) {
    var dtype = kw.dtype !== undefined ? toStr(kw.dtype) : undefined;
    if (pos.length <= 1) return ND.arange(toNum(pos[0]), undefined, undefined, dtype);
    if (pos.length === 2) return ND.arange(toNum(pos[0]), toNum(pos[1]), undefined, dtype);
    return ND.arange(toNum(pos[0]), toNum(pos[1]), toNum(pos[2]), dtype);
  };
  NP_FUNCS.linspace = function (pos, kw) {
    var num = kw.num !== undefined ? toIntStrict(kw.num) : (pos[2] !== undefined ? toIntStrict(pos[2]) : 50);
    var endpoint = kw.endpoint !== undefined ? toBool(kw.endpoint) : true;
    return ND.linspace(toNum(pos[0]), toNum(pos[1]), num, endpoint);
  };
  NP_FUNCS.zeros = function (pos, kw) { return ND.zeros(toShape(pos[0]), kw.dtype !== undefined ? toStr(kw.dtype) : (pos[1] !== undefined ? toStr(pos[1]) : undefined)); };
  NP_FUNCS.ones = function (pos, kw) { return ND.ones(toShape(pos[0]), kw.dtype !== undefined ? toStr(kw.dtype) : (pos[1] !== undefined ? toStr(pos[1]) : undefined)); };
  NP_FUNCS.full = function (pos, kw) { return ND.full(toShape(pos[0]), toNum(pos[1]), kw.dtype !== undefined ? toStr(kw.dtype) : undefined); };
  NP_FUNCS.empty = function (pos, kw) { return ND.empty(toShape(pos[0]), kw.dtype !== undefined ? toStr(kw.dtype) : (pos[1] !== undefined ? toStr(pos[1]) : undefined)); };
  NP_FUNCS.eye = function (pos, kw) {
    var Nn = toIntStrict(pos[0]);
    var M = pos[1] !== undefined ? toIntStrict(pos[1]) : (kw.M !== undefined ? toIntStrict(kw.M) : undefined);
    var k = kw.k !== undefined ? toIntStrict(kw.k) : (pos[2] !== undefined ? toIntStrict(pos[2]) : 0);
    var dtype = kw.dtype !== undefined ? toStr(kw.dtype) : undefined;
    return ND.eye(Nn, M, k, dtype);
  };
  NP_FUNCS.identity = function (pos, kw) { return ND.identity(toIntStrict(pos[0]), kw.dtype !== undefined ? toStr(kw.dtype) : undefined); };
  NP_FUNCS.diag = function (pos, kw) {
    var k = kw.k !== undefined ? toIntStrict(kw.k) : (pos[1] !== undefined ? toIntStrict(pos[1]) : 0);
    return ND.diag(asNDArg(pos[0]), k);
  };
  NP_FUNCS.reshape = function (pos) { return asNDArg(pos[0]).reshape(toShapeFromArgs(pos.slice(1))); };
  NP_FUNCS.sum = function (pos, kw) { return callReduce('sum', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.mean = function (pos, kw) { return callReduce('mean', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.std = function (pos, kw) { return callReduce('std', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.var = function (pos, kw) { return callReduce('var', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.min = function (pos, kw) { return callReduce('min', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.max = function (pos, kw) { return callReduce('max', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.argmin = function (pos, kw) { return callReduce('argmin', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.argmax = function (pos, kw) { return callReduce('argmax', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.median = function (pos, kw) { return callReduce('median', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.all = function (pos, kw) { return callReduce('all', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.any = function (pos, kw) { return callReduce('any', asNDArg(pos[0]), pos.slice(1), kw); };
  NP_FUNCS.percentile = function (pos, kw) {
    var a = asNDArg(pos[0]);
    var q = kw.q !== undefined ? toNum(kw.q) : toNum(pos[1]);
    var axis = kw.axis !== undefined ? normAxis(kw.axis) : (pos[2] !== undefined ? normAxis(pos[2]) : null);
    return ND.percentile(a, q, axis);
  };
  NP_FUNCS.sqrt = mathUnaryFn(Math.sqrt);
  NP_FUNCS.exp = mathUnaryFn(Math.exp);
  NP_FUNCS.log = mathUnaryFn(Math.log);
  NP_FUNCS.sin = mathUnaryFn(Math.sin);
  NP_FUNCS.cos = mathUnaryFn(Math.cos);
  NP_FUNCS.tan = mathUnaryFn(Math.tan);
  NP_FUNCS.deg2rad = mathUnaryFn(function (x) { return x * Math.PI / 180; });
  NP_FUNCS.rad2deg = mathUnaryFn(function (x) { return x * 180 / Math.PI; });
  NP_FUNCS.floor = function (pos) {
    var x = pos[0];
    if (x instanceof ND.ND) return ND.unop(x, Math.floor, ND.isIntDtype(x.dtype) ? x.dtype : undefined);
    return mkFloat(Math.floor(toNum(x)));
  };
  NP_FUNCS.ceil = function (pos) {
    var x = pos[0];
    if (x instanceof ND.ND) return ND.unop(x, Math.ceil, ND.isIntDtype(x.dtype) ? x.dtype : undefined);
    return mkFloat(Math.ceil(toNum(x)));
  };
  NP_FUNCS.abs = function (pos) {
    var x = pos[0];
    if (x instanceof ND.ND) return ND.unop(x, Math.abs, ND.isIntDtype(x.dtype) ? x.dtype : undefined);
    return isFloatVal(x) ? mkFloat(Math.abs(x.value)) : Math.abs(toNum(x));
  };
  NP_FUNCS.round = function (pos, kw) {
    var decimals = kw.decimals !== undefined ? toIntStrict(kw.decimals) : (pos[1] !== undefined ? toIntStrict(pos[1]) : 0);
    var x = pos[0];
    if (x instanceof ND.ND) return ND.unop(x, function (v) { return npRound(v, decimals); }, ND.isIntDtype(x.dtype) ? x.dtype : undefined);
    return mkFloat(npRound(toNum(x), decimals));
  };
  NP_FUNCS.power = function (pos) {
    var a = pos[0], b = pos[1];
    if (a instanceof ND.ND || b instanceof ND.ND || isListOrTuple(a) || isListOrTuple(b)) return ND.binop(unwrapForND(a), unwrapForND(b), Math.pow);
    return scalarBinOp('**', a, b);
  };
  NP_FUNCS.dot = function (pos) { return ND.dot(asNDArg(pos[0]), asNDArg(pos[1])); };
  NP_FUNCS.matmul = function (pos) { return ND.matmul(asNDArg(pos[0]), asNDArg(pos[1])); };
  NP_FUNCS.transpose = function (pos) {
    var a = asNDArg(pos[0]), rest = pos.slice(1);
    return rest.length ? a.transpose(toShapeFromArgs(rest)) : a.transpose();
  };
  NP_FUNCS.concatenate = function (pos, kw) {
    var axis = kw.axis !== undefined ? toIntStrict(kw.axis) : (pos[1] !== undefined ? toIntStrict(pos[1]) : 0);
    return ND.concatenate(toArrList(pos[0]), axis);
  };
  NP_FUNCS.vstack = function (pos) { return ND.vstack(toArrList(pos[0])); };
  NP_FUNCS.hstack = function (pos) { return ND.hstack(toArrList(pos[0])); };
  NP_FUNCS.stack = function (pos, kw) {
    var axis = kw.axis !== undefined ? toIntStrict(kw.axis) : (pos[1] !== undefined ? toIntStrict(pos[1]) : 0);
    return ND.stack(toArrList(pos[0]), axis);
  };
  NP_FUNCS.where = function (pos) {
    if (pos.length === 1) return PyTuple(whereMultiIdx(asNDArg(pos[0])));
    return ND.where(asNDArg(pos[0]), unwrapForND(pos[1]), unwrapForND(pos[2]));
  };
  NP_FUNCS.isnan = function (pos) {
    var x = pos[0];
    if (x instanceof ND.ND) return ND.unop(x, function (v) { return isNaN(v); }, 'bool');
    return isNaN(toNum(x));
  };
  NP_FUNCS.isfinite = function (pos) {
    var x = pos[0];
    if (x instanceof ND.ND) return ND.unop(x, function (v) { return isFinite(v); }, 'bool');
    return isFinite(toNum(x));
  };
  NP_FUNCS.unravel_index = function (pos) {
    var flat = toIntStrict(pos[0]), shape = toShape(pos[1]);
    var idx = new Array(shape.length), f = flat;
    for (var i = shape.length - 1; i >= 0; i--) { idx[i] = f % shape[i]; f = Math.floor(f / shape[i]); }
    return PyTuple(idx);
  };
  NP_FUNCS.shares_memory = function (pos) { return ND.sharesMemory(asNDArg(pos[0]), asNDArg(pos[1])); };
  NP_FUNCS.broadcast_to = function (pos) { return ND.broadcastTo(asNDArg(pos[0]), toShape(pos[1])); };
  NP_FUNCS.cumsum = function (pos) { return ND.cumsum(asNDArg(pos[0])); };
  NP_FUNCS.clip = function (pos, kw) {
    var a = asNDArg(pos[0]);
    var lo = pos[1] !== undefined ? pos[1] : kw.a_min;
    var hi = pos[2] !== undefined ? pos[2] : kw.a_max;
    var loN = (lo === undefined || lo === null) ? null : toNum(lo);
    var hiN = (hi === undefined || hi === null) ? null : toNum(hi);
    return ND.unop(a, function (v) {
      var r = v;
      if (loN !== null && r < loN) r = loN;
      if (hiN !== null && r > hiN) r = hiN;
      return r;
    }, a.dtype);
  };
  NP_FUNCS.sort = function (pos) { return npSort(asNDArg(pos[0])); };
  NP_FUNCS.argsort = function (pos) { return npArgsort(asNDArg(pos[0])); };
  NP_FUNCS.unique = function (pos) { return npUnique(asNDArg(pos[0])); };

  var NP_LINALG_FUNCS = {
    norm: function (pos) { return mkFloat(ND.norm(asNDArg(pos[0]))); },
    solve: function (pos) { return ND.solve(asNDArg(pos[0]), asNDArg(pos[1])); },
    inv: function (pos) { return ND.inv(asNDArg(pos[0])); },
    det: function (pos) { return mkFloat(ND.det(asNDArg(pos[0]))); }
  };

  function randShape(sizeArg) { return sizeArg !== undefined ? toShape(sizeArg) : []; }
  var NP_RANDOM_FUNCS = {
    seed: function () { return null; },
    rand: function (pos) {
      var shape = pos.map(toIntStrict);
      var nTotal = shape.length ? ND.prod(shape) : 1;
      var vals = new Array(nTotal);
      for (var i = 0; i < nTotal; i++) vals[i] = Math.random();
      return shape.length ? new ND.ND(vals, shape, null, 0, 'float64', null) : mkFloat(vals[0]);
    },
    randint: function (pos, kw) {
      var lo, hi, sizeArg;
      if (pos.length >= 2) { lo = toIntStrict(pos[0]); hi = toIntStrict(pos[1]); sizeArg = pos[2] !== undefined ? pos[2] : kw.size; }
      else { lo = 0; hi = toIntStrict(pos[0]); sizeArg = pos[1] !== undefined ? pos[1] : kw.size; }
      var shape = randShape(sizeArg);
      var nTotal = shape.length ? ND.prod(shape) : 1;
      var vals = new Array(nTotal);
      for (var i = 0; i < nTotal; i++) vals[i] = lo + Math.floor(Math.random() * (hi - lo));
      return shape.length ? new ND.ND(vals, shape, null, 0, 'int64', null) : vals[0];
    },
    uniform: function (pos, kw) {
      var lo = pos[0] !== undefined ? toNum(pos[0]) : 0, hi = pos[1] !== undefined ? toNum(pos[1]) : 1;
      var shape = randShape(pos[2] !== undefined ? pos[2] : kw.size);
      var nTotal = shape.length ? ND.prod(shape) : 1;
      var vals = new Array(nTotal);
      for (var i = 0; i < nTotal; i++) vals[i] = lo + Math.random() * (hi - lo);
      return shape.length ? new ND.ND(vals, shape, null, 0, 'float64', null) : mkFloat(vals[0]);
    },
    normal: function (pos, kw) {
      var mu = pos[0] !== undefined ? toNum(pos[0]) : 0, sigma = pos[1] !== undefined ? toNum(pos[1]) : 1;
      var shape = randShape(pos[2] !== undefined ? pos[2] : kw.size);
      var nTotal = shape.length ? ND.prod(shape) : 1;
      var vals = new Array(nTotal);
      for (var i = 0; i < nTotal; i++) {
        var u1 = Math.random() || 1e-9, u2 = Math.random();
        vals[i] = mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
      return shape.length ? new ND.ND(vals, shape, null, 0, 'float64', null) : mkFloat(vals[0]);
    }
  };

  var ND_METHODS = {
    reshape: function (self, pos) { return self.reshape(toShapeFromArgs(pos)); },
    ravel: function (self) { return self.ravel(); },
    flatten: function (self) { return self.flatten(); },
    copy: function (self) { return self.copy(); },
    astype: function (self, pos) { return self.astype(toStr(pos[0])); },
    transpose: function (self, pos) { return pos.length ? self.transpose(toShapeFromArgs(pos)) : self.transpose(); },
    swapaxes: function (self, pos) { return self.swapaxes(toIntStrict(pos[0]), toIntStrict(pos[1])); },
    sum: function (self, pos, kw) { return callReduce('sum', self, pos, kw); },
    mean: function (self, pos, kw) { return callReduce('mean', self, pos, kw); },
    std: function (self, pos, kw) { return callReduce('std', self, pos, kw); },
    var: function (self, pos, kw) { return callReduce('var', self, pos, kw); },
    min: function (self, pos, kw) { return callReduce('min', self, pos, kw); },
    max: function (self, pos, kw) { return callReduce('max', self, pos, kw); },
    argmin: function (self, pos, kw) { return callReduce('argmin', self, pos, kw); },
    argmax: function (self, pos, kw) { return callReduce('argmax', self, pos, kw); },
    median: function (self, pos, kw) { return callReduce('median', self, pos, kw); },
    all: function (self, pos, kw) { return callReduce('all', self, pos, kw); },
    any: function (self, pos, kw) { return callReduce('any', self, pos, kw); },
    cumsum: function (self) { return ND.cumsum(self); },
    dot: function (self, pos) { return ND.dot(self, asNDArg(pos[0])); }
  };

  function evalAttr(obj, name) {
    if (obj && obj.__ns === 'np') {
      if (name === 'linalg') return NP_LINALG;
      if (name === 'random') return NP_RANDOM;
      if (name === 'nan') return mkFloat(NaN);
      if (name === 'inf') return mkFloat(Infinity);
      if (name === 'pi') return mkFloat(Math.PI);
      if (name === 'e') return mkFloat(Math.E);
      if (Object.prototype.hasOwnProperty.call(NP_FUNCS, name)) return makeCallable(NP_FUNCS[name], 'np.' + name);
      unsupported('np.' + name + ' 은(는) 지원하지 않는다');
    }
    if (obj && obj.__ns === 'np.linalg') {
      if (Object.prototype.hasOwnProperty.call(NP_LINALG_FUNCS, name)) return makeCallable(NP_LINALG_FUNCS[name], 'np.linalg.' + name);
      unsupported('np.linalg.' + name + ' 은(는) 지원하지 않는다');
    }
    if (obj && obj.__ns === 'np.random') {
      if (Object.prototype.hasOwnProperty.call(NP_RANDOM_FUNCS, name)) return makeCallable(NP_RANDOM_FUNCS[name], 'np.random.' + name);
      unsupported('np.random.' + name + ' 은(는) 지원하지 않는다');
    }
    if (obj instanceof ND.ND) {
      if (name === 'shape') return PyTuple(obj.shape);
      if (name === 'strides') return PyTuple(obj.strides);
      if (name === 'ndim') return obj.ndim;
      if (name === 'size') return obj.size;
      if (name === 'nbytes') return obj.nbytes;
      if (name === 'itemsize') return obj.itemsize;
      if (name === 'dtype') return mkDtype(obj.dtype);
      if (name === 'T') return obj.T;
      if (name === 'base') return obj.base === null ? null : obj.base;
      if (Object.prototype.hasOwnProperty.call(ND_METHODS, name)) {
        return makeCallable(function (pos, kw) { return ND_METHODS[name](obj, pos, kw); }, name);
      }
      unsupported('배열의 .' + name + ' 은(는) 지원하지 않는다');
    }
    unsupported('.' + name + ' 을(를) 쓸 수 있는 값이 아니다');
  }

  /* =======================================================================
   * 7. AST 평가기
   * ===================================================================== */

  function evalNode(node, env) {
    switch (node.type) {
      case 'num': return node.isFloat ? mkFloat(node.value) : node.value;
      case 'str': return node.value;
      case 'bool': return node.value;
      case 'none': return null;
      case 'name':
        if (Object.prototype.hasOwnProperty.call(env, node.value)) return env[node.value];
        nameError(node.value);
        return;
      case 'list': return PyList(node.elements.map(function (e) { return evalNode(e, env); }));
      case 'tuple': return PyTuple(node.elements.map(function (e) { return evalNode(e, env); }));
      case 'unary': return evalUnary(node.op, evalNode(node.operand, env));
      case 'binop': return evalBinOp(node.op, evalNode(node.left, env), evalNode(node.right, env));
      case 'attr': return evalAttr(evalNode(node.obj, env), node.name);
      case 'call': {
        var callee = evalNode(node.func, env);
        var argVals = node.args.map(function (a) { return evalNode(a, env); });
        var kwVals = {};
        for (var k in node.kwargs) kwVals[k] = evalNode(node.kwargs[k], env);
        if (callee && typeof callee.__call === 'function') return callee.__call(argVals, kwVals);
        unsupported('호출할 수 없는 값이다');
        return;
      }
      case 'index': return evalIndexNode(node, env);
      default: unsupported('알 수 없는 구문');
    }
  }

  /* =======================================================================
   * 8. 셀 실행 — 여러 줄을 순서대로 실행하고, 마지막 줄이 대입이 아닌
   *    표현식이면 그 값을 "Out" 으로 보여준다(주피터 셀과 같다).
   * ===================================================================== */

  function makeBaseEnv(outputBox, DATA) {
    var env = {};
    env.np = NP_NS;
    env.print = makeCallable(function (pos) {
      outputBox.list.push(pos.map(pyStr).join(' '));
      return null;
    }, 'print');
    env.a = ND.arange(12).reshape([3, 4]);
    env.b = ND.arange(1, 13).reshape([3, 4]);
    env.v = ND.array([1, 2, 3]);
    env.w = ND.array([4, 5, 6]);
    env.m = ND.arange(1, 7).reshape([2, 3]);
    env.n = ND.arange(7, 13).reshape([3, 2]);
    env.t = ND.arange(24).reshape([2, 3, 4]);
    env.data = DATA;
    return env;
  }

  function runOneExecution(code, env, outputBox) {
    outputBox.list = [];
    try {
      var lines = code.replace(/\r\n/g, '\n').split('\n');
      var lastVal, lastWasAssign = false, had = false;
      for (var i = 0; i < lines.length; i++) {
        var line = stripComment(lines[i]);
        if (!line.trim()) continue;
        had = true;
        var stmt = parseLine(line);
        if (!stmt) continue;
        if (stmt.type === 'assign') {
          var val = evalNode(stmt.expr, env);
          env[stmt.name] = val;
          lastWasAssign = true; lastVal = undefined;
        } else {
          lastVal = evalNode(stmt.expr, env);
          lastWasAssign = false;
        }
      }
      var hasResult = had && !lastWasAssign && lastVal !== null && lastVal !== undefined;
      return { ok: true, prints: outputBox.list.slice(), hasResult: hasResult, lastVal: lastVal };
    } catch (e) {
      return { ok: false, message: (e && e.message) || String(e), pyType: e && e.pyType, unsupported: !!(e && e.unsupported) };
    }
  }

  var SUPPORTED_HTML =
    '<b>이름</b>: a, b, v, w, m, n, t, data (아래 표 참고) · <code>np</code> · <code>print(...)</code><br>' +
    '<b>리터럴</b>: 정수·실수·음수, 문자열(<code>\'..\'</code>), <code>True</code> <code>False</code> <code>None</code>, ' +
    '리스트 <code>[1,2,3]</code>, 튜플 <code>(2,3)</code><br>' +
    '<b>인덱싱</b>: <code>a[1:3, ::2]</code>, <code>a[0]</code>, <code>a[:, None]</code>, <code>a[a&gt;5]</code><br>' +
    '<b>속성</b>: <code>.shape .ndim .size .dtype .nbytes .itemsize .T .strides .base</code><br>' +
    '<b>메서드</b>: <code>.reshape() .ravel() .flatten() .copy() .astype() .transpose() .swapaxes()</code>, ' +
    '<code>.sum() .mean() .std() .var() .min() .max() .argmin() .argmax() .median() .all() .any() .cumsum() .dot()</code>' +
    '(axis=, keepdims=, ddof= 지원)<br>' +
    '<b>np 함수</b>: array arange linspace zeros ones full empty eye identity diag reshape sum mean std var ' +
    'min max argmin argmax median percentile all any sqrt exp log abs round floor ceil sin cos tan deg2rad rad2deg ' +
    'power dot matmul transpose concatenate vstack hstack stack where isnan isfinite unravel_index shares_memory ' +
    'broadcast_to cumsum clip sort argsort unique, np.linalg.{norm,solve,inv,det}, np.random.{seed,rand,randint,uniform,normal}, ' +
    'np.nan np.inf np.pi np.e<br>' +
    '<b>연산자</b>: <code>+ - * / // % ** @ &gt; &gt;= &lt; &lt;= == != &amp; | ^</code> 그리고 단항 <code>- ~</code><br>' +
    '<b>대입</b>: <code>c = a + b</code> 한 줄 (이후 c 를 계속 쓸 수 있다)';

  function buildResultDom(res) {
    var box = el('div');
    if (!res.ok) {
      box.appendChild(UI.errBlock(res.message, res.pyType || undefined));
      if (res.unsupported) box.appendChild(UI.callout('tip', SUPPORTED_HTML, '지원하는 문법 목록'));
      return box;
    }
    res.prints.forEach(function (p) { box.appendChild(UI.out(p, { label: 'print 출력' })); });
    if (res.hasResult) {
      var v = res.lastVal;
      if (v instanceof ND.ND) {
        box.appendChild(UI.shapeBadge(v));
        box.appendChild(UI.out(ND.format(v, { mode: 'repr' }), { label: 'Out' }));
        if (v.size <= 200 && v.ndim <= 3) {
          box.appendChild(UI.grid(v, { axisLabels: true, highlight: function () { return 'r'; } }));
        }
      } else {
        box.appendChild(UI.out(pyRepr(v), { label: 'Out' }));
      }
    } else if (!res.prints.length) {
      box.appendChild(UI.out('(출력 없음)', { label: false }));
    }
    return box;
  }

  function executeAndRender(code, env, outputBox) {
    var res = runOneExecution(code, env, outputBox);
    return el('div', { style: { borderTop: '1px solid var(--border)', paddingTop: '.9rem', marginTop: '.9rem' } },
      [UI.code(code), buildResultDom(res)]);
  }

  /* =======================================================================
   * 9. Pyodide 연동 (탭 2)
   * ===================================================================== */

  var PYODIDE_SRC = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';

  function buildPyPrelude(dataFlatArr) {
    return [
      'import numpy as np',
      'data = np.array([' + dataFlatArr.join(',') + ']).reshape(60, 40)',
      'a = np.arange(12).reshape(3, 4)',
      'b = np.arange(1, 13).reshape(3, 4)',
      'v = np.array([1, 2, 3])',
      'w = np.array([4, 5, 6])',
      'm = np.arange(1, 7).reshape(2, 3)',
      'n = np.arange(7, 13).reshape(3, 2)',
      't = np.arange(24).reshape(2, 3, 4)',
      ''
    ].join('\n');
  }

  function runPyCode(pyodide, code) {
    var lines = code.replace(/\r\n/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    var last = lines.length ? lines[lines.length - 1] : '';
    var rest = lines.slice(0, -1).join('\n');
    var wrapped = [
      'import sys, io, json',
      '_buf = io.StringIO()',
      '_old_stdout = sys.stdout',
      'sys.stdout = _buf',
      '_err = None',
      'try:',
      '    _rest_src = ' + JSON.stringify(rest),
      '    _last_src = ' + JSON.stringify(last),
      '    if _rest_src.strip():',
      '        exec(compile(_rest_src, "<cell>", "exec"))',
      '    if _last_src.strip():',
      '        exec(compile(_last_src, "<cell-last>", "single"))',
      'except Exception as e:',
      '    _err = type(e).__name__ + ": " + str(e)',
      'finally:',
      '    sys.stdout = _old_stdout',
      'json.dumps({"out": _buf.getvalue(), "err": _err})'
    ].join('\n');
    var resultStr = pyodide.runPython(wrapped);
    return JSON.parse(resultStr);
  }

  /* =======================================================================
   * 10. 예제 칩
   * ===================================================================== */

  var EXAMPLES = [
    'a.shape', 'a.ndim', 'a.dtype', 'a.sum(axis=1)', 'a.sum(axis=0)',
    'a[1:3, ::2]', 'a[0]', 'a[:, None].shape',
    'v @ w', 'm @ n', 'a.T.strides',
    'np.shares_memory(a, a[0:2])', 'a.reshape(2,6)', 'a.flatten()',
    'np.eye(3,5,k=2)', 'np.broadcast_to(v, (4,3)).strides',
    'data.shape', 'data.mean(axis=1)[:5]', 'data.argmax(axis=1)[:12]', 'data.std()',
    'np.linalg.solve(np.array([[2,2,1],[2,-1,2],[1,-1,2]]), np.array([9,6,5]))',
    'np.round(np.array([0.5, 1.5, 2.5]))',
    'np.array([1, np.nan]).sum()', 'np.nan == np.nan',
    'a[a>5]', 'np.sort(np.array([3,1,2]))', 'np.unique(np.array([1,1,2,3,3]))',
    'np.clip(a, 2, 8)', 'np.where(a > 5, 1, 0)',
    'c = a + b', 't.shape', 't[0]'
  ];

  /* =======================================================================
   * 11. render
   * ===================================================================== */

  function render(root) {
    var hasRealData = !!(D && D.inflammation);
    var DATA1 = hasRealData ? D.nd('inflammation') : ND.arange(2400).reshape([60, 40]);
    var DATA2 = hasRealData ? D.nd('inflammation') : ND.arange(2400).reshape([60, 40]);

    root.appendChild(el('p', {
      class: 'lede', html:
        '이 장은 <b>직접 코드를 써서 돌려 보는</b> 실습실이다. 탭 1 은 브라우저 안 미니 엔진 위에서 도는 ' +
        '제한된 파이썬 표현식 평가기 — 인터넷 없이 항상 동작한다. 탭 2 는 버튼을 눌렀을 때만 CDN 에서 ' +
        '<b>Pyodide</b> 를 불러와 진짜 NumPy 를 돌린다. 두 결과를 맞대어 보면서 이 앱이 근사한 부분과 ' +
        '진짜 NumPy 가 어떻게 다른지 확인해 보자.'
    }));

    /* ---------------------------------------------------------- 11.1 */

    root.appendChild(el('h2', { class: 'h-sec', text: '11.1 미니 엔진 표현식 평가기' }));
    root.appendChild(el('p', {
      html:
        '아래 이름들이 미리 정의되어 있다. 표의 shape·dtype 은 하드코딩이 아니라 지금 이 배열들을 ' +
        '실제로 만들어서 <code>ND</code> 엔진으로 읽은 값이다.'
    }));

    if (!hasRealData) {
      root.appendChild(UI.callout('ver',
        '관절염 데이터(<code>data.js</code>)를 아직 불러오지 못했다 — <code>node webapp/build.js</code> 를 ' +
        '실행하지 않았을 때만 벌어진다. 지금은 대신 0~2399 를 60×40 으로 채운 배열을 <code>data</code> 로 쓴다.'));
    }

    var defRows = [
      { name: 'a', def: 'np.arange(12).reshape(3,4)', arr: ND.arange(12).reshape([3, 4]) },
      { name: 'b', def: 'np.arange(1,13).reshape(3,4)', arr: ND.arange(1, 13).reshape([3, 4]) },
      { name: 'v', def: 'np.array([1,2,3])', arr: ND.array([1, 2, 3]) },
      { name: 'w', def: 'np.array([4,5,6])', arr: ND.array([4, 5, 6]) },
      { name: 'm', def: 'np.arange(1,7).reshape(2,3)', arr: ND.arange(1, 7).reshape([2, 3]) },
      { name: 'n', def: 'np.arange(7,13).reshape(3,2)', arr: ND.arange(7, 13).reshape([3, 2]) },
      { name: 't', def: 'np.arange(24).reshape(2,3,4)', arr: ND.arange(24).reshape([2, 3, 4]) },
      { name: 'data', def: '관절염 환자 60명 × 40일 염증 수치', arr: DATA1 }
    ];
    root.appendChild(UI.table(
      [{ k: 'name', label: '이름' }, { k: 'def', label: '정의' }, { k: 'shape', label: 'shape' }, { k: 'dtype', label: 'dtype' }],
      defRows.map(function (r) {
        return { name: r.name, def: r.def, shape: ND.shapeStr(r.arr.shape), dtype: r.arr.dtype };
      })
    ));

    root.appendChild(UI.callout('ver',
      '이 평가기는 미니 엔진 위에서 돌기 때문에 <b>실제 NumPy 와 다르게 나오는 것이 몇 가지</b> 있다. ' +
      '아래 결과를 진짜 NumPy 값으로 그대로 외우지 마라.' +
      '<ul style="margin:.4rem 0 0 1.1rem;padding:0">' +
      '<li><code>.strides</code> — 이 엔진은 보기 쉽게 <b>원소 단위</b>로 보여 준다. ' +
      '실제 NumPy 는 <b>바이트 단위</b>이고, <code>바이트 보폭 = 원소 보폭 × itemsize</code> 다. ' +
      'itemsize 는 dtype 에 따라 달라지므로 같은 코드라도 환경에 따라 숫자가 다르게 나온다. ' +
      '<code>a.T.strides</code> 를 예로 들면 세 값이 모두 같은 것을 뜻한다:' +
      '<br>· 이 실습실(원소 단위) → <code>(1, 4)</code>' +
      '<br>· 아래 탭 2 의 Pyodide → <code>(4, 16)</code> ' +
      '<span class="muted">(WASM 은 32비트라 기본 정수가 int32, itemsize 4)</span>' +
      '<br>· 보통의 64비트 데스크톱 NumPy → <code>(8, 32)</code> ' +
      '<span class="muted">(기본 정수가 int64, itemsize 8)</span>' +
      '<br>보폭의 <i>비율</i>과 “0 이면 늘어난 축”이라는 뜻은 세 경우 모두 똑같다. ' +
      '외울 것은 숫자가 아니라 이 구조다.</li>' +
      '<li><code>dtype</code> — 이 엔진과 64비트 데스크톱 NumPy 는 정수 기본형이 <code>int64</code> 지만, ' +
      '탭 2 의 Pyodide 는 <code>int32</code> 다. <code>a.dtype</code> 을 양쪽에서 돌려 직접 확인해 보라.</li>' +
      '<li><code>np.random.*</code> — 난수 알고리즘이 달라 <code>seed</code> 를 줘도 NumPy 와 같은 수열이 나오지 않는다.</li>' +
      '<li><code>np.empty</code> — 초기화하지 않은 메모리를 흉내 낸 것이라 값이 실제와 다르다(원래 예측 불가한 것이 요점이다).</li>' +
      '<li>아주 큰 정수와 실수의 마지막 자리 — JS 수 표현의 한계로 어긋날 수 있다.</li>' +
      '<li>리스트끼리의 <code>+</code> — 파이썬은 이어붙이지만 이 평가기는 원소별 덧셈으로 처리한다.</li>' +
      '</ul>' +
      '아래 탭 2 에서 같은 코드를 <b>진짜 NumPy</b> 로 돌려 직접 맞대어 볼 수 있다.',
      '이 실습실이 실제 NumPy 와 다른 점'));

    var outputBox = { list: [] };
    var env = makeBaseEnv(outputBox, DATA1);

    var historyHost = el('div');
    var ta = el('textarea', { class: 'code', rows: 6, spellcheck: 'false' });
    ta.value = 'a.shape';
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doRun(); }
    });

    function doRun() {
      var code = ta.value;
      if (!code || !code.trim()) return;
      historyHost.insertBefore(executeAndRender(code, env, outputBox), historyHost.firstChild);
    }
    function resetEnv() {
      for (var k in env) delete env[k];
      var fresh = makeBaseEnv(outputBox, DATA1);
      for (var k2 in fresh) env[k2] = fresh[k2];
      historyHost.insertBefore(el('p', { class: 'small muted', text: '— 환경을 초기화했다: a~t, data 를 다시 정의했다 —' }), historyHost.firstChild);
    }

    var chipHost = UI.chips(EXAMPLES, function (code) { ta.value = code; doRun(); });

    root.appendChild(UI.card({
      kicker: '시뮬레이터',
      title: '표현식 평가기 — 코드를 써서 바로 돌려 보자',
      note: '주피터 셀처럼 여러 줄을 쓸 수 있다. 마지막 줄이 대입이 아닌 표현식이면 그 값이 <b>Out</b> 으로 ' +
        '표시된다. <code>c = a + b</code> 처럼 대입을 하면 이후 실행에서도 <code>c</code> 를 계속 쓸 수 있다 — ' +
        '주피터 노트북과 같다. <b>Ctrl+Enter</b> 로도 실행된다.',
      body: [
        ta,
        UI.controls([UI.btn('실행 (Ctrl+Enter)', doRun, { primary: true }), UI.btn('환경 초기화', resetEnv)]),
        chipHost,
        historyHost
      ]
    }));

    /* ---------------------------------------------------------- 11.2 */

    root.appendChild(el('h2', { class: 'h-sec', text: '11.2 진짜 NumPy 실행 (Pyodide)' }));
    root.appendChild(el('p', {
      html:
        '<b>Pyodide</b> 는 파이썬 인터프리터를 웹어셈블리(WebAssembly)로 컴파일해 브라우저 안에서 돌리는 ' +
        '프로젝트다. 버튼을 누르면 <b>그때 처음</b> CDN 에서 내려받는다(20MB 이상, 처음 한 번만 20~40초). ' +
        '자동으로 불러오지 않는 이유는 그만큼 무겁기 때문이다.'
    }));

    var pyodideState = { pyodide: null };
    var pyStatusHost = el('div');
    var pyBodyHost = el('div');
    var loadBtn;

    function setSteps(descs, states) {
      UI.clear(pyStatusHost);
      pyStatusHost.appendChild(UI.steps(descs.map(function (d, i) { return { html: d, state: states[i] }; })));
    }

    function showFail(msg) {
      UI.clear(pyBodyHost);
      pyBodyHost.appendChild(UI.errBlock(msg, 'ConnectionError'));
      pyBodyHost.appendChild(UI.callout('trap',
        '인터넷에 연결되지 않았거나 학교 네트워크가 CDN 을 막았을 때 나는 에러다. <b>탭 1 의 미니 엔진은 ' +
        '이것과 무관하게 인터넷 없이 그대로 동작한다</b> — 위로 돌아가 계속 실습해도 된다.'));
      pyBodyHost.appendChild(UI.btn('다시 시도', loadPyodideFlow));
    }

    function loadPyodideFlow() {
      var descs = [
        'pyodide.js 내려받는 중 (CDN, 처음 한 번만 20~40초)',
        'Pyodide 런타임 초기화',
        'numpy 패키지 설치',
        '실습 배열 준비 (a, b, v, w, m, n, t, data)'
      ];
      var states = ['', '', '', ''];
      UI.clear(pyBodyHost);
      setSteps(descs, states);
      var p = Promise.resolve();
      if (!window.loadPyodide) {
        p = p.then(function () {
          return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = PYODIDE_SRC;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('pyodide.js 스크립트를 불러오지 못했다 (네트워크 차단 또는 CDN 접근 불가).')); };
            document.head.appendChild(s);
          });
        });
      }
      p.then(function () {
        states[0] = 'done'; setSteps(descs, states);
        return window.loadPyodide();
      }).then(function (pyodide) {
        states[1] = 'done'; setSteps(descs, states);
        return pyodide.loadPackage('numpy').then(function () { return pyodide; });
      }).then(function (pyodide) {
        states[2] = 'done'; setSteps(descs, states);
        pyodide.runPython(buildPyPrelude(DATA2.flatValues()));
        states[3] = 'done'; setSteps(descs, states);
        pyodideState.pyodide = pyodide;
        showReadyUI();
      }).catch(function (err) {
        var failIdx = states.indexOf('');
        if (failIdx !== -1) { states[failIdx] = 'failed'; setSteps(descs, states); }
        showFail((err && err.message) || String(err));
      });
    }

    function showReadyUI() {
      UI.clear(pyBodyHost);
      var pyHistory = el('div');
      var pyTa = el('textarea', { class: 'code', rows: 5, spellcheck: 'false' });
      pyTa.value = 'a.mean(axis=1)';
      function runPy() {
        var code = pyTa.value;
        if (!code || !code.trim()) return;
        var entry = el('div', { style: { borderTop: '1px solid var(--border)', paddingTop: '.9rem', marginTop: '.9rem' } }, [UI.code(code)]);
        try {
          var r = runPyCode(pyodideState.pyodide, code);
          if (r.err) entry.appendChild(UI.errBlock(r.err));
          else entry.appendChild(UI.out(r.out || '(출력 없음)', { label: 'Out' }));
        } catch (e) {
          entry.appendChild(UI.errBlock('Pyodide 실행 실패: ' + e.message));
        }
        pyHistory.insertBefore(entry, pyHistory.firstChild);
      }
      pyTa.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runPy(); }
      });
      pyBodyHost.appendChild(UI.callout('tip', '<b>실제 NumPy 가 준비됐다.</b> a, b, v, w, m, n, t, data 가 탭 1 과 똑같은 값으로 미리 정의되어 있다.'));
      pyBodyHost.appendChild(pyTa);
      pyBodyHost.appendChild(UI.controls([UI.btn('실행 (Ctrl+Enter)', runPy, { primary: true })]));
      pyBodyHost.appendChild(UI.chips([
        'a.mean(axis=1)', 'np.random.seed(0); np.random.rand(3)', 'a.dtype', 'a.strides',
        'data.mean(axis=1)[:5]', 'np.empty((3,5))'
      ], function (code) { pyTa.value = code; runPy(); }));
      pyBodyHost.appendChild(pyHistory);
    }

    loadBtn = UI.btn('Pyodide 불러오기 (진짜 NumPy 실행)', loadPyodideFlow, { primary: true });

    root.appendChild(UI.card({
      kicker: '시뮬레이터',
      title: '실제 NumPy 실행 — 미니 엔진과 결과를 맞대어 보기',
      note: '아래 버튼을 누르기 전까지는 아무것도 내려받지 않는다. 실패해도 탭 1 은 항상 그대로 쓸 수 있다.',
      body: [UI.controls([loadBtn]), pyStatusHost, pyBodyHost]
    }));

    root.appendChild(el('h3', { class: 'h-sub', text: '탭 1 (미니 엔진) vs 탭 2 (Pyodide) 비교' }));
    root.appendChild(UI.table(
      [{ k: 'k', label: '항목', raw: true }, { k: 'a', label: '탭 1 · 미니 엔진', raw: true },
       { k: 'b', label: '탭 2 · Pyodide', raw: true }],
      [
        { k: '인터넷 필요 여부', a: '불필요', b: '필요 (첫 로딩에만)' },
        { k: '첫 로딩 시간', a: '즉시', b: '20~40초 (20MB 이상 다운로드)' },
        { k: '지원 문법 범위', a: '이 장에서 정의한 제한된 문법(위 목록)', b: '진짜 파이썬 + NumPy 전체' },
        { k: '정수 기본 dtype', a: '<code>int64</code> (itemsize 8)',
          b: '<code>int32</code> (itemsize 4) — WASM 이 32비트라서다. 64비트 데스크톱 NumPy 는 int64 다' },
        { k: '<code>.strides</code> 단위', a: '원소 단위 — <code>a.T.strides</code> → <code>(1, 4)</code>',
          b: '바이트 단위 — <code>(4, 16)</code>. 데스크톱 64비트에서는 <code>(8, 32)</code>' },
        { k: '결과의 정확성', a: '대부분 일치. 다만 난수 · <code>np.empty</code> · 아주 큰 정수 · ' +
            'float 마지막 자리는 다를 수 있다',
          b: '실제 NumPy 그 자체 (단 위의 dtype·strides 차이는 플랫폼 특성이다)' }
      ]
    ));
    root.appendChild(UI.callout('why',
      '두 엔진이 정확히 같은 코드로 <b>다른 값</b>을 내는 경우가 세 가지 있다. ① <code>np.random.*</code> — ' +
      '미니 엔진은 <code>Math.random</code> 기반이라 seed 를 줘도 NumPy 와 같은 수열이 나오지 않는다. ' +
      '② <code>np.empty</code> —애초에 "메모리 쓰레기"를 흉내 낸 것이라 예측할 수 없는 값이 정상이다. ' +
      '③ 아주 큰 정수나 float 의 마지막 자리 — JS number 의 정밀도 한계 때문이다. 그 외의 모든 계산(모양, ' +
      '집계, 브로드캐스팅, 슬라이싱, 선형대수)은 두 탭에서 같은 값이 나와야 한다 — 위 예제로 직접 대조해 보라.'));

    /* ---------------------------------------------------------- 11.3 */

    root.appendChild(el('h2', { class: 'h-sec', text: '11.3 다음으로 배울 것' }));
    root.appendChild(el('p', {
      html:
        'NumPy 는 끝이 아니라 시작이다. <b>pandas</b> 는 ndarray 위에 행·열 이름표와 열마다 다른 자료형을 ' +
        '얹어 표(table)를 다룬다(결측치 처리도 훨씬 정교하다). <b>matplotlib</b> 은 ndarray 를 그림으로 ' +
        '바꾼다. <b>scikit-learn</b> 의 모델은 입력·출력이 전부 ndarray 다. <b>PyTorch</b> 와 ' +
        '<b>TensorFlow</b> 의 텐서(tensor)도 결국 GPU 에서 도는 ndarray — 이 장에서 만든 (buffer, shape, ' +
        'strides) 그림이 그대로 확장된다.'
    }));
    root.appendChild(el('p', {
      html:
        '막히면 공식 문서 <a href="https://numpy.org/doc/stable/" target="_blank" rel="noopener">numpy.org/doc/stable</a> 를 ' +
        '검색하라. 주피터 노트북에서는 <code>np.info(np.sum)</code> 으로 함수 설명을 바로 읽거나, 함수 이름 뒤에 ' +
        '<code>?</code> 를 붙이거나(<code>np.sum?</code>), 괄호 안에서 <b>Shift+Tab</b> 을 누르면 그 자리에서 ' +
        '문서가 뜬다.'
    }));

    /* ---------------------------------------------------------- 확인 문제 */

    root.appendChild(el('h2', { class: 'h-sec', text: '확인 문제' }));
    root.appendChild(UI.quiz([
      {
        q: '<code>a = np.arange(12).reshape(3,4)</code> 일 때, <code>np.shares_memory(a, a[0:2])</code> 의 결과는?',
        choices: [
          '<code>True</code> — 슬라이싱은 뷰(view)라서 메모리를 공유한다',
          '<code>False</code> — 슬라이싱은 항상 새 배열(사본)을 만든다',
          '<code>True</code> 지만 reshape 를 거쳤기 때문에 우연히 겹친 것이다'
        ],
        answer: 0,
        explain: '슬라이싱은 원본과 같은 버퍼를 다른 shape·strides·offset 으로 보는 <b>뷰</b>다. reshape 도 연속(contiguous)이면 뷰이므로 a 자체도 뷰이고, 그 슬라이스 역시 같은 메모리를 가리킨다.'
      },
      {
        q: '관절염 데이터 <code>data</code> 의 shape 는 (60, 40) 이다. <code>data.mean(axis=1)</code> 의 shape 는?',
        choices: ['<code>(40,)</code>', '<code>(60,)</code>', '<code>(60, 40)</code>'],
        answer: 1,
        explain: 'axis=1(날짜 축)이 사라지고 그 축을 따라 평균이 계산된다. 남는 축은 axis=0(환자), 그래서 shape 는 (60,) — "환자마다 40일 평균 하나".'
      },
      {
        q: '<code>np.round(np.array([2.5]))</code> 의 결과는?',
        choices: [
          '<code>array([3.])</code> — 0.5 는 항상 올림한다',
          "<code>array([2.])</code> — 은행가 반올림(banker's rounding)으로 짝수 쪽에 붙는다",
          '<code>array([2])</code> — 정수 dtype 으로 바뀐다'
        ],
        answer: 1,
        explain: "NumPy 의 np.round 는 가장 가까운 짝수로 반올림하는 은행가 반올림을 쓴다. 2.5 는 2와 3의 중간인데 짝수인 2 로, 1.5 도 짝수인 2 로 간다. dtype 은 float64 그대로 유지된다."
      },
      {
        q: '<code>a[a > 5]</code> 의 결과에 대한 설명으로 옳은 것은?',
        choices: [
          'a 와 같은 shape 을 갖고, 조건을 깬 자리는 0 으로 채운 배열',
          '조건을 만족한 값만 모은 <b>1차원 사본</b> — 원본 shape 정보는 사라진다',
          '조건을 만족한 위치의 인덱스로 이루어진 튜플'
        ],
        answer: 1,
        explain: '불리언 마스크 인덱싱은 조건이 참인 원소만 순서대로 뽑아 <b>항상 1차원 사본</b>으로 돌려준다. 원본과 메모리를 공유하지 않고, 원래 몇 행 몇 열이었는지도 결과에는 남지 않는다.'
      }
    ], { id: 'playground' }));
  }

  Lab.register({
    id: 'playground',
    n: '11',
    title: '코드 실습실',
    blurb: '브라우저 안 미니 엔진으로 파이썬 비슷한 코드를 직접 돌려 보고, 원한다면 Pyodide 로 진짜 NumPy 와 대조한다.',
    sim: '표현식 평가기(재귀 하강 파서) · Pyodide 실제 NumPy 실행',
    render: render
  });
})();
