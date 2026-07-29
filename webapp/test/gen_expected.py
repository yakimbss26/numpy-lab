# -*- coding: utf-8 -*-
"""실제 NumPy 로 기대값을 뽑아 expected.json 에 쓴다.

실행:
  "C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe" webapp/test/gen_expected.py

이 파일이 만든 expected.json 을 cross.test.js 가 미니 엔진 결과와 대조한다.
손계산 정답표를 실제 NumPy 출력으로 대체하는 것이 목적이다.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, '..', '..', '수업자료', 'lab_inflammation-01.csv')

E = {}
def clean(v):
    """np 타입을 순수 파이썬으로 재귀 변환"""
    if isinstance(v, np.ndarray):
        return clean(v.tolist())
    if isinstance(v, np.generic):
        return v.item()
    if isinstance(v, (tuple, list)):
        return [clean(x) for x in v]
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    return v

def put(k, v):
    E[k] = clean(v)

# ---------------------------------------------------------------- arr5
a = np.arange(1, 13).reshape(3, 4)
put('arr5', a); put('arr5.shape', a.shape); put('arr5.dtype', str(a.dtype))
put('arr5.strides_elems', [s // a.itemsize for s in a.strides])
put('arr5.nbytes', a.nbytes); put('arr5.itemsize', a.itemsize)
put('sum', a.sum()); put('sum0', a.sum(0)); put('sum1', a.sum(1))
put('mean', a.mean()); put('mean0', a.mean(0)); put('mean1', a.mean(1))
put('std0ddof', a.std()); put('std1ddof', a.std(ddof=1))
put('var0ddof', a.var()); put('var1ddof', a.var(ddof=1))
put('min', a.min()); put('max', a.max()); put('ptp', np.ptp(a))
put('argmin', a.argmin()); put('argmax', a.argmax())
put('argmax1', a.argmax(1)); put('argmin0', a.argmin(0))
put('median', np.median(a))
put('p25', np.percentile(a, 25)); put('p50', np.percentile(a, 50)); put('p75', np.percentile(a, 75))
put('cumsum', a.cumsum()); put('prod_small', np.arange(1, 6).prod())
put('keepdims1', a.sum(axis=1, keepdims=True)); put('keepdims1.shape', a.sum(axis=1, keepdims=True).shape)
put('unravel_argmax', np.unravel_index(a.argmax(), a.shape))

# --------------------------------------------------------------- 3D axis
t = a.reshape(3, 2, 2)
put('t3d', t)
put('t3d.sum0', t.sum(0)); put('t3d.sum1', t.sum(1)); put('t3d.sum2', t.sum(2))
put('t3d.sum0.shape', t.sum(0).shape)
put('t3d.sum1.shape', t.sum(1).shape)
put('t3d.sum2.shape', t.sum(2).shape)
put('t3d.mean1', t.mean(1))
put('t3d.max2', t.max(2))

# --------------------------------------------------------------- 행렬곱
m = np.arange(1, 7).reshape(2, 3)
n = np.arange(7, 13).reshape(3, 2)
put('matmul', m @ n)
put('matmul.shape', (m @ n).shape)
put('dot_1d', np.array([1, 2, 3]) @ np.array([4, 5, 6]))
put('mat_vec', m @ np.array([1, 1, 1]))
put('PQ', np.array([[1, 2], [3, 4]]) @ np.array([[0, 1], [1, 0]]))
put('QP', np.array([[0, 1], [1, 0]]) @ np.array([[1, 2], [3, 4]]))
put('mT', m.T); put('mT.shape', m.T.shape)
put('mT.strides_elems', [s // m.T.itemsize for s in m.T.strides])
put('v1d_T.shape', np.array([1, 2, 3]).T.shape)
put('ABt_eq_BtAt', bool(np.array_equal((m @ n).T, n.T @ m.T)))

# --------------------------------------------------------- 브로드캐스팅
A = np.array([[0], [10], [20], [30]])
B = np.array([0, 1, 2])
put('bcast', A + B); put('bcast.shape', (A + B).shape)
put('bcast_to.strides_elems', [s // B.itemsize for s in np.broadcast_to(B, (4, 3)).strides])
put('bshape_34_4', list(np.broadcast_shapes((3, 4), (4,))))
put('bshape_31_14', list(np.broadcast_shapes((3, 1), (1, 4))))
put('gugudan', (np.arange(1, 10)[:, None] * np.arange(1, 10)).tolist())

# ---------------------------------------------------------------- 생성
put('arange5', np.arange(5))
put('arange_05', np.arange(0, 2, 0.5))
put('arange_05.dtype', str(np.arange(0, 2, 0.5).dtype))
put('linspace', np.linspace(0, 1, 5))
put('zeros25.dtype', str(np.zeros((2, 5)).dtype))
put('ones_like_int.dtype', str(np.ones_like(np.arange(30).reshape(5, 6)).dtype))
put('eye_3_5', np.eye(3, 5, dtype=int))
put('eye_3_5_k2', np.eye(3, 5, k=2, dtype=int))
put('identity3', np.identity(3, dtype=int))
put('diag2d', np.diag(np.arange(9).reshape(3, 3)))
put('diag1d', np.diag(np.array([1, 2, 3])))
put('diag1d_k1', np.diag(np.array([1, 2, 3]), k=1))

# ------------------------------------------------------------- reshape
mat = np.array([[1, 2, 5, 8], [1, 2, 5, 8]])
put('mat.reshape8', mat.reshape(8))
put('mat.reshape_1_2', mat.reshape(-1, 2))
put('mat.reshape222', mat.reshape(2, 2, 2))
m2 = np.array([[[1, 2, 3, 4], [1, 2, 5, 8]], [[1, 2, 3, 4], [1, 2, 5, 8]]])
put('m2.shape', m2.shape); put('m2.flatten', m2.flatten())
put('m2.flatten.size', m2.flatten().size)

# ------------------------------------------------------ 인덱싱/슬라이싱
insl = np.array([[1, 2, 3], [4, 5, 6]])
put('insl_1_01', insl[1:, 0:1]); put('insl_1_01.shape', insl[1:, 0:1].shape)
put('insl_1_13', insl[1, 1:3])
put('insl_13', insl[1:3])
put('insl_0.shape', insl[0].shape)
put('insl_001.shape', insl[0:1].shape)
put('insl_col.shape', insl[:, 0].shape)
put('insl_col01.shape', insl[:, 0:1].shape)
put('insl_59.shape', insl[5:9].shape)
r = np.arange(6)
put('rev', r[::-1]); put('r_1_5_2', r[1:5:2]); put('r_m2', r[-2:]); put('r_to_m2', r[:-2])
put('r_newax_front.shape', r[None, :].shape)
put('r_newax_back.shape', r[:, None].shape)
tt = np.arange(24).reshape(2, 3, 4)
put('ell.shape', tt[..., 1].shape)
put('t123', tt[1, 2, 3])

# --------------------------------------------------- 불리언 / 팬시
t4 = np.array([10, 20, 30, 40, 50, 60])
put('t4_gt35', (t4 > 35).tolist())
put('t4_sel', t4[t4 > 35])
put('where_idx', np.where(t4 < 35)[0])
put('where3', np.where(t4 > 10, 1, 0))
t5 = np.array([2, 4, 6, 8]); t6 = np.array([0, 0, 3, 2, 1, 2])
put('fancy', t5[t6]); put('fancy.shape', t5[t6].shape)
put('all_arange10', bool(np.all(np.arange(10))))
put('all_arange1_10', bool(np.all(np.arange(1, 10))))
put('any_gt5', bool(np.any(np.arange(10) > 5)))
t1 = np.array([1, 3, 0]); t2 = np.array([5, 2, 0])
put('cmp_gt', (t1 > t2).tolist()); put('cmp_eq', (t1 == t2).tolist())
put('cmp_gt2', (t1 > 2).tolist())
put('nan_eq_nan', bool(np.nan == np.nan))
tn = np.array([1, np.nan, np.inf])
put('tn.dtype', str(tn.dtype))
put('isnan', np.isnan(tn).tolist()); put('isfinite', np.isfinite(tn).tolist())

# ------------------------------------------------------------- 합치기
va, vb = np.array([1, 2, 3]), np.array([2, 3, 4])
put('vstack', np.vstack((va, vb))); put('vstack.shape', np.vstack((va, vb)).shape)
put('concat1d', np.concatenate((va, vb)))
ca = np.array([[1], [2], [3]]); cb = np.array([[2], [3], [4]])
put('hstack', np.hstack((ca, cb))); put('hstack.shape', np.hstack((ca, cb)).shape)
put('stack0.shape', np.stack((va, vb)).shape)
put('stack1', np.stack((va, vb), axis=1)); put('stack1.shape', np.stack((va, vb), axis=1).shape)

# ---------------------------------------------------------- 선형대수
LA = np.array([[2, 2, 1], [2, -1, 2], [1, -1, 2]], dtype=float)
Lb = np.array([9, 6, 5], dtype=float)
put('solve', np.linalg.solve(LA, Lb))
put('norm34', np.linalg.norm(np.array([3, 4])))
put('det12_34', np.linalg.det(np.array([[1, 2], [3, 4]], dtype=float)))
put('dist', np.linalg.norm(np.array([1, 2]) - np.array([4, 6])))

# ---------------------------------------------------------- dtype 함정
put('astype_trunc', np.array([1.7, -1.7]).astype(int))
put('round_bankers', np.round(np.array([0.5, 1.5, 2.5, 3.5])))
put('int8_wrap', np.array([200], dtype=np.int16).astype(np.int8))
put('float_eq', bool(0.1 + 0.2 == 0.3))
put('promote_int_float', str(np.result_type(np.int64, np.float64)))
put('sin30_wrong', float(np.sin(30)))
put('sin30_right', float(np.sin(np.deg2rad(30))))

# ------------------------------------------------------------- 포맷
put('fmt_print_int', str(np.array([1, 2, 3])))
put('fmt_repr_int', repr(np.array([1, 2, 3])))
put('fmt_print_float', str(np.array([1.0, 2.0, 3.0])))
put('fmt_print_2d', str(np.array([[1, 2], [3, 4]])))
put('fmt_print_bool', str(np.array([True, False])))
put('fmt_print_arr5', str(a))

# --------------------------------------------------------- 관절염 데이터
if os.path.exists(CSV):
    d = np.loadtxt(CSV, delimiter=',')
    put('inf.shape', d.shape); put('inf.dtype', str(d.dtype))
    put('inf.max', d.max()); put('inf.min', d.min())
    put('inf.mean', d.mean()); put('inf.std', d.std())
    put('inf.p0max', d[0].max()); put('inf.p0argmax', d[0].argmax())
    put('inf.day0mean', d[:, 0].mean())
    put('inf.argmax1', d.argmax(1))
    put('inf.mean0.shape', d.mean(0).shape)
    put('inf.mean1.shape', d.mean(1).shape)
    put('inf.mean0_first8', d.mean(0)[:8])
    put('inf.p4_first10', d[4][:10])
    put('inf.max20count', int((d.max(1) == 20).sum()))
    put('inf.mean_gt6count', int((d.mean(1) > 6).sum()))
    put('inf.norm.shape', (d - d.mean(axis=1, keepdims=True)).shape)
    put('inf.lt15_all_count', int((d < 15).all(axis=1).sum()))

E['_meta'] = {'numpy': np.__version__, 'python': sys.version.split()[0]}

with open(os.path.join(HERE, 'expected.json'), 'w', encoding='utf-8') as f:
    json.dump(E, f, ensure_ascii=False, indent=1)

print('expected.json 생성: %d개 항목 (numpy %s)' % (len(E) - 1, np.__version__))
