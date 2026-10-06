import * as vscode from "vscode";
import { LEVELS, Level, isLevel } from "./prompt";
import { readHints, recordedLevel, countRemaining, extractResultTable, hintsUri, HINTS_FILE } from "./hints";

/**
 * 学生が迷わないための入口をまとめる。
 * - @java-tutor だけを送ったときの使い方とボタン
 * - 画面下のステータスバー（残りのヒント数）と、そこから開くメニュー
 * - レベルの切り替え
 * ボタンからは @java-tutor 付きでチャットに送るので、付け忘れて Copilot のエージェントに
 * 渡り、コードを書き換えられてしまう事故も防げる。
 */

export function settingLevel(): Level {
  const v = vscode.workspace.getConfiguration("javaTutor").get<string>("level", "初学者");
  return isLevel(v) ? v : "初学者";
}

function folder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

/** @java-tutor 付きでチャットに送る。partial なら入力欄に置くだけで送らない（質問を書いてもらう） */
export async function sendToTutor(query: string, partial = false): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: `@java-tutor ${query}`.trimEnd() + (partial ? " " : ""),
    isPartialQuery: partial,
  });
}

/** @java-tutor だけを送ったときの使い方 */
export async function renderHelp(stream: vscode.ChatResponseStream): Promise<void> {
  const f = folder();
  const hints = f ? await readHints(f) : undefined;
  const level = settingLevel();

  stream.markdown(
    "java-tutor は、開いている Java プロジェクト全体を読んで、答えではなくヒントを `HINTS.md` に書きます。" +
      "あなたのコードは書き換えません。\n\n"
  );

  stream.markdown(`**レベル：${level}**\n\n`);
  for (const l of LEVELS) {
    stream.button({ command: "javaTutor.setLevel", title: l === level ? `${l} ✓` : l, arguments: [l] });
  }

  stream.markdown(
    "\n\n**使い方**\n\n" +
      "1. 最初に「レビュー」を押す → プロジェクト直下に `HINTS.md` ができます\n" +
      "2. ヒントを読んで、自分の手でコードを直す\n" +
      "3. 直したら「合格チェック」を押す\n" +
      "4. わからないところは「質問する」から聞く\n\n"
  );

  if (!hints) {
    stream.button({ command: "javaTutor.chat", title: "レビュー", arguments: ["/review"] });
  } else {
    const remaining = countRemaining(hints);
    if (remaining !== undefined) {
      stream.markdown(`いまの残りのヒント：**${remaining}個**\n\n`);
    }
    stream.button({ command: "javaTutor.chat", title: "合格チェック", arguments: ["/check"] });
    stream.button({ command: "javaTutor.chat", title: "残りを見る", arguments: ["/status"] });
    stream.button({ command: "javaTutor.chat", title: "質問する", arguments: ["/hint", true] });
    stream.button({ command: "javaTutor.openHints", title: `${HINTS_FILE} を開く` });
  }

  stream.markdown(
    "\n\n> 自分で入力するときは、毎回先頭に `@java-tutor` を付けてください。" +
      "付けないと Copilot が答え、コードを書き換えてしまうことがあります。" +
      "チャットのモードは「Ask」にしておくと安心です。"
  );
}

/** /status：モデルを呼ばずに、HINTS.md の結果の表と残りの数だけを返す */
export async function renderStatus(stream: vscode.ChatResponseStream): Promise<number | undefined> {
  const f = folder();
  const hints = f ? await readHints(f) : undefined;
  if (!f || !hints) {
    stream.markdown(`${HINTS_FILE} がまだありません。まずレビューしてください。\n\n`);
    stream.button({ command: "javaTutor.chat", title: "レビュー", arguments: ["/review"] });
    return undefined;
  }
  const remaining = countRemaining(hints);
  const table = extractResultTable(hints);
  const level = recordedLevel(hints);
  stream.markdown(
    (remaining === undefined ? "" : remaining === 0 ? "**全部のヒントに合格しています。**\n\n" : `残りのヒントは **${remaining}個** です。\n\n`) +
      (level ? `レベル：${level}\n\n` : "") +
      (table ? `${table}\n\n` : "")
  );
  stream.reference(hintsUri(f));
  return remaining;
}

