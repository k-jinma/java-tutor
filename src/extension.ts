import * as vscode from "vscode";
import { buildPrompt, Mode } from "./prompt";
import {
  collectSources,
  renderSources,
  compile,
  findMainClass,
  runWithInput,
  cleanup,
  MAX_SOURCE_CHARS,
  SourceFile,
} from "./project";
import {
  readHints,
  writeHints,
  hintsUri,
  stripFence,
  extractInputs,
  extractResultTable,
  hintSection,
  HINTS_FILE,
} from "./hints";

/** チャットとコマンドパレットの両方から使う出力先 */
interface Out {
  progress(msg: string): void;
  markdown(msg: string): void;
  done(uri: vscode.Uri): void;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Copilot のモデルを取得する。見つからなければ GitHub サインインへ誘導する（dogo-tutor と同じ） */
async function pickModel(): Promise<vscode.LanguageModelChat | undefined> {
  let [model] = await vscode.lm.selectChatModels({ vendor: "copilot" });
  if (model) {
    return model;
  }
  const signIn = "GitHub にサインイン";
  const choice = await vscode.window.showErrorMessage(
    "利用できる言語モデルがありません。GitHub Copilot へのサインインが必要です。",
    signIn
  );
  if (choice !== signIn) {
    return;
  }
  try {
    await vscode.authentication.getSession("github", [], { createIfNone: true });
  } catch {
    return;
  }
  for (let i = 0; i < 10 && !model; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    [model] = await vscode.lm.selectChatModels({ vendor: "copilot" });
  }
  return model;
}

async function ask(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  token: vscode.CancellationToken,
  onFragment?: (s: string) => void
): Promise<string> {
  const res = await model.sendRequest(messages, {}, token);
  let text = "";
  for await (const f of res.text) {
    text += f;
    onFragment?.(f);
  }
  return text;
}

/**
 * コンパイルし、合格チェックではバグのヒントに残した確認用の入力を流して実行する。
 * 結果はモデルに渡す事実として文章で返す。
 */
async function buildAndRun(files: SourceFile[], hintsForRun: string | undefined, out: Out): Promise<string[]> {
  out.progress("コンパイルしています…");
  const build = await compile(files);
  const facts: string[] = [];
  try {
    if (!build.javacFound) {
      facts.push("javac が見つからないため、コンパイルと実行は確認していません。");
    } else if (!build.ok) {
      facts.push(`コンパイルに失敗しました。\n\`\`\`\n${build.output}\n\`\`\``);
    } else {
      facts.push("コンパイルは成功しました。" + (build.output ? `\n警告:\n${build.output}` : ""));
      const mainClass = findMainClass(files);
      if (hintsForRun && mainClass) {
        for (const { hint, input } of extractInputs(hintsForRun)) {
          out.progress(`ヒント${hint}の確認用の入力で実行しています…`);
          const output = await runWithInput(build.outDir, mainClass, input);
          facts.push(`ヒント${hint}の確認用の入力で ${mainClass} を実行した出力:\n\`\`\`\n${output}\n\`\`\``);
        }
      }
    }
  } finally {
    await cleanup(build.outDir);
  }
  return facts;
}

async function run(
  mode: Mode,
  model: vscode.LanguageModelChat,
  out: Out,
  token: vscode.CancellationToken,
  userText = ""
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    out.markdown("Java プロジェクトのフォルダを開いてから呼んでください。");
    return;
  }
  const cfg = vscode.workspace.getConfiguration("javaTutor");
  const maxHints = cfg.get<number>("maxHints", 9);
  const theme = cfg.get<string>("theme", "");
  const hints = await readHints(folder);

  // モードと HINTS.md の有無が合わないときは、上書きや空振りをせずに案内する
  if (mode === "review" && hints) {
    out.markdown(
      `${HINTS_FILE} がもうあります。直したあとなら \`/check\` で合格チェック、` +
        `今のコードでヒントを出し直したいなら \`/new\` を使ってください。`
    );
    return;
  }
  if (mode !== "review" && !hints) {
    out.markdown(`${HINTS_FILE} がまだありません。まず \`/review\` でレビューしてください。`);
    return;
  }

  // /hint 3 〜 の先頭の数字はヒント番号。番号なしの質問も受け付ける
  let hintNo: number | undefined;
  if (mode === "hint") {
    const m = /^\s*(\d+)\s*/.exec(userText);
    if (m) {
      hintNo = Number(m[1]);
      userText = userText.slice(m[0].length);
      if (!hintSection(hints!, hintNo)) {
        out.markdown(`${HINTS_FILE} にヒント${hintNo}が見つかりませんでした。番号を確かめてください。`);
        return;
      }
    }
    if (!userText.trim()) {
      out.markdown(
        "どこで困っているかを、番号のあとに書いてください。\n\n" +
          "例: `/hint 3 enum を作ったけど、どこで状態を変えればいいかわからない`"
      );
      return;
    }
  }

  out.progress("ソースを読んでいます…");
  const files = await collectSources(folder);
  if (files.length === 0) {
    out.markdown("このフォルダに .java ファイルが見つかりませんでした。");
    return;
  }
  const sources = renderSources(files);
  if (sources.length > MAX_SOURCE_CHARS) {
    out.markdown(
      `ソースが大きすぎるため（${files.length} ファイル）、レビューできませんでした。` +
        `演習のプロジェクトだけを開いて呼んでください。`
    );
    return;
  }

