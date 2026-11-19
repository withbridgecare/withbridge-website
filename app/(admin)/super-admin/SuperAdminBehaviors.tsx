'use client';

/** 최고 관리자 화면 동작 (실제 코드는 superAdmin.ts) */
import { useEffect } from 'react';
import { initSuperAdmin } from './superAdmin';

export function SuperAdminBehaviors() {
  useEffect(() => {
    initSuperAdmin();
  }, []);
  return null;
}
