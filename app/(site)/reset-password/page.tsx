import './reset-password.css';
import '../../styles/tailwind-preflight.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: '비밀번호 재설정',
  robots: { index: false, follow: false },
};

/** 비밀번호 재설정 — public/reset-password.html 에서 옮김. 관리자 화면에서 보낸 재설정 메일의 링크로 들어옵니다. */
export default function ResetPasswordPage() {
  return (
    <>
      <NotoSansKr />
      <ResetPasswordForm />
    </>
  );
}
