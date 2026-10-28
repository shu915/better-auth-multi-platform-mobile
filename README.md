# better-auth-multi-platform (mobile)

ひとつのログインを、複数のクライアントで共有するためのサンプルの、モバイル(Expo、iOS と Android)
側です。Web アプリ([Better Auth](https://www.better-auth.com))でログインし、そのトークンで Go API を
**直接**呼びます。Web、デスクトップと並ぶ、3 つのクライアントの 1 つです。

## 4 つのリポジトリ

| リポジトリ | 役割 |
|---|---|
| [better-auth-multi-platform-web](https://github.com/shu915/better-auth-multi-platform-web) | Next.js。Better Auth でログインを担当し、JWT を発行する。ブラウザの UI。 |
| [better-auth-multi-platform-api](https://github.com/shu915/better-auth-multi-platform-api) | Go の API。JWT を検証して、プロフィール(bio)を読み書きする。 |
| **better-auth-multi-platform-mobile**(これ) | Expo(iOS と Android)のクライアント。 |
| [better-auth-multi-platform-desktop](https://github.com/shu915/better-auth-multi-platform-desktop) | Tauri(macOS)のクライアント。 |

## できること

- **メールのログイン**(マジックリンク)とログアウト。パスワードは使いません。
- **プロフィール**の閲覧と編集(名前は Web、bio は Go)。
- **退会**(確認のメールアドレスの入力が要る。直近 5 分以内のログインが必要)。
- **Google の連携と解除**(プロフィール画面)と、**Google でログイン**(連携済みのユーザーだけ。
  新規登録はできません)。

## 全体像

```
メールのリンク ──▶ ブラウザ ──▶ Web (Next.js) ──▶ betterauthmulti://?code=… ──▶ アプリ
                                                                                │
アプリ  ── code + PKCE の verifier ──▶ POST /api/mobile/exchange ──▶ セッション   │
アプリ  ── セッションを Bearer で ──▶ GET /api/auth/token ──▶ JWT (5 分)
アプリ  ── JWT を Bearer で ──▶ Go API (/me/profile)
```

- **セッションを URL に載せません。** ブラウザからアプリへ戻るリンクには、セッションではなく、
  1 回限りのコード(60 秒)だけを載せます。アプリが、リンクを頼むときに作った PKCE の verifier を
  添えて、セッションに引き換えます(`src/lib/exchange-code.ts`)。同じスキームを別のアプリが登録しても、
  コードだけではセッションが取れません。
- **自分が頼んだリンクだけ受けます。** リンクの `state` を、頼んだときに保存したものと突き合わせます。
  この規則(`src/lib/sign-in-rules.ts`)が、ログイン CSRF を防ぐ唯一の砦です。
- **セッションと JWT は、SecureStore にだけ置きます。** iOS は Keychain、Android は Keystore です。
- **Go は直接呼びます。** Web の Next.js のサーバーは通りません。`GET /api/auth/token` で、セッションを
  Bearer で送り、JWT を受け取ります(Bearer は、この口だけで受け付けられます)。
- 認証のルールと、受け入れた限界は、Web の `docs/design.md` が正です。

## 技術スタック

| 分類 | 技術 | バージョン |
|---|---|---|
| フレームワーク | Expo(SDK) | 58 |
| ルーティング | Expo Router | 58 |
| UI | React Native / React | 0.88 / 19.3 |
| 言語 | TypeScript | 6.0 |
| 認証 | Better Auth のクライアント(`better-auth`、`@better-auth/expo`) | 1.7.7(Web と同じ版に固定) |
| 保管 | expo-secure-store | 58 |
| ブラウザ | expo-web-browser(Google ログインの画面) | 58 |
| テスト | Vitest | 3 |
| Lint | ESLint(`eslint-config-expo`) | 9 |
| 連携先 | Web(Next.js)、Go API(別リポジトリ) | - |

## 手元で動かす

必要なもの: Node.js、Xcode(iOS)または Android Studio(Android)、動いている Web と Go API(それぞれの
リポジトリを参照)。

```bash
npm ci
npm start                # Metro(JS/TS の変更は保存で反映される)
npm run ios              # 初回と、ネイティブ側を変えたときだけ。シミュレーターで起動
npm run android          # エミュレーターで起動
```

### 接続先

`src/lib/config.ts` が決めます。開発では、未設定でも動きます。

| 環境 | Web | Go |
|---|---|---|
| iOS シミュレーター | `localhost:3000` | `localhost:8080` |
| Android エミュレーター | `localhost:3000`(`adb reverse tcp:3000 tcp:3000` が要る) | `10.0.2.2:8080` |
| 実機 | `EXPO_PUBLIC_WEB_URL` | `EXPO_PUBLIC_API_URL` |

Android で `adb reverse` が要るのは、Google の戻り先が `localhost` で、Cookie がホストごとのためです
(エミュレーターを再起動すると消えます)。

### 実機に入れる(本番に接続する)

本番の URL(https)をビルド時に埋め込みます。Metro も `adb reverse` も要りません。

```bash
EXPO_PUBLIC_WEB_URL=https://<本番の Web> EXPO_PUBLIC_API_URL=https://<本番の Go> \
  npx expo run:android --device --variant release     # USB デバッグをオン
EXPO_PUBLIC_WEB_URL=https://<本番の Web> EXPO_PUBLIC_API_URL=https://<本番の Go> \
  npx expo run:ios --device --configuration Release    # 無料の署名は 7 日で切れる
```

`app.json`(スキーム、バンドル ID)を変えたら、`ios/` と `android/` を消して作り直します(生成物です)。
本番の DB は別なので、Google は本番でも連携し直します。Render の無料プランは、スリープ明けの最初の
bio が出ないことがあります(再読み込みで出ます)。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm start` | 開発サーバー(Metro)。 |
| `npm run ios` / `android` | ネイティブをビルドして起動。 |
| `npm test` | Vitest。React Native に依存しない判断のロジック(`src/lib/*-rules.ts` など)を試す。 |
| `npm run lint` / `npx tsc --noEmit` | lint と型チェック。 |
| `npx expo-doctor` | 依存と設定の診断。 |

## テスト

- **Vitest**: ログインのリンクを受け取る規則(`state` の突き合わせ、コードの引き換え)、プロフィールと
  退会の規則、Google の連携の判断、保管したセッションの扱い。
- 画面(コンポーネント)のテストは、入れていません。
- CI(GitHub Actions)は、型、lint、テスト、JS のバンドルの確認を行います。

## 既知の限界

- 攻撃者のアプリが端末にある場合、リンクのコードを取られる可能性があります(PKCE の verifier があれば
  引き換えられる)。根本的な対策には、Universal Links / App Links(自分のドメインだけがアプリを開ける
  仕組み)が要ります。
- ストアには出しません。

設計の判断など、開発者向けの詳しい記述は、`CLAUDE.md` と `claude-progress.txt` にあります。
