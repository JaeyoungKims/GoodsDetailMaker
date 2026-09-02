# Supabase

- `migrations/` 의 SQL 을 순서대로 적용합니다. (`supabase db push` 또는 대시보드 SQL Editor)
- Auth → Providers → Email: **Magic Link 사용**, Confirm email 끔(OTP 링크만 사용).
- Auth → URL Configuration: Site URL 과 Redirect URLs 에 배포 도메인·`http://localhost:5173` 추가.
- Auth → Attack Protection: **Enable Captcha protection** 켜고 Provider = Turnstile, Cloudflare 대시보드에서 만든 위젯의 **Secret Key** 입력.
  같은 위젯의 Site Key 를 웹의 `VITE_TURNSTILE_SITE_KEY` 에 넣습니다. 위젯 도메인에 배포 도메인과 `localhost` 를 등록하세요.
- Database → Replication: `job_sections` 가 `supabase_realtime` publication 에 포함됐는지 확인.
- Vault: `supabase_vault` 확장이 켜져 있어야 `set_openai_key` 함수가 동작합니다.

Worker 는 **service role key** 로 접근하고, 브라우저는 **publishable(anon) key** 만 씁니다.
