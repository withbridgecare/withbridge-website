# Supabase 개발/운영 분리 · 릴리스 SQL 안내

## 폴더 구성

| 파일 | 실행 위치 | 언제 |
|---|---|---|
| `dev/1_schema_bootstrap.sql` | **개발** 프로젝트 | 개발 DB 최초 1회 (전체 구조 생성) |
| `dev/2_vault_secrets.sql` | **개발** 프로젝트 | 1번 직후 (값 채워서 실행, 커밋 금지) |
| `prod/2026-11-19_1_before_deploy.sql` | 운영 (개발에서 먼저 시험) | 코드 배포 **전** |
| `prod/2026-11-19_2_after_deploy.sql` | 운영 (개발에서 먼저 시험) | 코드 배포 **직후** |
| `prod/2026-11-19_3_role_hierarchy.sql` | 개발·운영 모두 | 최고관리자 계정 확인 후 |
| `prod/2026-11-20_mypage_performance.sql` | 운영 (개발에서 먼저 시험) | 아무 때나 (코드 배포와 무관) |

모든 파일은 여러 번 실행해도 안전합니다. `prod/*` 파일은 트랜잭션이라 중간에 실패하면 전부 취소됩니다.

---

## A. 개발 DB 만들기 (최초 1회)

1. Supabase 대시보드 → **New project** → 이름 `withbridge-dev`, 리전은 운영과 동일(Seoul 권장), DB 비밀번호 저장
2. 운영자에게 두 프로젝트 모두 **Developer** 이상 권한으로 팀원 초대 요청
3. 개발 프로젝트 → **Database → Extensions** → `pg_cron`, `pg_net` 켜기
4. `dev/1_schema_bootstrap.sql` 에서 `__DEV_PROJECT_REF__` 를 개발 프로젝트 Reference ID 로 모두 바꾸고 SQL Editor 에서 실행
5. `dev/2_vault_secrets.sql` 의 `<...>` 를 개발용 값으로 채워 실행 (파일은 커밋하지 말 것)
6. **Storage** 탭에서 버킷 확인: `care-departure-photos`, `manager-id-cards` 가 비공개(private)인지
7. **Authentication**
   - URL Configuration: Site URL / Redirect URLs 에 `http://localhost:5500`, Vercel 미리보기 주소 등록
   - Providers → Kakao: 카카오 개발자 콘솔 앱에 개발 프로젝트 콜백 주소(`https://<dev-ref>.supabase.co/auth/v1/callback`) 추가 후 키 입력
   - Email: 최소 비밀번호 길이 8
8. 테스트용 회원가입 → 그 계정을 최고관리자로 지정 → `prod/2026-11-19_3_role_hierarchy.sql` 실행
   ```sql
   update public.profiles set role = 'super_admin' where id = '<테스트 계정 id>';
   ```
9. Edge Function 배포 + 개발용 비밀값 등록
   ```bash
   supabase functions deploy --project-ref <dev-ref>
   supabase secrets set --project-ref <dev-ref> PORTONE_API_SECRET=<테스트 키> TELEGRAM_BOT_TOKEN=<개발용 봇> ...
   ```
   - PortOne 은 **테스트 채널**, 텔레그램은 **개발용 채팅방**, Solapi 알림톡은 비우거나 테스트 번호만
   - `DB_WEBHOOK_SECRET`, `ALIMTALK_WEBHOOK_SECRET`, `PARTNER_INQUIRY_WEBHOOK_SECRET` 은 5번 Vault 값과 동일하게
10. **운영 회원 데이터는 개발 DB로 복사하지 않습니다.** 테스트 데이터만 사용

## B. 사이트 연결 (Vercel · 로컬)

| 환경 | Git 브랜치 | Supabase | 설정 위치 |
|---|---|---|---|
| 운영 | `main` | 운영 프로젝트 | Vercel → Environment Variables → **Production** |
| 개발 | `dev` | 개발 프로젝트 | Vercel → Environment Variables → **Preview** (브랜치 `dev` 지정 가능) |
| 로컬 | 작업 브랜치 | 개발 프로젝트 | `.env` |

설정할 값: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WB_ENV_NAME`(`production` / `development`)

## C. 이후 작업 흐름

1. 기능 브랜치에서 작업 → `dev` 로 PR/머지 → 개발 DB 에 새 SQL 실행 → 미리보기 사이트에서 확인
2. 문제 없으면 `prod/<날짜>_*.sql` 로 릴리스 SQL 정리 → `main` 머지 → 운영 DB 에 순서대로 실행
3. 새 SQL 은 항상 **개발 DB 에서 먼저** 실행

## D. 이번 릴리스(2026-11-19) 운영 적용 순서

1. 운영 DB 백업
2. `prod/2026-11-19_1_before_deploy.sql` 실행 (매니저 지원서 성별 컬럼)
3. Edge Function **전체** 재배포 (`supabase functions deploy --project-ref <prod-ref>`) — 공용 텔레그램 코드가 바뀌어 대부분의 함수에 영향
4. Vercel Production 환경 변수 확인 후 `main` 배포
5. `prod/2026-11-19_2_after_deploy.sql` 실행 (사진 비공개 · 계좌번호 암호화) → 확인 쿼리 0건
6. 최고관리자 계정 확인 후 `prod/2026-11-19_3_role_hierarchy.sql` 실행
7. 동작 확인: 로그인, 신청·결제창, 매니저 지원서, 인증 사진 표시, 관리자 계좌번호 [전체 보기], 관리자 권한 부여/회수

## E. 2026-11-20 릴리스 — 마이페이지 조회 속도 개선

개발 DB 에는 `sql/mypage_performance.sql` 로 먼저 적용했습니다. 운영은 아래 순서로:

1. (권장) 파일 아래쪽 **[확인 A]** 블록만 실행해 바뀔 정책 목록 확인 — `new_qual` 이 `auth.uid()` 등을 `(SELECT ...)` 로 감싼 것만 다른지
2. `prod/2026-11-20_mypage_performance.sql` 전체 실행 (인덱스 6개 + RLS 정책 식 최적화, 트랜잭션)
3. **[확인 B]** 실행 → 첫 결과 0줄, 두 번째 결과 인덱스 6개
4. 동작 확인: 보호자 마이페이지(케어 현황·리포트·어르신·쿠폰), 매니저 마이페이지, 어드민 목록이 예전과 같은지
5. 문제가 있으면 파일 맨 아래 **[되돌리기]** 실행 (원래 정책 식은 `public.rls_policy_backup` 에 저장돼 있음)
