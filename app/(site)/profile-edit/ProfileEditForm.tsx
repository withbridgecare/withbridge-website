'use client';

/**
 * 내 정보 수정 (예전 profile-edit.html 의 인라인 스크립트를 React 로).
 *  - 로그인 안 했으면 로그인 화면으로 (돌아올 곳 기억)
 *  - 기본 정보(이름 수정 · 휴대폰은 비어 있을 때만 1회 입력 후 고정 · 이메일 인증 상태/재발송/변경)
 *  - 주소지(카카오 우편번호 검색) · 알림 수신 설정 → update_user_profile() RPC 로 저장
 *  - 회원 탈퇴: DB 비식별화 → delete-account Edge Function
 */
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { EMAIL_PATTERN, resendSignupEmail, setInitialPhoneIfMissing } from '@/lib/api/auth';
import { getMyProfile, requestEmailChange, updateMyProfile, withdrawAccount } from '@/lib/api/profile';
import { rememberPostLoginRedirect } from '@/lib/browser/storage';
import { ROUTES, SITE } from '@/lib/config';

const POSTCODE_SRC = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

function formatPhoneDigits(digits: string) {
  if (digits.length < 4) return digits;
  if (digits.length < 8) return digits.slice(0, 3) + '-' + digits.slice(3);
  if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
}

type Msg = { text: string; error: boolean } | null;

