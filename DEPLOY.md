# 인터넷 공개 배포 가이드

조회 서비스를 외부에 공개하기 위한 절차. 대상: 월 1~3만 원급 VPS (Ubuntu 기준).

## 구성

```
인터넷 → Caddy (HTTPS, 도메인) → uvicorn:8000 (127.0.0.1만 바인딩) → SQLite (읽기전용)
                                          ↑
                                   cron → collector (매일 06:00, SERVICE_KEY 사용)
```

## 1. 서버 준비

```bash
# Docker 설치 (공식 스크립트)
curl -fsSL https://get.docker.com | sh

git clone -b claude/confident-programs-eh6gzl https://github.com/elel99gg34-code/d.git /srv/d
cd /srv/d

# 시크릿은 .env 파일로 (git에 커밋되지 않음 — .gitignore 등록됨)
cat > .env <<'EOF'
SERVICE_KEY=공공데이터포털_일반인증키
REGIONS=11680,11710
EOF
chmod 600 .env
```

## 2. 기동

```bash
docker compose up -d web          # 조회 서비스
docker compose run --rm collector # 최초 수집 (이후는 cron)

# 매일 06:00 자동 수집
crontab -e
# 0 6 * * * cd /srv/d && docker compose run --rm collector >> collect.log 2>&1
```

## 3. HTTPS 공개 (Caddy)

도메인의 A 레코드를 서버 IP로 지정한 뒤:

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:8000
    encode gzip
}
```

```bash
sudo systemctl reload caddy
```

Caddy가 인증서 발급·갱신(Let's Encrypt)을 자동 처리한다.

## 4. 공개 전 보안 체크리스트

| 항목 | 상태 |
|---|---|
| API가 읽기전용인가 | ✅ GET만 존재, DB도 `mode=ro`로 연결 |
| SQL 인젝션 | ✅ 전 쿼리 파라미터 바인딩 (문자열 조립 없음) |
| XSS | ✅ 화면 렌더링 시 HTML 이스케이프 |
| 시크릿 노출 | ✅ SERVICE_KEY는 .env(600)로만, 저장소에 없음 |
| 응답 크기 제한 | ✅ limit 최대 500 |
| 앱 직접 노출 차단 | ✅ uvicorn은 127.0.0.1 바인딩, 공개는 Caddy 경유만 |
| 과도한 트래픽 | ⚠ 필요 시 아래 rate limit 적용 |
| 방화벽 | ⚠ 80/443/SSH만 개방: `ufw allow 80,443/tcp && ufw allow ssh && ufw enable` |

**Rate limit** (트래픽이 붙으면): Caddy는 플러그인이 필요하므로, 간단하게는 nginx로 교체하고
`limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;` 적용. 초기에는 생략 가능.

## 5. 공개 시 법적 주의 (PLAN.md 2장 요약)

- 국토부 실거래가 데이터는 공공데이터로 상업적 이용이 가능하나, **출처 표기**
  ("국토교통부 실거래가 공개시스템")를 화면 하단에 넣을 것.
- 공공데이터포털 **개발계정(일 1,000회)은 검증용**이다. 서비스를 공개 운영하려면
  포털에서 **운영계정 전환 신청**(활용사례 등록)을 해야 트래픽 한도가 늘어난다.
- 데이터 재판매(B2B API) 형태로 확장할 경우 사업화 전 변호사 검토(Phase 3) 필수.

## 무료로 먼저 공개해보고 싶다면

VPS 없이 임시 공개하는 방법:
- **Cloudflare Tunnel**: 집 PC에서 `cloudflared tunnel --url http://localhost:8000`
  한 줄로 임시 URL 발급 (PC 켜져 있는 동안만)
- 단, 상시 서비스는 결국 VPS가 필요하다.
