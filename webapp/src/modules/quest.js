/* ===========================================================================
 * quest.js — "스스로 하기" 과제 화면 (#/quest)
 *
 * 수업 과제로 나갔던 Colab 노트북 "NumPy 실습장 혼자 공부하기" 를 실습장 안으로
 * 옮긴 것이다. 노트북은 런타임이 끊기면 진도·예측·메모가 통째로 사라지지만
 * 이 화면은 localStorage 에 남는다.
 *
 * 구조는 노트북 그대로다 — 5단계 · 문항 23개 · 예측 5개 · 메모 8개 · 배지 5개.
 * 판정기(norm)도 노트북의 _n() 을 그대로 옮겼다.
 *
 * 노트북과 달라진 곳 하나: 노트북의 예측 4·5번은 _문제 에 없는 번호("예측4",
 * "예측5")를 써서 "생각이 바뀐 문항" 집계에서 조용히 빠졌다. 여기서는 다섯 개
 * 모두 실재하는 문항(2-1a, 2-3a, 3-1, 4-1a, 5-3)에 걸어 두었다.
 *
 * 이 화면은 장(chapter)이 아니다. Lab.register({ extra: true }) 로 등록해서
 * 사이드바 "학습 과정" 목록과 홈 타일, 이전/다음 줄에 끼어들지 않게 했다.
 * =========================================================================== */
