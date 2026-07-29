/* nd.js 검증 — 실제 NumPy 출력값(groundtruth)과 대조한다.
 * 실행: node webapp/test/nd.test.js
 */
const ND = require('../src/core/nd.js');

let pass = 0, fail = 0;
const fails = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; fails.push(`${label}\n    기대: ${b}\n    실제: ${a}`); }
}
function close(actual, expected, label, tol = 1e-9) {
  if (Math.abs(actual - expected) <= tol) pass++;
  else { fail++; fails.push(`${label}\n    기대: ${expected}\n    실제: ${actual}`); }
}
function throws(fn, label, re) {
  try { fn(); fail++; fails.push(`${label}\n    에러가 나야 하는데 안 났다`); }
  catch (e) {
    if (re && !re.test(e.message)) { fail++; fails.push(`${label}\n    메시지 불일치: ${e.message}`); }
    else pass++;
  }
}
function str(actual, expected, label) {
  if (actual === expected) pass++;
  else { fail++; fails.push(`${label}\n    기대:\n${expected}\n    실제:\n${actual}`); }
}

/* ---------------------------------------------------- 생성 · 기본 속성 */
{
  const a = ND.arange(1, 13).reshape([3, 4]);
  eq(a.shape, [3, 4], 'arange(1,13).reshape(3,4) shape');
  eq(a.toNested(), [[1,2,3,4],[5,6,7,8],[9,10,11,12]], 'arr5 내용');
  eq(a.size, 12, 'size');
  eq(a.ndim, 2, 'ndim');
  eq(a.dtype, 'int64', 'arange dtype');
  eq(a.nbytes, 96, 'nbytes = 12*8');
  eq(ND.cStrides([3,4]), [4,1], 'cStrides(3,4)');

  eq(ND.arange(5).toNested(), [0,1,2,3,4], 'arange(5)');
  eq(ND.arange(0, 2, 0.5).toNested(), [0,0.5,1,1.5], 'arange(0,2,0.5)');
  eq(ND.arange(0, 2, 0.5).dtype, 'float64', 'arange 실수 step → float64');
  eq(ND.linspace(0, 1, 5).toNested(), [0,0.25,0.5,0.75,1], 'linspace(0,1,5)');
  eq(ND.zeros([2,5]).dtype, 'float64', 'zeros 기본 dtype');
  eq(ND.zeros(10, 'int64').toNested(), [0,0,0,0,0,0,0,0,0,0], 'zeros(10, int)');
  eq(ND.onesLike(ND.arange(30).reshape([5,6])).dtype, 'int64', 'ones_like 는 dtype 상속');
  eq(ND.array([1,2,3,4,'9'].map(Number), 'float64').toNested(), [1,2,3,4,9], "array([...], float)");
}

/* --------------------------------------------------------- eye / diag */
{
  eq(ND.eye(3,5,0,'int64').toNested(), [[1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0]], 'eye(3,5)');
  eq(ND.eye(3,5,2,'int64').toNested(), [[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]], 'eye(3,5,k=2)');
  eq(ND.identity(3,'int64').toNested(), [[1,0,0],[0,1,0],[0,0,1]], 'identity(3)');
  eq(ND.diag(ND.arange(9).reshape([3,3])).toNested(), [0,4,8], 'diag(2D) → 대각 추출');
  eq(ND.diag(ND.array([1,2,3])).toNested(), [[1,0,0],[0,2,0],[0,0,3]], 'diag(1D) → 대각 행렬');
}

