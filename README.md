# java-tutor

*English summary is at the bottom of this page.*

自分の手で書いた Java プロジェクトを丸ごとレビューして、答えではなくヒントを返す学習用チューターです。ヒントはプロジェクト直下の `HINTS.md` にまとまり、ヒントに沿って直したあとは、合格できているかをチェックしてもらえます。

「自分で書く → ヒントを読む → 自分の手で直す → 合格チェック」をくり返すことで、クラス設計の考え方が身につくように作っています。

## 必要なもの

- Visual Studio Code（バージョン 1.95 以上）
- GitHub Copilot へのサインイン
- JDK（`javac` と `java` が使えること。コンパイルと実行の確認に使います）

学生の方は GitHub の学生認定（GitHub Student Developer Pack）で Copilot を無料で使えます。

## 使い方

迷ったら、チャットに `@java-tutor` とだけ送ってください。使い方とボタン（レビュー・合格チェック・残りを見る・質問する）が出ます。画面下のステータスバーの「🎓 java-tutor」を押しても、同じメニューが開きます。

1. Java プロジェクトのフォルダを VS Code で開く
2. 「レビュー」を押す（または `@java-tutor /review` と送る）
3. プロジェクト直下に `HINTS.md` ができるので、ヒントを読んで自分の手で直す
4. 直したら「合格チェック」を押す（または `@java-tutor /check` と送る）
5. 全部のヒントが合格するまで 3〜4 をくり返す。残りの数はステータスバーに出ます

**自分で入力するときは、毎回先頭に `@java-tutor` を付けてください。** 付けずに `/check` だけを送ると Copilot が受け取り、エージェントモードだとあなたのコードを書き換えてしまうことがあります。チャットのモードは「Ask」にしておくと安心です。

**レビューの質は、チャット欄で選んでいるモデルで大きく変わります。** 「自動」だと軽いモデルが選ばれ、ヒントが少なく浅くなることがあります。`/review` と `/check` のときは、チャット欄のモデル選択で上位のモデル（Claude Sonnet、GPT-5 など）を選んでください。

ヒントを読んでもわからないところは、番号のあとに質問を書いて聞けます。

```text
@java-tutor /hint 3 enum を作ったけど、どこで状態を変えればいいかわからない
```

## コマンド

| コマンド | すること |
| --- | --- |
| `/review` | プロジェクト全体を読んで、ヒントを `HINTS.md` に書く |
| `/check` | 直したあとに、ヒントごとに 合格／もう少し／未着手／取り下げ を判定する |
| `/status` | 残りのヒントと合格の状況を見る（すぐ返ります） |
| `/hint 3 質問` | ヒント3について質問する。チャットで答えます（答えのコードは書きません） |
| `/new` | プログラムを大きく変えたときに、今のコードに合わせてヒントを出し直す |

コマンドパレットの「java-tutor: プロジェクトをレビューしてヒントを出す」「java-tutor: 合格チェック」からも呼べます。

## レベル

| レベル | 見るところ |
| --- | --- |
| 初学者（既定） | 継承の誤用、カプセル化、命名、`static` や `==` の使い方など基本を中心に、問い・手順・骨組みまで丁寧に |
| 中級 | 基本に加えて、抽象クラスとインターフェースの使い分け、`final`、重複コード、例外の扱いなど |
| 上級 | 設計原則、依存の向き、テストのしやすさなどを中心に、指摘と問いで簡潔に |

レベルは、`@java-tutor` と送ったときに出るボタン、ステータスバーのメニュー、設定 `javaTutor.level` のどれからでも変えられます。1回だけ別のレベルで見てほしいときは `@java-tutor /review 上級` のように書きます。

レビューしたときのレベルは `HINTS.md` に記録され、合格チェックはそのレベルのまま続きます。レベルを変えたあとは「新規レビュー」で出し直してください。

先生へ：課題のリポジトリの `.vscode/settings.json` に `"javaTutor.level": "中級"` と書いておくと、そのリポジトリを開いた学生全員にそのレベルが適用されます。

## java-tutor がすること・しないこと

- **あなたのコードは書き換えません。** 書き込むのは `HINTS.md` だけです。
- **答えのコードは書きません。** ヒントには、考えるための問いと、`// TODO` 入りの骨組みが入っています。
- **合格チェックは、コードと実行結果で判定します。** プログラムをコンパイルし、バグのヒントには確認用の入力を流して、症状が消えたかを確かめます。コンパイル結果は一時フォルダに出して、終わったら消します。
- チェック項目を形だけ満たしても、ヒントの意図から外れていれば合格にはなりません。

## 設定

| 設定 | 内容 |
| --- | --- |
| `javaTutor.level` | レビューのレベル（初学者／中級／上級） |
| `javaTutor.theme` | 今回の学習テーマ（例：継承とポリモーフィズム）。関係する指摘を優先します |
| `javaTutor.maxHints` | 一度に出すヒントの最大数（既定 9） |
| `javaTutor.model` | コマンドパレットから呼んだときに使うモデル。空なら初回に一覧から選びます |
| `javaTutor.javaHome` | JDK のフォルダ。空なら PATH 上の `javac` / `java` を使います |
| `javaTutor.runTimeoutSeconds` | 確認用の入力で実行するときの制限時間（既定 10 秒） |

`HINTS.md` のクラス図は Mermaid で書かれています。VS Code のプレビューで図として見るには「Markdown Preview Mermaid Support」などの拡張機能を入れてください。GitHub 上ではそのまま図として表示されます。

## English summary

java-tutor is a VS Code chat participant (`@java-tutor`) for Java learners. It reviews your whole project and writes hints — guiding questions, skeleton code with `// TODO`, and a checklist — to `HINTS.md`, without giving you the answer. After you fix your code by hand, `/check` compiles and runs it and tells you which hints you have passed. It never edits your source files. Requires GitHub Copilot and a JDK.

## License

MIT
