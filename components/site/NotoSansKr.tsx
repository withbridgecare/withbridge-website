/**
 * Google 'Noto Sans KR' 웹폰트를 불러옵니다.
 *
 * 예전 HTML 페이지마다 이 폰트를 불러오는 곳과 안 불러오는 곳(메인·제휴 페이지)이 섞여 있었고,
 * 안 불러온 페이지는 기기 기본 한글 폰트로 보였습니다. 전환하면서 화면이 바뀌지 않도록
 * 예전에 불러오던 페이지에서만 이 컴포넌트를 넣었습니다.
 * 사이트 전체 폰트를 통일하려면(디자인 결정) app/layout.tsx 로 옮기면 됩니다.
 */
export function NotoSansKr({ weights = '400;500;700' }: { weights?: string }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href={`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weights}&display=swap`}
      />
    </>
  );
}