/* ----------------------------------------------------------- reshape */
{
  const m = ND.array([[1,2,5,8],[1,2,5,8]]);
  eq(m.shape, [2,4], 'matrix shape');
  eq(m.reshape([8]).toNested(), [1,2,5,8,1,2,5,8], 'reshape(8,)');
  eq(m.reshape([-1,2]).shape, [4,2], 'reshape(-1,2) shape');
  eq(m.reshape([-1,2]).toNested(), [[1,2],[5,8],[1,2],[5,8]], 'reshape(-1,2) 내용');
  eq(m.reshape([2,2,2]).toNested(), [[[1,2],[5,8]],[[1,2],[5,8]]], 'reshape(2,2,2)');
  throws(() => m.reshape([-1,3]), 'reshape(-1,3) 은 ValueError', /cannot reshape/);
  throws(() => ND.arange(12).reshape([-1,-1]), 'reshape(-1,-1) 금지', /one unknown/);

  // flatten: matrix2 shape (2,2,4) → 원소 16개
  const m2 = ND.array([[[1,2,3,4],[1,2,5,8]],[[1,2,3,4],[1,2,5,8]]]);
  eq(m2.shape, [2,2,4], 'matrix2 shape');
  eq(m2.ndim, 3, 'matrix2 ndim');
  eq(m2.flatten().toNested(), [1,2,3,4,1,2,5,8,1,2,3,4,1,2,5,8], 'matrix2.flatten()');
  eq(m2.flatten().size, 16, 'flatten size 16');
}

/* ------------------------------------------------------- 뷰 vs 사본 */
{
  const a = ND.arange(12).reshape([3,4]);
  const s = a.idx('0:2, 1:3');
  eq(s.shape, [2,2], '슬라이스 shape');
  eq(s.toNested(), [[1,2],[5,6]], '슬라이스 내용');
  eq(ND.sharesMemory(a, s), true, '슬라이싱은 뷰 → 메모리 공유');
  s.set([0,0], 99);
  eq(a.get([0,1]), 99, '뷰를 고치면 원본이 바뀐다');

  const b = ND.arange(6).reshape([2,3]);
  eq(ND.sharesMemory(b, b.reshape([3,2])), true, 'reshape 는 뷰');
  eq(ND.sharesMemory(b, b.ravel()), true, 'ravel 은 뷰');
  eq(ND.sharesMemory(b, b.flatten()), false, 'flatten 은 사본');
  eq(ND.sharesMemory(b, b.T), true, 'T 는 뷰');
  eq(ND.sharesMemory(b, b.copy()), false, 'copy 는 사본');
  eq(b.T.shape, [3,2], 'T shape');
  eq(b.T.toNested(), [[0,3],[1,4],[2,5]], 'T 내용');
  eq(b.T.isContiguous(), false, 'T 는 연속이 아니다');

  // 1차원의 .T 는 아무 일도 하지 않는다
  const v = ND.array([1,2,3]);
  eq(v.T.shape, [3], '1차원 .T 는 그대로');
}

/* ------------------------------------------------- 인덱싱 · 슬라이싱 */
{
  const insl = ND.array([[1,2,3],[4,5,6]]);
  eq(insl.get([0,1]), 2, 'insl[0,1]');
  eq(insl.idx('1:, 0:1').toNested(), [[4]], 'insl[1:, 0:1]');
  eq(insl.idx('1:, 0:1').shape, [1,1], 'insl[1:, 0:1] shape');
  eq(insl.idx('1, 1:3').toNested(), [5,6], 'insl[1, 1:3]');
  eq(insl.idx('1:3').toNested(), [[4,5,6]], 'insl[1:3] — 행이 2개뿐이라 있는 만큼만');
  eq(insl.idx('0').shape, [3], 'a[0] → 축이 사라진다');
  eq(insl.idx('0:1').shape, [1,3], 'a[0:1] → 축이 남는다');
  eq(insl.idx(':, 0').shape, [2], 'a[:, 0]');
  eq(insl.idx(':, 0:1').shape, [2,1], 'a[:, 0:1]');
  throws(() => insl.idx('5'), '인덱싱은 범위를 넘으면 IndexError', /out of bounds/);
  eq(insl.idx('5:9').shape, [0,3], '슬라이싱은 범위를 넘어도 에러가 아니다');

  const r = ND.arange(6);
  eq(r.idx('::-1').toNested(), [5,4,3,2,1,0], '역순 슬라이싱 ::-1');
  eq(r.idx('1:5:2').toNested(), [1,3], '1:5:2');
  eq(r.idx('-2:').toNested(), [4,5], '음수 start');
  eq(r.idx(':-2').toNested(), [0,1,2,3], '음수 stop');
  eq(r.idx('None, :').shape, [1,6], 'newaxis 앞');
  eq(r.idx(':, None').shape, [6,1], 'newaxis 뒤');

  const t = ND.arange(24).reshape([2,3,4]);
  eq(t.idx('..., 1').shape, [2,3], 'Ellipsis');
  eq(t.idx('1, 2, 3'), t.idx('1,2,3'), '공백 무시');
  eq(t.idx('1,2,3').toNested(), 23, 't[1,2,3]');
}

