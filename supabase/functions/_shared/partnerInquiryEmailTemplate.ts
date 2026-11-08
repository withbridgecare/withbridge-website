// partner.html 제휴 문의 신규 접수 알림 메일 본문 — notify-partner-inquiry 가 호출합니다.

export interface PartnerInquiryEmailInput {
  orgName: string;
  contactName: string;
  phone: string;
  email: string;
  orgType: string;
  message: string | null;
  createdAt: string | null; // partner_inquiries.created_at (ISO)
}

function fmtKoreanDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  // 사이트 전역이 KST 고정 표기를 쓰므로(mypage.html toKst() 등) 서버 타임존과 무관하게 +9시간으로 맞춥니다.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}-${p2(kst.getUTCDate())} ${p2(kst.getUTCHours())}:${p2(kst.getUTCMinutes())}`;
}

// 폼 입력값을 그대로 메일 HTML에 꽂아 넣으므로(기관명·메시지 등 전부 사용자 입력), 반드시 escape 해
// XSS/HTML 주입을 막습니다 — 운영자 메일 클라이언트에서 열리더라도 신뢰할 수 없는 입력입니다.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPartnerInquiryEmail(input: PartnerInquiryEmailInput): { subject: string; html: string; text: string } {
  const subject = `[위드브릿지] 신규 제휴 문의 - ${input.orgName} (${input.orgType})`;

  const rows: [string, string][] = [
    ["기관명", input.orgName],
    ["기관 유형", input.orgType],
    ["담당자명", input.contactName],
    ["연락처", input.phone],
    ["이메일", input.email],
    ["접수 시각", fmtKoreanDateTime(input.createdAt)],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#6B7280;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0 6px 16px;color:#1A1D21;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const messageHtml = input.message
    ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(input.message)}</p>`
    : "";

  const html = `
  <div style="font-family:'Noto Sans KR',-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#1A1D21;">
    <div style="padding:28px 24px 20px;background:#78866B;border-radius:16px 16px 0 0;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">위드브릿지</p>
    </div>
    <div style="padding:28px 24px;border:1px solid #E2ECE0;border-top:none;border-radius:0 0 16px 16px;">
      <h1 style="margin:0 0 14px;font-size:19px;font-weight:800;letter-spacing:-0.02em;">새로운 제휴 문의가 접수되었습니다</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #EBE7E0;border-bottom:1px solid #EBE7E0;">
        ${rowsHtml}
      </table>
      ${messageHtml}
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">
        admin.html에서 상세 내역을 확인하고 담당자에게 연락해 주세요.
      </p>
    </div>
  </div>`;

  const text =
    `[위드브릿지] 신규 제휴 문의 접수\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
    (input.message ? `\n문의 내용: ${input.message}` : "");

  return { subject, html, text };
}
