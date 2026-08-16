# 앱으로 내보내기

알맹이는 `game/index.html` **한 장**이다. 여기 있는 것은 그것을
감싸는 껍데기뿐이고, 무엇이 다른지는 게임 안의 두 낱말이 가른다.

| | EDITION | PLAT | 값은 어떻게 받나 |
|---|---|---|---|
| 웹 (체험판) | `demo` | `web` | **안 받는다.** 제3막까지만 |
| 안드로이드 | `full` | `android` | Google Play 결제 |
| 데스크톱 | `full` | `desktop` | 코드 (설정 → 코드) |

`game/build-apps.mjs` 가 `dist/` 밑에 셋을 지으면서 앞머리에
`window.__EDITION` · `window.__PLAT` 을 심는다. 아무것도 안 심으면
예전 그대로 「웹 전체판」이다.

```
node game/build-apps.mjs
  dist/web/index.html      체험판 · 넓은 화면
  dist/web/mobile.html     체험판 · 손전화
  dist/android/index.html  전체판 · 손전화 겉옷 덧댐
  dist/desktop/index.html  전체판 · 넓은 화면
```

---

## 안드로이드

```bash
cd app/android
npm install
npm run add        # 처음 한 번 — android/ 를 만든다
npm run apk        # 시험용 APK
npm run aab        # 스토어에 올릴 AAB (서명 열쇠 필요)
```

미는 것만으로 GitHub Actions 가 대신 짓는다. 서명 열쇠를 저장소
비밀에 넣어 두면 그때부터 서명된 AAB 가 나온다.

| 비밀 | 무엇 |
|---|---|
| `ANDROID_KEYSTORE_B64` | 열쇠집(.jks)을 base64 로 옮긴 것 |
| `ANDROID_KEYSTORE_PASS` | 열쇠집 암호 |
| `ANDROID_KEY_ALIAS` | 열쇠 이름 |
| `ANDROID_KEY_PASS` | 열쇠 암호 |

열쇠집은 이렇게 만든다 (한 번 만들면 **절대 잃어버리면 안 된다** —
잃으면 그 앱을 다시 올릴 수 없다):

```bash
keytool -genkey -v -keystore baekgwi.jks -keyalg RSA \
        -keysize 2048 -validity 10000 -alias baekgwi
base64 -w0 baekgwi.jks > baekgwi.jks.b64   # 이 글자를 비밀에 넣는다
```

### Play Console 에 만들 물건 둘

앱 안에서 파는 것은 구글 결제로만 받을 수 있다. 물건 id 는 게임의
`PLAY_SKU` 와 **똑같이** 적어야 한다.

| id | 갈래 | 값 |
|---|---|---|
| `vip_package` | 관리 상품 (한 번만) | ₩10,000 |
| `skin_box` | 소모품 (여러 번) | ₩3,000 |

구글 결제창은 한 번에 하나씩만 받으므로, 스킨 10+1회는 「남은 회수」로
쌓아 두고 차례로 사는 꼴이 된다.

---

## 데스크톱

```bash
cd app/desktop
npm install
npm start          # 그 자리에서 띄워 본다
npm run dist:win   # 윈도우 .exe
npm run dist:linux # 리눅스 AppImage
npm run dist:mac   # 맥 .dmg (맥에서만)
```

윈도우와 리눅스는 미는 것만으로 Actions 가 짓는다. 서명은 안 하므로
윈도우가 「모르는 만든이」라고 한 번 물을 것이다.

---

## 아직 안 정한 것

- `STORE_URL` — 체험판에서 「전체판 보러 가기」가 가리킬 자리.
  플레이 스토어 주소가 나오면 `game/index.html` 에 적는다.
- 앱 아이콘 — 지금은 Capacitor·Electron 의 기본 그림이다.