/* -------------------------------------------------------- 파서 오류 */
{
  eq(ND.parseIndex('a[1:4, ::2]'), ND.parseIndex('1:4, ::2'), 'a[...] 껍질 제거');
  eq(ND.parseIndex(':'), [{k:'s',start:null,stop:null,step:null}], '전체 슬라이스');
  throws(() => ND.parseIndex('1:2:3:4'), '콜론 4개는 에러', /콜론/);
  throws(() => ND.parseIndex('abc'), '문자열 인덱스는 에러');
}

/* ------------------------------------------------------ 원소별 연산 */
{
  const a = ND.array([[1,2,3],[4,5,6]]);
  eq(ND.ops.add(a,a).toNested(), [[2,4,6],[8,10,12]], 'a+a');
  eq(ND.ops.sub(a,a).toNested(), [[0,0,0],[0,0,0]], 'a-a');
  eq(ND.ops.mul(a,a).toNested(), [[1,4,9],[16,25,36]], 'a*a (성분별 곱)');
  eq(ND.ops.add(a,3).toNested(), [[4,5,6],[7,8,9]], 'a+3 (스칼라 브로드캐스팅)');
  eq(ND.ops.pow(a,2).toNested(), [[1,4,9],[16,25,36]], 'a**2');
  eq(ND.ops.gt(ND.array([1,3,0]), ND.array([5,2,0])).toNested(), [false,true,false], 'temp1>temp2');
  eq(ND.ops.eq(ND.array([1,3,0]), ND.array([5,2,0])).toNested(), [false,false,true], 'temp1==temp2');
  eq(ND.ops.gt(ND.array([1,3,0]), 2).toNested(), [false,true,false], 'temp1>2');
}

/* ------------------------------------------------------ 브로드캐스팅 */
{
  let bc = ND.broadcastShapes([4,1],[3]);
  eq(bc.ok, true, '(4,1)+(3,) 가능');
  eq(bc.shape, [4,3], '(4,1)+(3,) → (4,3)');
  eq(bc.padded, [[4,1],[1,3]], '패딩 결과');

  const A = ND.array([[0],[10],[20],[30]]);
  const B = ND.array([0,1,2]);
  eq(ND.ops.add(A,B).toNested(), [[0,1,2],[10,11,12],[20,21,22],[30,31,32]], '핵심 브로드캐스팅 예제');

  eq(ND.broadcastShapes([3,4],[4]).shape, [3,4], '(3,4)+(4,) OK');
  eq(ND.broadcastShapes([3,4],[3]).ok, false, '(3,4)+(3,) 실패');
  eq(ND.broadcastShapes([3,4],[3]).failAxis, 1, '실패 축은 1');
  eq(ND.broadcastShapes([3,4],[3,1]).shape, [3,4], '(3,4)+(3,1) OK');
  eq(ND.broadcastShapes([3,1],[1,4]).shape, [3,4], '(3,1)+(1,4) → (3,4)');
  eq(ND.broadcastShapes([2,3],[3,2]).ok, false, '(2,3)+(3,2) 실패');

  // broadcastTo 는 stride 0 뷰
  const bt = ND.broadcastTo(B, [4,3]);
  eq(bt.strides, [0,1], '늘어난 축의 stride 는 0');
  eq(ND.sharesMemory(B, bt), true, '브로드캐스팅은 메모리를 복사하지 않는다');
}

