#!/usr/bin/env bash
# PreToolUse: 禁止事項を実行前にブロックする(exit 2 + stderr で Claude に理由を返す)
set -u
input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
path=$(jq -r '.tool_input.file_path // .tool_input.path // ""' <<<"$input")
# 書き込まれる内容(Write: content / Edit: new_string / MultiEdit: edits[].new_string)
content=$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")' <<<"$input")

block() { echo "BLOCKED by guard-pre.sh: $1" >&2; exit 2; }

rel=${path#"${CLAUDE_PROJECT_DIR:-$PWD}"/}

# --- .env の読み取り(.env.example は許可) ---
is_env_path() { [[ "$(basename "$1")" == .env* && "$(basename "$1")" != ".env.example" ]]; }
if [[ -n "$path" ]] && is_env_path "$path"; then
  block ".env 系ファイルは読まない(.env.example は可)"
fi
if [[ "$tool" == "Bash" ]]; then
  stripped=${cmd//.env.example/}
  if grep -Eq "(^|[[:space:]/\"'=])\.env(\.[A-Za-z0-9._-]+)?(\$|[[:space:]\"'|;&)])" <<<"$stripped"; then
    block ".env 系ファイルをコマンドで読まない(.env.example は可)"
  fi
fi

# --- rm の再帰削除: 再生成できるものだけ許す ---
sep='(^|[;&|][[:space:]]*)'
# 再帰削除してよい名前(消しても、install・ビルド・prebuild で作り直せるもの)
RM_ALLOWED='node_modules|\.expo|dist|ios|android|coverage|tmp'

# rm の再帰削除で、許可リストにない対象を含むなら 0(= 危険)を返す。再帰でない rm や、対象が全部許可なら 1。
rm_recursive_unsafe() {
  local cmd="$1" seg tok recursive
  set -f # 展開させない(* や ? をそのまま文字列として見る)
  while IFS= read -r seg; do
    recursive=0
    for tok in $seg; do
      [[ "$tok" =~ ^-[a-zA-Z]*[rR][a-zA-Z]*$ || "$tok" == "--recursive" ]] && recursive=1
    done
    [[ $recursive -eq 0 ]] && continue
    for tok in $seg; do
      [[ "$tok" == -* ]] && continue
      # 相対パスで、このプロジェクトの直下の名前だけ(src/ios のようなものは通さない)。.. ・絶対パス・~・変数・ワイルドカード・引用符も通さない
      [[ "$tok" =~ ^(\./)?(${RM_ALLOWED})/?$ ]] || { set +f; return 0; }
    done
  done < <(grep -Eo "${sep}rm[[:space:]]+[^;&|]*" <<<"$cmd" | sed -E 's/^[;&|[:space:]]*rm[[:space:]]+//')
  set +f
  return 1
}

# --- Bash の危険操作 ---
if [[ "$tool" == "Bash" ]]; then
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(push|clean|reset[[:space:]]+--hard)" <<<"$cmd" \
    && block "git push/clean/reset --hard は人が頼むまでしない(commit はローカルで取り消せるので許可。外に出る push は人が実行する)"
  rm_recursive_unsafe "$cmd" \
    && block "rm の再帰削除(-r)は、再生成できるもの(node_modules、.expo、ios、android など)だけ許可。それ以外は人に確認する"
  grep -Eq "${sep}(npx[[:space:]]+(-[^[:space:]]+[[:space:]]+)*)?eas(-cli)?(@[^[:space:]]+)?[[:space:]]+(build|submit|update|credentials)" <<<"$cmd" \
    && block "eas build/submit/update/credentials は外(クラウドとストア)に出る。人が実行する"
fi

# --- 保護対象ファイルの編集禁止 ---
if [[ "$tool" =~ ^(Edit|Write|MultiEdit)$ && -n "$rel" ]]; then
  case "$rel" in
    ios/*|android/*) block "ios/ と android/ は生成物。app.json と config plugin で設定する" ;;
    package-lock.json) block "package-lock.json は手編集しない(npm / npx expo install 経由で更新する)" ;;
  esac

  # --- 型・lint・テストを黙らせる回避の禁止 ---
  case "$rel" in
    *.ts|*.tsx|*.mts|*.mjs)
      grep -Eq '@ts-ignore|@ts-expect-error|eslint-disable|as unknown as|as any\b|:[[:space:]]*any[[:space:]]*[],;=)>|]' <<<"$content" \
        && block "@ts-ignore / @ts-expect-error / eslint-disable / as unknown as / any は使わない。型を正しく直す"
      ;;
  esac
  case "$rel" in
    *.test.ts|*.test.tsx|eslint.config.js|tsconfig.json)
      grep -Eq '\b(it|test|describe)\.(skip|only|todo)\b|"strict"[[:space:]]*:[[:space:]]*false|:[[:space:]]*"off"|exclude' <<<"$content" \
        && block "テスト/設定を弱める変更(skip/only/todo, strict:false, rule off, exclude)は禁止。やむを得ないなら理由を報告して人の確認を待つ"
      ;;
  esac
fi
exit 0
