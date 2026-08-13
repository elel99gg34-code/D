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

주문을 적어 둘 KV 묶음은 **이미 만들어 두었다.**

| 이름 | id |
|---|---|
| `baekgwi-orders` | `47054fd1996b4f57af6458acd6501bea` |

`wrangler.toml` 에도 이미 적혀 있으니 그대로 두면 된다. 남은 것은 올리는 일뿐.

```bash
cd game/server
npx wrangler login                    # 창이 열리면 허락 누르기
npx wrangler secret put CREEM_API_KEY # Creem API 열쇠를 붙여넣는다
npx wrangler deploy
```
`wrangler.toml` 의 `PROD_SKIN` · `PROD_VIP` 도 채운다 (`ALLOW_ORIGIN` 은 이미 넣어 두었다).
올리고 나면 `https://baekgwi-creem.<계정>.workers.dev` 같은 주소가 나온다.
`/health` 로 살아 있는지 볼 수 있다.

손으로 하기 싫으면 저장소 비밀에 `CLOUDFLARE_API_TOKEN` 하나만 넣어도 된다 —
`.github/workflows/worker.yml` 이 대신 올린다. `CREEM_API_KEY` 도 비밀에
넣어 두면 그것까지 함께 넣어 준다.

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

`.github/workflows/pages.yml` 이 밀 때마다 게임을 지어 **`gh-pages` 가지**에
넣어 둔다 (이미 들어가 있다). 남은 것은 그 가지를 내어 주라고 한 번
일러 주는 일뿐:

> **Settings → Pages → Source: `Deploy from a branch` → `gh-pages` / `(root)` → Save**

한 번만 하면 그 뒤로는 밀 때마다 저절로 바뀐다.
주소는 `https://elel99gg34-code.github.io/D/` 가 된다.

*왜 이건 손으로 해야 하나* — Pages 를 **처음 켜는** API 는 `administration`
권한을 찾는데, 워크플로가 쥔 GITHUB_TOKEN 에는 그 권한을 줄 칸 자체가 없다.
`configure-pages` 로 켜 보려다 `Resource not accessible by integration` 으로
두 번 엎어진 뒤 이 길로 바꿨다.

## 아직 안 채웠을 때

`CREEM.prod` 가 비어 있으면 값 치르는 단추가 잠기고
「물건 번호를 안 적었다」고 일러 준다.
`CREEM.verify` 가 비어 있으면 서명을 맞춰 보지 않고 그냥 내어 준다 —
혼자 시험할 때만 그렇게 두고, 진짜로 팔 때는 반드시 채운다.

## 이미 값을 치른 사람

설정 → 코드에 받은 코드를 적어도 된다. Creem 의 라이선스 키를
쓰려면 `CODES` 에 그 키를 더하거나, Worker 에 `/license` 자리를
하나 더 내면 된다.
