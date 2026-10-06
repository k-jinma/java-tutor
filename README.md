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

1. Java プロジェクトのフォルダを VS Code で開く
2. チャットを開き、`@java-tutor /review` と入力する
3. プロジェクト直下に `HINTS.md` ができるので、ヒントを読んで自分の手で直す
4. 直したら `@java-tutor /check` で合格チェックをしてもらう
5. 全部のヒントが合格するまで 3〜4 をくり返す

## コマンド

| コマンド | すること |
| --- | --- |
| `/review` | プロジェクト全体を読んで、ヒントを `HINTS.md` に書く |
| `/check` | 直したあとに、ヒントごとに 合格／もう少し／未着手／取り下げ を判定する |
| `/hint 3` | ヒント3で行き詰まったときに、1段だけ詳しいヒントを足す（3段まで） |
| `/new` | プログラムを大きく変えたときに、今のコードに合わせてヒントを出し直す |

コマンドパレットの「java-tutor: プロジェクトをレビューしてヒントを出す」「java-tutor: 合格チェック」からも呼べます。

## java-tutor がすること・しないこと

- **あなたのコードは書き換えません。** 書き込むのは `HINTS.md` だけです。
- **答えのコードは書きません。** ヒントには、考えるための問いと、`// TODO` 入りの骨組みが入っています。
- **合格チェックは、コードと実行結果で判定します。** プログラムをコンパイルし、バグのヒントには確認用の入力を流して、症状が消えたかを確かめます。コンパイル結果は一時フォルダに出して、終わったら消します。
- チェック項目を形だけ満たしても、ヒントの意図から外れていれば合格にはなりません。

## 設定

| 設定 | 内容 |
| --- | --- |
| `javaTutor.theme` | 今回の学習テーマ（例：継承とポリモーフィズム）。関係する指摘を優先します |
| `javaTutor.maxHints` | 一度に出すヒントの最大数（既定 9） |
| `javaTutor.javaHome` | JDK のフォルダ。空なら PATH 上の `javac` / `java` を使います |
| `javaTutor.runTimeoutSeconds` | 確認用の入力で実行するときの制限時間（既定 10 秒） |

`HINTS.md` のクラス図は Mermaid で書かれています。VS Code のプレビューで図として見るには「Markdown Preview Mermaid Support」などの拡張機能を入れてください。GitHub 上ではそのまま図として表示されます。

## English summary

java-tutor is a VS Code chat participant (`@java-tutor`) for Java learners. It reviews your whole project and writes hints — guiding questions, skeleton code with `// TODO`, and a checklist — to `HINTS.md`, without giving you the answer. After you fix your code by hand, `/check` compiles and runs it and tells you which hints you have passed. It never edits your source files. Requires GitHub Copilot and a JDK.

## License

MIT
