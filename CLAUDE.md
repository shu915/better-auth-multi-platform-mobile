@AGENTS.md

# better-auth-multi-platform-mobile

## 概要
Next.js と Better Auth、Go で認証を実装する。これはモバイル(Expo)のクライアント。Web(`better-auth-multi-platform-web`)と Go API(`better-auth-multi-platform-api`)は別リポジトリ。
- 認証は Web の Better Auth が担当する。モバイルは Better Auth でログインし、JWT を取って Go を直接呼ぶ(Go は変えずに済む)
- ログインはマジックリンクが必須。Google などの OAuth は、ログイン済みのユーザーが後から足す任意の手段。パスワードは使わない
- 流れ: マジックリンクのメール → ディープリンクでアプリに戻る(`betterauthmulti://`)→ セッションを SecureStore に保存 → `GET /api/auth/token` に Bearer で JWT をもらう → Go を呼ぶ
- Web 側のルール(Bearer は `/token` だけで受け付ける、など)は、Web の `docs/design.md` が正

## 使用技術
Expo SDK 58 / React Native / Expo Router / TypeScript / Better Auth のクライアント(`better-auth`、`@better-auth/expo`)/ expo-secure-store

## 詳細ドキュメント(必要なときに読む)
- Expo は SDK ごとに壊れる変更が入る。コードを書く前に、AGENTS.md の手順でバージョン別のドキュメントを読む

## 守るルール(特に壊しやすいもの)
- **接続先はプラットフォームで違う**: iOS シミュレータは `localhost`、Android エミュレータは `10.0.2.2`(`src/lib/config.ts`)。実機は Mac の LAN アドレスを `EXPO_PUBLIC_WEB_URL` / `EXPO_PUBLIC_API_URL` に入れる
- **マジックリンクのメールのリンクは、Web の `BETTER_AUTH_URL`(`localhost:3000`)で作られる**。Android エミュレータで開くには `adb reverse tcp:3000 tcp:3000` が要る(エミュレータの再起動で消える)
- アプリのスキーム(`betterauthmulti`)は、`app.json` の `scheme`、Web の `trustedOrigins`(`betterauthmulti://`)、`src/lib/config.ts` の `APP_SCHEME` で同じにする
- セッションのトークンと JWT は SecureStore にだけ置く。`AsyncStorage` やログに出さない
- `ios/` と `android/` は生成物(`.gitignore` 済み)。手で編集しない。ネイティブの設定は `app.json` と config plugin で行う。壊れたら消して作り直す(`npm run ios` / `android`)
- 依存は `npx expo install <package>` で足す(SDK に合う版が入る)。ネイティブ依存を足したら、再ビルドが要る
- iOS 27 のシミュレータは、scene ベースのライフサイクルに対応していないアプリを起動時に落とす。SDK 58 以降のテンプレートは対応済み

## コマンド
- `npm start`: 開発サーバー(Metro)。JS/TS の変更は保存で反映される(再ビルド不要)
- `npm run ios` / `npm run android`: ネイティブをビルドして起動。初回と、ネイティブ側(依存、`app.json` のプラグインやスキーム)を変えたときだけ要る。iOS は初回に時間がかかる
- `npm run lint`: lint / 型チェック: `npx tsc --noEmit`
- `npx expo-doctor`: 依存と設定の診断 / `npx expo install --fix`: 版のずれを直す
- iOS のビルドが `Podfile.lock` のずれで落ちたら `cd ios && pod install`(CocoaPods が要る)
- Android の起動前に、エミュレータを起動しておく(`adb devices` が `device` になるまで待つ)

## 型の方針
- `strict: true` を前提にする。`any` は使わない
- 型は書くか推論に任せる。黙らせる回避は使わない: `as unknown as X`、`@ts-ignore`、`@ts-expect-error`、`eslint-disable`
- 外部から来るデータ(Go のレスポンス、ディープリンクの URL、SecureStore の値、環境変数)は `unknown` で受け、検証してから型を付ける
- どうしても回避が要るときは、理由を 1 行のコメントで書く

## 実装後の流れ
実装は自分で行う。hooks と `evaluator` エージェントは、まだ入れていない(これから入れる。入れたら、Web / Go と同じ「生成と評価のループ」を書く)。
- 実装したら、`npm run lint` と `npx tsc --noEmit` を実行してから完了と報告する
- 画面の動作は、iOS と Android の両方で確かめる。確かめていないものは、報告にそのまま書く
- 人間の確認(実機やシミュレータでの動作、最終レビュー)は、ループの外

### テストを通すための改ざんは禁止
やむを得ず変えるときは、理由を報告に書き、人間の確認を待つ。
- 失敗するテストの削除、`skip` / `only` の追加、`exclude` で外すこと
- 期待値を実装の出力に合わせて弱めること(仕様が変わった場合を除く)
- 型や lint を黙らせる回避を足すこと、tsconfig や ESLint のルールを緩めること
- 上限値、タイムアウト、許可リストなどを、通るように緩めること

## コミットと push
- 人が頼むまでコミットしない(未コミットで残し、先に読んでもらう)。push は人が実行する
- `.env` 系のファイルは読まない(`.env.example` は可)
- `rm -r` は、再生成できるもの(`node_modules`、`.expo`、`ios`、`android` など)だけ
- ブロックされたら回避せず、理由を報告して人の指示を待つ

## 進捗ファイル
- `claude-progress.txt` に、完了・実行中・これからのタスクを書く。新しいセッションは、最初にこのファイルと CLAUDE.md を読む
- 区切りのたびに、終了時の報告と一緒に更新する
