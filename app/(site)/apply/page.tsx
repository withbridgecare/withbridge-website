import './apply.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { TermsLink } from '@/components/site/TermsLink';
import { ApplyBehaviors } from './ApplyBehaviors';

export const metadata: Metadata = {
  title: "시니어 병원 동행 서비스 신청서",
  robots: { index: false },
};

/** 시니어 병원 동행 서비스 신청서 — public/apply.html 에서 옮김 */
export default function ApplyPage() {
  return (
    <>
    <NotoSansKr />
    <main className="ap-main" style={{ visibility: "hidden" }}>
      <div className="ap-wrap">
        {/* ================================================================ */}
        {' '}
        {/* 01. 신청서: 하나의 큰 카드 안에 [제목 · 설명] → [안내 배너] → [입력 양식] 이 위에서 아래로 이어지는 단일 페이지 폼입니다(다단계 Wizard 를 되돌림 — 2026-11 이전 구조로 복원). */}
        {' '}
        {/* ================================================================ */}
        <div className="card" id="applyCard">
          <h1 className="ap-title" id="applyTitle">
            시니어 병원 동행 서비스 신청서
          </h1>
          <p className="ap-lead">
            병원 예약부터 진료 동행, 약 수령 및 안전한 귀가까지 전문 동행 매니저가 함께합니다. 정확하고 안전한 동행을 위해 아래 항목을 작성해 주세요.
          </p>
          {/* 48시간 미매칭 자동 취소/환불 안심 문구 (상단) — 하단(제출 버튼 위)에는 같은 내용을 반복하지 않고 짧은 한 줄 문구로만 한 번 더 상기시킵니다(.submit-area-note 참고). */}
          <div className="refund-policy">
            <svg className="rp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"></path>
              {' '}
              <path d="m9 12 2 2 4-4"></path>
            </svg>
            {' '}
            <span>
              48시간 이내 매니저가 배정되지 않을 경우 신청이 자동 취소되며, 결제금액은 100% 자동 환불됩니다. 안심하고 신청해 주세요.
            </span>
          </div>
          {/* 안내 배너 (작은 연한 초록 콜아웃): 서비스 가능 지역 / 소요 시간 · 안내 · 문의 / 로그인한 계정 이메일 */}
          <aside className="notice" id="applyIntro" aria-label="신청 전 안내">
            <div className="nt-region">
              <h2 className="nt-title">
                [서비스 가능 지역 안내]
              </h2>
              <p className="nt-sub">
                위드브릿지가 서비스 중인 주요 지역입니다.
              </p>
              {/* 메인 페이지 [주요 동행 지원 지역] 탭과 같은 9개 지역 — 클릭 인터랙션 없이 목록만 보여주는 정적 태그입니다(버튼이 아니라 span). */}
              <div className="area-chip-row" aria-label="서비스 가능 지역 목록">
                <span className="area-chip">
                  인천 남동구
                </span>
                {' '}
                <span className="area-chip">
                  인천 연수구
                </span>
                {' '}
                <span className="area-chip">
                  인천 미추홀구
                </span>
                {' '}
                <span className="area-chip">
                  인천 부평구
                </span>
                {' '}
                <span className="area-chip">
                  인천 계양구
                </span>
                {' '}
                <span className="area-chip">
                  인천 서구
                </span>
                {' '}
                <span className="area-chip">
                  경기 시흥시
                </span>
                {' '}
                <span className="area-chip">
                  경기 부천시
                </span>
                {' '}
                <span className="area-chip">
                  경기 안산시
                </span>
              </div>
            </div>
            <ul className="nt-info">
              <li>
                <b>
                  안내 사항:
                </b>
                {' '}신청서가 접수되면 담당 매니저 배정이 진행되며, 매칭 완료 시 카카오 알림톡/문자로 최종 예약 확정 안내를 드립니다.
              </li>
              <li>
                <b>
                  문의:
                </b>
                {' '}위드브릿지 고객센터 (
                <a href="tel:01055305760">
                  010-5530-5760
                </a>
                {' '}/ 카카오톡 채널 @위드브릿지)
              </li>
            </ul>
            <div className="nt-notes">
              <p className="nt-note">
                ※ 위에 표기된 지역 내 출발지(자택 등) 및 목적지(병원)의 동행 서비스 신청이 가능합니다.
              </p>
              <p className="nt-note">
                ※ 목록에 없는 주변 지역이라도 일단 주소를 입력해 보시면 담당 매니저가 전화 확인 후 매칭을 도와드립니다.
              </p>
            </div>
            {/* 로그인한 경우에만 표시: 로그인 계정(이메일)과 신청 내용이 자동으로 연결됨 */}
            <p className="nt-login" id="loginNote" hidden></p>
          </aside>
          {/* ================================================================ */}
          {' '}
          {/* 02. 신청서 입력 (같은 카드 안에서 안내 배너 바로 아래로 이어짐) */}
          {' '}
          {/* ================================================================ */}
          <form id="applyForm" noValidate aria-label="시니어 병원 동행 서비스 신청서">
            {/* 어르신 프로필 원클릭 불러오기 — 로그인 + 등록된 어르신 프로필(마이페이지 '어르신 프로필 관리', seniors 테이블)이 있을 때만 보입니다(loadSeniorProfiles 참고). 폼 맨 위에 둬서 패키지 재이용 고객이 매번 같은 정보를 새로 입력하지 않고 날짜/시간·방문 병원만 고르면 되게 합니다. */}
            <section className="senior-quickfill-card" id="seniorQuickfill" hidden>
              <label htmlFor="seniorProfileSelect">
                어르신 프로필 원클릭 불러오기
              </label>
              {' '}
              <select className="text-input" id="seniorProfileSelect"></select>
              <p className="senior-quickfill-hint">
                선택하면 성함·거동 상태·출발지 주소가 자동으로 채워져요. 날짜/시간과 방문 병원만 골라 주시면 돼요.
              </p>
            </section>
            {/* 서비스 선택: 아래 입력 항목의 안내 문구와 '기본 요금'이 선택한 서비스에 맞게 바뀝니다. 요금은 index.html 의 '이용 요금 안내'(기본 2시간)와 같은 값이며, 화면 안내용일 뿐 저장하지 않습니다 */}
            <fieldset className="field" id="f-service">
              <legend>
                서비스 선택 (Service Type){' '}
                <span className="req">
                  *
                </span>
              </legend>
              {' '}
              {/* 세로형 카드 4개 나열 대신, 공간을 차지하지 않는 슬림한 드롭다운 하나로 서비스를 고릅니다. 선택에 따른 상세 설명은 아래 fee-box(요금)·routeHint(주소 입력 안내)가 이어서 보여줍니다. */}
              <div className="svc-select-wrap">
                <select className="text-input" id="serviceType" name="service">
                  <option value="">
                    선택해주세요
                  </option>
                  <option value="1시간 라이트 케어">
                    [NEW] 1시간 콕집 라이트 케어 (30,000원 / 1시간)
                  </option>
                  <option value="시니어 병원 동행">
                    시니어 병원 동행 (50,000원 / 2시간)
                  </option>
                  <option value="생활 편의 대행">
                    생활 편의 대행 (40,000원 / 2시간)
                  </option>
                  <option value="복합 매칭 서비스 (동행 + 생활편의)">
                    복합 매칭 서비스 (동행 + 생활편의) (60,000원 / 2시간)
                  </option>
                </select>
                {' '}
                {/* '1시간 콕집 라이트 케어' 선택 시에만 표시 — 세부 유형 선택(택 1). applyService/f-service 의 change 리스너가 토글합니다. 값은 request_details 에 '세부 목적: …' 줄로 함께 저장되고 (toDbRow), 마이페이지·매니저·어드민 화면이 같은 키로 다시 읽어 노출합니다. */}
                <div className="svc-onehour-purpose" id="oneHourPurposeWrap" hidden>
                  <label className="sub-label" htmlFor="oneHourPurpose">
                    세부 이용 목적 선택{' '}
                    <span className="req">
                      (필수)
                    </span>
                  </label>
                  {' '}
                  <select className="text-input" id="oneHourPurpose" name="oneHourPurpose">
                    <option value="">
                      선택해주세요
                    </option>
                    <option value="수면내시경/검사 후 안전 귀가 케어">
                      수면내시경/검사 후 안전 귀가 케어
                    </option>
                    <option value="아파트 단지 내 안심 산책 및 말벗">
                      아파트 단지 내 안심 산책 및 말벗
                    </option>
                    <option value="집 앞 마트 생필품 장보기 및 간단 업무 대행">
                      집 앞 마트 생필품 장보기 및 간단 업무 대행
                    </option>
                    <option value="기타 (직접 입력)">
                      기타 (직접 입력)
                    </option>
                  </select>
                  {' '}
                  {/* '기타 (직접 입력)' 선택 시에만 표시 — updateOneHourCustomInputUi()가 토글합니다. 값은 request_details 에 '세부 목적: 기타 (입력내용)' 형태로 합쳐 저장되고(toDbRow), 마이페이지·매니저·어드민 화면은 그 줄을 그대로 '세부 목적'으로 다시 읽어 보여줍니다. */}
                  {' '}
                  <input className="text-input" type="text" id="oneHourCustomInput" name="oneHourCustomInput" maxLength={80} hidden placeholder="1시간 이내 가능한 가벼운 케어 내용을 적어주세요 (예: 약국 서류 수령 보조 등 / ※ 무거운 짐 운반·전문 청소 제외)" />
                </div>
              </div>
              <div className="fee-box is-empty" id="feeBox" aria-live="polite">
                서비스를 선택하시면 총 예상 금액이 표시됩니다.
              </div>
              <p className="svc-firstuse-text" style={{ marginTop: "6px" }}>
                * 위드브릿지의 모든 동행에는 매니저 안심케어(배상책임) 혜택이 기본 포함되어 있습니다.
              </p>
              {/* 추가 요금 · 정산 기준 — 결제 직전에 놓치기 쉬운 부가 요금을 서비스 선택 바로 아래에서 한 번 더 안내합니다(접힌 상태로 한 줄 요약만 보이고, 누르면 상세). 내용은 pricing.html '2. 부가 요금 및 정산 기준'과 같아야 합니다. 자세히 보기는 작성 중인 신청서를 잃지 않도록 새 창으로 엽니다. */}
              <details className="fee-rules">
                <summary>
                  <span className="fee-rules-title">
                    추가 요금 · 정산 기준
                  </span>
                  {' '}
                  <span className="fee-rules-chips">
                    <span>
                      교통비 실비
                    </span>
                    <span>
                      주말·야간 +20%
                    </span>
                    <span>
                      30분 단위 초과
                    </span>
                  </span>
                </summary>
                <ul className="fee-rules-list">
                  <li>
                    <b>
                      이동 교통비
                    </b>
                    {' '}매니저와 어르신의 교통비(택시·버스·지하철)와 병원 주차비는 실비로 별도 청구돼요.
                  </li>
                  <li>
                    <b>
                      주말 / 야간 할증
                    </b>
                    {' '}평일 09:00~18:00 외 주말·공휴일·야간 이용은 기본요금의 20%가 추가돼요.
                  </li>
                  <li>
                    <b>
                      초과 시간
                    </b>
                    {' '}기본 시간을 넘기면 30분 단위로 초과 요금이 정산돼요. (1시간 라이트 케어는 시간 추가 불가)
                  </li>
                  <li>
                    <b>
                      시간 산정
                    </b>
                    {' '}매니저가 출발지에서 어르신을 만난 시간부터 귀가 완료까지를 기준으로 해요.
                  </li>
                  <li>
                    <b>
                      긴급 매칭
                    </b>
                    {' '}이용 24시간 이내 긴급 예약은 +10,000원이 추가돼요.
                  </li>
                </ul>
                <a className="fee-rules-link" href="/pricing#rules" target="_blank" rel="noopener">
                  요금 기준 · 예상 요금 계산기 보기 (새 창)
                </a>
              </details>
              <p className="err" id="e-service" hidden></p>
            </fieldset>
            <fieldset className="field" id="f-relationship">
              <legend>
                신청자분과 어르신의 관계{' '}
                <span className="req">
                  *
                </span>
              </legend>
              <div className="options">
                <label className="opt">
                  <input type="radio" name="relationship" defaultValue="어르신 본인" />
                  <span>
                    어르신 본인
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="relationship" defaultValue="자녀" />
                  <span>
                    자녀
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="relationship" defaultValue="사위·며느리" />
                  <span>
                    사위·며느리
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="relationship" defaultValue="기타" />
                  <span>
                    기타
                  </span>
                </label>
              </div>
              <p className="err" id="e-relationship" hidden></p>
            </fieldset>
            <div className="field" id="f-senior-name">
              <label htmlFor="seniorName">
                어르신 성함{' '}
                <span className="req">
                  *
                </span>
              </label>
              {' '}
              <input className="text-input" type="text" id="seniorName" name="seniorName" maxLength={30} autoComplete="off" placeholder="예: 홍길동" />
              <p className="hint" id="seniorNameHint">
                실제로 동행·대행 서비스를 받으실 어르신의 성함을 적어 주세요. 매니저 배정 화면과 보호자 마이페이지에 그대로 표시돼요.
              </p>
              <p className="err" id="e-senior-name" hidden></p>
            </div>
            <div className="field" id="f-senior-phone">
              <label htmlFor="seniorPhone">
                어르신 연락처
                <span className="opt-tag">
                  (선택)
                </span>
              </label>
              {' '}
              <input className="text-input" type="tel" id="seniorPhone" name="seniorPhone" maxLength={13} autoComplete="off" inputMode="numeric" placeholder="예: 010-1234-5678" />
              <p className="hint">
                현장에서 매니저가 어르신께 직접 연락드려야 할 때를 위한 번호예요. 신청자 연락처와 같다면 비워 두셔도 됩니다.
              </p>
            </div>
            <div className="field" id="f-contact">
              <div className="route-row">
                <div className="sub-field">
                  <label className="sub-label" htmlFor="contactName">
                    신청자 성함{' '}
                    <span className="req">
                      *
                    </span>
                  </label>
                  {' '}
                  <input className="text-input" type="text" id="contactName" name="contactName" maxLength={30} autoComplete="name" placeholder="예: 홍길동" />
                </div>
                <div className="sub-field">
                  <label className="sub-label" htmlFor="contactPhone">
                    신청자 연락처{' '}
                    <span className="req">
                      *
                    </span>
                  </label>
                  {' '}
                  <input className="text-input" type="tel" id="contactPhone" name="contactPhone" maxLength={13} autoComplete="tel" inputMode="numeric" placeholder="예: 010-1234-5678" />
                </div>
              </div>
              {/* 로그인 계정(profiles)에 성함/연락처가 등록돼 있으면 initApplicantContactFromAccount() 가 위 두 입력칸을 읽기 전용으로 잠그고 이 안내를 보여줍니다 — 계정 정보가 없거나 비로그인이면 평소처럼 직접 입력합니다. */}
              <p className="contact-lock-note" id="contactLockNote" hidden>
                로그인된 계정 정보로 자동 접수됩니다.
              </p>
              <p className="err" id="e-contact" hidden></p>
            </div>
            {/* 거동 상태는 '일정 및 장소' 필드들보다 앞(어르신 정보 묶음 끝)에 둡니다 — id/name/검증 로직은 그대로입니다. */}
            <fieldset className="field" id="f-mobility">
              <legend>
                어르신 거동 상태{' '}
                <span className="req">
                  *
                </span>
              </legend>
              <div className="options">
                <label className="opt">
                  <input type="radio" name="mobility" defaultValue="혼자 걸음 가능" />
                  <span>
                    혼자 걸음 가능
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="mobility" defaultValue="지팡이·보행기 사용" />
                  <span>
                    지팡이·보행기 사용
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="mobility" defaultValue="휠체어 사용" />
                  <span>
                    휠체어 사용
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="mobility" defaultValue="매니저 부축 필수" />
                  <span>
                    매니저 부축 필수
                  </span>
                </label>
              </div>
              <p className="err" id="e-mobility" hidden></p>
            </fieldset>
            <div className="field" id="f-datetime">
              <label htmlFor="datetimeDate">
                희망 날짜 및 시간{' '}
                <span className="req">
                  *
                </span>
              </label>
              <div className="dt-row">
                <input className="text-input dt-date" type="date" id="datetimeDate" name="datetimeDate" autoComplete="off" aria-label="희망 날짜" />
                {' '}
                <input className="text-input dt-time" type="time" id="datetimeTime" name="datetimeTime" autoComplete="off" aria-label="희망 시간" />
              </div>
              <p className="hint">
                희망하시는 날짜와 시간을 선택해 주세요. 담당 매니저 배정 후 확정 일정을 안내해 드려요.
              </p>
              <p className="hint">
                * 원활한 매칭을 위해 최소 24시간 이후 일정부터 온라인 예약이 가능합니다. 당일 및 긴급 동행은 고객센터로 문의해 주세요.
              </p>
              <p className="err" id="e-datetime" hidden></p>
            </div>
            {/* 라벨 · 입력 예시 · 안내 문구는 선택한 서비스에 따라 바뀝니다 (apply 스크립트의 SERVICES 참고). 출발지/목적지를 별도 칸으로 나눠, 한 칸에 '/' 로 직접 구분해 적다 실수하는 것을 막습니다 */}
            <div className="field" id="f-route">
              <label id="routeGroupLabel">
                출발지 및 목적지/방문 장소{' '}
                <span className="req">
                  *
                </span>
              </label>
              <div className="route-row">
                <div className="sub-field">
                  <label className="sub-label" htmlFor="routeOrigin">
                    출발지 (자택 등)
                  </label>
                  <div className="addr-search-row">
                    <input className="text-input" type="text" id="routeOrigin" name="routeOrigin" readOnly autoComplete="off" placeholder="주소 검색 버튼을 눌러 주소를 선택해 주세요" />
                    {' '}
                    <button type="button" className="addr-search-btn" id="btnSearchOrigin">
                      주소 검색
                    </button>
                  </div>
                  <input className="text-input route-detail" type="text" id="routeOriginDetail" name="routeOriginDetail" maxLength={60} autoComplete="off" placeholder="상세 주소 (동/호수 등)" />
                  {' '}
                  <input type="hidden" id="routeOriginZip" name="routeOriginZip" />
                  {' '}
                  {/* 출발지 주소를 고르는 즉시(카카오 우편번호 oncomplete) 서비스 가능 지역 여부를 알려줍니다 */}
                  <p className="addr-area-note" id="originAreaNote" hidden></p>
                </div>
                <div className="sub-field">
                  <label className="sub-label" htmlFor="routeDestination" id="routeDestLabel">
                    목적지 (병원명)
                  </label>
                  <div className="addr-search-row">
                    <input className="text-input" type="text" id="routeDestination" name="routeDestination" readOnly autoComplete="off" placeholder="예: 길병원" />
                    {' '}
                    <button type="button" className="addr-search-btn" id="btnSearchDestination">
                      병원/목적지 검색
                    </button>
                  </div>
                  <input className="text-input route-detail" type="text" id="routeDestinationDetail" name="routeDestinationDetail" maxLength={60} autoComplete="off" placeholder="상세 위치 (진료과, 층수 등)" />
                  {' '}
                  <input type="hidden" id="routeDestinationZip" name="routeDestinationZip" />
                  {' '}
                  {/* 어르신 프로필에 등록된 '자주 가는 병원'을 불러왔을 때만 보이는 안내 (loadSeniorProfiles 참고) */}
                  <p className="addr-area-note" id="destinationNote" hidden></p>
                </div>
              </div>
              <p className="hint" id="routeHint" hidden></p>
              <p className="err" id="e-route" hidden></p>
            </div>
            <div className="field" id="f-details">
              <label htmlFor="details">
                요청 상세 내용
                <span className="opt-tag">
                  (선택)
                </span>
              </label>
              {' '}
              <textarea className="text-input" id="details" name="details" rows={4} maxLength={1000} placeholder="예: 진료과, 장보기 목록, 은행 업무 등 구체적인 요청을 적어 주세요."></textarea>
            </div>
            {/* 어르신 성함·연락처·거동 상태·자택 주소·자주 가는 병원·요청 상세 내용까지 어르신 관련 입력이 모두 끝나는 지점(주소 입력 바로 다음)에 두어, 위 '어르신 프로필 원클릭 불러오기' 카드와 짝을 이루는 같은 박스 UI(senior-save-card)로 눈에 띄게 둡니다. 로그인한 사용자에게만 보여줍니다(비로그인 신청은 저장할 계정이 없음, init() 이 세션 확인 뒤 hidden 을 풀어 줍니다). 기본값은 체크 해제 — 무조건 저장이 아니라 보호자가 직접 선택해야 저장됩니다 (saveSeniorProfileFromApplication 참고). */}
            <div className="field senior-save-card" id="f-save-senior-profile" hidden>
              <label className="consent-row">
                <input type="checkbox" id="saveSeniorProfile" name="saveSeniorProfile" />
                {' '}
                <span>
                  입력한 어르신 정보를 '어르신 프로필'에 저장하기
                </span>
              </label>
              <p className="consent-help">
                성함·연락처·거동 상태·자택 주소·자주 가는 병원·요청 상세 내용을 마이페이지 '어르신 프로필 관리'에 저장합니다. 다음 신청부터는 위 '어르신 프로필 원클릭 불러오기'로 바로 채울 수 있어요.
              </p>
            </div>
            {/* 선택 추가 옵션(Add-on) — 긴급 매칭 서비스. 보유 패키지 차감을 고른 경우에도 선택할 수 있습니다 — 패키지는 기본 서비스 요금만 차감하므로, 추가 옵션을 고르면 그 금액은 결제 없이 접수되고 '결제 대기(추가금)'로 표시가 접수되어 매니저 수락 이후 '추가 요금 결제 안내' (mypage.html)에서 나중에 결제합니다(packageHint, toDbRow 참고). */}
            <fieldset className="field" id="f-addon">
              <legend>
                선택 추가 옵션{' '}
                <span className="opt-tag">
                  (선택)
                </span>
              </legend>
              <div className="options">
                <label className="opt">
                  <input type="checkbox" id="addonUrgent" name="addon_urgent" />
                  <span>
                    긴급 매칭 서비스 (+10,000원){' '}
                    <small>
                      24시간 이내 긴급 예약 요청 시
                    </small>
                  </span>
                </label>
              </div>
            </fieldset>
            {/* 할인 혜택 적용: 보유 쿠폰 선택 + 적립금 사용. 결제 수단을 고르기 바로 전에 '최종 결제 금액'을 확정합니다. 둘 다 선택 사항(필수 아님)이라 서비스 선택 전에는 비활성 상태로 둡니다 — 서비스가 아직 없으면 할인액을 계산할 '기본 금액'이 없기 때문입니다 (updateDiscountInputsEnabled 참고). 실제 할인/차감은 결제가 'PAID' 로 확인된 뒤 서버(mark_payment_matching_pending, sql/user_coupons_checkout.sql) 가 다시 검증한 값으로만 반영됩니다 — 여기 값은 "이번 결제에 쓰겠다"는 희망액 스냅샷입니다. */}
            <fieldset className="field" id="f-discount">
              <legend>
                할인 혜택 적용{' '}
                <span className="opt-tag">
                  (선택)
                </span>
              </legend>
              <div className="sub-field" style={{ marginBottom: "18px" }}>
                <label className="sub-label" htmlFor="couponSelect">
                  보유 쿠폰
                </label>
                {' '}
                <select className="text-input" id="couponSelect">
                  <option value="">
                    쿠폰 사용 안 함
                  </option>
                </select>
                <p className="hint" id="couponHint" hidden></p>
              </div>
              <div className="sub-field">
                <label className="sub-label" htmlFor="pointsInput">
                  적립금 사용{' '}
                  <span id="pointsBalanceLabel"></span>
                </label>
                <div className="fee-points-row">
                  <input type="number" id="pointsInput" className="text-input fee-points-input" min="0" step="1" inputMode="numeric" placeholder="사용할 적립금" disabled />
                  {' '}
                  <button type="button" className="fee-points-max" id="pointsMaxBtn" disabled>
                    전액 사용
                  </button>
                </div>
                <p className="hint" id="pointsHint" hidden></p>
              </div>
            </fieldset>
            {/* 결제 수단: 포트원 V2 requestPayment() 는 payMethod 를 필수로 받습니다(결제창 안에서 수단을 바꿔 보여주는 건 PortOne 쪽 통합결제위젯(loadPaymentUI)에서만 되고, requestPayment() 호출마다 먼저 하나를 정해 보내야 합니다) — 그래서 여기서 먼저 고르게 하고, 그 값을 그대로 payMethod 로 넘깁니다 */}
            <fieldset className="field" id="f-payment">
              <legend>
                결제 수단{' '}
                <span className="req">
                  *
                </span>
              </legend>
              <div className="options">
                {/* 보유 중인 회차 패키지(5회권/10회권)가 있을 때만 보이는 옵션 — init() 이 user_packages 를 조회해 활성 패키지가 있으면 보여주고, 잔여 횟수를 채워 넣습니다. 선택 시 결제 단계를 건너뛰고 회차만 차감합니다(제출 핸들러 참고). */}
                {' '}
                <label className="opt" id="optUsePackage" hidden>
                  <input type="radio" name="payment_method" defaultValue="패키지차감" />
                  <span id="packageRemainingLabel">
                    보유 패키지 차감 (잔여 0회)
                  </span>
                </label>
                {' '}
                <label className="opt">
                  <input type="radio" name="payment_method" defaultValue="카드" checked />
                  <span>
                    카드
                  </span>
                </label>
                {' '}
                {/* 간편결제(EASY_PAY)는 KG이니시스 실연동 계정에 아직 간편결제 사용 등록이 안 돼 있어 PortOne이 V104 에러로 막습니다 — 등록 완료 전까지 이 옵션을 숨겨 둡니다. 등록되면 이 label과 PAY_METHOD_MAP의 '간편결제' 항목만 되돌리면 됩니다(easyPayProvider 관련 로직은 git 이력에 남아 있습니다). */}
                {' '}
                <label className="opt">
                  <input type="radio" name="payment_method" defaultValue="계좌이체" />
                  <span>
                    계좌이체
                  </span>
                </label>
              </div>
              <p className="hint" id="packageHint" hidden>
                패키지로 예약하면 결제 없이 바로 접수되고, 보유 회차에서 1회가 차감됩니다. 쿠폰·적립금은 이 예약에는 적용되지 않습니다. 선택 추가 옵션을 고르면 그 금액만 매니저 수락 후 별도로 결제받습니다.
              </p>
              <p className="err" id="e-payment" hidden></p>
            </fieldset>
            {/* 이용약관 동의 (필수). '이용약관' 링크 → 약관 팝업 → [동의하고 닫기] 로도 체크됩니다 */}
            <fieldset className="field" id="f-terms">
              <legend>
                이용약관 동의{' '}
                <span className="req">
                  *
                </span>
              </legend>
              {' '}
              <label className="consent-row">
                <input type="checkbox" id="terms" name="terms" />
                {' '}
                <span>
                  <TermsLink agreeSelector="#terms">
                    이용약관
                  </TermsLink>
                  에 동의합니다.
                </span>
              </label>
              <p className="consent-help">
                진료·간호 등 의료행위 없이 이동·행정 동행만 제공하는 서비스이며(
                <TermsLink article={3}>
                  제3조
                </TermsLink>
                ), 취소·환불은 서비스 시작 시각을 기준으로 적용돼요(
                <TermsLink article={6}>
                  제6조
                </TermsLink>
                ).
              </p>
              <p className="err" id="e-terms" hidden></p>
            </fieldset>
            <fieldset className="field" id="f-consent">
              <legend>
                개인정보 수집 동의{' '}
                <span className="req">
                  *
                </span>
              </legend>
              {' '}
              <label className="consent-row">
                <input type="checkbox" id="consent" name="consent" />
                {' '}
                <span>
                  개인정보 수집 및 이용에 동의합니다.
                </span>
              </label>
              <p className="consent-help">
                수집 항목·이용 목적 등 자세한 내용은{' '}
                <a href="/privacy">
                  개인정보 처리방침
                </a>
                을 확인해 주세요.
              </p>
              <p className="err" id="e-consent" hidden></p>
            </fieldset>
            {/* 스팸 봇 함정: 사람은 볼 수 없고 건드리지 않음. 값이 채워져 있으면 전송하지 않고 조용히 무시 */}
            <div className="hp" aria-hidden="true">
              <label>
                웹사이트{' '}
                <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {/* 이용약관 동의 → 개인정보 수집 동의 → 제출 버튼 순서로 이어집니다. 구분선으로 '동의 구간'과 '제출' 을 분리해 버튼이 체크박스 위로 겹치거나 카드 끝에 잘려 보이지 않게 합니다 (여백은 #applyCard padding-bottom 참고) */}
            <div className="submit-area">
              {/* 기본 금액 → 쿠폰 할인 → 적립금 사용 → 최종 결제 금액. f-discount 의 쿠폰/적립금 입력과 실시간으로 연동됩니다(refreshDiscountSummary 참고). 서비스를 아직 선택하지 않았으면 숨김 */}
              <div className="discount-summary" id="discountSummary" hidden>
                <div className="ds-row">
                  <span>
                    기본 금액
                  </span>
                  <span id="dsBase">
                    -
                  </span>
                </div>
                <div className="ds-row" id="dsAddonRow" hidden>
                  <span>
                    선택 옵션
                  </span>
                  <span id="dsAddon">
                    -
                  </span>
                </div>
                <div className="ds-row" id="dsCouponRow" hidden>
                  <span>
                    쿠폰 할인
                  </span>
                  <span id="dsCoupon">
                    -
                  </span>
                </div>
                <div className="ds-row" id="dsPointsRow" hidden>
                  <span>
                    적립금 사용
                  </span>
                  <span id="dsPoints">
                    -
                  </span>
                </div>
                <div className="ds-row ds-final">
                  <span>
                    최종 결제 금액
                  </span>
                  <span id="dsFinal">
                    -
                  </span>
                </div>
                {/* 패키지 차감 선택 시에만 보임 — "지금 보이는 금액이 전액이 아니라 선택 옵션 금액뿐"임을 한 번 더 명확히 알립니다(refreshDiscountSummary 참고). */}
                <p className="ds-package-note" id="dsPackageNote" hidden></p>
              </div>
              {/* 48시간 환불 안심 문구는 상단에서 이미 전체 박스로 한 번 안내했으므로, 결제 직전에는 같은 박스를 반복하지 않고 짧은 문구로만 한 번 더 상기시킵니다(반복 노출 최소화). */}
              <p className="submit-area-note">
                * 48시간 내 미배정 시 결제금액 100% 자동 환불 · 실비(교통비, 주차비 등)는 별도로 부과될 수 있습니다.
              </p>
              <div className="form-error" id="formError" role="alert" hidden></div>
              <button type="submit" className="submit" id="submitBtn">
                신청서 및 결제하기
              </button>
            </div>
          </form>
        </div>
        {/* /#applyCard */}
        {/* ================================================================ */}
        {' '}
        {/* 03. 접수 완료 */}
        {' '}
        {/* ================================================================ */}
        <section className="card done" id="doneCard" hidden aria-live="polite">
          <div className="done-icon" aria-hidden="true">
            ✓
          </div>
          <h2 id="doneTitle" tabIndex={-1}>
            신청서가 접수되었습니다
          </h2>
          <p>
            신청서가 접수되어 담당 매니저 배정이 진행 중입니다. 매칭이 완료되면 알림톡/문자로 최종 예약 확정 안내를 드립니다.
          </p>
          <p>
            급하신 경우 위드브릿지 고객센터(
            <a href="tel:01055305760">
              010-5530-5760
            </a>
            )로 문의해 주세요.
          </p>
          <p style={{ fontSize: "12.5px", color: "#94A3B8" }}>
            (위드브릿지 전속 안심케어 혜택 자동 적용)
          </p>
          <div className="who" id="doneService"></div>
          <div className="who" id="doneContact"></div>
          {/* 카드/간편결제/계좌이체 즉시결제가 성공했을 때 채워짐 (showDone 참고) */}
          <p className="payment-success" id="donePaymentNotice" hidden></p>
          {/* 비로그인(또는 계정 연결 없이) 접수된 경우에만 표시: 로그인하면 이 신청이 마이페이지에 자동 연결됩니다 */}
          <p className="done-login" id="doneLoginHint" hidden>
            로그인하지 않고 신청하셨어요.{' '}
            <a href="/login">
              카카오로 로그인
            </a>
            하시면 이 신청이 마이페이지에 자동으로 연결돼요.
          </p>
          <div className="done-actions">
            <a className="btn" href="/">
              홈으로
            </a>
            {' '}
            <a className="btn btn-ghost" id="doneMypage" href="/mypage" hidden>
              마이페이지
            </a>
          </div>
        </section>
      </div>
    </main>
    {/* 서비스 준비 중 지역 안내 커스텀 모달 (checkOriginServiceArea 에서 열고 닫음) */}
    <div className="area-modal-overlay" id="areaModalOverlay" aria-hidden="true">
      <div className="area-modal" role="alertdialog" aria-modal="true" aria-labelledby="areaModalTitle" aria-describedby="areaModalDesc">
        <div className="area-modal-icon" aria-hidden="true">
          ⚠️
        </div>
        <h3 id="areaModalTitle">
          서비스 준비 중인 지역입니다
        </h3>
        <p id="areaModalDesc">
          죄송합니다. 현재 선택하신 지역은 서비스 준비 중입니다.
          <br />
          서비스 지역 외의 지역이신 경우 고객센터(010-5530-5760)로 문의해 주세요.
        </p>
        <button type="button" className="area-modal-btn" id="areaModalClose">
          확인
        </button>
      </div>
    </div>
    {/* 추가 요금 미납 예약 제한(Lock) 안내 모달 — 로그인 확인 직후 신청서 접근 게이트(위 <head> 스크립트의 checkExtraChargeLockThenShowMain())에서만 엶. 배경 클릭/Esc 로는 닫히지 않고(area-modal-overlay 와 달리 별도 핸들러를 달지 않음), [확인]을 눌러야만 마이페이지 '추가 요금 결제 안내' 섹션으로 이동합니다. */}
    <div className="area-modal-overlay" id="extraChargeLockOverlay" aria-hidden="true">
      <div className="area-modal" role="alertdialog" aria-modal="true" aria-labelledby="extraChargeLockTitle" aria-describedby="extraChargeLockDesc">
        <div className="area-modal-icon" aria-hidden="true">
          !
        </div>
        <h3 id="extraChargeLockTitle">
          새 예약을 진행할 수 없습니다
        </h3>
        <p id="extraChargeLockDesc">
          결제 대기 중인 추가 요금이 있습니다. 추가 요금을 결제하신 후 새로운 예약을 신청하실 수 있습니다.
        </p>
        <button type="button" className="area-modal-btn" id="extraChargeLockConfirm">
          확인
        </button>
      </div>
    </div>
    <ApplyBehaviors />
    </>
  );
}