/* -------------------------------------------------------------- 행렬곱 */
{
  const a = ND.arange(1,7).reshape([2,3]);
  const b = ND.arange(7,13).reshape([3,2]);
  eq(a.toNested(), [[1,2,3],[4,5,6]], 'a');
  eq(b.toNested(), [[7,8],[9,10],[11,12]], 'b');
  eq(ND.matmul(a,b).toNested(), [[58,64],[139,154]], 'a.dot(b) — groundtruth 대조');
  const st = ND.matmul(a,b,{steps:true});
  eq(st.steps[0].terms.map(t=>t.prod), [7,18,33], '(0,0) 항별 곱');
  close(st.steps[0].value, 58, '(0,0) 합');
  throws(() => ND.matmul(a, a), '(2,3)@(2,3) 는 실패', /mismatch/);

  // 1차원끼리는 내적(스칼라)
  const u = ND.array([1,2,3]), v = ND.array([4,5,6]);
  eq(ND.matmul(u,v).ndim, 0, '1D@1D → 0차원');
  eq(ND.matmul(u,v).toNested(), 32, '1·4+2·5+3·6 = 32');
  // 교환법칙 성립 안 함
  const p = ND.array([[1,2],[3,4]]), q = ND.array([[0,1],[1,0]]);
  eq(ND.matmul(p,q).toNested(), [[2,1],[4,3]], 'PQ');
  eq(ND.matmul(q,p).toNested(), [[3,4],[1,2]], 'QP ≠ PQ');
}

/* ------------------------------------------------- 집계 · axis (핵심) */
{
  const a = ND.arange(1,13).reshape([3,4]);
  eq(ND.sum(a).toNested(), 78, 'sum 전체 = 78');
  eq(ND.sum(a,1).toNested(), [10,26,42], 'sum(axis=1) = 각 행의 합');
  eq(ND.sum(a,0).toNested(), [15,18,21,24], 'sum(axis=0) = 각 열의 합');
  eq(ND.sum(a,1).shape, [3], 'axis=1 → shape (3,)');
  eq(ND.sum(a,0).shape, [4], 'axis=0 → shape (4,)');
  eq(ND.reduce(a,{op:'sum',axis:1,keepdims:true}).shape, [3,1], 'keepdims');
  close(ND.mean(a).toNested(), 6.5, 'mean = 6.5');
  eq(ND.mean(a,0).toNested(), [5,6,7,8], 'mean(axis=0)');
  close(ND.std(a).toNested(), 3.452052529534663, 'std(ddof=0) — groundtruth');
  close(ND.variance(a).toNested(), 11.916666666666666, 'var(ddof=0)');
  close(ND.std(a,null,1).toNested(), Math.sqrt(143/12*12/11), 'std(ddof=1)', 1e-9);
  eq(ND.max(a).toNested(), 12, 'max');
  eq(ND.min(a).toNested(), 1, 'min');
  eq(ND.argmax(a).toNested(), 11, 'argmax (평평한 인덱스)');
  eq(ND.argmin(a).toNested(), 0, 'argmin');
  close(ND.median(a).toNested(), 6.5, 'median');
  close(ND.percentile(a,25).toNested(), 3.75, 'percentile 25 — groundtruth');
  close(ND.percentile(a,50).toNested(), 6.5, 'percentile 50');
  close(ND.percentile(a,75).toNested(), 9.25, 'percentile 75');

  // 3차원 axis — 교재 하이라이트
  const t = a.reshape([3,2,2]);
  eq(t.toNested(), [[[1,2],[3,4]],[[5,6],[7,8]],[[9,10],[11,12]]], 'reshape(3,2,2)');
  eq(ND.sum(t,0).toNested(), [[15,18],[21,24]], '3D sum(axis=0) — groundtruth');
  eq(ND.sum(t,1).toNested(), [[4,6],[12,14],[20,22]], '3D sum(axis=1) — groundtruth');
  eq(ND.sum(t,2).toNested(), [[3,7],[11,15],[19,23]], '3D sum(axis=2) — groundtruth');
  eq(ND.sum(t,0).shape, [2,2], '3D axis=0 shape');
  eq(ND.sum(t,1).shape, [3,2], '3D axis=1 shape');
  eq(ND.sum(t,2).shape, [3,2], '3D axis=2 shape');
  throws(() => ND.sum(t,3), 'axis=3 은 범위 밖', /out of bounds/);
}

