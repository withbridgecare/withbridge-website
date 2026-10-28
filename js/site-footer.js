/* =========================================================
   위드브릿지 공용 푸터 (모든 페이지 공용)
   - index.html 의 푸터를 그대로 담아 두고, 각 페이지의
     <div id="wb-footer"></div> 자리를 이 마크업으로 바꿔 끼웁니다.
   - defer 없이(동기) 로드되므로, 바로 뒤에 이어서 실행되어 자리를
     바꿔 끼운 뒤 나머지 파싱이 이어집니다 — 깜빡임(FOUC) 없음.
   - 푸터 내용을 바꿀 땐 이 파일 하나만 고치면 모든 페이지에 반영됩니다.
   - '이용약관'/'개인정보 처리방침' 링크는 data-open-terms(팝업, js/terms-modal.js) 를 쓰지 않고
     target="_blank" 로 각 전용 페이지(terms.html/privacy.html)를 새 탭에서 바로 엽니다 — 신청서(apply.html,
     manager-apply.html)의 '동의하고 닫기' 흐름에서만 그 팝업을 계속 씁니다.
========================================================= */
(function () {
  'use strict';

  var FOOTER_HTML = '<footer style="background-color: #1A1D21 !important; color: #E5E7EB !important; padding: 64px 32px 48px 32px !important; font-family: \'Noto Sans KR\', sans-serif !important;">' +
    '<div style="max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 48px;">' +

      '<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 0px;">' +
        '<div style="display: flex; align-items: baseline; gap: 12px;">' +
          '<strong style="font-size: 20px; font-weight: 700; color: #ffffff !important;">위드브릿지</strong>' +
          '<span style="font-size: 14px; color: #a1a1aa !important;">WithBridge</span>' +
        '</div>' +
        '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 24px;">' +
          '<nav style="display: flex; align-items: center; gap: 16px; font-size: 14px;">' +
            '<a href="terms.html" target="_blank" rel="noopener" style="color: #d4d4d8 !important; text-decoration: underline; text-underline-offset: 4px;">이용약관</a>' +
            '<span style="width: 1px; height: 12px; background-color: rgba(255,255,255,0.2);"></span>' +
            '<a href="privacy.html" target="_blank" rel="noopener" style="color: #ffffff !important; font-weight: 700; text-decoration: underline; text-underline-offset: 4px;">개인정보 처리방침</a>' +
          '</nav>' +
          '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">' +
            '<a href="#instagram" style="display: inline-flex; align-items: center; justify-content: center; padding: 8px 18px; border-radius: 9999px; background-color: #ffffff !important; color: #18181b !important; font-size: 14px; font-weight: 700; text-decoration: none;"><span>인스타그램</span></a>' +
            '<a href="#youtube" style="display: inline-flex; align-items: center; justify-content: center; padding: 8px 18px; border-radius: 9999px; background-color: #ffffff !important; color: #18181b !important; font-size: 14px; font-weight: 700; text-decoration: none;"><span>유튜브</span></a>' +
            '<a href="#tiktok" style="display: inline-flex; align-items: center; justify-content: center; padding: 8px 18px; border-radius: 9999px; background-color: #ffffff !important; color: #18181b !important; font-size: 14px; font-weight: 700; text-decoration: none;"><span>틱톡</span></a>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="wb-footer-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 48px;">' +
        '<div style="display: flex; flex-direction: column;">' +
          '<h3 style="margin-bottom: 12px; font-size: 16px; font-weight: 700; color: #ffffff !important;">회사 정보</h3>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">상호명</span>' +
            '<span style="color: #f4f4f5 !important;">위드브릿지</span>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">대표자</span>' +
            '<span style="color: #f4f4f5 !important;">강승수</span>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">사업자등록번호</span>' +
            '<span style="color: #f4f4f5 !important;">등록 예정</span>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">통신판매업 신고번호</span>' +
            '<span style="color: #f4f4f5 !important;">등록 예정</span>' +
          '</div>' +
        '</div>' +

        '<div style="display: flex; flex-direction: column;">' +
          '<h3 style="margin-bottom: 12px; font-size: 16px; font-weight: 700; color: #ffffff !important;">연락처 &amp; 고객센터</h3>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">주소</span>' +
            '<span style="color: #f4f4f5 !important;">인천광역시 남동구 소래역로 93 (906-201)</span>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">전화번호</span>' +
            '<a href="tel:01055305760" style="color: #ffffff !important; font-weight: 500; text-decoration: none;">010-5530-5760</a>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">이메일</span>' +
            '<a href="mailto:withbridge.care@gmail.com" style="color: #ffffff !important; font-weight: 500; text-decoration: none;">withbridge.care@gmail.com</a>' +
          '</div>' +
          '<div style="display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; padding: 4px 0; font-size: 14px; overflow-wrap: anywhere;">' +
            '<span style="font-weight: 700; color: #ffffff !important;">운영시간</span>' +
            '<span style="color: #f4f4f5 !important;">평일 08:00 ~ 18:00 <span style="color: #a1a1aa !important;">(주말·공휴일 휴무)</span></span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div style="padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.1);">' +
        '<p style="margin: 0; font-size: 14px; color: #e4e4e7 !important;">© 2026 WithBridge. All rights reserved.</p>' +
      '</div>' +

    '</div>' +
  '</footer>';

  var mount = document.getElementById('wb-footer');
  if (mount) mount.outerHTML = FOOTER_HTML;
})();
