import './profile-edit.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { ProfileEditForm } from './ProfileEditForm';

export const metadata: Metadata = {
  title: '내 정보 수정',
  description: '위드브릿지 계정의 기본 정보, 주소지, 알림 수신 설정을 확인하고 수정합니다.',
  robots: { index: false },
};

/** 내 정보 수정 — public/profile-edit.html 에서 옮김. 화면·동작은 ProfileEditForm.tsx */
export default function ProfileEditPage() {
  return (
    <>
      <NotoSansKr />
      <ProfileEditForm />
    </>
  );
}
