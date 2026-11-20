'use client';

/**
 * 로그인 화면 (예전 login.html 의 인라인 스크립트를 React 로).
 *  - 카카오 로그인/회원가입, 이메일 로그인('다른 방식으로 로그인'을 펼쳐야 보임)
 *  - 로그인되면(이미 로그인 상태 포함) 메인으로 이동. ?redirect=apply 처럼 들어왔으면
 *    로그인 후 그 페이지로 이어서 이동합니다(AuthProvider 가 처리).
 *  - 로그인 = 이용약관 동의 (버튼 아래 안내 문구)
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH, signInWithEmail, signInWithKakao } from '@/lib/api/auth';
import { recordTermsAgreement, rememberPostLoginRedirect } from '@/lib/browser/storage';
import { authRedirectUrl, ROUTES, SITE, TERMS_VERSION } from '@/lib/config';
import { TermsLink } from '@/components/site/TermsLink';

const inputStyle: React.CSSProperties = { width: '100%', height: '48px', padding: '0 14px', border: '1px solid #E0E0E0', borderRadius: '0px', fontSize: '14px', outline: 'none', backgroundColor: '#ffffff', color: '#1A1D21' };

export function LoginForm() {
  const [otherOpen, setOtherOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const client = getSupabase();
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    if (redirect) rememberPostLoginRedirect(redirect);

    const goToMain = () => (window.location.href = ROUTES.home);
    client.auth.getSession().then(({ data }) => {
      if (data.session) goToMain();
    });
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) goToMain();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loginWithKakao = async () => {
    recordTermsAgreement(TERMS_VERSION);
    const err = await signInWithKakao(getSupabase(), authRedirectUrl(window.location.origin));
    if (err) alert('로그인 오류: ' + err.message);
  };

  const loginWithEmail = async () => {
    setError('');
    const e = email.trim();
    if (!e || !EMAIL_PATTERN.test(e)) return setError('올바른 이메일 주소를 입력해 주세요.');
    if (!password || password.length < PASSWORD_MIN_LENGTH) return setError('비밀번호는 ' + PASSWORD_MIN_LENGTH + '자 이상이어야 합니다.');
    recordTermsAgreement(TERMS_VERSION);
    const result = await signInWithEmail(getSupabase(), e, password);
    if (result.error) {
      console.error('[이메일 로그인 오류]', result.error.message);
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    // 성공하면 위 onAuthStateChange(SIGNED_IN) 가 메인으로 이동시킵니다
  };

  const kakaoOnly = (ev: React.MouseEvent) => {
    ev.preventDefault();
    alert('카카오 소셜 로그인을 이용해 주세요.');
  };

  return (
    <main style={{ maxWidth: '380px', margin: '70px auto', padding: '0 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '13.5px', color: '#666666', fontWeight: '400', lineHeight: '1.6', marginBottom: '16px' }}>
        아이디와 비밀번호 입력하기 귀찮으시죠?
        <br /> 1초 회원가입으로 입력없이 간편하게 로그인하세요.
      </p>
      <button
        onClick={loginWithKakao}
        style={{ width: '100%', height: '50px', backgroundColor: '#FEE500', color: '#000000', border: 'none', padding: '0', borderRadius: '0px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#000000" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3C6.477 3 2 6.48 2 10.772c0 2.766 1.812 5.19 4.582 6.577l-.936 3.422c-.083.303.255.553.518.378l4.082-2.72c.575.086 1.162.131 1.754.131 5.523 0 10-3.48 10-7.772C22 6.48 17.523 3 12 3z"></path>
        </svg>{' '}
        <span>카카오 1초 로그인 / 회원가입</span>
      </button>{' '}
      {/* 약관 안내 (별도 동의 체크 없이, 로그인하면 동의한 것으로 봅니다) */}
      <p className="login-terms" style={{ margin: '0 0 24px', fontSize: '12px', lineHeight: '1.6', color: '#6B7280', wordBreak: 'keep-all', textWrap: 'balance' }}>
        로그인 시 위드브릿지의 <TermsLink>이용약관</TermsLink> 및 <a href={ROUTES.privacy}>개인정보 처리방침</a>에 동의하게 됩니다.
      </p>{' '}
      <button
        onClick={() => setOtherOpen((v) => !v)}
        aria-expanded={otherOpen}
        style={{ background: 'none', border: 'none', fontSize: '13.5px', color: '#333333', fontWeight: '500', cursor: 'pointer', marginBottom: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px 12px', fontFamily: 'inherit' }}
      >
        <span>다른 방식으로 로그인</span>{' '}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease', display: 'inline-block', transform: otherOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>{' '}
      <div style={{ display: otherOpen ? 'block' : 'none' }}>
        <form
          onSubmit={(ev) => ev.preventDefault()}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '8px' }}
        >
          <input type="email" name="authEmail" placeholder="이메일" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} style={inputStyle} />{' '}
          <input type="password" name="authPassword" placeholder="비밀번호 (8자 이상)" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} style={inputStyle} />
        </form>
        <p role="alert" style={{ display: error ? 'block' : 'none', margin: '0 0 14px', fontSize: '12.5px', color: '#DC2626', textAlign: 'left', lineHeight: '1.5' }}>
          {error}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', fontSize: '12px', color: '#999999', marginBottom: '20px' }}>
          <a href="#" onClick={kakaoOnly} style={{ color: '#999999', textDecoration: 'none' }}>
            아이디 찾기
          </a>{' '}
          <span>|</span>{' '}
          <a href="#" onClick={kakaoOnly} style={{ color: '#999999', textDecoration: 'none' }}>
            비밀번호 찾기
          </a>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {' '}
          <button type="button" onClick={loginWithEmail} style={{ width: '100%', height: '48px', backgroundColor: '#8FA482', color: '#ffffff', border: 'none', padding: '0', borderRadius: '0px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
            기존 회원 로그인
          </button>{' '}
          {' '}
          <a href={ROUTES.signup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '48px', backgroundColor: '#ffffff', color: '#1A1D21', border: '1px solid #1A1D21', padding: '0', borderRadius: '0px', fontSize: '14px', fontWeight: '500', textDecoration: 'none', boxSizing: 'border-box' }}>
            회원가입
          </a>{' '}
          {' '}
          <a href={SITE.kakaoChannelUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '48px', backgroundColor: '#ffffff', color: '#1A1D21', border: '1px solid #E0E0E0', padding: '0', borderRadius: '0px', fontSize: '14px', fontWeight: '500', textDecoration: 'none' }}>
            비회원 문의하기
          </a>
        </div>
      </div>
    </main>
  );
}
