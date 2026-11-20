'use client';

/** 관리자 로그 화면 동작 (실제 코드는 adminLogs.ts) */
import { useEffect } from 'react';
import { initAdminLogs } from './adminLogs';

export function AdminLogsBehaviors() {
  useEffect(() => {
    initAdminLogs();
  }, []);
  return null;
}
