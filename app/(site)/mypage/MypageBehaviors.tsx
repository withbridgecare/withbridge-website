'use client';

/** 보호자 마이페이지 동작을 붙입니다 (실제 코드는 mypageScript.ts). */
import { useEffect } from 'react';
import { useAuth } from '@/components/site/AuthProvider';
import { initGuardianMypage } from './mypageScript';

export function MypageBehaviors() {
  const { showLoginModal } = useAuth();
  useEffect(() => {
    initGuardianMypage({ showLoginModal });
  }, [showLoginModal]);
  return null;
}
