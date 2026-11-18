/** Tailwind 를 CDN(브라우저에서 매번 생성) 대신 배포할 때 미리 만들어 둔 CSS 로 씁니다.
 *  css/tailwind.css 를 불러오는 페이지와, 그 페이지들이 클래스 이름을 만드는 스크립트만 검사합니다.
 *  Tailwind 클래스를 쓰는 페이지를 새로 추가하면 아래 content 에도 넣어 주세요. */
module.exports = {
  content: [
    './index.html',
    './login.html',
    './signup.html',
    './reset-password.html',
    './admin.html',
    './admin.js',
    './js/**/*.js',
  ],
  theme: { extend: {} },
  plugins: [],
};
