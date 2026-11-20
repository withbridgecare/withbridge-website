'use client';

/** 케어 매니저 마이페이지 동작을 붙입니다 (실제 코드는 managerMypageScript.ts). */
import { useEffect } from 'react';
import { useAuth } from '@/components/site/AuthProvider';
import { initManagerMypage } from './managerMypageScript';

export function ManagerMypageBehaviors() {
  const { showLoginModal } = useAuth();
  useEffect(() => {
    initManagerMypage({ showLoginModal });
  }, [showLoginModal]);
  return null;
}
