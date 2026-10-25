/* =========================================================
   결제 확인 등 "결제창 성공 직후" 호출하는 Supabase Edge Function 전용 명시적 fetch 래퍼
   (apply.html issue-virtual-account, mypage.html confirm-extra-charge-payment,
   package.html confirm-package-order-payment 공용)

   supabaseClient.functions.invoke() 대신 window.fetch() 를 직접 써서 요청/응답을 명시적으로
   다룹니다. Edge Function 자체는 어느 환경에서 열든(127.0.0.1 로컬이든 배포된 도메인이든)
   항상 Supabase 클라우드에 배포돼 있으므로 이 호출은 그 둘을 가리지 않고 똑같이 동작합니다 —
   "로컬이라 안 들어오는" 건 PortOne 서버가 우리 쪽으로 보내는 inbound 웹훅뿐이고(공개 URL이
   있어야 함), 이건 브라우저가 Supabase로 보내는 outbound 호출이라 로컬/배포 여부와 무관합니다.

   사용법:
     const { data, error } = await WBEdgeFn.invoke(supabaseClient, 'confirm-package-order-payment', { order_id });
     if (error) { ... } // error.status, error.message, error.error(서버가 보낸 코드 문자열) 를 바로 읽을 수 있음
========================================================= */
(function () {
  'use strict';

  // js/auth-header.js 가 Supabase 클라이언트를 만들 때 쓰는 값과 반드시 같아야 합니다 — 둘 다 공개
  // 노출돼도 안전한 "publishable" 값(anon key)이라 여기 그대로 둬도 문제없습니다. supabaseClient
  // 인스턴스의 내부 속성(supabaseUrl/supabaseKey)을 읽어서 쓰는 방식은 "속성 이름이 그대로 있다는
  // 보장이 없는 비공개 구현 세부사항"에 기대는 것이라 — @supabase/supabase-js 버전이 바뀌면서 그
  // 속성이 없어지거나 달라지면, 이 함수가 "조용히" 아무 요청도 보내지 않고 여기서 바로 에러를
  // 반환해 버립니다(그러면 Edge Function 로그에는 당연히 아무것도 안 남습니다 — 요청이 브라우저를
  // 떠난 적이 없으니까요). 그래서 URL/anon key 는 추측하지 않고 이 두 상수로 고정합니다.
  var SUPABASE_URL = 'https://layvjisfeivkzowopkco.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_M7wpIAR7-aXvG78Xv-WBoQ_q1wj_FcR';

  async function invoke(supabaseClient, functionName, body) {
    // 이 줄이 브라우저 콘솔에 안 보인다면 invoke() 자체가 호출되지 않은 것입니다 — 호출부(try/catch)가
    // 그 앞 단계(예: PortOne.requestPayment 응답 처리)에서 이미 멈췄거나, WBEdgeFn 자체가 정의되지
    // 않았다는 뜻이니(스크립트 로드 실패/경로 오타) 네트워크 탭에서 edge-function-fetch.js 가 200으로
    // 로드됐는지부터 확인하세요.
    console.log('[WBEdgeFn][디버그] invoke() 호출됨 — functionName=' + functionName);

    // 로그인 세션이 있으면 사용자 액세스 토큰을, 없으면(비로그인 신청 등) anon key 를 그대로 Authorization
    // 에 씁니다 — apply.html 의 issue-virtual-account 는 비로그인 신청도 지원하므로 이 분기가 필요합니다.
    // authSource 를 같이 남겨서, 401 이 났을 때 "로그인 세션이 안 잡혀서 anon key 로 호출됐다"를
    // 바로 구분할 수 있게 합니다(로그인 상태인데도 anon key 로 넘어가면 세션 만료/타이밍 문제).
    let accessToken = SUPABASE_ANON_KEY;
    let authSource = 'anon_key(세션 없음)';
    let userIdForLog = null;
    try {
      if (!supabaseClient || !supabaseClient.auth) {
        console.error('[WBEdgeFn][디버그] supabaseClient 가 없거나 .auth 가 없습니다(초기화 실패?):', supabaseClient);
      } else {
        const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
        if (sessionErr) console.warn('[WBEdgeFn][디버그] getSession() 오류:', sessionErr);
        if (sessionData && sessionData.session && sessionData.session.access_token) {
          accessToken = sessionData.session.access_token;
          authSource = 'user_session';
          userIdForLog = sessionData.session.user && sessionData.session.user.id;
        }
      }
    } catch (e) {
      console.warn('[WBEdgeFn][디버그] 세션 조회 중 예외 — anon key 로 호출합니다:', e);
    }

    const url = SUPABASE_URL + '/functions/v1/' + functionName;
    const startedAt = Date.now();
    console.log('[WBEdgeFn][디버그] → ' + functionName + ' 요청 시작', {
      url: url,
      authSource: authSource,
      userId: userIdForLog,
      body: body || {}
    });

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessToken,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify(body || {})
      });
    } catch (e) {
      // 이 단계 예외는 "요청이 서버에 도달하지도 못했다"는 뜻입니다 — 브라우저 네트워크 탭에 요청 자체가
      // 안 보이거나 CORS/혼합 콘텐츠(mixed content)/DNS 오류로 끝나는 경우가 대부분입니다. TypeError:
      // Failed to fetch 가 바로 그 신호입니다.
      console.error('[WBEdgeFn][디버그] ✗ ' + functionName + ' — fetch() 자체가 실패(요청이 서버에 도달 못함):', e);
      return { data: null, error: { message: '서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.', cause: e } };
    }

    const elapsedMs = Date.now() - startedAt;
    // 응답 바디를 먼저 텍스트로 통째로 읽어 둡니다 — JSON.parse 가 실패해도(함수가 크래시해서 Deno가
    // 돌려주는 순수 텍스트/HTML 에러 페이지인 경우 등) 원문이 로그에 그대로 남아야 "뭐가 왔는지"를
    // 알 수 있습니다. res.json() 을 바로 호출하면 실패 시 바디 내용 자체가 사라집니다.
    let rawText = null;
    try { rawText = await res.text(); } catch (e) { console.warn('[WBEdgeFn][디버그] 응답 본문 읽기 실패:', e); }
    let json = null;
    if (rawText) {
      try { json = JSON.parse(rawText); } catch (e) { /* JSON 이 아님 — rawText 로만 남음 */ }
    }

    console.log('[WBEdgeFn][디버그] ← ' + functionName + ' 응답(' + elapsedMs + 'ms) — status=' + res.status +
      ' ' + res.statusText, { parsedJson: json, rawText: json ? undefined : rawText });

    if (!res.ok) {
      var message = (json && (json.message || json.error)) || rawText || ('HTTP ' + res.status);
      if (res.status === 401) {
        console.error('[WBEdgeFn][디버그] ⚠ 401 Unauthorized — authSource="' + authSource + '". ' +
          (authSource === 'anon_key(세션 없음)'
            ? '로그인 세션이 없어 anon key 로 호출됐습니다. 이 Edge Function이 verify_jwt=true 이면서 로그인 사용자를 요구한다면, 로그인 상태를 다시 확인하세요.'
            : '세션은 있었는데도 401 — 토큰 만료, 또는 Edge Function의 verify_jwt/내부 인증 로직을 확인하세요.'));
      } else if (res.status >= 500) {
        console.error('[WBEdgeFn][디버그] ⚠ ' + res.status + ' 서버 오류 — Edge Function 내부에서 처리 중 실패했습니다(코드 예외, DB 함수 오류, 환경변수 누락 등). ' +
          'supabase functions logs ' + functionName + ' --tail 로 그 시각의 실제 예외를 확인하세요.');
      } else if (res.status === 400) {
        console.error('[WBEdgeFn][디버그] ⚠ 400 — 요청 파라미터를 확인하세요. 보낸 body:', body);
      } else if (res.status === 404) {
        console.error('[WBEdgeFn][디버그] ⚠ 404 — 이 함수가 아직 배포되지 않았을 수 있습니다(supabase functions deploy ' + functionName + '), 또는 함수 내부에서 대상 행을 못 찾았다는 응답(예: ORDER_NOT_FOUND)일 수 있습니다. rawText 를 확인하세요.');
      }
      console.error('[WBEdgeFn][디버그] ✗ ' + functionName + ' 실패(status ' + res.status + '):', json || rawText || message);
      return { data: null, error: Object.assign({ status: res.status, message: message }, json || {}) };
    }

    return { data: json, error: null };
  }

  window.WBEdgeFn = { invoke: invoke };
})();
