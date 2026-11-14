# 별점·후기·신고 서버 설정 (한 번만 하면 돼요)

디스코드 서버 멤버만 별점을 줄 수 있게 하는 작은 서버예요. Cloudflare Workers(무료)에서 돌아요.

1. 디스코드 개발자 페이지(discord.com/developers/applications)에서 앱 만들기
   - OAuth2 > Redirects 에 `https://<워커주소>/callback` 추가
   - Bot 탭에서 봇 만들고 토큰 복사 (특별한 권한/인텐트는 필요 없어요)
   - 봇을 우리 서버에 초대 (OAuth2 > URL Generator, scope: bot, 권한 없음)
2. Cloudflare에서 Worker 만들고 `index.js` 붙여넣기, D1 데이터베이스 만들어 `schema.sql` 실행
3. 운영진 전용 채널을 하나 만들고(신고가 올라와요) 봇에게 그 채널의 '메시지 보내기' 권한 주기
   변수: CLIENT_ID, GUILD_ID, REPORT_CHANNEL_ID, SITE_ORIGIN, SITE_PATH / 비밀값: CLIENT_SECRET, BOT_TOKEN, SESSION_SECRET (아무 긴 글자)
4. Cron 트리거: 하루 1회 (서버 나간 사람 별점 정리)
5. 사이트 `config.js` 의 `rating:` 에 워커 주소를 넣으면 별점 기능이 켜져요