(function () {
  'use strict';

  var UI = window.UI, ND = window.ND, el = UI.el;

  /* --------------------------------------------------------------- 저장소 */
  /* 장들과 같은 localStorage 키를 쓴다. 문항 정답 여부만 'quest:q<번호>' 로
   * 넣어서 UI.progress.stats('quest') 가 그대로 세게 했다(사이드바 점). */

  var P = UI.progress;

  function get(k, dflt) { var d = P.load(); return (k in d) ? d[k] : dflt; }
  function put(k, v) { var d = P.load(); d[k] = v; P.save(d); }

  function solved(id) { return get('quest:q' + id, false) === true; }
  function markSolved(id, ok) { P.mark('quest:q' + id, ok); }   /* emit → 사이드바 갱신 */
  function tries(id) { return get('quest:try:' + id, 0); }
  function bumpTries(id) { var n = tries(id) + 1; put('quest:try:' + id, n); return n; }
  function firstTry(id) { return get('quest:first:' + id, false) === true; }
  function prediction(id) { return get('quest:pre:' + id, ''); }
  function memoOf(id) { return get('quest:memo:' + id, ''); }

  /* ------------------------------------------------------------ 이름(프로필)
   * 학교 실습실처럼 한 컴퓨터를 여러 학생이 쓰면 localStorage 가 공유되어
   * 앞 사람의 답이 다음 사람에게 그대로 보인다. 그래서 "지금 하는 사람"을 두고,
   * 사람이 바뀌면 앞 사람 기록을 questbox:<이름> 으로 옮겨 두었다가 되돌린다.
   * 지우지 않으므로 다시 자기 이름을 넣으면 이어서 할 수 있다.
   *
   * 비밀번호는 없다. 남의 이름을 고르면 그 기록이 보인다 — 성적에 반영하지 않는
   * 과제라서 이 정도로 둔다. 성적에 쓰려면 서버가 있어야 한다. */

  var WHO = 'quest:who';
  var BOX = 'questbox:';

  function whoNow() { return get(WHO, ''); }

  /** 지금 화면에 올라와 있는 기록의 키들 (이름표는 뺀다) */
  function activeKeys(d) {
    return Object.keys(d).filter(function (k) { return k.indexOf('quest:') === 0 && k !== WHO; });
  }

  function boxNames() {
    return Object.keys(P.load())
      .filter(function (k) { return k.indexOf(BOX) === 0; })
      .map(function (k) { return k.slice(BOX.length); })
      .sort();
  }

  /** 사람 바꾸기 — 앞 사람 것을 상자에 넣고, 그 사람 것을 꺼내 온다 */
  function switchTo(name) {
    name = String(name == null ? '' : name).trim();
    if (!name) return false;
    var d = P.load();
    if (d[WHO] === name) return true;

    if (d[WHO]) {                       /* 앞 사람 기록을 상자에 보관 */
      var box = {};
      activeKeys(d).forEach(function (k) { box[k] = d[k]; });
      d[BOX + d[WHO]] = box;
    }
    activeKeys(d).forEach(function (k) { delete d[k]; });

    var mine = d[BOX + name];           /* 전에 하던 것이 있으면 되돌려요 */
    if (mine) {
      Object.keys(mine).forEach(function (k) { d[k] = mine[k]; });
      delete d[BOX + name];             /* 사본을 남기지 않아요 — 지금 것이 원본이에요 */
    }

    d[WHO] = name;
    P.save(d);
    return true;
  }

  /** 노트북 _n() 과 같은 정규화 — 공백·따옴표·괄호를 지우고 끝의 콤마를 턴다 */
  function norm(s) {
    s = String(s == null ? '' : s).trim().toLowerCase();
    s = s.replace(/[ \t'"[\]()]/g, '');
    while (s.charAt(s.length - 1) === ',') s = s.slice(0, -1);
    return s;
  }

  function matches(input, answers) {
    var n = norm(input);
    if (!n) return false;
    for (var i = 0; i < answers.length; i++) if (n === norm(answers[i])) return true;
    return false;
  }

  /* ------------------------------------------------------------- 문항 정의 */
  /* ch = 이 문항을 확인할 실습장 장 번호. LINKS 가 해시 경로로 바꿔 준다. */

  var LINKS = {
    '3': { id: 'ndarray', t: '배열과 dtype' },
    '4': { id: 'reshape', t: '배열의 모양 바꾸기와 뷰' },
    '5': { id: 'indexing', t: '인덱싱과 슬라이싱' },
    '7': { id: 'broadcast', t: '연산과 브로드캐스팅' },
    '8': { id: 'axis', t: '축(axis)과 수학·통계 함수' },
    '9': { id: 'condition', t: '조건, 논리, 결측치' }
  };

  var STAGES = [
    {
      n: '1단계',
      title: '지난 시간 코드를 다시 돌려 보기',
      badge: '출발 도장',
      intro: '지난 시간 노트북 마지막쯤에 있던 코드예요. 지금 그대로 돌리면 <b>에러가 나요.</b> ' +
             '9장을 열어 이유를 찾아봐요 — 대문자와 소문자를 눈여겨보면 돼요.',
      items: [
        {
          id: '1-1', ch: '9',
          code: 'temp3 = np.array([1, np.NaN, np.Inf])\ntemp3',
          q: '<code>np.NaN</code> 대신 무엇을 써야 하나요?',
          ph: '예: np.xxx',
          ans: ['np.nan', 'np.nan,np.inf', 'nan'],
          hint: '9장 맨 앞을 봐요. 대문자와 소문자의 차이에요.',
          explain: 'NumPy 2.0 부터 <code>np.NaN</code>, <code>np.Inf</code> 는 없어졌어요. ' +
                   '소문자 <code>np.nan</code>, <code>np.inf</code> 를 써요. ' +
                   '2024년 이전에 쓰인 코드를 그대로 돌리면 <code>AttributeError</code> 가 나는 이유가 이것이에요.'
        },
        {
          kind: 'predict',
          title: '화면을 열기 전에 — 다섯 가지 예측',
          note: '아직 확인하지 말고 <b>생각만</b> 적어 봐요. 이 다섯 개가 오늘의 지도가 돼요. ' +
                '틀려도 좋아요 — 오히려 틀렸다가 직접 뒤집은 것이 오늘 진짜로 배운 것이고, 맨 아래에서 그 목록을 보여 줘요.',
          code: 'a = np.arange(12).reshape(3, 4)',
          targets: [
            { id: '2-1a', q: '<code>b = a[0:2, 0:2]</code> 를 만든 다음 <code>b[0, 0] = 99</code> 를 했어요. <code>a[0, 0]</code> 은 얼마일까?' },
            { id: '2-3a', q: '<code>a[0].shape</code> 는 무엇일까?' },
            { id: '3-1', q: '모양 <code>(4, 1)</code> 과 <code>(3,)</code> 을 더하면 결과 모양은?' },
            { id: '4-1a', q: '<code>(3, 2, 2)</code> 배열에 <code>np.sum(axis=0)</code> 을 하면 결과 모양은?' },
            { id: '5-3', q: '<code>np.mean(np.array([1, 2, np.nan]))</code> 은 nan 이 돼요. 이것을 피하려면 어떤 함수를 써야 할까?' }
          ]
        }
      ]
    },

    {
      n: '2단계',
      title: '잘라 놓은 조각을 고쳤는데 원본이 바뀌어요',
      badge: '뷰 사냥꾼 배지',
      intro: '4장의 <b>뷰 vs 사본 실험실</b>로 가요. 메모리 칸 색이 겹치는 것을 직접 보면서 아래를 풀어 봐요.',
      base: 'a',
      items: [
        {
          id: '2-1a', ch: '4',
          code: 'a = np.arange(12).reshape(3, 4)\nb = a[0:2, 0:2]\nb[0, 0] = 99\nprint(a)',
          q: '<code>a[0, 0]</code> 의 값은?',
          ph: '숫자 하나',
          ans: ['99'],
          hint: 'b 가 새로 복사된 배열이라면 a 는 그대로일 것이에요. 메모리 칸 색을 봐요.',
          explain: 'b 는 새 배열이 아니라 <b>a 와 같은 메모리를 보고 있어요.</b> 그래서 b 를 고치면 a 가 바뀌어요.'
        },
        {
          id: '2-1b', ch: '4',
          q: '화면의 메모리 칸 그림에서 a 와 b 의 색이 <b>겹치는 칸은 몇 개</b>인가요?',
          ph: '개수',
          ans: ['4'],
          hint: '겹쳐서 칠해진 칸만 세면 돼요. 2행 2열이에요.'
        },
        {
          id: '2-1c', ch: '4',
          q: '그 겹치는 칸들의 <b>원래 값</b>을 순서대로 적어 봐요.',
          ph: '예: 3,7,11',
          ans: ['0,1,4,5'],
          hint: '<code>a = np.arange(12).reshape(3,4)</code> 의 왼쪽 위 네 칸이에요.',
          explain: 'a 의 0번, 1번, 4번, 5번 칸을 b 가 그대로 같이 쓰고 있어요.'
        },
        {
          kind: 'memo', id: '2-2',
          q: '지난 시간에 <code>insl[0][0] = 10</code> 을 하면 <code>insl</code> 이 바뀌었어요. 이건 그럴 만해요. ' +
             '그런데 <b>잘라낸 조각을 고쳤을 뿐인데</b> 원본까지 바뀐 건 왜일까? 화면에서 본 것을 근거로 자기 말로 적어 봐요.'
        },
        {
          id: '2-3a', ch: '5',
          code: 'a = np.arange(12).reshape(3, 4)\n\nprint(a[0].shape, a[0:1].shape)\nprint(a[:, 1].shape, a[:, 1:2].shape)',
          q: '<code>a[0]</code> 의 모양은?',
          ph: '예: 2,3',
          ans: ['4'],
          hint: '정수로 하나 집으면 그 축은 없어져요.'
        },
        { id: '2-3b', ch: '5', q: '<code>a[0:1]</code> 의 모양은?', ph: '예: 2,3', ans: ['1,4'], hint: '슬라이스는 축을 남겨요. 길이가 1 이어도 남아요.' },
        { id: '2-3c', ch: '5', q: '<code>a[:, 1]</code> 의 모양은?', ph: '예: 2,3', ans: ['3'], hint: '열 쪽을 정수로 집었어요.' },
        { id: '2-3d', ch: '5', q: '<code>a[:, 1:2]</code> 의 모양은?', ph: '예: 2,3', ans: ['3,1'], hint: '열 쪽을 슬라이스로 집었어요.' },
        {
          kind: 'memo', id: '2-3정리',
          q: '네 줄을 보고 알아낸 규칙을 <b>한 문장</b>으로 적어 봐요 — 정수로 집을 때와 잘라낼 때는 무엇이 다른가?'
        },
        {
          id: '2-4a', ch: '5',
          code: 'temp5 = np.array([2, 4, 6, 8])\ntemp6 = np.array([0, 0, 3, 2])\n\nf = temp5[temp6]\nf[0] = 100\nprint("팬시:", temp5)\n\nm = temp5[temp5 > 4]\nm[0] = 100\nprint("불리언:", temp5)',
          q: '<b>팬시 인덱싱</b>으로 만든 배열의 값을 바꾸면 원본도 바뀌나요? (예 / 아니오)',
          ph: '예 또는 아니오',
          ans: ['아니오', '아니요', 'no', '안바뀌어요', '안바뀜', 'x'],
          explain: '팬시 인덱싱은 <b>값을 복사해 와요.</b> 그래서 원본은 그대로예요.'
        },
        {
          id: '2-4b', ch: '5',
          q: '<b>불리언 인덱싱</b>은 어떤가? (예 / 아니오)',
          ph: '예 또는 아니오',
          ans: ['아니오', '아니요', 'no', '안바뀌어요', '안바뀜', 'x'],
          explain: '불리언 인덱싱도 사본이에요. 다만 <code>a[a &gt; 5] = 0</code> 처럼 <b>왼쪽에 쓰면</b> 원본이 바뀌어요 — 그건 인덱싱이 아니라 대입이기 때문이에요.'
        },
        {
          kind: 'memo', id: '2-5',
          q: '여기까지를 한 문장으로 정리해 봐요. — 슬라이싱은 ______ 이고, 불리언과 팬시 인덱싱은 ______ 이에요.'
        }
      ]
    },

    {
      n: '3단계',
      title: '크기가 다른 배열끼리 어떻게 더해질까',
      badge: '브로드캐스팅 배지',
      intro: '7장 <b>브로드캐스팅 시뮬레이터</b>에 아래 두 모양을 직접 넣어 봐요. ' +
             '축을 맞추고, 1 인 축을 늘리고, 결과가 정해지는 3단계가 그대로 보여요.',
      items: [
        {
          id: '3-1', ch: '7',
          code: 'a = np.array([[0], [10], [20], [30]])   # (4, 1)\nb = np.array([0, 1, 2])                 # (3,)\n\nprint(a + b)',
          q: '<code>a + b</code> 의 결과 모양은?',
          ph: '예: 2,3',
          ans: ['4,3'],
          hint: '뒤에서부터 축을 맞춰 봐요. (4,1) 과 (1,3) 이 돼요.',
          explain: '(4,1) 과 (3,) 을 뒤에서부터 맞추면 (4,1) 과 (1,3) 이 되고, 1 인 축이 늘어나 <b>(4,3)</b> 이 돼요.'
        },
        {
          id: '3-2', ch: '7',
          q: '화면의 <b>「늘리기의 정체 — stride 0」</b> 패널을 봐요. 늘어난 축의 <code>stride</code> 값은?',
          ph: '숫자 하나',
          ans: ['0'],
          hint: '늘어난 축을 따라가도 메모리에서 제자리라면 값은 얼마여야 할까.',
          explain: 'stride 가 0 이면 인덱스가 늘어나도 메모리 위치가 안 움직여요. ' +
                   '<b>같은 값을 다시 읽을 뿐 복사는 없어요.</b> 브로드캐스팅이 메모리를 늘리지 않는 이유예요.'
        },
        {
          kind: 'memo', id: '3-2설명',
          q: '그 숫자가 무슨 뜻일지 <b>메모리와 연결해서</b> 적어 봐요. (힌트: 인덱스가 늘어나는데 메모리 위치는 안 움직인다면?)'
        },
        {
          kind: 'memo', id: '3-3',
          q: '이번엔 일부러 실패시켜 봐요. 시뮬레이터에 모양 <code>(3,)</code> 과 <code>(2,)</code> 를 넣으면 진단이 나와요. ' +
             '두 배열은 <b>어떨 때</b> 서로 더해지지 않을까?'
        },
        {
          kind: 'design', id: '3-4', ch: '7',
          q: '이번엔 내가 만들어 볼 차례예요. 결과 모양이 <b>(2, 3, 4)</b> 가 되도록 두 배열의 모양을 직접 정해 봐요. 답은 하나가 아니에요.',
          explain: '브로드캐스팅으로 (2,3,4) 를 만드는 방법은 여러 가져요. 1 인 축을 어디에 두느냐가 전부예요.'
        }
      ]
    },

    {
      n: '4단계',
      title: 'axis 숫자를 바꾸면 무슨 일이 일어날까',
      badge: '축 정복 배지',
      intro: '지난 시간에는 <b>"axis=0 은 행 방향, axis=1 은 열 방향"</b> 이라고 배웠어요. ' +
             '2차원까지는 이 말로 맞힐 수 있어요. 3차원에서도 통하는지 봐요. ' +
             '8장 <b>axis 축소기</b>를 <b>3차원</b>으로 놓고 함께 보면 돼요.',
      base: 'arr3',
      items: [
        {
          id: '4-1a', ch: '8',
          code: 'arr = np.arange(1, 13).reshape(3, 2, 2)\n\nprint(np.sum(arr, axis=0).shape)\nprint(np.sum(arr, axis=1).shape)\nprint(np.sum(arr, axis=2).shape)',
          q: '<code>np.sum(arr, axis=0)</code> 의 결과 모양은?',
          ph: '예: 2,3',
          ans: ['2,2'],
          hint: 'axis=0 을 지우면 (3,2,2) 에서 무엇이 남을까.'
        },
        { id: '4-1b', ch: '8', q: '<code>axis=1</code> 의 결과 모양은?', ph: '예: 2,3', ans: ['3,2'], hint: '가운데 축이 사라져요.' },
        {
          id: '4-1c', ch: '8', q: '<code>axis=2</code> 의 결과 모양은?', ph: '예: 2,3', ans: ['3,2'],
          hint: '마지막 축이 사라져요.',
          explain: 'axis=1 과 axis=2 의 <b>결과 모양이 같아요.</b> 그래서 "행 방향·열 방향" 이라는 말로는 이 둘을 구별할 수 없어요. 값은 달라요.'
        },
        {
          id: '4-3', ch: '8',
          q: '모양이 같으니 <b>값</b>으로 구별해 봐요. <code>axis=1</code> 결과 배열의 값을 순서대로 적어 봐요.',
          ph: '예: 1,2,3,4',
          ans: ['4,6,12,14,20,22'],
          hint: '각 덩어리는 2행 2열이에요. 위아래를 더해 봐요.',
          explain: '각 덩어리 안에서 <b>위아래를 더한</b> 값이에요.'
        },
        {
          kind: 'memo', id: '4-4',
          q: '이제 규칙을 새로 써 봐요. <b>"방향" 이라는 말을 쓰지 말고</b> 적어 봐요. — <code>np.sum(a, axis=k)</code> 를 하면 ______'
        },
        {
          id: '4-5', ch: '8',
          code: 'arr5 = np.arange(1, 13).reshape(3, 4)\nprint(np.argmax(arr5, axis=1))',
          q: '<code>np.argmax(arr5, axis=1)</code> 의 결과 모양은?',
          ph: '예: 2,3',
          ans: ['3'],
          hint: '축 하나가 사라져요. 남는 축의 길이는?',
          explain: 'argmax 는 값이 아니라 <b>몇 번째인지</b>를 알려줘요. axis=1 이 사라져서 (3,) 이 남아요.'
        }
      ]
    },

    {
      n: '5단계',
      title: '숫자를 믿기 전에 한 번 더 보기',
      badge: '함정 탐지 배지',
      intro: '3장 <b>dtype 실험실</b>에는 함정이 세 가지 들어 있어요. 하나씩 확인해 봐요.',
      items: [
        {
          id: '5-1', ch: '3',
          code: 'x = np.int8(127)\nprint(x + np.int8(1))',
          q: '결과 값은?',
          ph: '숫자 하나',
          ans: ['-128'],
          hint: 'int8 이 담을 수 있는 가장 큰 수를 넘으면 어디로 갈까.',
          explain: 'int8 은 -128 부터 127 까지만 담아요. 127 에서 하나 더 가면 <b>반대쪽 끝으로 돌아요.</b>'
        },
        {
          id: '5-2', ch: '3',
          code: 'print(0.1 + 0.2)\nprint(0.1 + 0.2 == 0.3)',
          q: '둘째 줄은 참인가 거짓인가요?',
          ph: '참 또는 거짓',
          ans: ['false', '거짓', 'f', '아니오', '아니요', 'no'],
          hint: '실제로 <code>print(0.1 + 0.2)</code> 를 찍어 봐요.',
          explain: '0.1 과 0.2 는 이진법으로 딱 떨어지지 않아요. <b>아주 작은 오차가 남아요.</b> ' +
                   '실수를 <code>==</code> 로 비교하면 안 되는 이유예요 — <code>np.isclose</code> 를 써요.'
        },
        {
          id: '5-3', ch: '9',
          code: 'print(np.mean(np.array([1, 2, np.nan])))     # nan\nprint(np.??????(np.array([1, 2, np.nan])))   # 1.5',
          q: 'nan 을 빼고 평균을 내주는 함수의 이름은?',
          ph: '예: np.xxx',
          ans: ['np.nanmean', 'nanmean'],
          hint: '이름 앞에 nan 이 붙어요.',
          explain: 'nan 은 섞이면 <b>결과 전체로 번져요.</b> <code>np.nanmean</code> 은 nan 을 빼고 계산해요.'
        },
        {
          id: '5-4', ch: '8',
          code: 'print(np.std(arr5))\nprint(np.std(arr5, ddof=1))',
          q: '둘 중 수학 시간에 배운 <b>표본표준편차</b>는 어느 쪽인가요?',
          ph: 'ddof=0 또는 ddof=1',
          ans: ['ddof=1', 'ddof1', '1', '오른쪽', '두번째'],
          hint: '기본값 ddof=0 은 모표준편차예요.',
          explain: '<code>np.std</code> 의 기본은 <b>ddof=0</b> 이라 모표준편차예요. 통계 시간에 배운 표본표준편차는 <b>ddof=1</b> 이에요.'
        },
        {
          id: '5-5', ch: '8',
          code: 'print(np.round(0.5), np.round(2.5))',
          q: '두 값을 순서대로 적어 봐요.',
          ph: '예: 1.0,3.0',
          ans: ['0.0,2.0', '0,2'],
          hint: '둘 다 소수점 아래가 .5 인데 결과가 어떻게 나왔는지 그대로 적어 봐요.',
          explain: '<b>은행가 반올림</b>이에요. .5 는 가까운 <b>짝수</b> 쪽으로 가요. 학교에서 배운 "5 는 올림" 과 달라요.'
        }
      ]
    }
  ];

  var MEMO_LAST = [
    { kind: 'memo', id: '정리', q: '틀렸다가 직접 뒤집은 문항이 있을 것이에요. 정답이 무엇인지 말고, <b>내가 왜 그렇게 생각했는지</b>를 적어 봐요.' },
    { kind: 'memo', id: '한줄', q: '오늘 알게 된 것 중에 가장 기억에 남는 <b>한 가지</b>를 한 문장으로.' }
  ];

  function isAsk(it) { return !it.kind || it.kind === 'ask' || it.kind === 'design'; }

  function stageItems(s) { return s.items.filter(isAsk); }

  /* 정답이 있는 문항만 모은 목록 — 진도의 분모다 */
  var ALL = (function () {
    var out = [];
    STAGES.forEach(function (s) { stageItems(s).forEach(function (it) { out.push(it); }); });
    return out;
  })();

  var MEMOS = (function () {
    var out = [];
    STAGES.forEach(function (s) {
      s.items.forEach(function (it) { if (it.kind === 'memo') out.push(it); });
    });
    return out.concat(MEMO_LAST);
  })();

  function solvedCount() {
    var n = 0;
    ALL.forEach(function (it) { if (solved(it.id)) n++; });
    return n;
  }
  function memoCount() {
    var n = 0;
    MEMOS.forEach(function (m) { if (memoOf(m.id)) n++; });
    return n;
  }
  function stageDone(s) {
    return stageItems(s).every(function (it) { return solved(it.id); });
  }

  /* 진도 키를 미리 깔아 둔다 — 그래야 사이드바 점이 "23개 중 몇 개" 로 센다 */
  function seed() {
    var d = P.load(), touched = false;
    ALL.forEach(function (it) {
      if (!(('quest:q' + it.id) in d)) { d['quest:q' + it.id] = false; touched = true; }
    });
    if (touched) P.save(d);
  }

  /* ------------------------------------------------------------- 화면 조각 */

  function chapterChip(ch) {
    var L = LINKS[ch];
    if (!L) return null;
    return el('a', { class: 'chip', href: '#/' + L.id, text: ch + '장 열기 — ' + L.t });
  }

  /** 문항 하나 */
  function askCard(it, onSolve) {
    var box = el('div', { class: 'q' });
    box.appendChild(el('div', { class: 'q-stem', html: '<span class="q-no">' + it.id + '</span> ' + it.q }));
    if (it.code) box.appendChild(UI.code(it.code));

    var verdict = el('span', { class: 'q-verdict' });
    var explain = el('div', { class: 'q-explain', hidden: true, html: it.explain || '' });
    var hintBox = el('div', { class: 'q-hint', hidden: true, html: '힌트 — ' + (it.hint || '') });

    var value = '';
    var input = UI.textInput({
      value: '', placeholder: it.ph || '답',
      onChange: function (v) { value = v; },
      onEnter: function () { check(); }
    });

    function paint(state, msg) {
      verdict.setAttribute('data-state', state);
      verdict.textContent = msg;
    }

    function check() {
      if (!norm(value)) { paint('', '아직 답을 안 적었어요.'); return; }
      var n = bumpTries(it.id);
      if (matches(value, it.ans)) {
        var already = solved(it.id);
        if (!already && n === 1) put('quest:first:' + it.id, true);
        markSolved(it.id, true);
        paint('right', '맞았어요.' + (firstTry(it.id) ? '  (한 번에!)' : ''));
        if (it.explain) explain.hidden = false;
        var pre = prediction(it.id);
        if (pre && !matches(pre, it.ans)) {
          explain.hidden = false;
          if (!explain.querySelector('.q-flip')) {
            explain.appendChild(el('p', { class: 'q-flip', html:
              '처음에는 <b>' + UI.esc(pre) + '</b> 라고 생각했어요. 그게 오늘의 수확이에요.' }));
          }
        }
        onSolve();
      } else {
        paint('wrong', '아직 아니에요. (' + n + '번째 시도)');
        if (it.hint) hintBox.hidden = false;
        if (n >= 3 && it.ch) {
          hintBox.hidden = false;
          hintBox.innerHTML = '힌트 — ' + (it.hint || '') +
            '<br>' + it.ch + '장 화면을 다시 열어서 눈으로 확인하고 와요.';
        }
      }
    }

    box.appendChild(el('div', { class: 'q-answer' }, [input, UI.btn('확인', check, { primary: true }), verdict]));

    var meta = el('div', { class: 'q-meta' });
    var chip = chapterChip(it.ch);
    if (chip) meta.appendChild(chip);
    if (it.hint) meta.appendChild(UI.btn('힌트', function () { hintBox.hidden = false; }));
    box.appendChild(meta);
    box.appendChild(hintBox);
    box.appendChild(explain);

    /* 이미 푼 문항은 다시 열었을 때 그대로 보여 준다 */
    if (solved(it.id)) {
      paint('right', '지난번에 해결했어요.' + (firstTry(it.id) ? '  (한 번에!)' : ''));
      if (it.explain) explain.hidden = false;
    }
    return box;
  }

  /** 3-4 — 모양을 직접 설계하는 문항. 엔진으로 그 자리에서 판정한다. */
  function designCard(it, onSolve) {
    var box = el('div', { class: 'q' });
    box.appendChild(el('div', { class: 'q-stem', html: '<span class="q-no">' + it.id + '</span> ' + it.q }));

    var A = '2,3,1', B = '1,1,4';
    var verdict = el('span', { class: 'q-verdict' });
    var outBox = el('div');
    var explain = el('div', { class: 'q-explain', hidden: true, html: it.explain || '' });

    function parseShape(s) {
      var parts = String(s).replace(/[()[\]\s]/g, '').split(',').filter(function (x) { return x !== ''; });
      var sh = parts.map(Number);
      if (!sh.length) return null;
      for (var i = 0; i < sh.length; i++) {
        if (!isFinite(sh[i]) || sh[i] < 1 || sh[i] !== Math.floor(sh[i])) return null;
      }
      return sh;
    }

    function check() {
      UI.clear(outBox);
      var sa = parseShape(A), sb = parseShape(B);
      if (!sa || !sb) {
        verdict.setAttribute('data-state', 'wrong');
        verdict.textContent = '모양은 1 이상의 정수를 콤마로 적어요. 예: 2,3,1';
        return;
      }
      var r = ND.broadcastShapes(sa, sb);
      if (!r.ok) {
        verdict.setAttribute('data-state', 'wrong');
        verdict.textContent = '이 둘은 서로 더해지지 않아요.';
        outBox.appendChild(UI.errBlock(r.error, 'ValueError'));
        if (r.reason) outBox.appendChild(el('p', { class: 'q-hint', text: r.reason }));
        return;
      }
      outBox.appendChild(UI.out(
        ND.shapeStr(sa) + ' + ' + ND.shapeStr(sb) + '  →  ' + ND.shapeStr(r.shape), { label: '결과 모양' }));
      var n = bumpTries(it.id);
      var ok = r.shape.length === 3 && r.shape[0] === 2 && r.shape[1] === 3 && r.shape[2] === 4;
      if (ok) {
        if (!solved(it.id) && n === 1) put('quest:first:' + it.id, true);
        markSolved(it.id, true);
        verdict.setAttribute('data-state', 'right');
        verdict.textContent = '성공이에요. 직접 설계해서 맞혔어요.';
        explain.hidden = false;
        onSolve();
      } else {
        verdict.setAttribute('data-state', 'wrong');
        verdict.textContent = '목표는 (2, 3, 4) 예요. 1 인 축의 자리를 바꿔 봐요.';
      }
    }

    var inA = UI.textInput({ label: 'A 의 모양', value: A, onChange: function (v) { A = v; }, onEnter: check });
    var inB = UI.textInput({ label: 'B 의 모양', value: B, onChange: function (v) { B = v; }, onEnter: check });
    box.appendChild(el('div', { class: 'q-answer' }, [inA, inB, UI.btn('맞춰 보기', check, { primary: true }), verdict]));

    var meta = el('div', { class: 'q-meta' });
    var chip = chapterChip(it.ch);
    if (chip) meta.appendChild(chip);
    box.appendChild(meta);
    box.appendChild(outBox);
    box.appendChild(explain);

    if (solved(it.id)) {
      verdict.setAttribute('data-state', 'right');
      verdict.textContent = '지난번에 해결했어요.';
      explain.hidden = false;
    }
    return box;
  }

  /** 서술형 메모 — 판정하지 않는다. 자기 말로 적는 것이 목적이다. */
  function memoCard(m, onSave) {
    var box = el('div', { class: 'q' });
    box.appendChild(el('div', { class: 'q-stem', html: '<span class="q-no memo">메모</span> ' + m.q }));

    var ta = el('textarea', { placeholder: '자기 말로 한 문장이라도 적어 봐요' });
    ta.value = memoOf(m.id);
    var said = el('span', { class: 'q-verdict' });
    if (ta.value) { said.setAttribute('data-state', 'right'); said.textContent = '적어 두었어요.'; }

    box.appendChild(el('div', { class: 'q-note' }, [ta]));
    box.appendChild(el('div', { class: 'q-answer' }, [
      UI.btn('적어 두기', function () {
        var t = ta.value.trim();
        if (t.length < 5) {
          said.setAttribute('data-state', 'wrong');
          said.textContent = '한 문장이라도 좋으니 자기 말로 적어 봐요.';
          return;
        }
        put('quest:memo:' + m.id, t);
        said.setAttribute('data-state', 'right');
        said.textContent = '적어 두었어요. (지금까지 ' + memoCount() + '개)';
        onSave();
      }), said
    ]));
    return box;
  }

  /** 예측 다섯 개 — 확인하기 전에 생각을 먼저 적는다 */
  function predictCard(block, onSave) {
    var body = [el('p', { class: 'card-note', html: block.note })];
    if (block.code) body.push(UI.code(block.code));

    block.targets.forEach(function (t) {
      var val = prediction(t.id);
      var v = val;
      var said = el('span', { class: 'q-verdict' });
      if (val) { said.setAttribute('data-state', 'right'); said.textContent = '적어 두었어요: ' + val; }

      function save() {
        var txt = String(v == null ? '' : v).trim();
        if (!txt) return;
        put('quest:pre:' + t.id, txt);
        said.setAttribute('data-state', 'right');
        said.textContent = '적어 두었어요: ' + txt;
        onSave();
      }
      var inp = UI.textInput({ value: val, placeholder: '내 생각', onChange: function (x) { v = x; }, onEnter: save });

      body.push(el('div', { class: 'q predict' }, [
        el('div', { class: 'q-stem', html: '<span class="q-no">' + t.id + '</span> ' + t.q }),
        el('div', { class: 'q-answer' }, [inp, UI.btn('적어 두기', save), said])
      ]));
    });

    return UI.card({ kicker: '예측', title: block.title, body: body });
  }

  /* --------------------------------------------------------------- render */

  /** 이름을 받는 첫 화면. 공용 PC 에서 기록이 섞이지 않게 하는 장치다. */
  function renderGate(root) {
    root.appendChild(el('p', { class: 'lede', html:
      '이 과제는 <b>답·예측·메모가 이 컴퓨터에 저장돼요.</b> 여러 사람이 쓰는 컴퓨터라면 ' +
      '누구 것인지 구분해야 하므로, 시작하기 전에 이름을 넣어 둬요.' }));

    var v = '';
    var msg = el('span', { class: 'q-verdict' });

    function start(name) {
      if (!String(name || '').trim()) {
        msg.setAttribute('data-state', 'wrong');
        msg.textContent = '이름을 넣어야 시작할 수 있어요.';
        return;
      }
      switchTo(name);
      location.reload();
    }

    var input = UI.textInput({
      label: '이름', value: '', placeholder: '예: 김영아',
      onChange: function (x) { v = x; }, onEnter: function () { start(v); }
    });

    var body = [
      el('p', { class: 'card-note', html:
        '이름은 이 컴퓨터 안에만 저장돼요. 어디로도 전송되지 않고 선생님도 볼 수 없어요.' }),
      el('div', { class: 'q-answer' }, [input, UI.btn('시작하기', function () { start(v); }, { primary: true }), msg])
    ];

    var names = boxNames();
    if (names.length) {
      body.push(el('p', { class: 'card-note', text: '전에 하던 것이 있으면 이어서 할 수 있어요.' }));
      body.push(UI.chips(names, function (nm) { start(nm); }));
    }

    root.appendChild(UI.card({ kicker: '시작', title: '누가 하는지 알려 줘요', body: body }));

    root.appendChild(UI.callout('why',
      '한 컴퓨터를 여러 사람이 쓰면 브라우저 저장소가 공유돼요. 이름을 나눠 두면 ' +
      '다음 사람이 와도 앞 사람의 답이 보이지 않고, <b>앞 사람 기록도 지워지지 않아요</b> — ' +
      '나중에 자기 이름을 다시 넣으면 하던 데서 이어져요.<br>' +
      '다만 비밀번호는 없으므로 남의 이름을 고르면 그 기록이 보여요. ' +
      '점수를 매기는 과제가 아니니 서로의 것을 건드리지 말아요.', '왜 이름을 묻나'));
  }

  function render(root) {
    root.classList.add('quest');   /* .q-stem 의 "Q1." 카운터를 꺼요 */
    if (!whoNow()) { renderGate(root); return; }
    seed();

    root.appendChild(el('p', { class: 'lede', html:
      '지난 시간에 노트북으로 NumPy 를 한 번 훑었어요. 이번에는 그때 그림으로만 보고 넘어갔던 것들을 ' +
      '<b>화면에서 직접 움직여 보며</b> 확인해요. 잘라 놓은 조각을 고쳤는데 원본이 바뀌는 일, ' +
      '크기가 다른 배열끼리 더해지는 일, axis 숫자를 바꿀 때마다 결과 모양이 달라지는 일 — 이 셋이 축이에요.' }));

    root.appendChild(el('div', { class: 'quest-who' }, [
      el('span', { class: 'badge on', text: '✎ ' + whoNow() }),
      el('span', { class: 'note', text: '이 이름으로 기록돼요.' }),
      UI.btn('사람 바꾸기', function () {
        if (!confirm(whoNow() + ' 의 기록을 그대로 보관하고 처음 화면으로 돌아가요. 계속하겠나요?')) return;
        var d = P.load();
        var box = {};
        activeKeys(d).forEach(function (k) { box[k] = d[k]; delete d[k]; });
        d[BOX + d[WHO]] = box;
        delete d[WHO];
        P.save(d);
        location.reload();
      })
    ]));

    var progText = el('span');
    var progFill = el('i');
    root.appendChild(el('div', { class: 'quest-prog' }, [
      progText, el('span', { class: 'bar' }, [progFill])
    ]));

    var badgeRow = el('div', { class: 'badge-row' });
    root.appendChild(badgeRow);

    root.appendChild(UI.callout('tip',
      '<b>이렇게 하면 돼요.</b> ① 문제를 보면 <b>화면을 열기 전에</b> 예측을 먼저 적어요. ' +
      '② 문항 아래 <b>장 열기</b> 를 눌러 시뮬레이터에서 직접 확인해요. ③ 돌아와 답을 넣어요.<br>' +
      '틀려도 감점은 없어요. 맞을 때까지 몇 번이든 다시 해도 돼요 — 오히려 틀리라고 만든 문제예요. ' +
      '<b>예측이 틀렸다가 직접 뒤집은 문항이 오늘 진짜로 배운 것</b>이고, 맨 아래에서 그 목록을 보여 줘요.<br>' +
      '기록은 이 컴퓨터에 <b>내 이름으로</b> 저장되므로 창을 닫았어요 다시 와도 이어서 할 수 있어요. ' +
      '다른 사람이 쓸 차례면 위의 <b>사람 바꾸기</b> 를 눌러 줘요.',
      '과제 하는 법'));

    root.appendChild(UI.callout('why',
      '문제는 모두 <b>' + ALL.length + '개</b>, 서술형 메모가 <b>' + MEMOS.length + '개</b>예요. ' +
      '다섯 단계를 다 하면 배지 다섯 개를 모을 수 있어요. ' +
      '중심은 <b>4장·5장·7장·8장</b>이고 3장과 9장은 조금만 봐요. ' +
      '1장·2장·6장은 지난 시간에 이미 했으니 넘어가도 돼요.', '오늘 열어 볼 곳'));

    var certBox = el('div');

    function refresh() {
      var d = solvedCount(), t = ALL.length;
      progText.textContent = '진도 ' + d + ' / ' + t + '문항 · 메모 ' + memoCount() + ' / ' + MEMOS.length + '개';
      progFill.style.width = (t ? (d / t * 100) : 0).toFixed(0) + '%';

      UI.clear(badgeRow);
      STAGES.forEach(function (s) {
        var on = stageDone(s);
        badgeRow.appendChild(el('span', {
          class: 'badge' + (on ? ' on' : ''), text: (on ? '✓ ' : '· ') + s.badge
        }));
      });
      drawCert();
    }

    STAGES.forEach(function (s) {
      root.appendChild(el('h2', { class: 'h-sec', text: s.n + ' — ' + s.title }));
      if (s.intro) root.appendChild(el('p', { html: s.intro }));

      if (s.base === 'a') {
        var a = ND.arange(12).reshape([3, 4]);
        root.appendChild(UI.card({
          kicker: '이 단계에서 쓰는 배열',
          title: 'a = np.arange(12).reshape(3, 4)',
          body: [UI.grid(a, { showIndex: true, axisLabels: true }), UI.shapeBadge(a)]
        }));
      }
      if (s.base === 'arr3') {
        var arr3 = ND.arange(1, 13).reshape([3, 2, 2]);
        root.appendChild(UI.card({
          kicker: '이 단계에서 쓰는 배열',
          title: 'arr = np.arange(1, 13).reshape(3, 2, 2)',
          note: '3차원은 axis 0 을 층으로 펼쳐 나란히 그려요. 8장 화면과 같은 배열이에요.',
          body: [
            UI.grid(arr3, { axisLabels: true, layerLabel: function (L) { return 'arr[' + L + ']'; } }),
            UI.shapeBadge(arr3)
          ]
        }));
      }

      var quizBox = el('div', { class: 'quiz' });
      s.items.forEach(function (it) {
        if (it.kind === 'predict') {
          if (quizBox.childNodes.length) root.appendChild(quizBox);
          quizBox = el('div', { class: 'quiz' });
          root.appendChild(predictCard(it, refresh));
          return;
        }
        if (it.kind === 'memo') { quizBox.appendChild(memoCard(it, refresh)); return; }
        if (it.kind === 'design') { quizBox.appendChild(designCard(it, refresh)); return; }
        quizBox.appendChild(askCard(it, refresh));
      });
      if (quizBox.childNodes.length) root.appendChild(quizBox);
    });

    root.appendChild(el('h2', { class: 'h-sec', text: '오늘 정리하기' }));
    var lastBox = el('div', { class: 'quiz' });
    MEMO_LAST.forEach(function (m) { lastBox.appendChild(memoCard(m, refresh)); });
    root.appendChild(lastBox);

    root.appendChild(el('h2', { class: 'h-sec', text: '완주 확인서' }));
    root.appendChild(certBox);

    function drawCert() {
      UI.clear(certBox);

      var d = solvedCount(), t = ALL.length;
      var once = 0;
      ALL.forEach(function (it) { if (solved(it.id) && firstTry(it.id)) once++; });

      var name = whoNow();
      var badges = STAGES.filter(stageDone).map(function (s) { return s.badge; });

      var body = [];
      body.push(el('p', { class: 'cert-name', text: name }));
      body.push(UI.statRow([
        { k: '해결한 문제', v: d + ' / ' + t },
        { k: '한 번에 맞힌 것', v: once + '개' },
        { k: '적어 둔 생각', v: memoCount() + '개' }
      ]));
      body.push(el('p', { class: 'card-note', html: badges.length
        ? '모은 배지 — <b>' + badges.join(' · ') + '</b>'
        : '아직 배지가 없어요. 1단계부터 가 봐요.' }));

      if (d === t) {
        body.push(UI.callout('tip',
          '<b>전부 해냈어요.</b> 11장 코드 실습실에서 오늘 확인한 식들을 직접 입력해 보고, ' +
          '진짜 NumPy(Pyodide)로 같은 코드를 돌려 나란히 비교해 봐요.', '완주'));
      }

      /* 예측을 뒤집은 문항 — 이 과제가 노리는 진짜 성과다 */
      var flipped = ALL.filter(function (it) {
        var pre = prediction(it.id);
        return solved(it.id) && pre && !matches(pre, it.ans);
      });
      if (flipped.length) {
        body.push(el('h3', { class: 'h-sub', text: '오늘 생각이 바뀐 문항' }));
        body.push(UI.table(
          [{ k: 'no', label: '문항' }, { k: 'pre', label: '처음 생각' }, { k: 'now', label: '실제' }],
          flipped.map(function (it) {
            return { no: it.id, pre: prediction(it.id), now: it.ans[0] };
          })
        ));
        body.push(el('p', { class: 'card-note', text:
          '틀린 예측을 직접 뒤집은 것이에요. 이것이 오늘 배운 것의 목록이에요.' }));
      }

      certBox.appendChild(UI.card({ kicker: '확인서', title: 'NumPy 실습장 완주 확인서', body: body }));
      certBox.appendChild(el('div', { class: 'q-answer' }, [
        UI.btn(name + ' 의 과제 기록 지우기', function () {
          if (!confirm(name + ' 의 답·예측·메모를 모두 지워요. 다른 사람 기록과 장별 확인 문제 진도는 그대로 둬요. 계속하겠나요?')) return;
          var data = P.load();
          activeKeys(data).forEach(function (k) { delete data[k]; });
          delete data[BOX + name];
          P.save(data);
          location.reload();
        })
      ]));
    }

    refresh();
  }

  Lab.register({
    id: 'quest',
    extra: true,
    n: '과제',
    title: '스스로 하기 — NumPy 실습장 혼자 공부하기',
    blurb: '예측하고, 화면에서 확인하고, 답을 넣어요. 23문항 · 5단계 · 배지 5개. 기록은 이름별로 이 컴퓨터에 남아요.',
    sim: '자유 입력 판정 · 예측 뒤집기 추적 · 브로드캐스팅 설계 판정 · 완주 확인서',
    render: render
  });
})();
