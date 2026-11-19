'use client';

/** 어드민 콘솔 동작 — 예전처럼 admin.js → admin-sidebar.js → admin-notices.js 순서로 붙입니다. */
import { useEffect } from 'react';
import { initAdminConsole } from './adminConsole';
import { initAdminSidebar } from './adminSidebar';
import { initAdminNotices } from './adminNotices';

export function AdminBehaviors() {
  useEffect(() => {
    initAdminConsole();
    initAdminSidebar();
    initAdminNotices();
  }, []);
  return null;
}
