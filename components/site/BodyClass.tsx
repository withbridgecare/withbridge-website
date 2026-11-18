'use client';

/** 이 페이지가 열려 있는 동안 <body> 에 클래스를 붙입니다 (예전 <body class="..."> 대신). */
import { useEffect } from 'react';

export function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}
