/* cross.test.js — 미니 엔진 vs 실제 NumPy 2.5.1 교차 검증
 *
 *   1) "…/Python313/python.exe" webapp/test/gen_expected.py   → expected.json
 *   2) node webapp/test/cross.test.js
 *
 * expected.json 의 값은 손계산이 아니라 실제 NumPy 가 낸 출력이다.
 */
const fs = require('fs');
const path = require('path');
const ND = require('../src/core/nd.js');

const EXP = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8'));

let pass = 0, fail = 0, skip = 0;
const fails = [];

function j(v) { return JSON.stringify(v); }

/** 기대값과 비교. fn 이 던지면 실패로 기록한다. */
function chk(key, fn, opts) {
  opts = opts || {};
  if (!(key in EXP)) { skip++; return; }
  let actual;
  try { actual = fn(); } catch (e) {
    fail++; fails.push(`${key}\n    엔진이 예외를 던졌다: ${e.message}`); return;
  }
  const want = EXP[key];
  if (opts.tol !== undefined) {
    const a = flat(actual), b = flat(want);
    if (a.length !== b.length) {
      fail++; fails.push(`${key}\n    길이 불일치 ${a.length} vs ${b.length}`); return;
    }
    for (let i = 0; i < a.length; i++) {
      if (!(Math.abs(a[i] - b[i]) <= opts.tol)) {
        fail++; fails.push(`${key}\n    NumPy: ${j(want)}\n    엔진 : ${j(actual)}\n    (${i}번째에서 어긋남)`); return;
      }
    }
    pass++; return;
  }
  if (j(actual) === j(want)) { pass++; return; }
  fail++; fails.push(`${key}\n    NumPy: ${j(want)}\n    엔진 : ${j(actual)}`);
}
function flat(v) { return Array.isArray(v) ? v.flat(Infinity) : [v]; }

const T = 1e-9;

/* ------------------------------------------------------------------ arr5 */
const a = ND.arange(1, 13).reshape([3, 4]);
chk('arr5', () => a.toNested());
chk('arr5.shape', () => a.shape);
chk('arr5.dtype', () => a.dtype);
chk('arr5.strides_elems', () => a.strides);
chk('arr5.nbytes', () => a.nbytes);
chk('arr5.itemsize', () => a.itemsize);
chk('sum', () => ND.sum(a).toNested());
chk('sum0', () => ND.sum(a, 0).toNested());
chk('sum1', () => ND.sum(a, 1).toNested());
chk('mean', () => ND.mean(a).toNested(), { tol: T });
chk('mean0', () => ND.mean(a, 0).toNested(), { tol: T });
chk('mean1', () => ND.mean(a, 1).toNested(), { tol: T });
chk('std0ddof', () => ND.std(a).toNested(), { tol: T });
chk('std1ddof', () => ND.std(a, null, 1).toNested(), { tol: T });
chk('var0ddof', () => ND.variance(a).toNested(), { tol: T });
chk('var1ddof', () => ND.variance(a, null, 1).toNested(), { tol: T });
chk('min', () => ND.min(a).toNested());
chk('max', () => ND.max(a).toNested());
chk('ptp', () => ND.ptp(a).toNested());
chk('argmin', () => ND.argmin(a).toNested());
chk('argmax', () => ND.argmax(a).toNested());
chk('argmax1', () => ND.argmax(a, 1).toNested());
chk('argmin0', () => ND.argmin(a, 0).toNested());
chk('median', () => ND.median(a).toNested(), { tol: T });
chk('p25', () => ND.percentile(a, 25).toNested(), { tol: T });
chk('p50', () => ND.percentile(a, 50).toNested(), { tol: T });
chk('p75', () => ND.percentile(a, 75).toNested(), { tol: T });
chk('cumsum', () => ND.cumsum(a).toNested());
chk('prod_small', () => ND.prodOf(ND.arange(1, 6)).toNested());
chk('keepdims1', () => ND.reduce(a, { op: 'sum', axis: 1, keepdims: true }).toNested());
chk('keepdims1.shape', () => ND.reduce(a, { op: 'sum', axis: 1, keepdims: true }).shape);
chk('unravel_argmax', () => a.unravel(ND.argmax(a).toNested()));

