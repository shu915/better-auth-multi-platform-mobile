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
- **接続先はプラットフォームで違う**: iOS シミュレータは `localhost`。Android エミュレータは、Go が `10.0.2.2`、Web は `localhost`(`adb reverse tcp:3000 tcp:3000` が要る。Google の戻り先が localhost で、Cookie はホストごとのため。`src/lib/config.ts`)。実機は Mac の LAN アドレスを `EXPO_PUBLIC_WEB_URL` / `EXPO_PUBLIC_API_URL` に入れる
- **マジックリンクのメールのリンクは、Web の `BETTER_AUTH_URL`(`localhost:3000`)で作られる**。Android エミュレータで開くには `adb reverse tcp:3000 tcp:3000` が要る(エミュレータの再起動で消える)
- アプリのスキーム(`betterauthmulti`)は、`app.json` の `scheme`、Web の `trustedOrigins`(`betterauthmulti://`)、`src/lib/config.ts` の `APP_SCHEME` で同じにする
- セッションのトークンと JWT は SecureStore にだけ置く。`AsyncStorage` やログに出さない
- `ios/` と `android/` は生成物(`.gitignore` 済み)。手で編集しない。ネイティブの設定は `app.json` と config plugin で行う。壊れたら消して作り直す(`npm run ios` / `android`)
- 依存は `npx expo install <package>` で足す(SDK に合う版が入る)。ネイティブ依存を足したら、再ビルドが要る
- iOS 27 のシミュレータは、scene ベースのライフサイクルに対応していないアプリを起動時に落とす。SDK 58 以降のテンプレートは対応済み

## コマンド
- `npm start`: 開発サーバー(Metro)。JS/TS の変更は保存で反映される(再ビルド不要)
- `npm run ios` / `npm run android`: ネイティブをビルドして起動。初回と、ネイティブ側(依存、`app.json` のプラグインやスキーム)を変えたときだけ要る。iOS は初回に時間がかかる
- `npm test`: Vitest(`src/**/*.test.ts`)。React Native に依存しない判断のロジック(`src/lib/*-rules.ts`)だけを試す。画面のテストは入れない方針。ログインのリンクを受け取る規則(`sign-in-rules.ts`)は、ログイン CSRF を防ぐ唯一の砦なので、変えたら必ずテストを足す
- `npm run lint`: lint / 型チェック: `npx tsc --noEmit` / JS のバンドルの確認: `npx expo export --platform ios --platform android --output-dir dist`
- `better-auth` と `@better-auth/expo` は Web と同じ版に固定している(`^` なし)。上げるときは Web と同時に(Dependabot の PR も、Web と合わせてから取り込む)。Expo の SDK のパッケージは `npx expo install --fix` でそろえる
- Vitest は 3.x。5.x は rolldown を使い、macOS で `npm install` すると `package-lock.json` から `@rolldown/binding-*` が消えて、Linux の CI が落ちる(`grep -c '"node_modules/@rolldown/binding-' package-lock.json` が 0 のとき)
- 依存を足したあと、`package-lock.json` を `--legacy-peer-deps` で作らない(peer 依存がロックに入らず、CI の `npm ci` が落ちる)。確認は `npm ci --dry-run`
- `npx expo-doctor`: 依存と設定の診断 / `npx expo install --fix`: 版のずれを直す
- iOS のビルドが `Podfile.lock` のずれで落ちたら `cd ios && pod install`(CocoaPods が要る)
- Android の起動前に、エミュレータを起動しておく(`adb devices` が `device` になるまで待つ)

## 型の方針
- `strict: true` を前提にする。`any` は使わない
- 型は書くか推論に任せる。黙らせる回避は使わない: `as unknown as X`、`@ts-ignore`、`@ts-expect-error`、`eslint-disable`
- 外部から来るデータ(Go のレスポンス、ディープリンクの URL、SecureStore の値、環境変数)は `unknown` で受け、検証してから型を付ける
- どうしても回避が要るときは、理由を 1 行のコメントで書く

## 実装後の流れ(生成と評価のループ)
実装は自分、評価は `evaluator` エージェント(`.claude/agents/evaluator.md`)。
1. 実装する。`tsc --noEmit` と lint は hooks(`.claude/settings.json`)が自動で実行する(編集ごとに ESLint、応答終了時に tsc と lint。`test` スクリプトができたらテストも)。失敗したら差し戻されるので直す。JS のバンドル(`npx expo export`)は hooks の対象外
2. 挙動を変える変更のときは `evaluator` を呼ぶ(ドキュメントやコメントだけの変更では呼ばない)
3. 「要修正」なら「高」「中」の指摘を直して 2 に戻る。最大 5 周で打ち切る
4. 「合格」で終了し、結果を報告する。5 周で合格しなければ、止めて残りの指摘をそのまま報告する(無理に通さない)。同じ指摘が再発したら、上限を待たずに止める
5. 報告には、検証していない範囲と、人間向けの確認手順を必ず書く。人間の返事は待たない
   - シミュレータ、エミュレータ、実機での動作と、ネイティブのビルド(`npm run ios` / `android`)は、このループでは確認できない。画面やディープリンクを変えたら、必ず未検証として残す
   - 画面のテストはない(ロジックは `npm test`)

人間の確認(iOS と Android での動作確認、最終レビュー)はループの外。人間が問題を見つけたら、その内容を新しい goal として回す。goal を書くときは、完了条件(機械で確認できるもの)と、ループの外(人間の作業)を分ける。

### テストを通すための改ざんは禁止
やむを得ず変えるときは、理由を報告に書き、人間の確認を待つ。
- 失敗するテストの削除、`skip` / `only` の追加、`exclude` で外すこと
- 期待値を実装の出力に合わせて弱めること(仕様が変わった場合を除く)
- 型や lint を黙らせる回避を足すこと、tsconfig や ESLint のルールを緩めること
- 上限値、タイムアウト、許可リストなどを、通るように緩めること
- `evaluator` の指摘を、直さずにコメントや設定で黙らせること

テストが落ちたら、まず実装が間違っていると考える。テストの側が間違っていると判断するときも、根拠を書く。

## コミットと hooks
- 人が頼むまでコミットしない(未コミットで残し、先に読んでもらう)。push は hook が止めるので人が実行する。`.github/workflows/` の編集は hook では止めない。CI を緩める変更(チェックの削除、など)は改ざんとして扱う
- CI(`.github/workflows/ci.yml`)は、lint、`tsc --noEmit`、`npx expo export`(iOS と Android の JS のバンドル)を実行する。ネイティブのビルドと端末での動作は、CI も見ない
- `.env` 系のファイルは読まない
- PreToolUse でブロック(`.claude/hooks/`): `.env` 系の読み取り(`.env.example` は可)、`git push/clean/reset --hard`、`rm -r`(`node_modules`・`.expo`・`dist`・`ios`・`android`・`coverage`・`tmp` だけ許可。`..`・絶対パス・ワイルドカード・それ以外は不可)、`eas build/submit/update/credentials`、`ios/`・`android/`・`package-lock.json` の編集、`@ts-ignore` / `eslint-disable` / `as unknown as` / `any` の追加、テストや設定への `skip` / `only` / `strict:false` / ルール `off` / `exclude`
- ブロックされたら回避せず、理由を報告して人の指示を待つ

## 進捗ファイル
- `claude-progress.txt` に、完了・実行中・これからのタスクを書く。新しいセッションは、最初にこのファイルと CLAUDE.md を読む
- 区切りのたびに、終了時の報告と一緒に更新する
