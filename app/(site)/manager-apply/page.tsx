import './manager-apply.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { ManagerApplyBehaviors } from './ManagerApplyBehaviors';

export const metadata: Metadata = {
  title: "케어 매니저 지원하기",
  description: "위드브릿지 케어 매니저 지원서 — 기본 정보, 활동 조건, 정산 계좌, 서약 4단계로 간편하게 지원하세요.",
  robots: { index: false },
};


/** 케어 매니저 지원하기 — public/manager-apply.html 에서 옮김 */
export default function ManagerApplyPage() {
  return (
    <>
    <NotoSansKr />
    <main className="ap-main">
      <div className="ap-wrap">
        <a href="/manager-landing" className="ap-back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7"></path>
          </svg>
          {' '}랜딩 페이지로 돌아가기
        </a>
        {' '}
        {/* ================================================================ */}
        {' '}
        {/* 01. 로딩 중 */}
        {' '}
        {/* ================================================================ */}
        <div className="card" id="loadingCard">
          <p style={{ margin: "0", textAlign: "center", color: "var(--ink-sub)" }}>
            불러오는 중…
          </p>
        </div>
        {/* ================================================================ */}
        {' '}
        {/* 02. 신청서 (4단계 멀티 스텝) */}
        {' '}
        {/* ================================================================ */}
        <div className="card" id="applyCard" hidden>
          <h1 className="ap-title">
            케어 매니저 지원하기
          </h1>
          <p className="ap-lead">
            위드브릿지 케어 매니저로 어르신들의 병원 동행과 일상 케어를 함께해 주세요. 4단계로 나누어 차근차근 작성할 수 있어요.
          </p>
          <aside className="notice" id="reapplyNotice" hidden></aside>
          <div className="wizard-head">
            <div className="wizard-steps-label">
              <span className="current" id="stepCurrentLabel">
                STEP 1 / 4
              </span>
              {' '}
              <span className="names" id="stepNameLabel">
                기본 정보
              </span>
            </div>
            <div className="wizard-track">
              <div className="wizard-fill" id="wizardFill"></div>
            </div>
          </div>
          <form id="applyForm" noValidate aria-label="케어 매니저 지원서">
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="websiteTrap">웹사이트</label>
              <input id="websiteTrap" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            {/* ============== STEP 1. 기본 정보 ============== */}
            <section className="wizard-step" id="step1">
              <h2 className="step-title">
                기본 정보
              </h2>
              <p className="step-desc">
                본인 확인을 위한 기본 정보를 입력해 주세요.
              </p>
              <div className="row2">
                <div className="field" id="f-name">
                  <label htmlFor="mgrName">
                    이름{' '}
                    <span className="req">
                      *
                    </span>
                  </label>
                  {' '}
                  <input className="text-input" type="text" id="mgrName" name="mgrName" maxLength={30} autoComplete="name" placeholder="예: 홍길동" />
                  <p className="err" id="e-name" hidden></p>
                </div>
                <div className="field" id="f-phone">
                  <label htmlFor="mgrPhone">
                    연락처{' '}
                    <span className="req">
                      *
                    </span>
                  </label>
                  {' '}
                  <input className="text-input" type="tel" id="mgrPhone" name="mgrPhone" maxLength={13} autoComplete="tel" inputMode="numeric" placeholder="예: 010-1234-5678" />
                  <p className="err" id="e-phone" hidden></p>
                </div>
              </div>
              <div className="field" id="f-birth">
                <label htmlFor="mgrBirth">
                  생년월일{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                {' '}
                <input className="text-input" type="text" id="mgrBirth" name="mgrBirth" inputMode="numeric" autoComplete="bday" maxLength={10} placeholder="예: 1900.01.01" />
                <p className="err" id="e-birth" hidden></p>
              </div>
              {/* 성별 — 어르신·보호자가 동성 매니저를 원하는 경우가 많아 매칭에 쓰는 필수 항목입니다 (manager_applications.gender, sql/manager_applications_gender.sql). */}
              <fieldset className="field" id="f-gender">
                <legend>
                  성별{' '}
                  <span className="req">
                    *
                  </span>
                </legend>
                <div className="options gender-options" role="radiogroup" aria-label="성별">
                  <label className="opt">
                    <input type="radio" name="gender" defaultValue="여" />
                    <span>
                      여성
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="radio" name="gender" defaultValue="남" />
                    <span>
                      남성
                    </span>
                  </label>
                </div>
                <p className="err" id="e-gender" hidden></p>
              </fieldset>
              <div className="field" id="f-address">
                <label htmlFor="mgrAddressBase">
                  거주지 주소{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                <div className="addr-search-row">
                  <input className="text-input" type="text" id="mgrAddressBase" readOnly autoComplete="off" placeholder="주소 검색 버튼을 눌러 주소를 선택해 주세요" />
                  {' '}
                  <button type="button" className="addr-search-btn" id="btnSearchAddress">
                    주소 검색
                  </button>
                </div>
                <input className="text-input addr-detail" type="text" id="mgrAddressDetail" maxLength={80} placeholder="상세 주소 (동/호수 등)" />
                <p className="err" id="e-address" hidden></p>
              </div>
              {/* 신분증 사본 첨부 — 현재 지원 단계에서는 받지 않아 숨겨 둡니다(아래 스크립트 ID_UPLOAD_ENABLED = false). 다시 받으려면 이 hidden 속성을 지우고 ID_UPLOAD_ENABLED 를 true 로 바꾸세요. */}
              <div className="field" id="f-idfile" hidden>
                <label htmlFor="mgrIdFile">
                  신분증 사본 첨부{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                {' '}
                <label className="file-drop" id="fileDropLabel" htmlFor="mgrIdFile" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "36px 24px", borderRadius: "16px" }}>
                  <div className="file-drop-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      {' '}
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                  </div>
                  <div className="file-drop-text" id="fileDropText">
                    신분증(주민등록증/운전면허증) 사진 또는 스캔 파일을 선택해 주세요
                  </div>
                  <input type="file" id="mgrIdFile" accept="image/jpeg,image/png,image/webp,application/pdf" />
                </label>
                <div className="file-chip" id="fileChip" hidden>
                  <span className="fc-name" id="fileChipName"></span>
                  {' '}
                  <button type="button" id="fileRemoveBtn">
                    삭제
                  </button>
                </div>
                <p className="file-status" id="fileStatus" hidden></p>
                <p className="id-mask-hint">
                  신분증 뒷자리(주민등록번호 뒤 7자리)는 가려서 올려 주세요. 승인 심사 용도로만 사용되며, 심사 외 목적으로 사용되지 않습니다.
                </p>
                <p className="err" id="e-idfile" hidden></p>
              </div>
              <div className="step-nav">
                <button type="button" className="nav-btn nav-next" id="toStep2">
                  다음
                </button>
              </div>
            </section>
            {/* ============== STEP 2. 활동 조건 및 경력 사항 ============== */}
            <section className="wizard-step" id="step2" hidden>
              <h2 className="step-title">
                활동 조건 및 경력 사항
              </h2>
              <p className="step-desc">
                활동 가능한 지역과 시간, 보유 자격증과 경력을 알려 주세요.
              </p>
              <fieldset className="field" id="f-areas">
                <legend>
                  주요 활동 가능 지역{' '}
                  <span className="req">
                    *
                  </span>
                  <span className="opt-tag">
                    (중복 선택 가능)
                  </span>
                </legend>
                <div className="options" id="areaOptions">
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="인천 남동구" />
                    <span>
                      인천 남동구
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="인천 연수구" />
                    <span>
                      인천 연수구
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="인천 미추홀구" />
                    <span>
                      인천 미추홀구
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="인천 부평구" />
                    <span>
                      인천 부평구
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="인천 계양구" />
                    <span>
                      인천 계양구
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="인천 서구" />
                    <span>
                      인천 서구
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="경기 시흥시" />
                    <span>
                      경기 시흥시
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="경기 부천시" />
                    <span>
                      경기 부천시
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="area" defaultValue="경기 안산시" />
                    <span>
                      경기 안산시
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" id="areaOtherCheck" defaultValue="기타" />
                    <span>
                      기타 (직접 입력)
                    </span>
                  </label>
                </div>
                <input className="text-input other-area-input" type="text" id="areaOtherText" maxLength={40} placeholder="그 외 활동 가능 지역을 입력해 주세요" hidden />
                <p className="err" id="e-areas" hidden></p>
              </fieldset>
              <fieldset className="field" id="f-schedule">
                <legend>
                  활동 가능 요일 및 시간대{' '}
                  <span className="req">
                    *
                  </span>
                  <span className="opt-tag">
                    (중복 선택 가능)
                  </span>
                </legend>
                <div className="options">
                  <label className="opt">
                    <input type="checkbox" name="schedule" defaultValue="평일 오전" />
                    <span>
                      평일 오전
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="schedule" defaultValue="평일 오후" />
                    <span>
                      평일 오후
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="schedule" defaultValue="주말 오전" />
                    <span>
                      주말 오전
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="schedule" defaultValue="주말 오후" />
                    <span>
                      주말 오후
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="schedule" defaultValue="시간 조율 가능" />
                    <span>
                      시간 조율 가능
                    </span>
                  </label>
                </div>
                <p className="err" id="e-schedule" hidden></p>
              </fieldset>
              <fieldset className="field" id="f-certs">
                <legend>
                  보유 자격증
                  <span className="opt-tag">
                    (중복 선택 가능, 없으면 '해당 없음')
                  </span>
                </legend>
                <div className="options">
                  <label className="opt">
                    <input type="checkbox" name="cert" defaultValue="요양보호사" />
                    <span>
                      요양보호사
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="cert" defaultValue="사회복지사" />
                    <span>
                      사회복지사
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="cert" defaultValue="간호사/간호조무사" />
                    <span>
                      간호사/간호조무사
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" name="cert" defaultValue="운전면허증" />
                    <span>
                      운전면허증
                    </span>
                  </label>
                  {' '}
                  <label className="opt">
                    <input type="checkbox" id="certNoneCheck" defaultValue="해당 없음" />
                    <span>
                      해당 없음
                    </span>
                  </label>
                </div>
                <p className="err" id="e-certs" hidden></p>
              </fieldset>
              <div className="field" id="f-career">
                <label htmlFor="mgrCareer">
                  관련 경력 및 경험{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                {' '}
                <textarea className="text-input" id="mgrCareer" maxLength={1000} rows={4} placeholder="요양 보호, 병원 동행, 돌봄 경험 등을 자유롭게 적어 주세요. 경험이 없다면 '없음'이라고 적어 주세요."></textarea>
                <p className="err" id="e-career" hidden></p>
              </div>
              <div className="step-nav">
                <button type="button" className="nav-btn nav-prev" id="toStep1FromStep2">
                  이전
                </button>
                {' '}
                <button type="button" className="nav-btn nav-next" id="toStep3">
                  다음
                </button>
              </div>
            </section>
            {/* ============== STEP 3. 정산 계좌 정보 ============== */}
            <section className="wizard-step" id="step3" hidden>
              <h2 className="step-title">
                정산 계좌 정보
              </h2>
              <p className="step-desc">
                케어 활동 정산금을 받으실 계좌 정보를 입력해 주세요.
              </p>
              <div className="field" id="f-bank">
                <label htmlFor="mgrBank">
                  정산 은행명{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                {' '}
                <select className="text-input" id="mgrBank">
                  <option value="">
                    은행을 선택해 주세요
                  </option>
                  <option>
                    국민은행
                  </option>
                  <option>
                    신한은행
                  </option>
                  <option>
                    우리은행
                  </option>
                  <option>
                    하나은행
                  </option>
                  <option>
                    농협은행
                  </option>
                  <option>
                    IBK기업은행
                  </option>
                  <option>
                    카카오뱅크
                  </option>
                  <option>
                    토스뱅크
                  </option>
                  <option>
                    새마을금고
                  </option>
                  <option>
                    우체국
                  </option>
                  <option value="기타">
                    기타(직접 입력)
                  </option>
                </select>
                {' '}
                <input className="text-input other-area-input" type="text" id="mgrBankOther" maxLength={30} placeholder="은행명을 입력해 주세요" hidden />
                <p className="err" id="e-bank" hidden></p>
              </div>
              <div className="field" id="f-account">
                <label htmlFor="mgrAccount">
                  계좌번호{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                {' '}
                <input className="text-input" type="text" id="mgrAccount" inputMode="numeric" maxLength={30} placeholder="'-' 없이 숫자만 입력해 주세요" />
                <p className="err" id="e-account" hidden></p>
              </div>
              <div className="field" id="f-holder">
                <label htmlFor="mgrHolder">
                  예금주명{' '}
                  <span className="req">
                    *
                  </span>
                </label>
                {' '}
                <input className="text-input" type="text" id="mgrHolder" maxLength={30} placeholder="예: 홍길동" />
                <p className="hint">
                  지원자 본인 성함과 일치해야 합니다.
                </p>
                <p className="err" id="e-holder" hidden></p>
              </div>
              <div className="step-nav">
                <button type="button" className="nav-btn nav-prev" id="toStep2FromStep3">
                  이전
                </button>
                {' '}
                <button type="button" className="nav-btn nav-next" id="toStep4">
                  다음
                </button>
              </div>
            </section>
            {/* ============== STEP 4. 안전 서약 및 필수 약관 동의 ============== */}
            <section className="wizard-step" id="step4" hidden>
              <h2 className="step-title">
                안전 서약 및 필수 약관 동의
              </h2>
              <p className="step-desc">
                아래 내용을 확인하고 모두 동의해 주셔야 지원할 수 있어요.
              </p>
              <div className="consent-card">
                <label className="consent-row">
                  <input type="checkbox" id="agreeSafety" />
                  {' '}
                  <span className="ct">
                    성범죄, 아동·노인 학대 등 안전 관련 범죄 이력이 없음을 서약합니다.{' '}
                    <span className="req">
                      *
                    </span>
                  </span>
                </label>
                <p className="consent-detail">
                  허위 서약이 확인될 경우 즉시 지원이 취소되거나 매니저 자격이 박탈될 수 있습니다.
                </p>
              </div>
              <div className="consent-card">
                <label className="consent-row">
                  <input type="checkbox" id="agreeNoDirectDeal" />
                  {' '}
                  <span className="ct">
                    플랫폼을 거치지 않은 개인 간 직거래(우회 거래)를 하지 않을 것에 동의합니다.{' '}
                    <span className="req">
                      *
                    </span>
                  </span>
                </label>
                <p className="consent-detail">
                  직거래로 발생한 사고·분쟁은 위드브릿지가 책임지지 않으며, 적발 시 매니저 자격이 해지될 수 있습니다.
                </p>
              </div>
              <div className="consent-card">
                <label className="consent-row">
                  <input type="checkbox" id="agreePrivacy" />
                  {' '}
                  <span className="ct">
                    성명, 연락처, 성별, 계좌정보의 수집 및 이용에 동의합니다.{' '}
                    <span className="req">
                      *
                    </span>
                  </span>
                </label>
                <p className="consent-detail">
                  수집한 정보는 매니저 자격 심사 및 정산 목적으로만 사용되며,{' '}
                  <a href="/terms" data-open-terms>
                    이용약관
                  </a>
                  에 따라 관리됩니다.
                </p>
                <p className="consent-detail">
                  매니저는 활동 중 발생할 수 있는 대인·대물 사고에 대비해 회사가 제공하는 안심케어(배상책임) 프로그램에 자동 참여되며, 별도의 개인 부담금 없이 회사가 정한 기준에 따른 약정 활동 수수료를 정산받습니다.
                </p>
              </div>
              <p className="err" id="e-agree" hidden></p>
              <div className="form-error" id="formError" role="alert" hidden></div>
              <div className="step-nav">
                <button type="button" className="nav-btn nav-prev" id="toStep3FromStep4">
                  이전
                </button>
                {' '}
                <button type="submit" className="nav-btn nav-submit" id="submitBtn">
                  제출하기
                </button>
              </div>
            </section>
          </form>
        </div>
        {/* ================================================================ */}
        {' '}
        {/* 03. 상태 카드: 이미 매니저 / 심사 중 / 접수 완료 (하나만 노출) */}
        {' '}
        {/* ================================================================ */}
        <section className="card status-card" id="alreadyManagerCard" hidden aria-live="polite">
          <span className="status-badge is-approved">
            활동 중
          </span>
          <h2>
            이미 케어 매니저로 활동 중입니다
          </h2>
          <p>
            매니저 마이페이지에서 오늘의 배정 케어와 신청 대기 목록을 확인해 주세요.
          </p>
          <div className="status-actions">
            <a className="btn" href="/mypage-manager">
              매니저 마이페이지로 이동
            </a>
          </div>
        </section>
        <section className="card status-card" id="pendingCard" hidden aria-live="polite">
          <span className="status-badge is-pending">
            심사 중
          </span>
          <h2>
            지원서를 검토 중입니다
          </h2>
          <p>
            관리자 확인 후 승인 여부를 알려드려요. 잠시만 기다려 주세요.
          </p>
          <div className="status-actions">
            <a className="btn btn-ghost" href="/mypage">
              마이페이지로 이동
            </a>
          </div>
        </section>
        <section className="card status-card" id="doneCard" hidden aria-live="polite">
          <div className="done-icon" aria-hidden="true">
            ✓
          </div>
          <h2 id="doneTitle" tabIndex={-1}>
            지원서가 접수되었습니다
          </h2>
          <p>
            관리자 검토 후 승인 여부를 안내해 드립니다.
          </p>
          <div className="status-actions">
            <a className="btn" href="/mypage">
              마이페이지로 이동
            </a>
          </div>
        </section>
      </div>
    </main>
    <ManagerApplyBehaviors />
    </>
  );
}
