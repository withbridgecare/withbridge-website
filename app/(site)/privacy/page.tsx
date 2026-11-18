import './privacy.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "위드브릿지 개인정보 처리방침 — 시니어 병원 동행 등 케어 서비스 이용 과정에서 수집하는 개인정보(건강정보 포함)의 처리 기준",
};

/** 개인정보 처리방침 | 위드브릿지 — public/privacy.html 에서 옮김 */
export default function PrivacyPage() {
  return (
    <>
      <NotoSansKr />
      <main className="pp-main">
        <div className="pp-wrap">
          <div className="pp-head">
            <h1 className="pp-title">
              위드브릿지 개인정보 처리방침
            </h1>
            <p className="pp-meta">
              시행일{' '}
              <b id="ppEffective">
                2026년 10월 13일
              </b>
              {' '}· 방침 버전{' '}
              <b id="ppVersion">
                2026-10-13
              </b>
            </p>
          </div>
          <p className="pp-intro">
            위드브릿지(이하 “회사”)는 시니어 병원 동행 및 생활 편의 매칭 서비스를 제공하며, 이 과정에서 보호자와 어르신의 개인정보, 그중에서도 거동 상태·질환 등{' '}
            <b>
              민감정보(건강정보)
            </b>
            를 다루게 됩니다. 회사는 「개인정보 보호법」 등 관계 법령을 지키며, 이 방침을 통해 수집하는 개인정보의 항목, 이용 목적, 케어매니저에게 제공되는 범위, 결제·호스팅 업무의 위탁 현황을 투명하게 밝힙니다. ★ 표시가 있는{' '}
            <b>
              제5조(제3자 제공)
            </b>
            ,{' '}
            <b>
              제6조(처리 위탁)
            </b>
            ,{' '}
            <b>
              제7조(민감정보 처리)
            </b>
            는 특히 중요하니 꼭 확인해 주세요.
          </p>
          <nav className="toc" aria-label="개인정보 처리방침 목차">
            <h2>
              목차
            </h2>
            <ol>
              <li>
                <a href="#art-1">
                  <span className="n">
                    제1조
                  </span>
                  {' '}목적
                </a>
              </li>
              <li>
                <a href="#art-2">
                  <span className="n">
                    제2조
                  </span>
                  {' '}수집하는 개인정보의 항목 및 방법
                </a>
              </li>
              <li>
                <a href="#art-3">
                  <span className="n">
                    제3조
                  </span>
                  {' '}개인정보의 수집 및 이용목적
                </a>
              </li>
              <li>
                <a href="#art-4">
                  <span className="n">
                    제4조
                  </span>
                  {' '}처리 및 보유기간
                </a>
              </li>
              <li>
                <a href="#art-5">
                  <span className="n">
                    제5조
                  </span>
                  {' '}제3자 제공{' '}
                  <span className="star">
                    ★
                  </span>
                </a>
              </li>
              <li>
                <a href="#art-6">
                  <span className="n">
                    제6조
                  </span>
                  {' '}처리 업무의 위탁{' '}
                  <span className="star">
                    ★
                  </span>
                </a>
              </li>
              <li>
                <a href="#art-7">
                  <span className="n">
                    제7조
                  </span>
                  {' '}민감정보(건강정보)의 처리{' '}
                  <span className="star">
                    ★
                  </span>
                </a>
              </li>
              <li>
                <a href="#art-8">
                  <span className="n">
                    제8조
                  </span>
                  {' '}정보주체의 권리·의무 및 행사방법
                </a>
              </li>
              <li>
                <a href="#art-9">
                  <span className="n">
                    제9조
                  </span>
                  {' '}개인정보의 파기
                </a>
              </li>
              <li>
                <a href="#art-10">
                  <span className="n">
                    제10조
                  </span>
                  {' '}안전성 확보조치
                </a>
              </li>
              <li>
                <a href="#art-11">
                  <span className="n">
                    제11조
                  </span>
                  {' '}쿠키의 운영 및 거부
                </a>
              </li>
              <li>
                <a href="#art-12">
                  <span className="n">
                    제12조
                  </span>
                  {' '}개인정보 보호책임자
                </a>
              </li>
              <li>
                <a href="#art-13">
                  <span className="n">
                    제13조
                  </span>
                  {' '}권익침해 구제방법
                </a>
              </li>
              <li>
                <a href="#art-14">
                  <span className="n">
                    제14조
                  </span>
                  {' '}처리방침의 변경
                </a>
              </li>
            </ol>
          </nav>
          {/* ================= 제1조 ================= */}
          <section className="art" id="art-1">
            <h2>
              <span className="no">
                제1조
              </span>
              {' '}목적
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              이 개인정보 처리방침은 회사가 운영하는 플랫폼과 케어매니저가 수행하는 오프라인 동행 서비스를 이용하는 과정에서 회사가 어떤 개인정보를 수집·이용·제공·보관·파기하는지, 이용자(보호자, 어르신)가 자신의 정보에 대하여 어떤 권리를 행사할 수 있는지를 알려 드리기 위하여 마련하였습니다.
            </p>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회사는 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」, 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관계 법령을 지키며, 이 방침은 회사의 웹사이트 및 모바일 환경에 모두 적용됩니다. 서비스 이용에 관한 전반적인 조건은 별도의{' '}
              <a href="/terms" data-open-terms style={{ color: "var(--accent-dark)", fontWeight: "700", textDecoration: "underline" }}>
                이용약관
              </a>
              으로 정합니다.
            </p>
          </section>
          {/* ================= 제2조 ================= */}
          <section className="art" id="art-2">
            <h2>
              <span className="no">
                제2조
              </span>
              {' '}수집하는 개인정보의 항목 및 수집방법
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 회원가입, 서비스 신청, 결제, 고객 상담 과정에서 다음의 개인정보를 수집합니다.
            </p>
            <ol className="sub">
              <li>
                <b>
                  필수 항목(보호자/회원)
                </b>
                {' '}: 이름, 휴대전화번호, 이메일, 카카오 소셜 로그인 식별값, 비밀번호(이메일 가입 시), 서비스 이용 및 결제 기록
              </li>
              <li>
                <b>
                  필수 항목(어르신)
                </b>
                {' '}: 이름, 생년월일, 주소, 거동 상태(보행 가능/보행기·지팡이 사용/휠체어 사용 등), 기왕증·복용 약물 등{' '}
                <b>
                  건강정보(민감정보)
                </b>
                , 보호자와의 관계
              </li>
              <li>
                <b>
                  결제 관련 정보
                </b>
                {' '}: 결제수단 정보(카드사명, 결제승인번호 등 PortOne이 발급하는 식별값), 가상계좌 발급 시 입금 계좌 및 예금주명 — 카드 전체 번호 등 원 결제정보는 회사가 직접 저장하지 않으며, 결제대행사(PortOne) 및 카드사·은행이 관계 법령에 따라 보관합니다.
              </li>
              <li>
                <b>
                  자동 수집 항목
                </b>
                {' '}: 접속 로그, 접속 IP, 쿠키, 서비스 이용기록, 기기 정보(OS·브라우저 종류)
              </li>
              <li>
                <b>
                  케어매니저(파트너) 지원 시
                </b>
                {' '}: 이름, 연락처, 이메일, 주소, 생년월일, 자격증·경력 증빙 자료, 통장사본(정산용)
              </li>
            </ol>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회사는 다음과 같은 방법으로 개인정보를 수집합니다.
            </p>
            <ol className="sub">
              <li>
                회원가입, 서비스(예약) 신청서 작성, 카카오 소셜 로그인 연동 시 이용자가 직접 입력
              </li>
              <li>
                고객센터·카카오톡 채널을 통한 상담, 전화 상담 과정에서 구술 또는 문서로 제공
              </li>
              <li>
                서비스 결제 시 결제대행사(PortOne)를 통하여 생성·전달되는 결제 승인 정보
              </li>
              <li>
                웹사이트 이용 과정에서 자동으로 생성되는 접속 로그, 쿠키
              </li>
            </ol>
          </section>
          {/* ================= 제3조 ================= */}
          <section className="art" id="art-3">
            <h2>
              <span className="no">
                제3조
              </span>
              {' '}개인정보의 수집 및 이용목적
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 수집한 개인정보를 다음의 목적을 위해서만 이용합니다.
            </p>
            <ol className="sub">
              <li>
                회원 가입 확인, 본인 확인, 부정 이용 방지 등 회원 관리
              </li>
              <li>
                서비스 신청 접수, 케어매니저 매칭, 안전한 동행을 위한 사전 준비(거동 상태·건강정보 확인 포함)
              </li>
              <li>
                서비스 이용 요금의 결제, 가상계좌를 통한 입금 확인, 환불·정산 처리
              </li>
              <li>
                예약 확인, 일정 변경, 사고·응급상황 대응을 위한 긴급 연락
              </li>
              <li>
                고객 문의·불만 처리, 공지사항 전달, 서비스 품질 개선을 위한 통계 분석(비식별 처리)
              </li>
              <li>
                케어매니저(파트너) 지원자의 자격 확인 및 계약·정산 관리
              </li>
            </ol>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회사는 이용자가 동의한 목적 범위를 넘어서 개인정보를 이용하지 않으며, 이용 목적이 변경되는 경우 사전에 별도의 동의를 받습니다.
            </p>
          </section>
          {/* ================= 제4조 ================= */}
          <section className="art" id="art-4">
            <h2>
              <span className="no">
                제4조
              </span>
              {' '}개인정보의 처리 및 보유기간
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 개인정보의 수집·이용 목적이 달성되면 해당 정보를 지체 없이 파기합니다. 다만, 관계 법령에서 일정 기간 보존하도록 정한 경우에는 그 기간 동안 별도로 분리하여 보관합니다.
            </p>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      보관 항목
                    </th>
                    <th>
                      보관 근거
                    </th>
                    <th>
                      보관 기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      계약 또는 청약철회 등에 관한 기록
                    </td>
                    <td>
                      전자상거래 등에서의 소비자보호에 관한 법률
                    </td>
                    <td>
                      5년
                    </td>
                  </tr>
                  <tr>
                    <td>
                      대금결제 및 재화 등의 공급에 관한 기록
                    </td>
                    <td>
                      전자상거래 등에서의 소비자보호에 관한 법률
                    </td>
                    <td>
                      5년
                    </td>
                  </tr>
                  <tr>
                    <td>
                      소비자의 불만 또는 분쟁처리에 관한 기록
                    </td>
                    <td>
                      전자상거래 등에서의 소비자보호에 관한 법률
                    </td>
                    <td>
                      3년
                    </td>
                  </tr>
                  <tr>
                    <td>
                      표시·광고에 관한 기록
                    </td>
                    <td>
                      전자상거래 등에서의 소비자보호에 관한 법률
                    </td>
                    <td>
                      6개월
                    </td>
                  </tr>
                  <tr>
                    <td>
                      세금계산서·영수증 등 거래 기록
                    </td>
                    <td>
                      국세기본법
                    </td>
                    <td>
                      5년
                    </td>
                  </tr>
                  <tr>
                    <td>
                      웹사이트 방문 기록(접속 로그)
                    </td>
                    <td>
                      통신비밀보호법
                    </td>
                    <td>
                      3개월
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회원 탈퇴 시 어르신의 거동 상태·건강정보 등 민감정보는 위 보존 의무가 있는 거래 관련 기록을 제외하고 지체 없이 파기합니다.
            </p>
          </section>
          {/* ================= 제5조 ★ ================= */}
          <section className="art is-key" id="art-5">
            <h2>
              <span className="no">
                제5조
              </span>
              {' '}개인정보의 제3자 제공{' '}
              <span className="badge-key">
                ★ 핵심 조항
              </span>
            </h2>
            <p className="must">
              회사는 동행 수행에 꼭 필요한 최소한의 정보만 케어매니저에게 제공하며, 그 밖의 제3자에게는 법령상 근거나 이용자의 동의가 있는 경우를 제외하고 개인정보를 제공하지 않습니다.
            </p>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의 경우에는 예외로 합니다.
            </p>
            <ol className="sub">
              <li>
                이용자가 사전에 동의한 경우
              </li>
              <li>
                법령의 규정에 의거하거나, 수사 목적으로 법령에서 정한 절차와 방법에 따라 수사기관의 요구가 있는 경우
              </li>
            </ol>
            <p className="cl">
              <span className="no">
                ②
              </span>
              서비스 매칭·수행을 위하여 다음과 같이 정보를 제공합니다.
            </p>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      제공받는 자
                    </th>
                    <th>
                      제공 목적
                    </th>
                    <th>
                      제공 항목
                    </th>
                    <th>
                      보유·이용 기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      매칭된 케어매니저
                    </td>
                    <td>
                      안전한 동행 수행을 위한 사전 파악 및 현장 대응
                    </td>
                    <td>
                      어르신 이름, 연락처, 주소(이동 구간), 거동 상태, 기왕증 등 동행에 필요한 최소한의 건강정보, 보호자 연락처
                    </td>
                    <td>
                      해당 서비스 수행 완료 시까지, 이후 지체 없이 파기 또는 접근 차단
                    </td>
                  </tr>
                  <tr>
                    <td>
                      배상책임보험사
                    </td>
                    <td>
                      동행 중 발생한 사고의 보험 접수 및 처리
                    </td>
                    <td>
                      사고 경위, 당사자 이름·연락처, 피해 내용
                    </td>
                    <td>
                      보험 처리 완료 시까지
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="cl">
              <span className="no">
                ③
              </span>
              케어매니저는 제공받은 정보를 동행 서비스 수행 목적 외로 이용하거나 보관할 수 없으며, 회사는 케어매니저와의 계약을 통하여 이를 의무화하고 교육합니다.
            </p>
          </section>
          {/* ================= 제6조 ★ ================= */}
          <section className="art is-key" id="art-6">
            <h2>
              <span className="no">
                제6조
              </span>
              {' '}개인정보처리 업무의 위탁{' '}
              <span className="badge-key">
                ★ 핵심 조항
              </span>
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리업무를 외부 업체에 위탁하고 있으며, 관계 법령에 따라 위탁계약 시 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정합니다.
            </p>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      수탁업체
                    </th>
                    <th>
                      위탁업무 내용
                    </th>
                    <th>
                      보유·이용 기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      ㈜포트원(PortOne)
                    </td>
                    <td>
                      신용카드·가상계좌 등 결제 처리, 결제 승인·취소·환불 대행
                    </td>
                    <td>
                      회원 탈퇴 또는 위탁계약 종료 시까지, 관계 법령에 따른 보존 의무 기간 동안은 별도 보관
                    </td>
                  </tr>
                  <tr>
                    <td>
                      Supabase, Inc.
                    </td>
                    <td>
                      회원정보·서비스 신청 정보·건강정보 등을 저장하는 데이터베이스 및 인증 시스템의 클라우드 호스팅
                    </td>
                    <td>
                      회원 탈퇴 또는 위탁계약 종료 시까지
                    </td>
                  </tr>
                  <tr>
                    <td>
                      ㈜카카오
                    </td>
                    <td>
                      소셜 로그인(카카오 계정 연동) 인증, 카카오톡 채널을 통한 고객 상담
                    </td>
                    <td>
                      로그인 연동 해지 또는 상담 종료 시까지
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="cl">
              <span className="no">
                ②
              </span>
              Supabase, Inc.는 해외(미국 등)에 서버를 둔 서비스로, 데이터 저장 및 처리 과정에서 국외로 개인정보가 이전될 수 있습니다. 회사는 수탁업체가 관계 법령 및 국제 기준에 따른 보안 수준을 유지하는지 계약 및 점검을 통해 관리합니다.
            </p>
            <p className="cl">
              <span className="no">
                ③
              </span>
              회사는 위탁계약 체결 시 「개인정보 보호법」 제26조에 따라 위탁업무 수행 목적 외 개인정보 처리 금지, 기술적·관리적 보호조치, 재위탁 제한, 수탁자에 대한 관리·감독, 손해배상 등 책임에 관한 사항을 계약서 등 문서에 명시하고, 수탁자가 개인정보를 안전하게 처리하는지 감독합니다.
            </p>
            <p className="cl">
              <span className="no">
                ④
              </span>
              위탁업무의 내용이나 수탁자가 변경되는 경우 회사는 지체 없이 이 방침을 통하여 공개합니다.
            </p>
          </section>
          {/* ================= 제7조 ★ ================= */}
          <section className="art is-key" id="art-7">
            <h2>
              <span className="no">
                제7조
              </span>
              {' '}민감정보(건강정보)의 처리{' '}
              <span className="badge-key">
                ★ 핵심 조항
              </span>
            </h2>
            <p className="must">
              어르신의 거동 상태·기왕증 등 건강정보는 「개인정보 보호법」상 민감정보로서, 안전한 동행 수행을 위한 목적 외에는 수집·이용하지 않습니다.
            </p>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 안전한 매칭과 현장 대응을 위하여 어르신의 거동 상태, 기왕증(치매·뇌졸중·심장·호흡기 질환·당뇨·낙상 경험 등), 복용 약물, 감염성 질환 여부 등 건강에 관한 정보를 수집할 수 있습니다. 이는 「개인정보 보호법」 제23조가 정한 민감정보에 해당합니다.
            </p>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회사는 이러한 민감정보를 수집하기 전에 그 수집·이용 목적, 항목, 보유기간을 명확히 알리고 이용자(보호자)로부터 별도의 동의를 받습니다. 동의하지 않을 경우 서비스 매칭 과정에서 어르신의 상태에 맞는 케어매니저 배정이 제한될 수 있습니다.
            </p>
            <p className="cl">
              <span className="no">
                ③
              </span>
              보호자가 어르신을 대신하여 건강정보를 제공하는 경우, 보호자는 어르신 본인(또는 법정대리인)에게 필요한 설명을 하고 정당한 동의를 받았음을 보증합니다.
            </p>
            <p className="cl">
              <span className="no">
                ④
              </span>
              민감정보는 제5조에 따라 매칭된 케어매니저 등 동행 수행에 반드시 필요한 범위로만 제공되며, 그 밖의 목적으로 이용하거나 제3자에게 제공하지 않습니다. 회사 내부에서도 매칭·배정 업무를 담당하는 인력만 접근할 수 있도록 권한을 제한합니다.
            </p>
            <p className="cl">
              <span className="no">
                ⑤
              </span>
              민감정보는 서비스 수행이 완료되고 관계 법령상 보관 의무 기간이 지나면 지체 없이 파기합니다.
            </p>
          </section>
          {/* ================= 제8조 ================= */}
          <section className="art" id="art-8">
            <h2>
              <span className="no">
                제8조
              </span>
              {' '}정보주체와 법정대리인의 권리·의무 및 행사방법
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              이용자(어르신 본인 또는 법정대리인 포함)는 언제든지 회사가 보유한 자신 및 어르신의 개인정보에 대하여 열람, 정정·삭제, 처리정지를 요구할 수 있습니다.
            </p>
            <p className="cl">
              <span className="no">
                ②
              </span>
              권리 행사는 회사에 서면, 전화, 이메일, 카카오톡 채널 등을 통하여 요청하실 수 있으며, 회사는 지체 없이 필요한 조치를 합니다. 다만, 관계 법령에서 보존을 요구하는 정보에 대한 삭제 요청은 제4조의 보유기간이 지난 뒤 처리됩니다.
            </p>
            <p className="cl">
              <span className="no">
                ③
              </span>
              이용자가 개인정보의 오류에 대한 정정을 요청한 경우 정정을 완료하기 전까지 해당 개인정보를 이용하거나 제공하지 않으며, 이미 제3자에게 제공한 경우에는 정정 처리 결과를 제3자에게 지체 없이 알려 정정이 이루어지도록 합니다.
            </p>
            <p className="cl">
              <span className="no">
                ④
              </span>
              이용자는 개인정보 처리에 관한 동의를 거부할 권리가 있으며, 다만 서비스 신청·결제·매칭에 필요한 필수 정보의 수집·이용에 동의하지 않으시면 서비스 이용이 제한될 수 있습니다.
            </p>
            <p className="cl">
              <span className="no">
                ⑤
              </span>
              권리 행사는 이용자 본인 또는 정당한 대리인을 통하여 할 수 있으며, 이 경우 「개인정보 보호법 시행규칙」이 정한 위임장을 제출해야 합니다.
            </p>
          </section>
          {/* ================= 제9조 ================= */}
          <section className="art" id="art-9">
            <h2>
              <span className="no">
                제9조
              </span>
              {' '}개인정보의 파기절차 및 방법
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 개인정보 보유기간의 경과, 처리 목적의 달성 등 개인정보가 불필요하게 된 경우에는 지체 없이 해당 개인정보를 파기합니다.
            </p>
            <p className="cl">
              <span className="no">
                ②
              </span>
              법령에 따라 보존해야 하는 정보는 별도의 데이터베이스(DB)로 옮기거나 보관 장소를 달리하여 분리 보관합니다.
            </p>
            <p className="cl">
              <span className="no">
                ③
              </span>
              전자적 파일 형태의 정보는 복구·재생이 불가능한 기술적 방법을 사용하여 삭제하며, 종이에 출력된 정보는 분쇄기로 분쇄하거나 소각하여 파기합니다.
            </p>
          </section>
          {/* ================= 제10조 ================= */}
          <section className="art" id="art-10">
            <h2>
              <span className="no">
                제10조
              </span>
              {' '}개인정보의 안전성 확보조치
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 개인정보의 분실·도난·유출·변조·훼손을 막기 위하여 다음과 같은 조치를 취합니다.
            </p>
            <ol className="sub">
              <li>
                <b>
                  관리적 조치
                </b>
                {' '}: 개인정보 접근 권한을 매칭·배정 등 업무 수행에 필요한 최소한의 인원으로 제한하고, 내부 관리계획을 수립·시행합니다.
              </li>
              <li>
                <b>
                  기술적 조치
                </b>
                {' '}: 비밀번호의 암호화 저장, 전송 구간 암호화(TLS/SSL), 수탁업체(Supabase 등)의 접근 제어 및 인증 체계 적용, 보안 프로그램의 설치·갱신
              </li>
              <li>
                <b>
                  물리적 조치
                </b>
                {' '}: 개인정보가 저장된 시스템에 대한 접근 통제
              </li>
            </ol>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회사는 개인정보가 유출되는 등 사고가 발생한 경우 「개인정보 보호법」이 정한 절차에 따라 지체 없이 이용자에게 알리고 관계 기관에 신고합니다.
            </p>
          </section>
          {/* ================= 제11조 ================= */}
          <section className="art" id="art-11">
            <h2>
              <span className="no">
                제11조
              </span>
              {' '}쿠키(Cookie)의 운영 및 거부
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 이용자에게 맞춤화된 서비스를 제공하기 위하여 쿠키 및 브라우저 로컬 스토리지를 사용할 수 있습니다. 예를 들어 혜택 안내 팝업을 하루 동안 다시 보지 않도록 설정하는 기능 등에 쓰입니다.
            </p>
            <p className="cl">
              <span className="no">
                ②
              </span>
              이용자는 웹브라우저 설정을 통하여 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만 쿠키 저장을 거부할 경우 일부 서비스 이용에 어려움이 발생할 수 있습니다.
            </p>
          </section>
          {/* ================= 제12조 ================= */}
          <section className="art" id="art-12">
            <h2>
              <span className="no">
                제12조
              </span>
              {' '}개인정보 보호책임자
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              회사는 개인정보 처리에 관한 업무를 총괄하고 이용자의 불만 처리 및 피해 구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <div className="tbl-wrap">
              <table className="info">
                <tbody>
                  <tr>
                    <th>
                      개인정보 보호책임자
                    </th>
                    <td>
                      강승수 (대표자)
                    </td>
                  </tr>
                  <tr>
                    <th>
                      전화
                    </th>
                    <td>
                      <a href="tel:01055305760">
                        010-5530-5760
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <th>
                      이메일
                    </th>
                    <td>
                      <a href="mailto:withbridge.care@outlook.kr">
                        withbridge.care@outlook.kr
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <th>
                      운영시간
                    </th>
                    <td>
                      평일 08:00 ~ 18:00 (주말·공휴일 휴무)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="cl">
              <span className="no">
                ②
              </span>
              이용자는 서비스를 이용하면서 발생한 모든 개인정보 관련 문의, 불만 처리, 피해 구제 등에 관한 사항을 개인정보 보호책임자에게 문의할 수 있습니다. 회사는 이용자의 문의에 대해 지체 없이 답변 및 처리해 드립니다.
            </p>
          </section>
          {/* ================= 제13조 ================= */}
          <section className="art" id="art-13">
            <h2>
              <span className="no">
                제13조
              </span>
              {' '}권익침해 구제방법
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              이용자는 개인정보침해로 인한 구제를 받기 위하여 개인정보분쟁조정위원회, 한국인터넷진흥원 개인정보침해신고센터 등에 분쟁 해결이나 상담을 신청할 수 있습니다. 그 밖에 기타 개인정보침해의 신고, 상담에 대하여는 아래의 기관에 문의하실 수 있습니다.
            </p>
            <ol className="sub">
              <li>
                개인정보분쟁조정위원회 : (국번없이) 1833-6972 (www.kopico.go.kr)
              </li>
              <li>
                개인정보침해신고센터 : (국번없이) 118 (privacy.kisa.or.kr)
              </li>
              <li>
                대검찰청 : (국번없이) 1301 (www.spo.go.kr)
              </li>
              <li>
                경찰청 : (국번없이) 182 (ecrm.cyber.go.kr)
              </li>
            </ol>
            <p className="cl">
              <span className="no">
                ②
              </span>
              회사는 이용자의 개인정보자기결정권을 보장하고, 개인정보침해로 인한 상담 및 피해 구제를 위해 최선을 다하여 협조합니다.
            </p>
          </section>
          {/* ================= 제14조 ================= */}
          <section className="art" id="art-14">
            <h2>
              <span className="no">
                제14조
              </span>
              {' '}개인정보 처리방침의 변경
            </h2>
            <p className="cl">
              <span className="no">
                ①
              </span>
              이 개인정보 처리방침은 법령·정책 또는 보안 기술의 변경에 따라 내용이 추가·삭제 및 수정될 수 있습니다. 내용을 변경하는 경우 회사는 적용일자{' '}
              <b>
                7일 전부터
              </b>
              (이용자의 권리에 중대한 영향을 미치는 변경은{' '}
              <b>
                30일 전부터
              </b>
              ) 플랫폼을 통해 공지합니다.
            </p>
            <p className="cl">
              <span className="no">
                ②
              </span>
              이 방침은{' '}
              <b id="ppEffective2">
                2026년 10월 13일
              </b>
              부터 시행합니다.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