/* ------------------------------------------------------------- 3D axis */
const t3 = a.reshape([3, 2, 2]);
chk('t3d', () => t3.toNested());
chk('t3d.sum0', () => ND.sum(t3, 0).toNested());
chk('t3d.sum1', () => ND.sum(t3, 1).toNested());
chk('t3d.sum2', () => ND.sum(t3, 2).toNested());
chk('t3d.sum0.shape', () => ND.sum(t3, 0).shape);
chk('t3d.sum1.shape', () => ND.sum(t3, 1).shape);
chk('t3d.sum2.shape', () => ND.sum(t3, 2).shape);
chk('t3d.mean1', () => ND.mean(t3, 1).toNested(), { tol: T });
chk('t3d.max2', () => ND.max(t3, 2).toNested());

/* -------------------------------------------------------------- 행렬곱 */
const m = ND.arange(1, 7).reshape([2, 3]);
const n = ND.arange(7, 13).reshape([3, 2]);
chk('matmul', () => ND.matmul(m, n).toNested());
chk('matmul.shape', () => ND.matmul(m, n).shape);
chk('dot_1d', () => ND.matmul(ND.array([1, 2, 3]), ND.array([4, 5, 6])).toNested());
chk('mat_vec', () => ND.matmul(m, ND.array([1, 1, 1])).toNested());
chk('PQ', () => ND.matmul(ND.array([[1, 2], [3, 4]]), ND.array([[0, 1], [1, 0]])).toNested());
chk('QP', () => ND.matmul(ND.array([[0, 1], [1, 0]]), ND.array([[1, 2], [3, 4]])).toNested());
chk('mT', () => m.T.toNested());
chk('mT.shape', () => m.T.shape);
chk('mT.strides_elems', () => m.T.strides);
chk('v1d_T.shape', () => ND.array([1, 2, 3]).T.shape);
chk('ABt_eq_BtAt', () => {
  const l = ND.matmul(m, n).T.toNested();
  const r = ND.matmul(n.T, m.T).toNested();
  return j(l) === j(r);
});

/* -------------------------------------------------------- 브로드캐스팅 */
const BA = ND.array([[0], [10], [20], [30]]);
const BB = ND.array([0, 1, 2]);
chk('bcast', () => ND.ops.add(BA, BB).toNested());
chk('bcast.shape', () => ND.ops.add(BA, BB).shape);
chk('bcast_to.strides_elems', () => ND.broadcastTo(BB, [4, 3]).strides);
chk('bshape_34_4', () => ND.broadcastShapes([3, 4], [4]).shape);
chk('bshape_31_14', () => ND.broadcastShapes([3, 1], [1, 4]).shape);
chk('gugudan', () => ND.ops.mul(ND.arange(1, 10).reshape([9, 1]), ND.arange(1, 10)).toNested());

/* ---------------------------------------------------------------- 생성 */
chk('arange5', () => ND.arange(5).toNested());
chk('arange_05', () => ND.arange(0, 2, 0.5).toNested(), { tol: T });
chk('arange_05.dtype', () => ND.arange(0, 2, 0.5).dtype);
chk('linspace', () => ND.linspace(0, 1, 5).toNested(), { tol: T });
chk('zeros25.dtype', () => ND.zeros([2, 5]).dtype);
chk('ones_like_int.dtype', () => ND.onesLike(ND.arange(30).reshape([5, 6])).dtype);
chk('eye_3_5', () => ND.eye(3, 5, 0, 'int64').toNested());
chk('eye_3_5_k2', () => ND.eye(3, 5, 2, 'int64').toNested());
chk('identity3', () => ND.identity(3, 'int64').toNested());
chk('diag2d', () => ND.diag(ND.arange(9).reshape([3, 3])).toNested());
chk('diag1d', () => ND.diag(ND.array([1, 2, 3])).toNested());
chk('diag1d_k1', () => ND.diag(ND.array([1, 2, 3]), 1).toNested());

/* -------------------------------------------------------------- reshape */
const mat = ND.array([[1, 2, 5, 8], [1, 2, 5, 8]]);
chk('mat.reshape8', () => mat.reshape([8]).toNested());
chk('mat.reshape_1_2', () => mat.reshape([-1, 2]).toNested());
chk('mat.reshape222', () => mat.reshape([2, 2, 2]).toNested());
const m2 = ND.array([[[1, 2, 3, 4], [1, 2, 5, 8]], [[1, 2, 3, 4], [1, 2, 5, 8]]]);
chk('m2.shape', () => m2.shape);
chk('m2.flatten', () => m2.flatten().toNested());
chk('m2.flatten.size', () => m2.flatten().size);