  // 質問への回答はソースを見れば足りる。待たせないようコンパイルは省く
  const facts =
    mode === "hint"
      ? ["（質問への回答のため、コンパイルと実行はしていません）"]
      : await buildAndRun(files, mode === "check" ? hints : undefined, out);

  out.progress(mode === "hint" ? "考えています…" : "ヒントを書いています…");
  const messages = [
    vscode.LanguageModelChatMessage.User(buildPrompt(mode, { date: today(), maxHints, theme, hint: hintNo })),
    vscode.LanguageModelChatMessage.User(`# ソース（行頭の数字は行番号）\n\n${sources}`),
    vscode.LanguageModelChatMessage.User(`# コンパイル・実行の結果\n\n${facts.join("\n\n")}`),
  ];
  if (hints) {
    messages.push(vscode.LanguageModelChatMessage.User(`# 今の ${HINTS_FILE}\n\n${hints}`));
  }
  if (userText.trim()) {
    const label = mode === "hint" ? "# 質問" : "# 学生からのひとこと";
    messages.push(vscode.LanguageModelChatMessage.User(`${label}\n\n${userText}`));
  }

  // 質問への回答はチャットに流すだけで、HINTS.md は書き換えない
  if (mode === "hint") {
    await ask(model, messages, token, (f) => out.markdown(f));
    return;
  }

  const answer = stripFence(await ask(model, messages, token));
  if (token.isCancellationRequested) {
    return;
  }

  // 書式を外れた応答で HINTS.md を壊さないよう、最低限の形を確かめてから書く
  if (!/^## ヒント\d+[：:]/m.test(answer) && !/## 合格したヒント/.test(answer)) {
    out.markdown("ヒントをうまく作れませんでした。もう一度呼んでみてください。");
    return;
  }
  const uri = await writeHints(folder, answer);
  const table = extractResultTable(answer);
  out.markdown(
    (mode === "check" ? "合格チェックの結果です。\n\n" : `${HINTS_FILE} にヒントを書きました。\n\n`) +
      (table ? `${table}\n\n` : "") +
      "直したら `@java-tutor /check` で合格チェックできます。"
  );
  out.done(uri);
}

export function activate(context: vscode.ExtensionContext) {
  const handler: vscode.ChatRequestHandler = async (request, _ctx, stream, token) => {
    const mode = request.command as Mode | undefined;
    if (!mode) {
      stream.markdown(
        "java-tutor は、開いている Java プロジェクト全体をレビューして、答えではなくヒントを `HINTS.md` に書きます。\n\n" +
          "- `/review` … 最初のレビュー\n" +
          "- `/check` … 直したあとの合格チェック\n" +
          "- `/hint 3 〜` … ヒント3について質問する（答えのコードは出しません）\n" +
          "- `/new` … 今のコードに合わせてヒントを出し直す"
      );
      return {};
    }
    const out: Out = {
      progress: (m) => stream.progress(m),
      markdown: (m) => stream.markdown(m),
      done: (uri) => {
        stream.reference(uri);
        stream.button({ command: "vscode.open", title: `${HINTS_FILE} を開く`, arguments: [uri] });
      },
    };
    try {
      await run(mode, request.model, out, token, request.prompt);
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        stream.markdown(
          `\n\nモデルを呼び出せませんでした (${err.code})。Copilot にサインインしているか、利用上限に達していないか確認してください。`
        );
        return {};
      }
      throw err;
    }
    return {};
  };

  const tutor = vscode.chat.createChatParticipant("javaTutor.tutor", handler);
  tutor.iconPath = new vscode.ThemeIcon("mortar-board");
  tutor.followupProvider = {
    provideFollowups() {
      return [{ prompt: "", command: "check", label: "直したので合格チェック" }];
    },
  };
  context.subscriptions.push(tutor);

  // コマンドパレットからも呼べるようにする。チャットを開かずに使いたい人向け
  const fromPalette = (mode: Mode) => async () => {
    const model = await pickModel();
    if (!model) {
      return;
    }
    const src = new vscode.CancellationTokenSource();
    const messages: string[] = [];
    let opened: vscode.Uri | undefined;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "java-tutor", cancellable: true },
      async (progress, cancel) => {
        cancel.onCancellationRequested(() => src.cancel());
        await run(
          mode,
          model,
          {
            progress: (m) => progress.report({ message: m }),
            markdown: (m) => messages.push(m),
            done: (uri) => (opened = uri),
          },
          src.token
        );
      }
    );
    if (opened) {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(opened));
    } else if (messages.length) {
      vscode.window.showInformationMessage(messages.join(" ").replace(/`/g, ""));
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("javaTutor.review", fromPalette("review")),
    vscode.commands.registerCommand("javaTutor.check", fromPalette("check")),
    vscode.commands.registerCommand("javaTutor.openHints", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        return;
      }
      try {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(hintsUri(folder)));
      } catch {
        vscode.window.showInformationMessage(`${HINTS_FILE} がまだありません。まずレビューしてください。`);
      }
    })
  );
}

export function deactivate() {}
