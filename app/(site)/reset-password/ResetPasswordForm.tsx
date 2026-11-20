'use client';

/**
 * 비밀번호 재설정 (예전 reset-password.html 의 인라인 스크립트를 React 로).
 * 재설정 메일 링크의 토큰을 supabase-js 가 자동으로 읽어 임시 세션을 만들고(detectSessionInUrl),
 * 이 화면은 그 세션이 있으면 새 비밀번호로 바꿉니다. 세션이 없으면 '만료된 링크' 안내.
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { PASSWORD_MIN_LENGTH, updatePassword } from '@/lib/api/auth';
import { ROUTES } from '@/lib/config';

const inputStyle: React.CSSProperties = { width: '100%', height: '48px', padding: '0 14px', border: '1px solid #E0E0E0', borderRadius: '0px', fontSize: '14px', outline: 'none', backgroundColor: '#ffffff', color: '#1A1D21' };

export function ResetPasswordForm() {
  const [sessionReady, setSessionReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => (data.session ? setSessionReady(true) : setInvalid(true)))
      .catch(() => setInvalid(true));
  }, []);

  const submit = async () => {
    if (!sessionReady) return setError('유효하지 않거나 만료된 링크입니다. 다시 요청해 주세요.');
    setError('');
    setSuccess('');
    if (!pw || pw.length < PASSWORD_MIN_LENGTH) return setError('비밀번호는 ' + PASSWORD_MIN_LENGTH + '자 이상이어야 합니다.');
    if (pw !== confirm) return setError('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    try {
      const result = await updatePassword(getSupabase(), pw);
      if (result.error) {
        console.error('[비밀번호 재설정 오류]', result.error.message);
        return setError('비밀번호 변경에 실패했습니다: ' + result.error.message);
      }
      setSuccess('비밀번호가 변경되었습니다. 잠시 후 메인 화면으로 이동합니다.');
      setTimeout(() => (window.location.href = ROUTES.home), 1500);
    } finally {
      setBusy(false);
    }
  };

  const done = !!success;
  return (
    <main style={{ maxWidth: '380px', margin: '70px auto', padding: '0 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 6px' }}>비밀번호 재설정</h1>
      <p style={{ fontSize: '13.5px', color: '#666666', fontWeight: '400', lineHeight: '1.6', marginBottom: '24px', display: invalid ? 'none' : undefined }}>
        새로 사용할 비밀번호를 입력해 주세요.
      </p>
      <p hidden={!invalid} style={{ fontSize: '13.5px', color: '#DC2626', lineHeight: '1.6', marginBottom: '20px' }}>
        유효하지 않거나 만료된 링크입니다. 어드민(또는 로그인 화면)에서 비밀번호 재설정 메일을 다시 요청해 주세요.
      </p>
      <form onSubmit={(e) => e.preventDefault()} style={{ display: invalid || done ? 'none' : 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', textAlign: 'left' }}>
        <input type="password" placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} />{' '}
        <input type="password" placeholder="새 비밀번호 확인" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
      </form>
      <p role="alert" style={{ display: error ? 'block' : 'none', margin: '0 0 14px', fontSize: '12.5px', color: '#DC2626', textAlign: 'left', lineHeight: '1.5' }}>
        {error}
      </p>
      <p role="status" style={{ display: success ? 'block' : 'none', margin: '0 0 14px', fontSize: '12.5px', color: '#455822', textAlign: 'left', lineHeight: '1.5' }}>
        {success}
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{ width: '100%', height: '50px', backgroundColor: '#8FA482', color: '#ffffff', border: 'none', padding: '0', borderRadius: '0px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '14px', display: invalid || done ? 'none' : undefined }}
      >
        비밀번호 변경하기
      </button>
    </main>
  );
}
