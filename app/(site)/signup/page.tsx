import './signup.css';
import '../../styles/tailwind-preflight.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = {
  title: '회원가입',
  description: '이메일, 비밀번호, 이름, 휴대폰 번호를 입력하고 위드브릿지 회원이 되어 보세요.',
};

/** 회원가입 — public/signup.html 에서 옮김. 화면·동작은 SignupForm.tsx */
export default function SignupPage() {
  return (
    <>
      <NotoSansKr />
      <SignupForm />
    </>
  );
}
