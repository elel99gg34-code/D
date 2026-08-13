# 값 치르기 — Creem 연동

## 무엇을 어디서 파는가

| 물건 | 값 | 어디서 |
|---|---|---|
| 부적 상자 (작은·보통·큰·특대급·비기) | 다이아 | 게임 안 |
| 스킨 상자 | **₩3,000 / 1회** | Creem |
| VIP 패키지 | **₩10,000** | Creem |

다이아로 파는 것은 예전 값 그대로 돌려놓았다 (`BOX_FREE = false`).
원화로 파는 둘만 Creem 을 거친다.

## 어떻게 도는가

```
게임 ──① 결제 쪽지로 보냄──▶ Creem 결제창
                                  │
게임 ◀──② 값 치르고 되돌아옴 ─────┘
  │        주소 뒤에 checkout_id · order_id · product_id · signature 가 붙는다
  │
  └──③ 확인 서버에 물어봄 ──▶ Cloudflare Worker
                                  │  서명을 맞춰 보고
                                  │  처음 보는 주문인지 KV 로 확인
       ◀──④ 참이면 물건을 내어 준다 ┘
```

서명을 맞춰 보려면 Creem API 열쇠가 있어야 한다. 그 열쇠를
`index.html` 에 적으면 누구나 가져가므로, 주소 하나짜리 서버를
따로 둔다. 늘 켜 둘 기계가 필요 없고 열쇠는 그 안에만 있다.

## 차릴 차례

### ① Creem
1. 대시보드에서 물건 둘을 만든다 — 스킨 상자 ₩3,000 · VIP ₩10,000
2. 각 물건의 `prod_…` 를 적어 둔다
3. 물건마다 **Success URL** 을 게임 주소로 잡는다
   (예: `https://<사용자>.github.io/<저장소>/`)
4. API 열쇠를 하나 만든다

### ② 확인 서버 (Cloudflare Worker)
```bash
cd game/server
npx wrangler kv namespace create ORDERS      # 나온 id 를 wrangler.toml 에 적는다
npx wrangler secret put CREEM_API_KEY        # Creem API 열쇠
npx wrangler deploy
```
`wrangler.toml` 의 `PROD_SKIN` · `PROD_VIP` · `ALLOW_ORIGIN` 도 채운다.
올리고 나면 `https://baekgwi-creem.<계정>.workers.dev` 같은 주소가 나온다.
`/health` 로 살아 있는지 볼 수 있다.

### ③ 게임
`game/index.html` 의 `CREEM` 을 채운다.
```js
const CREEM = {
  test: false,                                  // 진짜로 팔 때는 false
  prod: { skin: 'prod_…', vip: 'prod_…' },
  verify: 'https://baekgwi-creem.<계정>.workers.dev',
  back: location.origin + location.pathname
};
```
그리고 `node game/build-mobile.mjs` 로 손전화판을 다시 뽑는다.

### ④ GitHub
- **Settings → Pages → Source: GitHub Actions** 로 켠다.
  `.github/workflows/pages.yml` 이 밀 때마다 게임을 올린다.
- Worker 를 자동으로 올리려면 저장소 비밀 둘을 넣는다.
  `CLOUDFLARE_API_TOKEN` · `CLOUDFLARE_ACCOUNT_ID`

## 아직 안 채웠을 때

`CREEM.prod` 가 비어 있으면 값 치르는 단추가 잠기고
「물건 번호를 안 적었다」고 일러 준다.
`CREEM.verify` 가 비어 있으면 서명을 맞춰 보지 않고 그냥 내어 준다 —
혼자 시험할 때만 그렇게 두고, 진짜로 팔 때는 반드시 채운다.

## 이미 값을 치른 사람

설정 → 코드에 받은 코드를 적어도 된다. Creem 의 라이선스 키를
쓰려면 `CODES` 에 그 키를 더하거나, Worker 에 `/license` 자리를
하나 더 내면 된다.
