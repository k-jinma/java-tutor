# 開発メモ

README.md は Marketplace の紹介ページとしてそのまま表示されるため、利用者向けの内容だけを書く。開発・配布に関する情報はこのファイルに置く（.vscodeignore で配布物からは除外している）。作りは [dogo-tutor](https://github.com/k-jinma/dogo-tutor) にそろえてあり、プロンプトを触る前に dogo-tutor の HANDOFF_CLAUDE_CODE.md 4章を読むこと。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/prompt.ts` | チューターへの指示文。レビューの観点、HINTS.md の形式、モードごとの仕事 |
| `src/extension.ts` | チャット参加者 `@java-tutor` とコマンドの登録、モードごとの流れ |
| `src/project.ts` | .java の収集、一時フォルダへのコンパイル、確認用入力を流した実行 |
| `src/hints.ts` | HINTS.md の読み書き、確認用入力・結果表・ヒントの節の抽出 |
| `claude-skill/java-tutor/` | 同じルールの Claude Code スキル版 |

## Claude Code スキル版との関係

`claude-skill/java-tutor/` は Claude Code のスキルとして同じことをする版で、ルールの試作はこちらで行うと速い。`~/.claude/skills/java-tutor/` に置くと `/java-tutor` で呼べる。

```bash
cp -r claude-skill/java-tutor ~/.claude/skills/
```

**ルールを変えたら、`src/prompt.ts` とスキル版の両方を直すこと。** 拡張機能版との違いは次のとおり。

- スキル版は Claude Code がファイルを読んでコンパイル・実行する。拡張機能版はそれを拡張機能側で行い、結果をモデルに渡す。
- `/hint` の回答は、拡張機能版ではチャットに流すだけで `HINTS.md` は書き換えない。

ヒントは段階的に小出しにせず、最初のレビューで「直す手順（日本語で2〜4ステップ）」まで出す。わからないところは `/hint 番号 質問` で聞いてもらう。dogo-tutor の4段階方式から変えた点。

## テストで分かったこと

- **2026-10-06 RentalShop5、モデル「自動」**：ヒントが5個と少なく、`Manager extends AiManager` の継承の誤用と、会員一覧が「延滞客」のままになる実バグを取りこぼした。番号入力の範囲外チェックが最優先のヒント1になり、手順も「〜を検討します」とぼやけていた。
  - スキル版から移すときに「入力チェックの不足は優先度を下げる」を落としていたので戻した。
  - 優先順位（バグ → 設計の根っこ → テーマ → そのほか）を明記し、厚く書くヒントの見本を1つ入れた（ルールを足す代わりに見本で厚さを伝える）。見本は別ドメイン（図書館）にして、中身を写さないよう断っている。
  - 上位モデルを選んだときとの比較はまだ。モデルを変えても取りこぼすなら、「問題点の一覧 → HINTS.md」の2段階にすることを検討する。

## 開発の手順

```bash
npm install
npm run compile
```

VS Code でこのフォルダを開き、F5 を押すと拡張開発ホストが起動する。そちらのウィンドウで Java プロジェクトを開き、チャットで `@java-tutor /review` と入力すれば動作を確認できる。

`npm run watch` を回しておくと、保存のたびに再コンパイルされる。拡張ホスト側は Ctrl+R で再読み込みする。

## 手動テストの進捗

確認できたもの（VS Code の外で、vscode をスタブして実行）:

- `HINTS.md` から確認用の入力・結果の表・ヒントの節を取り出せる
- RentalShop5 をコンパイルし、確認用の入力を流して実行できる。一時フォルダは消える

**未確認**:

- 拡張開発ホストで `@java-tutor` が候補に出るか
- `/review` `/check` `/hint` `/new` の一連の流れ（Copilot のモデルで HINTS.md の書式が守られるか）
- コマンドパレットからの `javaTutor.review` / `javaTutor.check`
- Windows 以外での javac の @引数ファイルの扱い

## Marketplace への公開

発行者は dogo-tutor と同じ `k-jinma`。手順と PAT の扱いは dogo-tutor の DEVELOPMENT.md を参照。

```bash
npx vsce package          # .vsix を作って手元で試す
npx vsce publish patch    # バージョンを上げて公開
```

公開前に用意するもの:

- アイコン（`icon.png`、128×128 以上）と package.json の `icon`
- 拡張機能名 `java-tutor` が Marketplace で使えるかの確認
