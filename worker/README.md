# 별점·후기·신고 서버 설정 (한 번만 하면 돼요)

구글 로그인으로 별점·후기를 남기는 작은 서버예요. Cloudflare Workers(무료)에서 돌아요.

1. 구글 클라우드 콘솔에서 OAuth 웹 클라이언트 ID 만들기
   - 승인된 JavaScript 원본: `https://sam7599.github.io`
2. Cloudflare에서 Worker 만들고 `index.js` 붙여넣기, D1 데이터베이스 만들어 `schema.sql` 실행
3. 운영진 전용 디스코드 채널에서 웹훅 만들기 (채널 설정 > 연동 > 웹후크)
4. Worker 변수: GOOGLE_CLIENT_ID, SITE_ORIGIN, SITE_PATH / 비밀값: SESSION_SECRET (아무 긴 글자), REPORT_WEBHOOK (웹훅 주소)
5. 사이트 `config.js` 의 `rating:` 에 워커 주소, `google:` 에 구글 클라이언트 ID 넣기

차단: 신고 알림의 "후기 삭제 / 작성자 차단" 링크에서 할 수 있어요. 차단된 계정은 다시 남길 수 없어요.