/* ------------------------------------------------------ 인덱싱/슬라이싱 */
const insl = ND.array([[1, 2, 3], [4, 5, 6]]);
chk('insl_1_01', () => insl.idx('1:, 0:1').toNested());
chk('insl_1_01.shape', () => insl.idx('1:, 0:1').shape);
chk('insl_1_13', () => insl.idx('1, 1:3').toNested());
chk('insl_13', () => insl.idx('1:3').toNested());
chk('insl_0.shape', () => insl.idx('0').shape);
chk('insl_001.shape', () => insl.idx('0:1').shape);
chk('insl_col.shape', () => insl.idx(':, 0').shape);
chk('insl_col01.shape', () => insl.idx(':, 0:1').shape);
chk('insl_59.shape', () => insl.idx('5:9').shape);
const r6 = ND.arange(6);
chk('rev', () => r6.idx('::-1').toNested());
chk('r_1_5_2', () => r6.idx('1:5:2').toNested());
chk('r_m2', () => r6.idx('-2:').toNested());
chk('r_to_m2', () => r6.idx(':-2').toNested());
chk('r_newax_front.shape', () => r6.idx('None, :').shape);
chk('r_newax_back.shape', () => r6.idx(':, None').shape);
const t24 = ND.arange(24).reshape([2, 3, 4]);
chk('ell.shape', () => t24.idx('..., 1').shape);
chk('t123', () => t24.idx('1,2,3').toNested());

/* --------------------------------------------------- 불리언 / 팬시 */
const t4 = ND.array([10, 20, 30, 40, 50, 60]);
chk('t4_gt35', () => ND.ops.gt(t4, 35).toNested());
chk('t4_sel', () => ND.maskSelect(t4, ND.ops.gt(t4, 35)).toNested());
chk('where_idx', () => ND.whereIdx(ND.ops.lt(t4, 35)).toNested());
chk('where3', () => ND.where(ND.ops.gt(t4, 10), 1, 0).toNested());
chk('fancy', () => ND.fancySelect(ND.array([2, 4, 6, 8]), ND.array([0, 0, 3, 2, 1, 2])).toNested());
chk('fancy.shape', () => ND.fancySelect(ND.array([2, 4, 6, 8]), ND.array([0, 0, 3, 2, 1, 2])).shape);
chk('all_arange10', () => ND.all(ND.arange(10)).toNested());
chk('all_arange1_10', () => ND.all(ND.arange(1, 10)).toNested());
chk('any_gt5', () => ND.any(ND.ops.gt(ND.arange(10), 5)).toNested());
const c1 = ND.array([1, 3, 0]), c2 = ND.array([5, 2, 0]);
chk('cmp_gt', () => ND.ops.gt(c1, c2).toNested());
chk('cmp_eq', () => ND.ops.eq(c1, c2).toNested());
chk('cmp_gt2', () => ND.ops.gt(c1, 2).toNested());
chk('nan_eq_nan', () => NaN === NaN);
const tn = ND.array([1, NaN, Infinity], 'float64');
chk('tn.dtype', () => tn.dtype);
chk('isnan', () => ND.unop(tn, v => isNaN(v), 'bool').toNested());
chk('isfinite', () => ND.unop(tn, v => isFinite(v), 'bool').toNested());

/* ------------------------------------------------------------- 합치기 */
const va = ND.array([1, 2, 3]), vb = ND.array([2, 3, 4]);
chk('vstack', () => ND.vstack([va, vb]).toNested());
chk('vstack.shape', () => ND.vstack([va, vb]).shape);
chk('concat1d', () => ND.concatenate([va, vb]).toNested());
const ca = ND.array([[1], [2], [3]]), cb = ND.array([[2], [3], [4]]);
chk('hstack', () => ND.hstack([ca, cb]).toNested());
chk('hstack.shape', () => ND.hstack([ca, cb]).shape);
chk('stack0.shape', () => ND.stack([va, vb]).shape);
chk('stack1', () => ND.stack([va, vb], 1).toNested());
chk('stack1.shape', () => ND.stack([va, vb], 1).shape);