export function ProfileEditForm() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneLocked, setPhoneLocked] = useState(true);
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [notifyCare, setNotifyCare] = useState(true);
  const [notifyMarketing, setNotifyMarketing] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // 이메일 인증/변경
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<Msg>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [changeSending, setChangeSending] = useState(false);
  const [changeSent, setChangeSent] = useState(false);
  const [changeMsg, setChangeMsg] = useState<Msg>(null);
  // 탈퇴
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const errorRef = useRef<HTMLParagraphElement>(null);
  const detailRef = useRef<HTMLInputElement>(null);

  // 로그인 확인 + 프로필 불러오기
  useEffect(() => {
    const client = getSupabase();
    (async () => {
      const { data, error } = await client.auth.getSession();
      const u = data.session?.user;
      if (error || !u) {
        rememberPostLoginRedirect('profile-edit');
        window.location.href = ROUTES.login + '?redirect=' + encodeURIComponent('profile-edit');
        return;
      }
      setUser(u);
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      setName(meta.name || meta.full_name || '');
      try {
        const p = await getMyProfile(client, u.id);
        if (p) {
          if (p.name) setName(p.name);
          if (p.phone) setPhone(p.phone);
          if (p.address) setAddress(p.address);
          if (p.address_detail) setAddressDetail(p.address_detail);
          setNotifyCare(p.notify_care !== false);
          setNotifyMarketing(p.notify_marketing === true);
          setPhoneLocked(!!p.phone);
        }
      } catch (e) {
        console.warn('[profile-edit] profiles 조회 실패(기본값으로 계속 진행):', e);
      }
      setLoading(false);
    })();
  }, []);

  // 카카오(다음) 우편번호 스크립트
  useEffect(() => {
    if (document.querySelector(`script[src="${POSTCODE_SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = POSTCODE_SRC;
    document.head.appendChild(s);
  }, []);

  const showError = (text: string | null) => {
    setBanner(text ? { kind: 'error', text } : null);
    if (text) requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const openAddressSearch = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 다음 우편번호 SDK 는 타입 정의가 없습니다
    const daum = (window as any).daum;
    if (!daum?.Postcode) {
      alert('주소 검색 서비스를 불러오지 못했어요. 네트워크 상태를 확인하고 새로고침 후 다시 시도해 주세요.');
      return;
    }
    new daum.Postcode({
      oncomplete: (data: { roadAddress?: string; jibunAddress?: string }) => {
        setAddress(data.roadAddress || data.jibunAddress || '');
        detailRef.current?.focus();
      },
    }).open();
  };

  const isKakao = (user?.app_metadata?.provider || '') === 'kakao';

  const resendVerification = async () => {
    if (!user?.email) return;
    setResending(true);
    setResendMsg(null);
    try {
      const res = await resendSignupEmail(getSupabase(), user.email);
      if (res.error) {
        console.error('[profile-edit] 인증 메일 재발송 실패:', res.error);
        setResendMsg({ text: '인증 메일 재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.', error: true });
      } else setResendMsg({ text: '인증 메일이 재발송되었습니다. 메일함을 확인해 주세요.', error: false });
    } catch (e) {
      console.error('[profile-edit] 인증 메일 재발송 중 예외:', e);
      setResendMsg({ text: '인증 메일 재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.', error: true });
    } finally {
      setResending(false);
    }
  };

  const resetChangePanel = () => {
    setChangeOpen(false);
    setChangeMsg(null);
    setNewEmail('');
    setChangeSent(false);
    setChangeSending(false);
  };

  const sendEmailChange = async () => {
    const e = newEmail.trim();
    setChangeMsg(null);
    if (!e || !EMAIL_PATTERN.test(e)) return setChangeMsg({ text: '올바른 이메일 주소를 입력해 주세요.', error: true });
    if (e.toLowerCase() === (user?.email || '').toLowerCase()) return setChangeMsg({ text: '현재 이메일과 동일합니다. 다른 이메일을 입력해 주세요.', error: true });
    setChangeSending(true);
    try {
      const res = await requestEmailChange(getSupabase(), e);
      if (res.error) {
        console.error('[profile-edit] 이메일 변경 요청 실패:', res.error);
        const m = (res.error.message || '').toLowerCase();
        if (res.error.code === 'email_exists' || m.includes('already') || m.includes('exist') || m.includes('registered'))
          setChangeMsg({ text: '이미 사용 중인 이메일입니다. 다른 이메일을 입력해 주세요.', error: true });
        else if (m.includes('invalid') || m.includes('format')) setChangeMsg({ text: '올바른 이메일 주소를 입력해 주세요.', error: true });
        else setChangeMsg({ text: '이메일 변경 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.', error: true });
        setChangeSending(false);
        return;
      }
      setChangeSent(true);
      setChangeMsg({ text: '새 이메일 주소로 확인 메일이 발송되었습니다. 새 메일함에서 인증 링크를 클릭하셔야 변경이 완료됩니다.', error: false });
    } catch (err) {
      console.error('[profile-edit] 이메일 변경 요청 중 예외:', err);
      setChangeMsg({ text: '이메일 변경 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.', error: true });
      setChangeSending(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = getSupabase();
    const n = name.trim();
    const addr = address.trim();
    const detail = addressDetail.trim();
    const phoneDigits = phoneLocked ? '' : phone.replace(/\D/g, '');
    showError(null);
    if (!n) return showError('이름을 입력해 주세요.');
    if (n.length > 30) return showError('이름은 30자 이내로 입력해 주세요.');
    if (!phoneLocked && phoneDigits && (phoneDigits.length < 9 || phoneDigits.length > 11)) return showError('휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)');
    if (detail && !addr) return showError('상세주소를 입력하려면 먼저 주소를 검색해 주세요.');

    setSaving(true);
    try {
      try {
        await updateMyProfile(client, { name: n, address: addr || null, addressDetail: detail || null, notifyCare, notifyMarketing });
      } catch (err) {
        console.error('[profile-edit] update_user_profile 실패:', err);
        return showError('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      if (!phoneLocked && phoneDigits) {
        const res = await setInitialPhoneIfMissing(client, phoneDigits);
        if (res.error) {
          console.error('[profile-edit] set_initial_phone_if_missing 실패:', res.error);
          return showError('이름/주소/알림 설정은 저장됐지만, 휴대폰 번호 저장에는 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
        const saved = (res.data as { phone?: string | null } | null)?.phone;
        if (saved) setPhone(saved);
        setPhoneLocked(true);
      }
      setBanner({ kind: 'success', text: '저장되었습니다. 마이페이지로 이동합니다...' });
      setTimeout(() => (window.location.href = ROUTES.mypage), 1100);
    } catch (err) {
      console.error('[profile-edit] 저장 중 예외:', err);
      showError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const runWithdraw = async () => {
    setWithdrawing(true);
    try {
      const result = await withdrawAccount(getSupabase());
      if (result === 'ok') {
        window.location.href = ROUTES.home;
        return;
      }
      setWithdrawOpen(false);
      showError(
        result === 'db_failed'
          ? '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'
          : `탈퇴 처리 중 일부 단계가 실패했습니다. 고객센터(${SITE.phone})로 문의해 주세요.`,
      );
    } catch (e) {
      console.error('[profile-edit] 회원 탈퇴 처리 중 예외:', e);
      setWithdrawOpen(false);
      showError('탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <main className="pe-main">
      <div className="pe-head-wrap">
        <a href={ROUTES.mypage} className="pe-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          {' '}마이페이지로
        </a>
        <h1 className="pe-page-title">내 정보 수정</h1>
        <p className="pe-page-sub">기본 정보, 주소지, 알림 수신 설정을 확인하고 수정할 수 있어요.</p>
      </div>
      <div className="pe-loading" hidden={!loading}>
        불러오는 중...
      </div>
      <form hidden={loading} noValidate className="pe-form-wrap" onSubmit={save}>
        <p className="pe-banner is-error" role="alert" hidden={banner?.kind !== 'error'} ref={errorRef}>
          {banner?.kind === 'error' ? banner.text : ''}
        </p>
        <p className="pe-banner is-success" role="status" hidden={banner?.kind !== 'success'}>
          {banner?.kind === 'success' ? banner.text : ''}
        </p>

        {/* 기본 정보 */}
        <section className="pe-row">
          <div className="pe-row-label">
            <h2>기본 정보</h2>
            <p>이름을 확인하고 수정할 수 있습니다. 이메일과 휴대폰 번호는 연동된 카카오 계정 정보를 기반으로 안전하게 보호됩니다.</p>
          </div>
          <div className="pe-row-fields">
            <div className="pe-fields-grid cols-2">
              <div className="pe-field">
                <label htmlFor="peName">이름</label>
                <input type="text" id="peName" maxLength={30} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="pe-field">
                <label htmlFor="pePhone">휴대폰 번호</label>
                {phoneLocked ? (
                  <input type="tel" id="pePhone" disabled readOnly value={phone} />
                ) : (
                  <input
                    type="tel"
                    id="pePhone"
                    placeholder="예: 010-1234-5678"
                    maxLength={13}
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 11)))}
                  />
                )}
                <p className="pe-hint">
                  {phoneLocked
                    ? '휴대폰 번호는 카카오 계정에 연동된 번호로 고정되며, 여기서 수정할 수 없습니다.'
                    : '케어 알림톡 수신을 위해 휴대폰 번호를 입력해 주세요. (1회 저장 후 고정됩니다)'}
                </p>
              </div>
              <div className="pe-field">
                <label htmlFor="peEmail">이메일</label>
                <input type="email" id="peEmail" disabled readOnly value={user?.email || ''} />
                <div className="pe-email-status-row">
                  <span className="pe-badge is-verified" hidden={!user?.email_confirmed_at}>
                    인증 완료
                  </span>{' '}
                  <span className="pe-badge is-unverified" hidden={!user || !!user.email_confirmed_at}>
                    미인증
                  </span>{' '}
                  <button type="button" className="pe-email-resend-btn" hidden={!user || !!user.email_confirmed_at} disabled={resending} onClick={resendVerification}>
                    {resending ? '발송 중...' : '인증 메일 재발송'}
                  </button>{' '}
                  {/* 카카오 로그인 계정은 이메일을 바꿀 수 없어 버튼 자체를 숨깁니다 */}
                  <button type="button" className="pe-email-resend-btn" hidden={!user || isKakao || changeOpen} onClick={() => setChangeOpen(true)}>
                    이메일 변경
                  </button>
                </div>
                <p className={'pe-hint ' + (resendMsg?.error ? 'is-error' : 'is-success')} hidden={!resendMsg}>
                  {resendMsg?.text}
                </p>
                <div className="pe-email-change-panel" hidden={!changeOpen}>
                  <div className="pe-field-row">
                    <input type="email" placeholder="새 이메일 주소" autoComplete="email" value={newEmail} disabled={changeSent} onChange={(e) => setNewEmail(e.target.value)} />{' '}
                    <button type="button" className="pe-search-btn" disabled={changeSending} onClick={sendEmailChange}>
                      {changeSent ? '발송 완료' : changeSending ? '발송 중...' : '인증 메일 발송'}
                    </button>
                  </div>
                  <button type="button" className="pe-text-btn" onClick={resetChangePanel}>
                    {changeSent ? '닫기' : '취소'}
                  </button>
                  <p className={'pe-hint ' + (changeMsg?.error ? 'is-error' : 'is-success')} hidden={!changeMsg}>
                    {changeMsg?.text}
                  </p>
                </div>
              </div>
              <p className="pe-hint pe-hint-grid">
                {user && !isKakao ? '가입하신 이메일입니다. 변경하려면 아래 [이메일 변경] 버튼을 눌러주세요.' : '카카오 계정으로 로그인한 이메일이라 여기서는 수정할 수 없어요.'}
              </p>
            </div>
          </div>
        </section>

        {/* 주소지 관리 */}
        <section className="pe-row">
          <div className="pe-row-label">
            <h2>주소지 관리</h2>
            <p>픽업·동행 서비스 신청 시 기본 주소로 활용돼요.</p>
          </div>
          <div className="pe-row-fields">
            <div className="pe-field">
              <label htmlFor="peAddress">주소</label>
              <div className="pe-field-row">
                <input type="text" id="peAddress" readOnly autoComplete="off" maxLength={200} placeholder="우편번호 찾기 버튼을 눌러 주소를 선택해 주세요" value={address} onClick={openAddressSearch} />{' '}
                <button type="button" className="pe-search-btn" onClick={openAddressSearch}>
                  우편번호 찾기
                </button>
              </div>
            </div>
            <div className="pe-field">
              <label htmlFor="peAddressDetail">상세주소</label>
              <input type="text" id="peAddressDetail" ref={detailRef} maxLength={100} autoComplete="off" placeholder="예: 101동 1502호" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 알림 수신 설정 */}
        <section className="pe-row">
          <div className="pe-row-label">
            <h2>알림 수신 설정</h2>
            <p>알림톡·SMS 수신 여부를 선택하세요.</p>
          </div>
          <div className="pe-row-fields">
            <div className="pe-checkbox-field">
              <input type="checkbox" id="peNotifyCare" checked={notifyCare} onChange={(e) => setNotifyCare(e.target.checked)} />{' '}
              <label htmlFor="peNotifyCare">
                <span className="pe-checkbox-title">케어 안내 알림 수신 동의</span>{' '}
                <span className="pe-checkbox-desc">매니저 배정·일정 변경·결제 안내 등 운영 알림. 끄면 중요 안내를 놓칠 수 있어요.</span>
              </label>
            </div>
            <div className="pe-checkbox-field">
              <input type="checkbox" id="peNotifyMarketing" checked={notifyMarketing} onChange={(e) => setNotifyMarketing(e.target.checked)} />{' '}
              <label htmlFor="peNotifyMarketing">
                <span className="pe-checkbox-title">마케팅 알림 수신 동의</span>{' '}
                <span className="pe-checkbox-desc">이벤트·혜택 등 광고성 정보 수신에 동의합니다.</span>
              </label>
            </div>
          </div>
        </section>

        <div className="pe-action-bar">
          <a href={ROUTES.mypage} className="pe-btn-sm is-ghost">
            취소
          </a>{' '}
          <button type="submit" className="pe-btn-sm is-primary" disabled={saving}>
            {saving ? '저장 중...' : '저장하기'}
          </button>
        </div>

        {/* 계정 관리(회원 탈퇴) */}
        <section className="pe-row is-danger-row">
          <div className="pe-row-label">
            <h2>계정 관리</h2>
            <p>탈퇴하면 로그인할 수 없고, 이름·연락처·주소 정보가 모두 지워집니다.</p>
          </div>
          <div className="pe-row-fields">
            <button type="button" className="pe-link-danger" onClick={() => setWithdrawOpen(true)}>
              회원 탈퇴
            </button>
          </div>
        </section>
      </form>

      {withdrawOpen && (
        <div className="wb-login-modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setWithdrawOpen(false)}>
          <div className="wb-login-modal-card">
            <p className="wb-login-modal-title">정말 탈퇴하시겠어요?</p>
            <p className="wb-login-modal-body">
              탈퇴하면 이 계정으로 다시 로그인할 수 없고, 이름·연락처·주소 정보가 모두 지워집니다. 진행 중인 신청/결제 내역은 법적 보관 의무에 따라 유지됩니다.
            </p>
            <div className="wb-login-modal-actions">
              <button type="button" className="wb-login-modal-btn wb-login-modal-cancel" onClick={() => setWithdrawOpen(false)}>
                취소
              </button>
              <button type="button" className="wb-login-modal-btn is-danger-confirm" disabled={withdrawing} onClick={runWithdraw}>
                {withdrawing ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
