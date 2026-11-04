-- ============================================================================
-- seniors_user_id_fkey_fix.sql
-- 어르신 프로필 저장 시 콘솔에 떴던 오류를 고칩니다:
--   insert or update on table "seniors" violates foreign key constraint "seniors_user_id_fkey"
--   DETAIL: Key (user_id)=(...) is not present in table "users".
--
--   ⚠ 먼저 바로잡을 점: 이 오류(23503, foreign_key_violation)는 "컬럼 이름이 잘못됐다"는 신호가
--   아닙니다 — DETAIL 라인이 "Key (user_id)=..." 라고 정확히 user_id 라는 컬럼명을 그대로 출력한다는
--   것 자체가 "그 컬럼이 user_id 로 존재하고, 보낸 값도 정상적으로 그 컬럼에 들어갔다"는 뜻입니다.
--   컬럼 이름이 실제로 guardian_id 등 다른 이름이었다면 PostgREST 가 42703(undefined_column) 또는
--   PGRST204 로 거부했을 것이고, 그 경우 에러 코드/문구가 전혀 다르게 나옵니다. 그래서 apply.html/
--   mypage.html 의 .eq('user_id', ...) / insert({ user_id: ... }) 코드는 바꿀 필요가 없습니다 —
--   컬럼명 자체는 이미 정확히 user_id 로 맞습니다.
--
--   23503(FK 위반)의 진짜 의미는 "user_id 컬럼에 적힌 값이, seniors_user_id_fkey 제약이 참조하는
--   테이블에 그 값(id)을 가진 행이 없다"는 것입니다. 이 저장소의 다른 파일들은 seniors.user_id 가
--   auth.users(id) 를 참조한다고 가정했지만(schema_clone_dev.sql 재구성본 참고 — 실제 운영 스키마와
--   다를 수 있다고 그 파일 자체가 경고합니다), 로그인된 사용자라면 auth.users 에 자기 행이 없을 수
--   없으므로(Supabase Auth 세션이 발급된 이상 그 user_id 는 항상 auth.users 에 존재), 실제로는 이
--   FK 가 (a) auth.users 가 아닌 전혀 다른 public.users 테이블을 참조하고 있거나(아무도 데이터를
--   채워 넣지 않는 테이블), (b) 참조 대상이 auth.users 가 맞더라도 이번에 쓴 테스트 계정이 SQL로
--   직접 만들어진 행(_recover_admin_account.sql 등으로 다뤄진 전례가 있는 종류의 수기 테스트
--   계정)이라 auth.users 쪽에는 대응하는 실제 가입 기록이 없는 경우일 가능성이 가장 큽니다.
--
--   이 파일은 두 경우를 전부 "같은 결론"으로 해결합니다 — seniors.user_id 의 FK를 이 프로젝트
--   전체가 '사용자'를 가리킬 때 실제로 쓰는 단 하나의 테이블인 public.profiles(id) 로 다시 겁니다.
--   service_applications.user_id, managers.id, user_packages.user_id 등 이 저장소의 거의 모든 FK가
--   이미 이 패턴을 씁니다(auth.users 가 아니라 profiles) — profiles 는 handle_new_user() 트리거가
--   모든 정상 가입 시 자동으로 채우고, 이 테스트 계정도 이미 profiles 에는 행이 있어야(그래야
--   service_applications 등 다른 insert 가 지금까지 성공했을 것) 정상입니다.
--
--   실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--   1)번(진단)은 읽기 전용이라 몇 번을 실행해도 안전하고, 결과를 'Results' 탭에서 바로 볼 수
--   있습니다. 2)번(수정)도 drop/add constraint 기반이라 여러 번 실행해도 안전합니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 진단 — 지금 seniors.user_id 의 FK가 실제로 어느 스키마.테이블을 참조하고 있는지 확인합니다.
--    (수정 전/후 비교용 — 이 SELECT 결과를 그대로 복사해 두면 나중에 비교하기 좋습니다)
-- ----------------------------------------------------------------------------
select
  tc.constraint_name,
  tc.table_schema || '.' || tc.table_name as "seniors 쪽(from)",
  kcu.column_name as "seniors 의 컬럼",
  ccu.table_schema || '.' || ccu.table_name as "지금 참조 중인 테이블(to)",
  ccu.column_name as "참조 중인 컬럼"
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
where tc.table_schema = 'public'
  and tc.table_name = 'seniors'
  and tc.constraint_type = 'FOREIGN KEY';

-- ----------------------------------------------------------------------------
-- 2) 수정 — seniors.user_id 의 FK를 public.profiles(id) 로 다시 겁니다. 이 프로젝트의 거의 모든
--    user_id/id FK가 이미 이 테이블을 참조하므로(service_applications, managers, user_packages 등),
--    현재 로그인한 계정이라면 profiles 행이 반드시 있어야 정상이고(없다면 이 insert 이전에 이미
--    다른 기능들도 깨져 있었을 것), 그 행을 그대로 참조 대상으로 씁니다.
-- ----------------------------------------------------------------------------
alter table public.seniors drop constraint if exists seniors_user_id_fkey;
alter table public.seniors add constraint seniors_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ============================================================================
-- PostgREST 스키마 캐시 새로고침
-- ============================================================================
notify pgrst, 'reload schema';
