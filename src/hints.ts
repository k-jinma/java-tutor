import * as vscode from "vscode";

export const HINTS_FILE = "HINTS.md";

export function hintsUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, HINTS_FILE);
}

export async function readHints(folder: vscode.WorkspaceFolder): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(hintsUri(folder));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

/** 拡張が書き込むのはこのファイルだけ。学生のソースには触れない */
export async function writeHints(folder: vscode.WorkspaceFolder, text: string): Promise<vscode.Uri> {
  const uri = hintsUri(folder);
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text.trimEnd() + "\n"));
  return uri;
}

/** モデルが全体を ```markdown で囲んで返すことがあるので外す */
export function stripFence(text: string): string {
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text);
  return m ? m[1] : text.trim();
}

const HINT_HEADING = /^## ヒント(\d+)[：:]/gm;

interface Section {
  number: number;
  start: number;
  end: number;
}

function hintSections(md: string): Section[] {
  const heads = [...md.matchAll(HINT_HEADING)].map((m) => ({ number: Number(m[1]), start: m.index ?? 0 }));
  return heads.map((h) => {
    const next = md.indexOf("\n## ", h.start + 1);
    return { number: h.number, start: h.start, end: next === -1 ? md.length : next + 1 };
  });
}

export function hintSection(md: string, n: number): string | undefined {
  const s = hintSections(md).find((x) => x.number === n);
  return s ? md.slice(s.start, s.end) : undefined;
}

/** バグのヒントに残した確認用の入力（<details> 内の ```text ブロック）を取り出す */
export function extractInputs(md: string): { hint: number; input: string }[] {
  const found: { hint: number; input: string }[] = [];
  for (const s of hintSections(md)) {
    const body = md.slice(s.start, s.end);
    const m = /<details>[\s\S]*?```text\r?\n([\s\S]*?)```[\s\S]*?<\/details>/.exec(body);
    if (m) {
      found.push({ hint: s.number, input: m[1] });
    }
  }
  return found;
}

/** HINTS.md に記録されたレベル（「レベル：中級」の行）。合格チェックはこのレベルで判定する */
export function recordedLevel(md: string): string | undefined {
  return /^レベル[：:]\s*(\S+)/m.exec(md)?.[1];
}

/** 結果の表で、合格・取り下げ以外の行の数。表が読めなければ undefined */
export function countRemaining(md: string): number | undefined {
  const table = extractResultTable(md);
  if (!table) {
    return undefined;
  }
  const rows = table
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith("|"))
    .slice(2); // 見出し行と区切り行
  const verdict = (row: string) => (row.split("|").filter((c) => c.trim()).pop() ?? "").trim();
  return rows.filter((l) => !/^(合格|取り下げ)/.test(verdict(l))).length;
}

/** チャットに出す要約。「合格チェックの結果」の表だけを抜く */
export function extractResultTable(md: string): string | undefined {
  const m = /## 合格チェックの結果\s*\n([\s\S]*?)(?=\n## )/.exec(md);
  return m?.[1].trim();
}
