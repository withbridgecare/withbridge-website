import './login.css';
import '../../styles/tailwind-preflight.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: '로그인',
  description: '카카오 1초 로그인으로 위드브릿지를 간편하게 이용하세요.',
};

/** 로그인 — public/login.html 에서 옮김. 화면·동작은 LoginForm.tsx */
export default function LoginPage() {
  return (
    <>
      <NotoSansKr />
      <LoginForm />
    </>
  );
}