/* --------------------------------------------------- all / any / where */
{
  const a = ND.arange(10);
  eq(ND.all(ND.ops.lt(a,10)).toNested(), true, 'all(a<10)');
  eq(ND.all(a).toNested(), false, 'all(arange(10)) → False (0이 있다)');
  eq(ND.all(ND.arange(1,10)).toNested(), true, 'all(arange(1,10)) → True');
  eq(ND.any(ND.ops.gt(a,5)).toNested(), true, 'any(a>5)');

  const t4 = ND.array([10,20,30,40,50,60]);
  eq(ND.whereIdx(ND.ops.lt(t4,35)).toNested(), [0,1,2], 'where(t4<35) 인덱스');
  eq(ND.where(ND.ops.gt(t4,10),1,0).toNested(), [0,1,1,1,1,1], 'where(t4>10,1,0)');
  eq(ND.maskSelect(t4, ND.ops.gt(t4,35)).toNested(), [40,50,60], '불리언 인덱싱');
  eq(ND.ops.gt(t4,35).toNested(), [false,false,false,true,true,true], '마스크');
  // 불리언 마스크는 사본
  const sel = ND.maskSelect(t4, ND.ops.gt(t4,35));
  eq(ND.sharesMemory(t4, sel), false, '불리언 인덱싱은 사본');
}

/* ------------------------------------------------------- 팬시 인덱싱 */
{
  const t5 = ND.array([2,4,6,8]);
  const t6 = ND.array([0,0,3,2,1,2]);
  eq(ND.fancySelect(t5,t6).toNested(), [2,2,8,6,4,6], 'temp5[temp6] — groundtruth');
  eq(ND.fancySelect(t5,t6).shape, [6], '결과 shape 는 인덱스 배열을 따른다');
  eq(ND.sharesMemory(t5, ND.fancySelect(t5,t6)), false, '팬시 인덱싱은 사본');
}

/* --------------------------------------------------------- 합치기 */
{
  const a = ND.array([1,2,3]), b = ND.array([2,3,4]);
  eq(ND.vstack([a,b]).toNested(), [[1,2,3],[2,3,4]], 'vstack — groundtruth');
  eq(ND.vstack([a,b]).shape, [2,3], 'vstack shape');
  eq(ND.concatenate([a,b]).toNested(), [1,2,3,2,3,4], 'concatenate 1D');
  const c = ND.array([[1],[2],[3]]), d = ND.array([[2],[3],[4]]);
  eq(ND.hstack([c,d]).toNested(), [[1,2],[2,3],[3,4]], 'hstack — groundtruth');
  eq(ND.hstack([c,d]).shape, [3,2], 'hstack shape');
  eq(ND.stack([a,b]).shape, [2,3], 'stack axis=0');
  eq(ND.stack([a,b],1).shape, [3,2], 'stack axis=1 — 새 축을 만든다');
  eq(ND.stack([a,b],1).toNested(), [[1,2],[2,3],[3,4]], 'stack axis=1 내용');
  throws(() => ND.concatenate([a,b],1), '1D 에 axis=1 은 에러', /out of bounds/);
  throws(() => ND.concatenate([ND.zeros([2,3]), ND.zeros([2,4])],0), 'shape 불일치', /must match/);
}

/* -------------------------------------------------------- 선형대수 */
{
  const A = ND.array([[2,2,1],[2,-1,2],[1,-1,2]]);
  const b = ND.array([9,6,5]);
  const x = ND.solve(A,b);
  close(x.get([0]), 1, 'solve x=1 — groundtruth');
  close(x.get([1]), 2, 'solve y=2');
  close(x.get([2]), 3, 'solve z=3');
  close(ND.norm(ND.array([3,4])), 5, 'norm([3,4]) = 5');
  close(ND.norm(ND.array([1,2]).idx(':')), Math.sqrt(5), 'norm 뷰');
  close(ND.det(ND.array([[1,2],[3,4]])), -2, 'det 2x2');
  close(ND.norm(ND.ops.sub(ND.array([1,2]), ND.array([4,6]))), 5, '유클리드 거리 (1,2)-(4,6) = 5');
  // 내적
  close(ND.sum(ND.ops.mul(ND.array([1,0]), ND.array([0,1]))).toNested(), 0, '수직 벡터 내적 0');
}

