import './home.css';
import type { Metadata } from 'next';
import { SERVICE, won } from '@/lib/services';
import { LoginGateLink } from '@/components/site/LoginGateLink';
import { PhoneLink } from '@/components/site/PhoneLink';
import { HomeBehaviors } from './HomeBehaviors';

export const metadata: Metadata = {
  title: { absolute: '위드브릿지 | WithBridge' },
  description: '사람과 사람을 잇는 따뜻한 연결, 위드브릿지 — 부모님의 안전한 병원길을 든든하게 동행하는 시니어 병원 동행·생활 편의 케어 서비스',
};

/**
 * 메인 페이지 — public/index.html 에서 옮김.
 * 화면 마크업은 여기(서버에서 미리 그림), 슬라이더·지도·FAQ 등 동작은 HomeBehaviors.tsx 에 있습니다.
 * 요금 카드 금액은 아직 여기 직접 적혀 있습니다 — 바꿀 때 lib/pricing.ts 와 서버 함수도 함께 (NEXTJS_MIGRATION_PLAN.md 6장).
 */
export default function HomePage() {
  return (
    <>
      {/* ==================================================================== 02. 메인 히어로 영역 (Hero Section) ==================================================================== 확장 가이드 — 지금은 2개 슬라이드(01. 시니어 안심 동행 / 02. 웰컴 쿠폰)지만, 아래 <script>의 setActive()/goTo() 는 슬라이드 개수를 하드코딩하지 않고 매번 .wb-hero-slide 개수를 DOM에서 그대로 읽습니다(var total = slides.length). 탭도 flex:1 1 0 로 균등분할이라 개수가 늘어도 레이아웃이 자동으로 재분배됩니다. 즉 "아동 케어" 같은 새 카테고리를 하나의 매니저 풀/유저 플로우로 통합하려면, JS를 고치지 않고 아래 3곳에 같은 인덱스(여기서는 "2")로 블록만 하나씩 추가하면 됩니다: 1) .wb-hero-slide 블록 (배경 사진 + data-title-strong/data-title-light/data-sub) 2) .wb-hero-cta-group[data-cta-slide="2"] 블록 (그 슬라이드 전용 CTA 버튼들) 3) .wb-hero-tabs 안의 .wb-hero-tab 버튼 (data-index="2") — 버튼 안 텍스트가 그 탭의 제목 세 블록의 순서(슬라이드 DOM 순서 = 탭 DOM 순서)만 서로 맞으면 되고, data-cta-slide 값만 그 슬라이드가 몇 번째인지(0-based)와 일치시키면 됩니다. */}
      {' '}
      {/* 키프레임 애니메이션 정의 */}
      {' '}
      {' '}
      {/* 메인 히어로 섹션: 풀블리드 인터랙티브 캐러셀 + 하단 균등분할 프로그레스 탭 내비게이션. 슬라이드(지금 2개: 이미지 + 헤드라인 2줄 + 서브카피)는 아래 .wb-hero-slide 의 data-* 속성에 담아두고, 탭을 클릭하면 JS(아래 <script>)가 배경 전환과 함께 헤드라인/서브카피 텍스트도 같이 바꿔치기합니다. CTA 버튼은 슬라이드마다 구성이 달라 .wb-hero-cta-group 블록을 슬라이드별로 두고 보이기/숨기기로 전환합니다. 슬라이드 추가 방법은 이 섹션 맨 위 "확장 가이드" 주석 참고. */}
      {' '}
      {/* 첫 화면(히어로 + 바로 아래 띠배너) 순수 CSS — 깜빡임(FOUC) 방지. Tailwind 는 CDN 스크립트(defer)라 HTML 이 다 그려진 "뒤"에 실행되어 유틸리티 클래스를 그때 만들어 붙입니다. 그래서 첫 화면이 먼저 그려지는 동안 버튼이 파란 밑줄 링크로 보이고(배경·여백·둥근 모서리 없음), 버튼 높이가 달라 히어로 글자 위치도 어긋났다가 Tailwind 가 붙는 순간 한꺼번에 바뀌었습니다. 아래 규칙은 같은 요소에 붙어 있는 Tailwind 클래스와 "똑같은 값"을 이 파일 자체의 CSS 로 미리 정의해, Tailwind 가 붙기 전 첫 페인트부터 최종 모습 그대로 보이게 합니다(Tailwind 가 붙은 뒤에도 값이 같아 아무것도 바뀌지 않음). 버튼/띠배너의 Tailwind 클래스를 바꿀 땐 여기도 같이 바꿔 주세요. */}
      {' '}
      <section className="wb-main-hero relative w-full overflow-hidden" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        {/* 슬라이드 2장: object-cover 로 화면을 빈틈없이 채우고, is-active 인 슬라이드만 opacity:1 로 보이는 크로스페이드 방식입니다(.wb-hero-slide, .wb-hero-img object-position 은 위 <style> 참고). */}
        <div className="wb-hero-slide is-active" data-title-strong="사람과 사람을 잇는" data-title-light="따뜻한 연결의 시작." data-sub="부모님의 안전한 병원길, 위드브릿지가 든든하게 동행합니다.">
          <img src="/images/hero-slide-1.webp" alt="" className="wb-hero-img absolute inset-0 w-full h-full object-cover" loading="eager" decoding="async" />
          {' '}
          {/* 세이지 그린 톤 일러스트(균일하게 밝아 기본/strong 스크림으로는 대비 부족) 전용 최강 스크림 — .wb-hero-scrim--illustration 참고 */}
          <div className="wb-hero-scrim wb-hero-scrim--illustration"></div>
        </div>
        <div className="wb-hero-slide" data-title-strong="첫 동행 웰컴 쿠폰" data-title-light="& 프렌즈 후기 10% 적립" data-sub="가입 즉시 사용 가능한 할인 쿠폰과 재이용 시 현금처럼 쓰는 적립금 혜택을 드립니다.">
          <img src="/images/hero-slide-2.webp" alt="" className="wb-hero-img absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
          {' '}
          {/* 웰컴 쿠폰 · 골드 코인 일러스트(슬라이드 1과 같은 세이지 그린 톤의 밝은 3D 렌더링이라 어두운 그림자가 없음) — 기본/strong 스크림으로는 대비 부족해 1번 슬라이드와 같은 최강 스크림을 씁니다 (.wb-hero-scrim--illustration 참고). 쿠폰·코인이 세로 중단~하단에 걸쳐 있어 기본 object-position (center 55%)만으로 구도가 충분해 별도 보정(과거 .wb-hero-slide--photo2)은 더 필요하지 않습니다. */}
          <div className="wb-hero-scrim wb-hero-scrim--illustration"></div>
        </div>
        {/* 좌우 쉐브론 화살표: 원형 배경 없는 크고 또렷한 화이트 아이콘만 */}
        {' '}
        <button type="button" className="wb-hero-arrow wb-hero-arrow--prev" aria-label="이전 슬라이드">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        {' '}
        <button type="button" className="wb-hero-arrow wb-hero-arrow--next" aria-label="다음 슬라이드">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        {' '}
        {/* 우측 하단 가장자리 재생/일시정지 토글 */}
        {' '}
        <button type="button" className="wb-hero-playpause" aria-label="일시정지">
          <svg className="wb-hero-playpause-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1"></rect>
          </svg>
        </button>
        {' '}
        {/* 단일 콘텐츠 블록(좌측 정렬): 타이틀 → 서브카피 → CTA 3단을 한 컬럼에 세로로 묶습니다. 우측은 비워 두어 손 맞잡은 배경 사진이 그대로 드러나게 합니다. */}
        <div className="wb-hero-content">
          <div className="wb-hero-text-wrap flex flex-col items-start" style={{ opacity: "0", animation: "heroFadeInUp 0.8s cubic-bezier(0.25, 1, 0.5, 1) 0.1s forwards" }}>
            {/* 메인 헤드라인(모시미 스타일: SemiBold 600, clamp 크기) + 서브카피 한 줄 + CTA 의 3단 구조. 하단 탭이 이미 슬라이드 주제를 안내하므로 상단 배지는 두지 않습니다. 타이틀/서브카피는 .wb-hero-title / .wb-hero-sub 순수 CSS 클래스로 색상·크기·여백을 지정합니다(이유는 위 .wb-hero-title 규칙의 주석 참고 — Tailwind 유틸리티와 섞지 않습니다). */}
            <div className="wb-hero-text-fade">
              <h1 className="wb-hero-title">
                <span id="wbHeroTitleStrong">
                  사람과 사람을 잇는
                </span>
                {' '}
                <span id="wbHeroTitleLight">
                  따뜻한 연결의 시작
                </span>
              </h1>
              <p className="wb-hero-sub" id="wbHeroSub">
                부모님의 안전한 병원길, 위드브릿지가 든든하게 동행합니다.
              </p>
            </div>
            {/* CTA 그룹: 슬라이드마다 버튼 구성/동작이 완전히 달라서 텍스트 바꿔치기 대신 그룹 자체를 보이기/숨기기 합니다(아래 <script> setActive() 참고). 서브 문구 아래 여백(mb-7/mb-8)이 CTA 와의 간격을 이미 만들어주므로 여기엔 별도 margin-top 을 더 얹지 않습니다. */}
            <div className="wb-hero-cta-group is-active" data-cta-slide="0">
              <div className="wb-hero-cta flex flex-col w-full gap-2 md:flex-row md:w-auto md:gap-4">
                <LoginGateLink href="/apply" className="wb-hero-btn wb-hero-btn--primary flex items-center justify-center gap-2 bg-[#2E6D53] hover:bg-[#245742] text-white font-bold w-full py-3 md:py-4 text-base rounded-xl shadow-lg transition-transform active:scale-95 md:w-auto md:px-8" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
                  동행 서비스 신청하기
                </LoginGateLink>
                {' '}
                <PhoneLink className="wb-hero-btn wb-hero-btn--light flex items-center justify-center gap-2.5 bg-white/95 hover:bg-white text-gray-900 font-semibold border border-white/40 w-full py-3 md:py-4 text-base rounded-xl shadow-md transition-all active:scale-95 md:w-auto md:px-8" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  {' '}전화 상담 문의
                </PhoneLink>
              </div>
            </div>
            <div className="wb-hero-cta-group" data-cta-slide="1">
              <div className="wb-hero-cta flex flex-col w-full gap-2 md:flex-row md:w-auto md:gap-4">
                <a href="/signup" id="wbHeroCouponBtn" className="wb-hero-btn wb-hero-btn--primary flex items-center justify-center gap-2 bg-[#2E6D53] hover:bg-[#245742] text-white font-bold w-full py-3 md:py-4 text-base rounded-xl shadow-lg transition-transform active:scale-95 md:w-auto md:px-8" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
                  회원가입하고 쿠폰 받기 →
                </a>
              </div>
            </div>
          </div>
        </div>
        {/* 최하단 프로그레스 바 탭 내비게이션 (현재 2개, flex:1 1 0 로 균등분할 — 아동 케어 탭을 추가하면 3분할로 자동 재배치됨). 새 탭을 추가할 때는 .wb-hero-tab-track/.wb-hero-tab-fill 구조와 data-index 값(새 슬라이드 순서와 동일한 0-based 인덱스)만 그대로 맞추면 됩니다. */}
        <div className="wb-hero-tabs" role="tablist" aria-label="히어로 슬라이드 선택">
          <button type="button" className="wb-hero-tab is-active" role="tab" aria-selected="true" data-index="0">
            <span className="wb-hero-tab-track">
              <span className="wb-hero-tab-fill"></span>
            </span>
            {' '}
            <span>
              01. 시니어 안심 동행 서비스
            </span>
          </button>
          {' '}
          <button type="button" className="wb-hero-tab" role="tab" aria-selected="false" data-index="1">
            <span className="wb-hero-tab-track">
              <span className="wb-hero-tab-fill"></span>
            </span>
            {' '}
            <span>
              02. 첫 이용 웰컴 쿠폰 &amp; 리워드 혜택
            </span>
          </button>
        </div>
      </section>
      {/* 히어로 캐러셀 동작 스크립트: 탭 클릭/화살표/자동 재생(진행 바와 동기화)을 하나의 상태로 관리합니다. 슬라이드 전환은 requestAnimationFrame 기반 타이머로 진행 바 width 를 매 프레임 갱신하다가 설정 시간(SLIDE_DURATION)에 도달하면 다음 슬라이드로 넘어가고, 일시정지 시엔 타이머만 멈춰 진행 바가 멈춘 지점에서 그대로 보이게(리셋되지 않게) 합니다. */}
      {' '}
      {' '}
      {/* '1시간 라이트 케어' 오픈 안내 띠 배너 — 히어로 바로 아래, 본문 시작 지점. 2시간 최소 이용 조건 때문에 망설이던 보호자(수면내시경 귀가, 퇴원 수속, 단기 외출 등)에게 짧은 서비스도 있다는 걸 바로 알립니다. html { scroll-behavior: smooth } 가 전역 적용돼 있어 #services 앵커 이동만으로도 부드럽게 스크롤됩니다(별도 스크립트 불필요). 전구 아이콘은 인위적인 느낌이라 빼고, 운영진이 직접 안내하는 듯한 자연스러운 문구만 담았습니다. */}
      <div className="wb-m-strip w-full" style={{ background: "#1F5C45" }}>
        <div className="wb-strip-inner mx-auto flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3 px-5 py-4" style={{ maxWidth: "1380px" }}>
          <p className="wb-strip-text text-white text-[13.5px] sm:text-[15px] font-semibold text-center sm:text-left" style={{ wordBreak: "keep-all", margin: "0", lineHeight: "1.55" }}>
            짧은 검진 귀가나 장보기가 필요할 때! 부담 없는{' '}
            <strong className="font-extrabold">
              '1시간 라이트 케어'
            </strong>
            를 만나보세요
          </p>
          <a href="#lite-care" className="wb-strip-btn shrink-0 inline-flex items-center gap-1 text-white text-[13px] sm:text-sm font-bold bg-white/15 hover:bg-white/25 border border-white/30 rounded-full px-4 py-1.5 transition-colors" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
            1시간 요금 보기 →
          </a>
        </div>
      </div>
      {/* 토스트 알림 (회원가입 축하 웰컴 쿠폰 발급 안내 — wbNotifyWelcomeCouponIfAny 참고) */}
      <div id="wbToast" className="fixed bottom-8 left-1/2 z-[9999]" style={{ transform: "translate(-50%, 12px)", opacity: "0", visibility: "hidden", transition: "opacity 0.25s ease, transform 0.25s ease" }}>
        <div className="px-5 py-3.5 rounded-full text-[14px] font-semibold text-white shadow-lg" style={{ backgroundColor: "#3B4B3C", whiteSpace: "nowrap" }}>
          <span id="wbToastText"></span>
        </div>
      </div>
      {' '}
      {/* ==================================================================== 03. ==================================================================== */}
      {' '}
      {/* 소개 페이지(story.html) 핵심 요약 섹션: 기존에 "02. 메인 히어로"와 카피가 겹치던 "원스톱 시니어 케어" 섹션을 대체합니다. */}
      {' '}
      {/* 3대 핵심 가치 카드 전용 스타일 — Tailwind CDN 유틸리티 대신 이 블록의 커스텀 클래스를 씁니다. backdrop-filter 블러/새츄레이션 + 반투명 그라데이션 배경은 Tailwind 조합 클래스로 쓰면 CDN JIT 파싱이 불안정할 수 있어, 이 파일 자체의 <style>(Tailwind 보다 먼저 파싱되지만 더 구체적인 클래스라 안전하게 이김)로 직접 정의합니다. 리퀴드 글래스(Liquid Glass) 업그레이드: 불투명 화이트 카드 → 뒤 숲 배경(annie-spratt)이 블러를 통해 비쳐 보이는 반투명 유리판. box-shadow 는 외부 드롭섀도우(뜨는 느낌) + inset 하이라이트 2겹(위쪽은 밝게, 아래쪽은 옅게 — 유리 단면에 빛이 위에서 맺히는 효과)으로 구성합니다. 배경이 전반적으로 어두운 숲 사진+블랙 오버레이라, 카드 투명도가 낮아지는 하단/우측에서도 대비가 깨지지 않도록 제목/본문은 다크 텍스트 대신 화이트 + 미세 text-shadow 로 통일했습니다(기존 다크 차콜 텍스트는 유리 안쪽이 어두워지는 쪽에서 가독성이 떨어짐). */}
      {' '}
      <section className="wb-m-story relative py-24 md:py-32 px-5 bg-cover bg-center" style={{ fontFamily: "'Noto Sans KR', sans-serif", backgroundImage: "url('/images/annie-spratt-Hn6PkNjEkUY-unsplash.webp')" }}>
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative z-10 max-w-6xl mx-auto">
          {/* 타이틀 영역 */}
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-[26px] md:text-[36px] font-bold mb-5 leading-snug text-white" style={{ letterSpacing: "-0.02em", wordBreak: "keep-all" }}>
              늘 함께하지 못하는 죄송함,
              <br className="md:hidden" />
              {' '}위드브릿지가 든든함으로 채웁니다
            </h2>
            <p className="text-[15px] md:text-[17px] max-w-2xl mx-auto text-white" style={{ wordBreak: "keep-all", lineHeight: "1.7" }}>
              부모님의 병원길이 외롭거나 불안하지 않도록,
              <br className="md:hidden" />
              {' '}전문 매니저가 처음부터 끝까지 함께합니다.
            </p>
          </div>
          {/* 3대 핵심 가치 카드 (3열 그리드) */}
          <div className="wb-m-story-grid grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* 카드 1: 100% 검증된 전문 매니저 */}
            <div className="wb-feature-card group p-8 md:p-10 flex flex-col">
              <span className="wb-feature-icon flex items-center justify-center w-14 h-14 rounded-full mb-6 shrink-0">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path>
                  <path d="m9 12 2 2 4-4"></path>
                </svg>
              </span>
              <h3 className="wb-feature-title text-[18px] md:text-[19px] font-bold mb-3">
                100% 검증된 전문 매니저
              </h3>
              <p className="wb-feature-desc text-[14.5px] leading-relaxed" style={{ wordBreak: "keep-all" }}>
                간호사·요양보호사 등 전문 자격을 보유한 매니저만 철저한 검증을 거쳐 배정됩니다.
              </p>
            </div>
            {/* 카드 2: 실시간 안심 동행 리포트 */}
            <div className="wb-feature-card group p-8 md:p-10 flex flex-col">
              <span className="wb-feature-icon flex items-center justify-center w-14 h-14 rounded-full mb-6 shrink-0">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"></path>
                </svg>
              </span>
              <h3 className="wb-feature-title text-[18px] md:text-[19px] font-bold mb-3">
                실시간 안심 동행 리포트
              </h3>
              <p className="wb-feature-desc text-[14.5px] leading-relaxed" style={{ wordBreak: "keep-all" }}>
                진료 과정과 의사 전달 사항을 카톡으로 실시간 공유해 언제든 안심하고 확인하실 수 있습니다.
              </p>
            </div>
            {/* 카드 3: 출발부터 귀가까지 풀케어 */}
            <div className="wb-feature-card group p-8 md:p-10 flex flex-col">
              <span className="wb-feature-icon flex items-center justify-center w-14 h-14 rounded-full mb-6 shrink-0">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
              </span>
              <h3 className="wb-feature-title text-[18px] md:text-[19px] font-bold mb-3">
                출발부터 귀가까지 풀케어
              </h3>
              <p className="wb-feature-desc text-[14.5px] leading-relaxed" style={{ wordBreak: "keep-all" }}>
                접수, 진료, 수납, 약 수령, 귀가까지 전 과정을 매니저가 처음부터 끝까지 밀착 케어합니다.
              </p>
            </div>
          </div>
          {/* 소개 페이지(story.html) 연결 링크 */}
          <div className="text-center mt-12 md:mt-16">
            <a href="/story" className="inline-flex items-center gap-2 bg-[#2E6D53] hover:bg-[#245742] text-white font-bold px-8 py-3.5 text-[15px] rounded-full shadow-md transition-colors duration-300" style={{ textDecoration: "none" }}>
              위드브릿지 이야기 더 보기{' '}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
          </div>
        </div>
      </section>
      {/* ==================================================================== 04. ==================================================================== */}
      {' '}
      {/* 위드브릿지 주요 동행 지원 지역 — 구 단위 탭 + 지도 포커스 */}
      {' '}
      <div className="wb-area-section">
        <div className="wb-area-wrap">
          {/* 헤더 */}
          <div className="wb-area-header">
            <h2 className="wb-area-title">
              주요 동행 지원 지역
            </h2>
            <p className="wb-area-sub">
              원하시는 지역을 선택해 상세 커버리지를 확인하세요.
            </p>
          </div>
          {/* 지역 선택 탭 (구 단위 독립) */}
          <div className="wb-area-tabs" id="wbRegionTabs" role="tablist" aria-label="동행 지원 지역 선택">
            <button type="button" className="wb-area-tab is-active" role="tab" aria-selected="true" data-region="namdong">
              남동구
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="yeonsu">
              연수구
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="michuhol">
              미추홀구
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="bupyeong">
              부평구
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="gyeyang">
              계양구
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="seo">
              서구
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="siheung">
              시흥시
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="bucheon">
              부천시
            </button>
            {' '}
            <button type="button" className="wb-area-tab" role="tab" aria-selected="false" data-region="ansan">
              안산시
            </button>
          </div>
          {/* 좌우 분할: 지도 / 텍스트 상세 */}
          <div className="wb-area-grid">
            <div id="wbRegionMap" className="wb-area-map"></div>
            <div className="wb-area-detail" id="wbAreaDetail" role="tabpanel">
              <div className="wb-area-badge">
                밀착 케어 지원 지역
              </div>
              <h3 className="wb-area-region-title" id="wbAreaRegionTitle">
                인천 남동구
              </h3>
              <div className="wb-area-list">
                <div className="wb-area-item">
                  <strong>
                    주요 커버리지
                  </strong>
                  <span id="wbAreaCoverage">
                    논현동 · 구월동 · 만수동
                  </span>
                </div>
                <div className="wb-area-item">
                  <strong>
                    전담 매니저
                  </strong>
                  거주지 인근 검증된 매니저 1:1 매칭
                </div>
                <div className="wb-area-item">
                  <strong>
                    안심 리포트
                  </strong>
                  동행 종료 후 보호자 실시간 결과 전송
                </div>
              </div>
              <p className="wb-area-summary">
                100% 검증 매니저 · 08-18시 실시간 상담 · 인천·경기 전 권역
              </p>
            </div>
          </div>
        </div>
      </div>
      {' '}
      {/* ==================================================================== 05. ==================================================================== */}
      {' '}
      {/* 위드브릿지 이용 요금 안내 & 실시간 계산기 (최종) */}
      {' '}
      {' '}
      {/* id="services" 속성을 추가하여 상단 메뉴 링크와 연결 */}
      <div className="wb-price-page wb-price-page--summary" id="services">
        <div className="wb-price-container">
          {/* 0. 페이지 헤더 (브랜드명 제외하여 깔끔하게 변경) */}
          <div className="wb-page-header">
            <h1 className="wb-page-title">
              이용 요금 안내
            </h1>
            <p className="wb-page-desc">
              어르신의 안전한 병원 진료와 편안한 일상을 연결하는
              <br />
              {' '}1:1 맞춤형 동행 케어 서비스를 제공합니다.
            </p>
            {/* 첫 이용 혜택 안내 — 기본 요금표에는 정상가만 깔끔하게 두고, 5,000원 할인 혜택은 여기 상단 안내 배너에서만 직관적으로 보여줍니다. */}
            <div className="wb-firstuse-banner">
              <span className="wb-firstuse-text">
                <strong>
                  첫 이용 혜택
                </strong>
                {' '}· 신규 회원 첫 결제 시 5,000원 웰컴 쿠폰이 자동 적용돼요.
              </span>
            </div>
          </div>
          {/* 3단 SaaS 프라이싱 카드 — 라이트 케어 / 시니어 병원 동행(메인 추천) / 생활·복합 동행. 각 카드의 가격·명칭은 apply.html SERVICES 및 아래 4번 계산기 옵션과 반드시 같은 이름/금액으로 유지하세요(1시간 라이트 케어: 30,000원, 시니어 병원 동행: 50,000원, 생활 편의 대행: 40,000원, 복합 매칭 서비스: 60,000원). id="lite-care" 는 히어로 하단 배너의 [1시간 요금 보기] 앵커 대상입니다. */}
          <div className="wb-pricing-section" id="lite-care">
            <div className="wb-pricing-grid">
              {/* 카드 1: 1시간 콕집 라이트 케어 */}
              <div className="pricing-card">
                <div className="card-top-glow"></div>
                <div className="wb-plan-top">
                  <span className="wb-plan-badge is-new">
                    NEW
                  </span>
                  <h3 className="wb-plan-title">
                    1시간 콕집 라이트 케어
                  </h3>
                  <p className="wb-plan-desc">
                    수면내시경 귀가, 단지 내 산책 등 1시간 이내 단기 돌봄
                  </p>
                  <div className="wb-plan-price-wrap">
                    <div className="wb-plan-price-row">
                      <span className="wb-plan-price">
                        {won(SERVICE.light.basePrice)}원
                      </span>
                      {' '}
                      <span className="wb-plan-price-unit">
                        / 1시간 기준
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {/* 카드 2: 시니어 병원 동행 (메인 추천 플랜) */}
              <div className="pricing-card popular-card">
                <div className="card-top-glow"></div>
                <div className="wb-plan-top">
                  <span className="wb-plan-badge is-pro">
                    인기 · 병원 동행 베스트
                  </span>
                  <h3 className="wb-plan-title">
                    시니어 병원 동행
                  </h3>
                  <p className="wb-plan-desc">
                    접수부터 진료 동석, 약 수령 및 안전 귀가까지 원스톱 케어
                  </p>
                  <div className="wb-plan-price-wrap">
                    <div className="wb-plan-price-row">
                      <span className="wb-plan-price">
                        {won(SERVICE.hospital.basePrice)}원
                      </span>
                      {' '}
                      <span className="wb-plan-price-unit">
                        / 기본 2시간
                      </span>
                    </div>
                    <p className="wb-plan-price-note is-accent">
                      초과 30분당 {won(SERVICE.hospital.extraPer30Min)}원
                    </p>
                  </div>
                </div>
              </div>
              {/* 카드 3: 생활 편의 · 복합 동행 */}
              <div className="pricing-card">
                <div className="card-top-glow"></div>
                <div className="wb-plan-top">
                  <span className="wb-plan-badge is-neutral">
                    맞춤 복합
                  </span>
                  <h3 className="wb-plan-title">
                    생활 편의 · 복합 동행
                  </h3>
                  <p className="wb-plan-desc">
                    관공서·은행 업무 대행 또는 병원 진료 후 장보기 원스톱
                  </p>
                  <div className="wb-plan-price-wrap">
                    <div className="wb-plan-price-row">
                      <span className="wb-plan-price">
                        {won(SERVICE.life.basePrice)}원~
                      </span>
                      {' '}
                      <span className="wb-plan-price-unit">
                        / 기본 2시간
                      </span>
                    </div>
                    <p className="wb-plan-price-note is-muted">
                      복합 매칭 {won(SERVICE.complex.basePrice)}원 / 초과 30분당 {won(Math.min(SERVICE.life.extraPer30Min, SERVICE.complex.extraPer30Min))}원~
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* 모바일 가로 스와이프 위치 점 — 버튼은 아래 스크립트가 카드 수만큼 채우고, PC에서는 숨김(pricing.css) */}
            <div className="wb-price-dots" id="wbPriceDots" role="tablist" aria-label="요금 카드 넘겨보기"></div>
            <p className="wb-pricing-note">
              ※ 일반 동행 서비스는 기본 2시간부터 이용 가능하며(1시간 라이트 케어 제외), 매니저 안심케어(배상책임) 혜택이 기본 포함됩니다.
            </p>
            {/* 요약 CTA — 메인에는 금액 위주의 카드만 두고, 추가 옵션·부가 요금·정산 기준·예상 요금 계산기는 pricing.html(예상 요금 페이지)로 옮겼습니다. 예약은 사이트 공통 경로(apply.html + goIfLoggedIn). */}
            <div className="wb-price-cta">
              <LoginGateLink href="/apply" className="wb-price-cta-btn is-solid">
                예약하기
              </LoginGateLink>
              {' '}
              <a href="/pricing#calculator" className="wb-price-cta-btn is-outline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                  <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"></path>
                </svg>
                {' '}예상 요금 계산하기
              </a>
            </div>
            <p className="wb-price-cta-note">
              추가 옵션 · 주말/야간 할증 · 교통비 정산 기준은{' '}
              <a href="/pricing#rules">
                예상 요금 페이지
              </a>
              에서 자세히 확인하실 수 있어요.
            </p>
          </div>
        </div>
      </div>
      {/* ==================================================================== 06. ==================================================================== */}
      {' '}
      {/* Pretendard CDN 불러오기 */}
      {' '}
      {' '}
      {/* id="how-it-works" 속성을 추가하여 상단 메뉴 '이용 방법' 링크와 연결 */}
      <div className="wb-container wb-section" id="how-it-works">
        {/* 헤더 영역 */}
        <div className="wb-header">
          <h2 className="wb-title">
            서비스 이용 방법
          </h2>
          <p className="wb-subtitle">
            마음까지 이어주는 안심 동행, 위드브릿지가 함께합니다.
          </p>
          {/* STEP 미니 순서도 */}
          <ul className="wb-mini-flow">
            <li className="wb-flow-item">
              <strong>
                STEP 01.
              </strong>
              {' '}서비스 신청
            </li>
            <span className="wb-arrow">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"></path>
              </svg>
            </span>
            <li className="wb-flow-item">
              <strong>
                STEP 02.
              </strong>
              {' '}매니저 매칭
            </li>
            <span className="wb-arrow">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"></path>
              </svg>
            </span>
            <li className="wb-flow-item">
              <strong>
                STEP 03.
              </strong>
              {' '}안심 병원 동행
            </li>
            <span className="wb-arrow">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"></path>
              </svg>
            </span>
            <li className="wb-flow-item">
              <strong>
                STEP 04.
              </strong>
              {' '}실시간 안심 보고
            </li>
          </ul>
        </div>
        {/* 그리드 영역 */}
        <div className="wb-grid">
          {/* STEP 01 */}
          <div className="wb-card">
            <div className="wb-image-box">
              <img src="/images/crayon-monitor-registration-02.webp" loading="lazy" decoding="async" alt="간편하게 신청하세요" />
            </div>
            <span className="wb-step-num">
              01
            </span>
            <h3 className="wb-headline">
              간편하게 신청하세요!
            </h3>
            <p className="wb-body">
              위드브릿지 웹페이지 또는 카카오톡으로 희망하는 일시와 병원, 필요 서비스를 알려주세요. 바쁜 보호자분도 1분 만에 쉽고 빠르게 접수하실 수 있습니다.
            </p>
          </div>
          {/* STEP 02 */}
          <div className="wb-card">
            <div className="wb-image-box">
              <img src="/images/crayon-hands-smartphones-connection-02.webp" loading="lazy" decoding="async" alt="매니저와 매칭되세요" />
            </div>
            <span className="wb-step-num">
              02
            </span>
            <h3 className="wb-headline">
              매니저와 매칭되세요!
            </h3>
            <p className="wb-body">
              접수 확인 후 전문 케어 자격을 갖춘 맞춤 동행 매니저가 배정됩니다. 매니저의 프로필과 이력을 사전에 확인한 후 안심하고 서비스를 이용하실 수 있습니다.
            </p>
          </div>
          {/* STEP 03 */}
          <div className="wb-card">
            <div className="wb-image-box">
              <img src="/images/crayon-manager-senior-walking-01.webp" loading="lazy" decoding="async" alt="편안하게 다녀오세요" />
            </div>
            <span className="wb-step-num">
              03
            </span>
            <h3 className="wb-headline">
              편안하게 다녀오세요!
            </h3>
            <p className="wb-body">
              약속된 시간에 매니저가 어르신 댁으로 방문하여 병원 이동, 접수, 진료 보조, 약 수령까지 전 과정을 든든하게 밀착 케어합니다.
            </p>
          </div>
          {/* STEP 04 */}
          <div className="wb-card">
            <div className="wb-image-box">
              <img src="/images/crayon-notification-bubble-check-01.webp" loading="lazy" decoding="async" alt="실시간으로 확인하세요" />
            </div>
            <span className="wb-step-num">
              04
            </span>
            <h3 className="wb-headline">
              실시간으로 확인하세요!
            </h3>
            <p className="wb-body">
              동행 시작부터 귀가까지 전 과정을 카카오톡 알림으로 실시간 공유합니다. 진료 후에는 의사 전달사항이 담긴 '안심 리포트'를 전달해 드립니다.
            </p>
          </div>
        </div>
      </div>
      {/* ==================================================================== 07. ==================================================================== */}
      {' '}
      {/* 위드브릿지 핵심 가치 & 서비스 특장점 섹션 (위드브릿지 브랜드 컬러 적용) */}
      {' '}
      <div className="wb-feature-section">
        <div className="wb-feature-container">
          {/* 좌측 : 타이틀 및 페인포인트 세로형 탭 리스트 */}
          <div className="wb-feature-left">
            <span className="wb-sub-title">
              상담 이후로는 알아서 척척
            </span>
            <div className="wb-main-title">
              복잡한 병원·외출 과정 모두를
              <br />
              {' '}편안하고 안심되게 케어
            </div>
            <div className="wb-pain-tab-list" id="wbPainTabList">
              <button type="button" className="wb-pain-tab is-active" data-solution="1">
                <span>
                  부모님 혼자 대형병원 가시는데, 여유가 없어요.
                </span>
                {' '}
                <span className="wb-tab-arrow" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6"></path>
                  </svg>
                </span>
              </button>
              {' '}
              <button type="button" className="wb-pain-tab" data-solution="2">
                <span>
                  진료 내용을 잊으실까 걱정돼요.
                </span>
                {' '}
                <span className="wb-tab-arrow" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6"></path>
                  </svg>
                </span>
              </button>
              {' '}
              <button type="button" className="wb-pain-tab" data-solution="3">
                <span>
                  거동이 불편하신데 혼자 외출하고 싶어 하세요.
                </span>
                {' '}
                <span className="wb-tab-arrow" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6"></path>
                  </svg>
                </span>
              </button>
              {' '}
              <button type="button" className="wb-pain-tab" data-solution="4">
                <span>
                  복잡한 병원 일정과 건강 관리를 한 번에 맡기고 싶어요.
                </span>
                {' '}
                <span className="wb-tab-arrow" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6"></path>
                  </svg>
                </span>
              </button>
              {' '}
              <button type="button" className="wb-pain-tab" data-solution="5">
                <span>
                  혼자 사시는 부모님의 복약과 생활 관리가 걱정돼요.
                </span>
                {' '}
                <span className="wb-tab-arrow" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6"></path>
                  </svg>
                </span>
              </button>
            </div>
          </div>
          {/* 우측 : 선택된 페인포인트에 대응하는 단일 대형 솔루션 카드 */}
          <div className="wb-feature-right">
            <div className="wb-solution-hero-card" id="wbSolutionHeroCard">
              <div className="wb-solution-hero-image" id="wbSolutionHeroImage" style={{ backgroundImage: "url('/images/warm-spring-walk-holding-hands.webp')" }}></div>
              <div className="wb-solution-hero-body">
                <div className="wb-solution-hero-title" id="wbSolutionHeroTitle">
                  안심 이동 지원
                </div>
                <div className="wb-solution-hero-desc" id="wbSolutionHeroDesc">
                  자택부터 병원·외출까지 도보 및 대중교통/택시로 꼼꼼하게 동행합니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {' '}
      {/* ==================================================================== 08. ==================================================================== */}
      {' '}
      {/* 위드브릿지 FAQ 아코디언 컴포넌트 */}
      {' '}
      <div className="wb-faq-container" id="faq">
        {/* 타이틀 영역 */}
        <div className="wb-faq-header">
          <span className="wb-faq-title-badge">
            자주 묻는 질문
          </span>
        </div>
        {/* 탭 메뉴 */}
        <div className="wb-faq-tabs">
          <button className="wb-faq-tab active" data-faq-category="all">
            전체
          </button>
          {' '}
          <button className="wb-faq-tab" data-faq-category="hospital">
            병원 동행
          </button>
          {' '}
          <button className="wb-faq-tab" data-faq-category="life">
            생활 편의
          </button>
        </div>
        {/* FAQ 항목 리스트 */}
        <div className="wb-faq-list">
          {/* [병원 동행] Q1 */}
          <div className="wb-faq-item" data-category="hospital">
            <button className="wb-faq-question">
              <span>
                Q. 병원 동행 매니저는 어떤 분들이 오시나요? 성별이나 자격 기준이 정해져 있나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                사회복지사, 요양보호사, 간호조무사 등 보건복지 전문 자격을 보유하고 위드브릿지의 신원 검증 및 시니어 케어 교육을 수료한 전문 매니저가 배정됩니다. 어르신의 성별이나 성향에 맞춰 전담 매니저 배정도 가능합니다.
              </div>
            </div>
          </div>
          {/* [병원 동행] Q2 */}
          <div className="wb-faq-item" data-category="hospital">
            <button className="wb-faq-question">
              <span>
                Q. 진료 예약이나 수속, 약 처방전 수령까지 모두 대신해 주시나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                네, 그렇습니다. 자택 방문 및 출발 준비부터 병원 이동, 접수·수속, 진료실 입실 동행, 수진 내용 기록, 약국 수령 및 안전 귀가까지 전 과정을 밀착 지원합니다. 진료 후 의사 전달 사항은 보호자분께 리포트로 전달해 드립니다.
              </div>
            </div>
          </div>
          {/* [병원 동행] Q3 */}
          <div className="wb-faq-item" data-category="hospital">
            <button className="wb-faq-question">
              <span>
                Q. 병원 이동 시 차량(교통편)은 어떻게 이용하나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                대중교통, 택시, 휠체어 택시(해피콜 등) 또는 보호자 및 어르신 자가용 등 원하시는 수단으로 동행합니다. (이동 시 발생되는 실비 교통비는 별도 부담입니다.)
              </div>
            </div>
          </div>
          {/* [병원 동행] Q4 */}
          <div className="wb-faq-item" data-category="hospital">
            <button className="wb-faq-question">
              <span>
                Q. 서비스 기본 이용 시간과 추가 비용 정책은 어떻게 되나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                기본 2시간/3시간 단위로 이용이 가능하며, 대기 시간이 길어져 약정 시간이 초과될 경우 30분 단위로 추가 요금이 합산 후불 정산됩니다.
              </div>
            </div>
          </div>
          {/* [병원 동행] Q5 */}
          <div className="wb-faq-item" data-category="hospital">
            <button className="wb-faq-question">
              <span>
                Q. 보호자인 저나 전담 요양보호사가 함께 동행해도 되나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                네, 당연히 가능합니다. 보호자분이 동행하시더라도 진료 대기나 휠체어 이동, 수속 보조 등 보조 인력이 필요한 경우 함께 서비스를 이용하실 수 있습니다.
              </div>
            </div>
          </div>
          {/* [생활 편의] Q1 */}
          <div className="wb-faq-item" data-category="life">
            <button className="wb-faq-question">
              <span>
                Q. 생활 편의 서비스에서는 정확히 어떤 도움을 받을 수 있나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                관공서·은행 방문 동행, 장보기 및 생필품 구매 대행, 간단한 집안 정리 및 가전/IT기기(스마트폰, 키오스크) 사용법 안내, 산책 동행 등 일상생활의 소소하지만 불편한 모든 과정을 도움해 드립니다.
              </div>
            </div>
          </div>
          {/* [생활 편의] Q2 */}
          <div className="wb-faq-item" data-category="life">
            <button className="wb-faq-question">
              <span>
                Q. 가사도우미나 정부 지원 요양보호사 서비스와 무엇이 다른가요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                노인장기요양보험 등급이 없으셔도 누구나 바로 이용하실 수 있습니다. 또한 전체 가사 노동(대청소 등) 중심이 아닌, 어르신의 일상 속 개별 니즈(외출, 행정 처리, 디지털 보조 등)에 맞춘 1:1 맞춤형 든든한 조력자 역할을 합니다.
              </div>
            </div>
          </div>
          {/* [생활 편의] Q3 */}
          <div className="wb-faq-item" data-category="life">
            <button className="wb-faq-question">
              <span>
                Q. 정기적으로 특정 요일이나 시간에 지정해서 이용할 수 있나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                네, 1회성 이용뿐만 아니라 주 1회/2회 등 정기 방문 이용도 가능합니다. 정기 이용 회원에게는 우선 매니저 배정 및 할인 혜택이 적용됩니다.
              </div>
            </div>
          </div>
          {/* [생활 편의] Q4 */}
          <div className="wb-faq-item" data-category="life">
            <button className="wb-faq-question">
              <span>
                Q. 서비스 중 응급상황이 발생하면 어떻게 조치하나요?
              </span>
              {' '}
              <span className="wb-faq-icon">
                ▼
              </span>
            </button>
            <div className="wb-faq-answer">
              <div className="wb-faq-answer-inner">
                모든 매니저는 응급처치 매뉴얼을 숙지하고 있습니다. 긴급 상황 발생 시 즉시 119 신고 및 지정된 보호자 연락처로 비상 알림을 전달하여 골든타임을 확보합니다.
              </div>
            </div>
          </div>
        </div>
      </div>
      {' '}
      {/* ==================================================================== 09. ==================================================================== */}
      {' '}
      {/* 위드브릿지 리뷰 섹션 — 신생 서비스라 아직 쌓인 후기가 없다는 점을 솔직하게 알리는 "첫 후기 안내". 카드 박스 없이 공원 산책 일러스트를 섹션 전체 배경으로 깔고, 타이틀·서브 문구·버튼 덩어리를 일러스트의 수직·수평 정중앙(인물 뒤쪽 여백)에 배치합니다. 딱딱한 카드 대신 은은한 반투명 블러 그라데이션을 텍스트 뒤에 깔아 가독성을 보완합니다. */}
      {' '}
      {' '}
      {/* id="reviews" 속성 유지 */}
      <div className="wb-review-section" id="reviews">
        <div className="wb-review-top">
          <span className="review-tag">
            Review
          </span>
          <h3 className="review-title">
            첫 이용 후기를 기다립니다
          </h3>
          <p className="wb-invite-desc">
            이제 막 첫걸음을 내딛는 위드브릿지는 어르신과 보호자님의 목소리에 귀 기울이고 있습니다.
            <br className="md:hidden" />
            {' '}따뜻했던 동행의 순간을 들려주세요.
          </p>
          <div className="wb-invite-actions">
            <LoginGateLink href="/mypage?tab=history" className="wb-more-btn">
              이용 후기 작성하기
            </LoginGateLink>
            {' '}
            <a href="http://pf.kakao.com/_PKxemX" target="_blank" rel="noopener noreferrer" className="wb-more-btn wb-more-btn--ghost">
              카카오톡 문의하기
            </a>
          </div>
        </div>
      </div>
      {/* ==================================================================== 10-1. B2B 제휴 전환 배너 — 기관/기업 담당자를 partner.html 로 안내 (리뷰 섹션과 푸터 사이. 스타일은 .wb-b2b- 접두사로 격리되어 있어 다른 CSS와 충돌하지 않음) ==================================================================== */}
      {' '}
      <section className="wb-b2b" aria-labelledby="wb-b2b-title">
        <div className="wb-b2b-inner">
          <div className="wb-b2b-card">
            <div className="wb-b2b-copy">
              <span className="wb-b2b-eyebrow">
                <i aria-hidden="true"></i>
                기관 · 기업 담당자이신가요?
              </span>
              <h2 className="wb-b2b-title" id="wb-b2b-title">
                요양원 · 복지관 · 병원 · 기업을 위한
                <br />
                <em>
                  위드브릿지 제휴 프로그램
                </em>
              </h2>
              <p className="wb-b2b-desc">
                이용자 병원 동행부터 임직원 부모님 케어까지, 기관 규모와 특성에 맞춘 플랜을 함께 설계해 드립니다. 지금 얼리 파트너를 모집하고 있어요.
              </p>
              <ul className="wb-b2b-chips" aria-label="제휴 대상">
                <li>
                  요양원
                </li>
                <li>
                  주간보호센터
                </li>
                <li>
                  복지관
                </li>
                <li>
                  종합병원
                </li>
                <li>
                  기업 복지
                </li>
              </ul>
            </div>
            <div className="wb-b2b-actions">
              <a href="/partner" className="wb-b2b-btn">
                제휴 안내 보기{' '}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6"></path>
                </svg>
              </a>
              {' '}
              <a href="/partner#inquiry" className="wb-b2b-sub">
                바로 제휴 문의하기
              </a>
            </div>
          </div>
        </div>
      </section>
      {/* ==================================================================== 10. 하단 푸터 (Footer) ==================================================================== */}
      {' '}
      {/* Tailwind CDN 스크립트는 head 바로 아래(위에서 defer 로 한 번만 로드)의 MutationObserver 가 문서 전체(이 푸터 포함)를 계속 지켜보며 유틸리티 클래스를 입혀 주므로, 여기서 다시 로드할 필요가 없습니다. (과거에는 "Tailwind CDN 로딩 지연·실패 시 푸터가 깨져 보이는 것"을 막으려고 중복 로드했었는데, 그 지연 자체가 상단 전체 렌더링을 막는 원인이었습니다 — 중복 로드 대신 defer 로 근본 원인을 고쳤습니다.) */}
      {' '}
      <HomeBehaviors />
    </>
  );
}
