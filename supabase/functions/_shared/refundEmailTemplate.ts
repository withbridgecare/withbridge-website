// 48시간 미매칭 자동 취소/환불 안내 메일 본문 — cancel-expired-applications 가 호출합니다.
// (apply.html 신청서 상단/하단의 "48시간 이내 매니저가 배정되지 않으면 자동 취소 + 100% 환불" 안심
// 문구와 같은 정책을 그대로 설명합니다.)

export interface RefundEmailInput {
  serviceType: string | null;
  seniorName: string | null;
  appliedAt: string | null; // service_applications.created_at (ISO)
  /** PortOne 재조회로 확인한 실제 환불 금액. 모르면(결제 기록 없음 등) null — 그 경우 금액 줄은 생략합니다. */
  amount: number | null;
}

function fmtKoreanDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // 사이트 전역이 KST 고정 표기를 쓰므로(mypage.html toKst() 등) 서버 타임존과 무관하게 +9시간으로 맞춥니다.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}-${p2(kst.getUTCDate())} ${p2(kst.getUTCHours())}:${p2(kst.getUTCMinutes())}`;
}

function fmtWon(amount: number | null): string | null {
  if (amount == null) return null;
  return amount.toLocaleString("ko-KR") + "원";
}

export function buildRefundEmail(input: RefundEmailInput): { subject: string; html: string; text: string } {
  const serviceType = input.serviceType || "케어 서비스";
  const seniorLine = input.seniorName ? `(${input.seniorName} 어르신)` : "";
  const appliedAt = fmtKoreanDateTime(input.appliedAt);
  const amount = fmtWon(input.amount);

  const subject = `[위드브릿지] ${serviceType} 신청 자동 취소 및 환불 완료 안내`;

  const amountRow = amount
    ? `<tr><td style="padding:6px 0;color:#6B7280;">환불 금액</td><td style="padding:6px 0;font-weight:700;color:#1A1D21;text-align:right;">${amount}</td></tr>`
    : "";
  const appliedAtRow = appliedAt
    ? `<tr><td style="padding:6px 0;color:#6B7280;">신청 시각</td><td style="padding:6px 0;color:#1A1D21;text-align:right;">${appliedAt}</td></tr>`
    : "";

  const html = `
  <div style="font-family:'Noto Sans KR',-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#1A1D21;">
    <div style="padding:28px 24px 20px;background:#78866B;border-radius:16px 16px 0 0;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">위드브릿지</p>
    </div>
    <div style="padding:28px 24px;border:1px solid #E2ECE0;border-top:none;border-radius:0 0 16px 16px;">
      <h1 style="margin:0 0 14px;font-size:19px;font-weight:800;letter-spacing:-0.02em;">신청이 자동 취소되어 결제금액을 환불했습니다</h1>
      <p style="margin:0 0 18px;font-size:14.5px;line-height:1.6;color:#374151;">
        신청하신 <b>${serviceType}</b>${seniorLine ? " " + seniorLine : ""} 서비스가 접수 후 48시간 이내에 담당 매니저가 배정되지 않아,
        안내드린 환불 정책에 따라 신청이 자동 취소되고 결제금액 전액이 환불 처리되었습니다.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #EBE7E0;border-bottom:1px solid #EBE7E0;margin:0 0 18px;">
        <tr><td style="padding:6px 0;color:#6B7280;">서비스</td><td style="padding:6px 0;color:#1A1D21;text-align:right;">${serviceType}${seniorLine ? " " + seniorLine : ""}</td></tr>
        ${appliedAtRow}
        ${amountRow}
      </table>
      <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6B7280;">
        환불은 결제하신 수단으로 처리되며, 카드 결제의 경우 카드사 사정에 따라 영업일 기준 3~5일 정도
        소요될 수 있습니다. 환불 내역이 보이지 않거나 문의사항이 있으시면 아래 고객센터로 연락해 주세요.
      </p>
      <p style="margin:0;font-size:13.5px;font-weight:700;color:#3B4B3C;">
        위드브릿지 고객센터 010-5874-5760 · 카카오톡 채널 @위드브릿지
      </p>
    </div>
  </div>`;

  const text =
    `[위드브릿지] ${serviceType}${seniorLine ? " " + seniorLine : ""} 신청이 48시간 이내 매니저 미배정으로 자동 취소되어 결제금액이 전액 환불 처리되었습니다.\n` +
    (appliedAt ? `신청 시각: ${appliedAt}\n` : "") +
    (amount ? `환불 금액: ${amount}\n` : "") +
    `환불은 결제 수단으로 처리되며(카드 결제는 영업일 기준 3~5일 소요될 수 있음), 문의는 고객센터 010-5874-5760 으로 연락해 주세요.`;

  return { subject, html, text };
}