/* -------------------------------------------------------- dtype 함정 */
{
  eq(ND.castValue(200, 'int8'), -56, 'int8 랩어라운드 200 → -56');
  eq(ND.castValue(128, 'int8'), -128, 'int8 128 → -128');
  eq(ND.castValue(1.7, 'int64'), 1, 'astype(int) 는 버림');
  eq(ND.castValue(-1.7, 'int64'), -1, 'astype(int) 음수도 0쪽으로 버림');
  eq(ND.array([1.7,-1.7]).astype('int64').toNested(), [1,-1], 'astype 배열');
  eq(ND.promote('int64','float64'), 'float64', 'int+float → float');
  eq(ND.promote('bool','int64'), 'int64', 'bool+int → int');
  throws(() => ND.array([[1,2],[3]]), '들쭉날쭉 리스트는 배열이 안 된다', /inhomogeneous/);
}

/* ----------------------------------------------------------- 포맷 */
{
  str(ND.format(ND.array([1,2,3])), '[1 2 3]', 'print(int 1D) — 콤마 없음');
  str(ND.format(ND.array([1,2,3]),{mode:'repr'}), 'array([1, 2, 3])', 'repr(int 1D) — 콤마 있음');
  str(ND.format(ND.array([1.0,2.0,3.0],'float64')), '[1. 2. 3.]', 'float 정수값 → 1. 2. 3.');
  str(ND.format(ND.array([[1,2],[3,4]])), '[[1 2]\n [3 4]]', 'print(2D)');
  str(ND.format(ND.array([true,false])), '[ True False]', 'bool 배열 정렬');
  str(ND.format(ND.arange(1,13).reshape([3,4])),
      '[[ 1  2  3  4]\n [ 5  6  7  8]\n [ 9 10 11 12]]', '2자리 정렬');
  str(ND.shapeStr([3]), '(3,)', 'shape (3,)');
  str(ND.shapeStr([]), '()', 'shape ()');
  str(ND.shapeStr([3,4]), '(3, 4)', 'shape (3, 4)');
  str(ND.fmtScalar(6.5,'float64'), '6.5', '스칼라 6.5');
  str(ND.fmtScalar(0,'float64'), '0.0', '스칼라 0.0');
}

/* ------------------------------------------- 관절염 데이터 (실제 파일) */
{
  const fs = require('fs');
  const path = 'C:/numpy/수업자료/lab_inflammation-01.csv';
  if (fs.existsSync(path)) {
    const rows = fs.readFileSync(path,'utf8').trim().split(/\r?\n/).map(l=>l.split(',').map(Number));
    const flat = rows.flat();
    const data = new ND.ND(flat.slice(), [60,40], null, 0, 'float64', null);
    eq(data.shape, [60,40], '관절염 shape (60,40)');
    eq(ND.max(data).toNested(), 20, 'max 20');
    eq(ND.min(data).toNested(), 0, 'min 0');
    close(ND.mean(data).toNested(), 6.14875, 'mean 6.14875');
    close(ND.std(data).toNested(), 4.613833197118566, 'std ≈ 4.6138', 1e-6);
    eq(ND.max(data.idx('0')).toNested(), 18, '0번 환자 최댓값 18');
    eq(ND.argmax(data.idx('0')).toNested(), 19, '0번 환자 argmax 19');
    close(ND.mean(data.idx(':, 0')).toNested(), 0, '첫째 날 평균 0.0');
    eq(ND.argmax(data,1).toNested().slice(0,12), [19,20,20,20,19,18,21,20,18,20,19,22],
       'argmax(axis=1) 앞 12개 — groundtruth');
    eq(ND.mean(data,0).shape, [40], 'mean(axis=0) → 날짜별 (40,)');
    eq(ND.mean(data,1).shape, [60], 'mean(axis=1) → 환자별 (60,)');
    // keepdims 브로드캐스팅 정규화
    const norm = ND.ops.sub(data, ND.reduce(data,{op:'mean',axis:1,keepdims:true}));
    eq(norm.shape, [60,40], 'keepdims 정규화 shape');
    throws(() => ND.ops.sub(data, ND.mean(data,1)), 'keepdims 없으면 브로드캐스팅 실패', /broadcast/);
  } else {
    console.log('  (관절염 CSV 없음 — 해당 테스트 생략)');
  }
}

/* ------------------------------------------------------------ 결과 */
console.log('');
if (fails.length) {
  console.log('실패 ' + fail + '건:');
  fails.forEach((f,i) => console.log('  ' + (i+1) + ') ' + f));
}
console.log(`\n통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
