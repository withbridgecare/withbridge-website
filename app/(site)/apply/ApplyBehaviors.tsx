'use client';

/**
 * 신청서 페이지 동작.
 *  1) 입장 확인 (예전 apply.html <head> 스크립트): 로그인 안 했으면 '로그인해 주세요' 안내(닫을 수 없음),
 *     결제 대기 중인 추가 요금이 있으면 잠금 안내 후 마이페이지로. 통과해야 신청서 본문(.ap-main)을 보여 줍니다.
 *  2) 신청서 입력·할인 계산·결제 (applyForm.ts — 예전 결제 스크립트를 로직 그대로 옮김)
 */
import { useEffect } from 'react';
import { useAuth } from '@/components/site/AuthProvider';
import { getSupabase } from '@/lib/supabase/client';
import { hasUnpaidExtraCharge } from '@/lib/api/auth';
import { maybeLoggedIn } from '@/lib/browser/storage';
import { initApplyForm } from './applyForm';

const EXTRA_CHARGE_PAGE = '/mypage#extraChargeSection';

export function ApplyBehaviors() {
  const { showLoginModal } = useAuth();

  useEffect(() => {
    const client = getSupabase();
    let settled = false;
    const showMain = () => {
      const main = document.querySelector<HTMLElement>('main.ap-main');
      if (main) main.style.visibility = 'visible';
    };
    const denyAccess = () => {
      if (settled) return;
      settled = true;
      showLoginModal('apply', { required: true });
    };
    const lockForUnpaidExtraCharge = () => {
      if (settled) return;
      settled = true;
      const overlay = document.getElementById('extraChargeLockOverlay');
      if (!overlay) {
        window.location.href = EXTRA_CHARGE_PAGE;
        return;
      }
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const btn = document.getElementById('extraChargeLockConfirm');
      if (btn) {
        btn.focus();
        btn.onclick = () => (window.location.href = EXTRA_CHARGE_PAGE);
      }
    };

    client.auth
      .getSession()
      .then(async ({ data }) => {
        const user = data.session?.user;
        if (!user) return denyAccess();
        if (await hasUnpaidExtraCharge(client, user.id)) lockForUnpaidExtraCharge();
        else showMain();
      })
      .catch((err) => {
        console.error('[신청서 접근 확인] getSession 실패:', err);
        if (maybeLoggedIn()) showMain();
        else denyAccess();
      });

    return initApplyForm();
  }, [showLoginModal]);

  return null;
}