/** レベルを切り替える。すでにヒントがあってレベルが違うなら、出し直すかを聞く */
export async function setLevel(level?: string): Promise<void> {
  if (!isLevel(level)) {
    const pick = await vscode.window.showQuickPick(
      LEVELS.map((l) => ({ label: l, description: l === settingLevel() ? "いまのレベル" : "" })),
      { placeHolder: "java-tutor のレベルを選んでください" }
    );
    if (!pick) {
      return;
    }
    level = pick.label;
  }
  const f = folder();
  await vscode.workspace
    .getConfiguration("javaTutor")
    .update("level", level, f ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);

  const hints = f ? await readHints(f) : undefined;
  const recorded = hints ? recordedLevel(hints) : undefined;
  if (hints && recorded && recorded !== level) {
    const again = "新規レビューで出し直す";
    const choice = await vscode.window.showInformationMessage(
      `レベルを「${level}」にしました。いまの ${HINTS_FILE} は「${recorded}」で作ったものです。` +
        `合格チェックは「${recorded}」のまま続きます。`,
      again
    );
    if (choice === again) {
      await sendToTutor("/new");
    }
  } else {
    vscode.window.showInformationMessage(`レベルを「${level}」にしました。次のレビューから反映されます。`);
  }
}

/** ステータスバーから開くメニュー */
export async function showMenu(): Promise<void> {
  const f = folder();
  const hints = f ? await readHints(f) : undefined;
  type Item = vscode.QuickPickItem & { run: () => unknown };
  const items: Item[] = hints
    ? [
        { label: "$(check) 合格チェック", description: "直したあとに", run: () => sendToTutor("/check") },
        { label: "$(list-unordered) 残りを見る", run: () => sendToTutor("/status") },
        { label: "$(question) 質問する", description: "ヒントの番号と質問を書きます", run: () => sendToTutor("/hint", true) },
        { label: "$(go-to-file) HINTS.md を開く", run: () => vscode.commands.executeCommand("javaTutor.openHints") },
        { label: "$(refresh) 新規レビュー", description: "今のコードでヒントを出し直す", run: () => sendToTutor("/new") },
      ]
    : [{ label: "$(search) レビュー", description: "最初に1回", run: () => sendToTutor("/review") }];
  items.push(
    { label: "$(mortar-board) レベルを変える", description: `いま：${settingLevel()}`, run: () => setLevel() },
    { label: "$(info) 使い方を見る", run: () => sendToTutor("") }
  );
  const pick = await vscode.window.showQuickPick(items, { placeHolder: "java-tutor" });
  await pick?.run();
}

/** 画面下のステータスバー。HINTS.md があれば残りのヒント数を出す */
export function createStatusBar(context: vscode.ExtensionContext): () => Promise<void> {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = "javaTutor.menu";
  context.subscriptions.push(item);

  const refresh = async () => {
    const f = folder();
    const hints = f ? await readHints(f) : undefined;
    const remaining = hints ? countRemaining(hints) : undefined;
    item.text =
      remaining === undefined
        ? "$(mortar-board) java-tutor"
        : remaining === 0
          ? "$(mortar-board) java-tutor 全部合格"
          : `$(mortar-board) java-tutor 残り${remaining}`;
    item.tooltip = `java-tutor（レベル：${settingLevel()}）— クリックでメニュー`;
    item.show();
  };

  const f = folder();
  if (f) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(f, HINTS_FILE));
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    context.subscriptions.push(watcher);
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("javaTutor.level") && refresh())
  );
  void refresh();
  return refresh;
}
