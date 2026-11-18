/** [레거시 전용] 아직 Next.js 로 옮기지 않은 public/*.html 페이지용 Tailwind 설정.
 *  npm run build:legacy-css 가 public/css/tailwind.css 를 만듭니다(생성물, 커밋하지 않음).
 *  해당 HTML 이 모두 Next.js 로 옮겨지면 이 파일과 legacy/ 폴더를 삭제하세요
 *  (NEXTJS_MIGRATION_PLAN.md 7단계). Next.js 화면용 설정은 루트의 tailwind.config.ts 입니다. */
module.exports = {
  content: [
    './public/index.html',
    './public/login.html',
    './public/signup.html',
    './public/reset-password.html',
    './public/admin.html',
    './public/admin.js',
    './public/js/**/*.js',
  ],
  theme: { extend: {} },
  plugins: [],
};