/* ---------------------------------------------------------- 선형대수 */
chk('solve', () => ND.solve(
  ND.array([[2, 2, 1], [2, -1, 2], [1, -1, 2]], 'float64'),
  ND.array([9, 6, 5], 'float64')).toNested(), { tol: 1e-9 });
chk('norm34', () => ND.norm(ND.array([3, 4])), { tol: T });
chk('det12_34', () => ND.det(ND.array([[1, 2], [3, 4]], 'float64')), { tol: 1e-9 });
chk('dist', () => ND.norm(ND.ops.sub(ND.array([1, 2]), ND.array([4, 6]))), { tol: T });

/* ---------------------------------------------------------- dtype 함정 */
chk('astype_trunc', () => ND.array([1.7, -1.7]).astype('int64').toNested());
chk('int8_wrap', () => [ND.castValue(200, 'int8')]);
chk('float_eq', () => 0.1 + 0.2 === 0.3);
chk('promote_int_float', () => ND.promote('int64', 'float64'));
chk('sin30_wrong', () => Math.sin(30), { tol: 1e-12 });
chk('sin30_right', () => Math.sin(30 * Math.PI / 180), { tol: 1e-12 });

/* ------------------------------------------------------------- 포맷 */
chk('fmt_print_int', () => ND.format(ND.array([1, 2, 3])));
chk('fmt_repr_int', () => ND.format(ND.array([1, 2, 3]), { mode: 'repr' }));
chk('fmt_print_float', () => ND.format(ND.array([1.0, 2.0, 3.0], 'float64')));
chk('fmt_print_2d', () => ND.format(ND.array([[1, 2], [3, 4]])));
chk('fmt_print_bool', () => ND.format(ND.array([true, false])));
chk('fmt_print_arr5', () => ND.format(a));

/* --------------------------------------------------------- 관절염 데이터 */
const CSV = 'C:/numpy/수업자료/lab_inflammation-01.csv';
if (fs.existsSync(CSV)) {
  const rows = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/).map(l => l.split(',').map(Number));
  const d = new ND.ND(rows.flat(), [rows.length, rows[0].length], null, 0, 'float64', null);
  chk('inf.shape', () => d.shape);
  chk('inf.dtype', () => d.dtype);
  chk('inf.max', () => ND.max(d).toNested());
  chk('inf.min', () => ND.min(d).toNested());
  chk('inf.mean', () => ND.mean(d).toNested(), { tol: 1e-9 });
  chk('inf.std', () => ND.std(d).toNested(), { tol: 1e-9 });
  chk('inf.p0max', () => ND.max(d.idx('0')).toNested());
  chk('inf.p0argmax', () => ND.argmax(d.idx('0')).toNested());
  chk('inf.day0mean', () => ND.mean(d.idx(':, 0')).toNested(), { tol: T });
  chk('inf.argmax1', () => ND.argmax(d, 1).toNested());
  chk('inf.mean0.shape', () => ND.mean(d, 0).shape);
  chk('inf.mean1.shape', () => ND.mean(d, 1).shape);
  chk('inf.mean0_first8', () => ND.mean(d, 0).idx(':8').toNested(), { tol: 1e-9 });
  chk('inf.p4_first10', () => d.idx('4, :10').toNested());
  chk('inf.max20count', () => ND.sum(ND.ops.eq(ND.max(d, 1), 20)).toNested());
  chk('inf.mean_gt6count', () => ND.sum(ND.ops.gt(ND.mean(d, 1), 6)).toNested());
  chk('inf.norm.shape', () => ND.ops.sub(d, ND.reduce(d, { op: 'mean', axis: 1, keepdims: true })).shape);
  chk('inf.lt15_all_count', () => ND.sum(ND.all(ND.ops.lt(d, 15), 1)).toNested());
}

/* ---------------------------------------------------------------- 결과 */
console.log('');
if (fails.length) {
  console.log('불일치 ' + fail + '건:');
  fails.forEach((f, i) => console.log('  ' + (i + 1) + ') ' + f));
  console.log('');
}
console.log(`실제 NumPy ${EXP._meta.numpy} 대조 — 일치 ${pass} / 불일치 ${fail}` +
  (skip ? ` / 건너뜀 ${skip}` : ''));
process.exit(fail ? 1 : 0);
