'use client';

/**
 * 이메일 회원가입 (예전 signup.html 의 인라인 스크립트를 React 로).
 *  1단계: 정보 입력 → 휴대폰 번호 중복 확인 → signUp → 인증 메일 발송
 *  2단계: [인증 메일 재발송] (60초 대기)
 *  3단계: [인증 완료 확인] → 같은 비밀번호로 로그인 시도해 인증 여부 확인 → 휴대폰 번호 최종 반영 → 로그인 화면
 * 중복 가입 방지(휴대폰 번호 1인 1계정)는 DB 의 UNIQUE 인덱스·트리거가 최종으로 막습니다 (원칙 1).
 */
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import {
  EMAIL_PATTERN,
  isDuplicatePhoneError,
  isPhoneRegistered,
  PASSWORD_MIN_LENGTH,
  PHONE_DIGITS_MAX,
  PHONE_DIGITS_MIN,
  resendSignupEmail,
  setInitialPhoneIfMissing,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/api/auth';
import { recordTermsAgreement, rememberPostLoginRedirect } from '@/lib/browser/storage';
import { ROUTES, TERMS_VERSION } from '@/lib/config';
import { TermsLink } from '@/components/site/TermsLink';

const RESEND_SECONDS = 60;
const inputStyle: React.CSSProperties = { width: '100%', height: '48px', padding: '0 14px', border: '1px solid #E0E0E0', borderRadius: '0px', fontSize: '14px', outline: 'none', backgroundColor: '#ffffff', color: '#1A1D21' };

type Pending = { email: string; password: string; phone: string };

export function SignupForm() {
  const [form, setForm] = useState({ email: '', password: '', passwordConfirm: '', name: '', phone: '' });
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  const [resending, setResending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    if (redirect) rememberPostLoginRedirect(redirect);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startCountdown = () => {
    setResendLeft(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setResendLeft((s) => {
        if (s <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const validate = () => {
    const email = form.email.trim();
    if (!email || !EMAIL_PATTERN.test(email)) return '올바른 이메일 주소를 입력해 주세요.';
    if (!form.password || form.password.length < PASSWORD_MIN_LENGTH) return '비밀번호는 ' + PASSWORD_MIN_LENGTH + '자 이상이어야 합니다.';
    if (form.password !== form.passwordConfirm) return '비밀번호가 일치하지 않습니다.';
    if (!form.name.trim()) return '이름을 입력해 주세요.';
    const digits = form.phone.trim().replace(/\D/g, '');
    if (digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) return '올바른 휴대폰 번호를 입력해 주세요.';
    if (!terms) return '이용약관 및 개인정보 처리방침에 동의해 주세요.';
    return null;
  };

  // 1단계
  const signUp = async () => {
    setError('');
    const v = validate();
    if (v) return setError(v);
    const client = getSupabase();
    const input = { email: form.email.trim(), password: form.password, name: form.name.trim(), phone: form.phone.trim() };
    setSubmitting(true);
    try {
      try {
        if (await isPhoneRegistered(client, input.phone)) return setError('이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.');
      } catch (e) {
        console.error('[회원가입 오류] 전화번호 중복 확인 실패', e);
        return setError('가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
      recordTermsAgreement(TERMS_VERSION);

      // 인증 메일 링크는 이 페이지로 돌아옵니다 — Supabase 허용 주소에 /signup.html 이 등록돼 있어 그대로 둠(/signup 으로 자동 이동)
      const result = await signUpWithEmail(client, { ...input, emailRedirectTo: window.location.origin + '/signup.html' });
      if (result.error) {
        console.error('[회원가입 오류]', result.error.message);
        return setError(
          isDuplicatePhoneError(result.error.message) ? '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.' : '회원가입에 실패했습니다: ' + result.error.message,
        );
      }
      const user = result.data.user;
      // 이메일 중복이면 Supabase 는 오류 대신 identities 가 빈 성공 응답을 줍니다
      if (user && Array.isArray(user.identities) && user.identities.length === 0) return setError('이미 가입된 이메일입니다. 로그인을 이용해 주세요.');
      if (result.data.session) {
        window.location.href = ROUTES.home; // 이메일 인증 없이 바로 로그인되는 설정
        return;
      }
      setPending({ email: input.email, password: input.password, phone: input.phone });
      startCountdown();
    } finally {
      setSubmitting(false);
    }
  };

  // 2단계
  const resend = async () => {
    if (!pending) return;
    setError('');
    setResending(true);
    const result = await resendSignupEmail(getSupabase(), pending.email);
    setResending(false);
    if (result.error) {
      console.error('[인증 메일 재발송 오류]', result.error.message);
      return setError('인증 메일 재발송에 실패했습니다: ' + result.error.message);
    }
    startCountdown();
  };

  // 3단계
  const checkConfirmed = async () => {
    if (!pending) return;
    const client = getSupabase();
    setError('');
    setChecking(true);
    try {
      const result = await signInWithEmail(client, pending.email, pending.password);
      if (result.error) {
        console.error('[인증 확인 오류]', result.error.message);
        return setError(
          result.error.message.toLowerCase().includes('confirm')
            ? '아직 이메일 인증이 완료되지 않았습니다. 메일함에서 링크를 먼저 클릭해 주세요.'
            : '인증 확인 중 오류가 발생했습니다: ' + result.error.message,
        );
      }
      if (!result.data.user?.email_confirmed_at) return setError('아직 이메일 인증이 완료되지 않았습니다. 메일함에서 링크를 먼저 클릭해 주세요.');

      const phoneSync = await setInitialPhoneIfMissing(client, pending.phone);
      if (phoneSync.error) {
        console.error('[회원가입 오류] 전화번호 반영 실패', phoneSync.error.message);
        return setError(
          phoneSync.error.code === '23505' ? '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다.' : '가입 완료 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
      if (timer.current) clearInterval(timer.current);
      setPending(null);
      alert('이메일 인증이 완료되었습니다! 로그인 페이지로 이동합니다.');
      window.location.href = ROUTES.login;
    } finally {
      setChecking(false);
    }
  };

  const locked = !!pending; // 2단계에서는 입력란 잠금

  return (
    <main style={{ maxWidth: '380px', margin: '70px auto', padding: '0 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 6px' }}>회원가입</h1>
      <p style={{ fontSize: '13.5px', color: '#666666', fontWeight: '400', lineHeight: '1.6', marginBottom: '24px' }}>
        이메일, 비밀번호, 이름, 휴대폰 번호를 입력하고 위드브릿지 회원이 되어 보세요.
      </p>
      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', textAlign: 'left' }}>
        <input type="email" name="signupEmail" className="signup-input" placeholder="이메일" autoComplete="email" value={form.email} onChange={set('email')} disabled={locked} style={inputStyle} />{' '}
        <input type="password" name="signupPassword" className="signup-input" placeholder="비밀번호 (8자 이상)" autoComplete="new-password" value={form.password} onChange={set('password')} disabled={locked} style={inputStyle} />{' '}
        <input type="password" name="signupPasswordConfirm" className="signup-input" placeholder="비밀번호 확인" autoComplete="new-password" value={form.passwordConfirm} onChange={set('passwordConfirm')} disabled={locked} style={inputStyle} />{' '}
        <input type="text" name="signupName" className="signup-input" placeholder="이름" autoComplete="name" value={form.name} onChange={set('name')} disabled={locked} style={inputStyle} />{' '}
        <input type="tel" name="signupPhone" className="signup-input" placeholder="휴대폰 번호 (예: 01012345678)" autoComplete="tel" value={form.phone} onChange={set('phone')} disabled={locked} style={inputStyle} />
      </form>
      <label className="signup-check-row" style={{ fontSize: '13px', lineHeight: '1.6', color: '#374151', textAlign: 'left', cursor: 'pointer' }}>
        <input type="checkbox" id="signupTerms" name="signupTerms" className="signup-checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} disabled={locked} />{' '}
        <span className="signup-terms">
          {/* 약관 팝업의 [동의하고 닫기] 를 누르면 이 체크박스가 체크됩니다 */}
          <TermsLink onAgree={() => setTerms(true)}>이용약관</TermsLink> 및 <a href={ROUTES.privacy}>개인정보 처리방침</a>에 동의합니다. (필수)
        </span>
      </label>
      <p role="alert" style={{ display: error ? 'block' : 'none', margin: '0 0 14px', fontSize: '12.5px', color: '#DC2626', textAlign: 'left', lineHeight: '1.5' }}>
        {error}
      </p>
      <button
        type="button"
        onClick={signUp}
        disabled={submitting}
        style={{ width: '100%', height: '50px', backgroundColor: '#8FA482', color: '#ffffff', border: 'none', padding: '0', borderRadius: '0px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '14px', display: locked ? 'none' : undefined }}
      >
        이메일 인증 링크 전송
      </button>
      <div style={{ display: locked ? 'block' : 'none', marginBottom: '14px', textAlign: 'left' }}>
        <p style={{ margin: '0 0 14px', fontSize: '13px', lineHeight: '1.7', color: '#374151', backgroundColor: '#F3F5F1', border: '1px solid #DCE2D6', borderRadius: '4px', padding: '12px 14px' }}>
          입력하신 메일로 인증 링크가 발송되었습니다. 사용 중이신 메일함에서 링크 확인 후 아래 [인증 완료 확인] 버튼을 눌러주세요.
        </p>
        <button
          type="button"
          id="signupCheckConfirmBtn"
          onClick={checkConfirmed}
          disabled={checking}
          style={{ width: '100%', height: '48px', backgroundColor: '#8FA482', color: '#ffffff', border: 'none', padding: '0', borderRadius: '0px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' }}
        >
          인증 완료 확인
        </button>{' '}
        <button
          type="button"
          id="signupResendBtn"
          onClick={resend}
          disabled={resending || resendLeft > 0}
          style={{ width: '100%', height: '44px', backgroundColor: '#ffffff', color: '#6B7280', border: '1px solid #E0E0E0', padding: '0', borderRadius: '0px', fontSize: '13.5px', fontWeight: '500', cursor: 'pointer' }}
        >
          {resendLeft > 0 ? `인증 메일 재발송 (${resendLeft}초)` : '인증 메일 재발송'}
        </button>
      </div>
      <p style={{ fontSize: '13.5px', color: '#666666' }}>
        이미 계정이 있으신가요?{' '}
        <a href={ROUTES.login} style={{ color: '#455822', fontWeight: '700', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
          로그인
        </a>
      </p>
    </main>
  );
}
