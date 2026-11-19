/**
 * 예전 HTML 페이지의 전역 도우미(window.WBAuth / WBEdgeFn / PortOne)와 같은 모양의 객체를 새 모듈로 만들어 줍니다.
 * 마이페이지처럼 스크립트를 로직 그대로 옮긴 화면에서, 호출부를 바꾸지 않고 새 코드(lib/api 등)를 쓰게 하는 연결부입니다.
 * 상태 기반 React 로 정리하면서 이 파일의 사용처를 줄여 나가세요.
 */
import { getSupabase } from '@/lib/supabase/client';
import { claimServiceApplications, hasUnpaidExtraCharge, lookupAdmin, lookupManager } from '@/lib/api/auth';
import { invokeEdgeFunction } from '@/lib/api/edge-functions';
import { requestPayment } from '@/lib/payments/portone';
import { getUserMode, isLoggingOut, readPendingApplications, setUserMode, writePendingApplications, type UserMode } from './storage';
import { stripCheckpointPii } from './privacy';

export function createLegacyShims(opts: { showLoginModal?: (target?: string, o?: { required?: boolean }) => void } = {}) {
  const client = getSupabase();
  const WBAuth = {
    client,
    async checkIsManager(userId: string) {
      return (await lookupManager(client, userId)) === 'yes';
    },
    async checkIsAdmin(userId: string) {
      return (await lookupAdmin(client, userId)) === 'yes';
    },
    hasUnpaidExtraCharge: (userId: string) => hasUnpaidExtraCharge(client, userId),
    getUserMode: (): UserMode => getUserMode(),
    setUserMode: (m: UserMode) => setUserMode(m),
    get loggingOut() {
      return isLoggingOut();
    },
    navigate: (url: string) => (window.location.href = url),
    showLoginModal: (target?: string, o?: { required?: boolean }) => opts.showLoginModal?.(target, o),
    async claimPendingApplications() {
      const list = readPendingApplications();
      if (!list.length) return;
      const ids = list.map((x) => x.id);
      const claimed = await claimServiceApplications(client, ids);
      if (claimed === null) return;
      writePendingApplications(readPendingApplications().filter((x) => !ids.includes(x.id)));
    },
  };
  const WBEdgeFn = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoke: (c: any, name: string, body?: Record<string, unknown>) => invokeEdgeFunction(c ?? client, name, body ?? {}),
  };
  const PortOne = {
    // storeId/channelKey 는 lib/payments/portone.ts 의 값이 쓰입니다 (요청에 같은 값이 있어도 동일)
    requestPayment: (req: Record<string, unknown>) => requestPayment(req),
  };
  const WBPrivacy = { stripCheckpointPii };
  return { WBAuth, WBEdgeFn, PortOne, WBPrivacy };
}
