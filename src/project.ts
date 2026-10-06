import * as vscode from "vscode";
import { execFile, spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface SourceFile {
  rel: string;
  uri: vscode.Uri;
  text: string;
}

/** コンパイル結果や IDE の作業フォルダ。学生が書いたソースではない */
const EXCLUDE = "{**/bin/**,**/target/**,**/build/**,**/out/**,**/node_modules/**,**/.git/**}";

/** モデルに渡すソースの上限（文字数）。演習規模なら十分に収まる */
export const MAX_SOURCE_CHARS = 200_000;

export async function collectSources(folder: vscode.WorkspaceFolder): Promise<SourceFile[]> {
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*.java"),
    new vscode.RelativePattern(folder, EXCLUDE)
  );
  const files: SourceFile[] = [];
  for (const uri of uris) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    files.push({ rel: vscode.workspace.asRelativePath(uri, false), uri, text: new TextDecoder().decode(bytes) });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** 行番号つきで並べる。モデルが「DVD.java:14」のように指せるようにする */
export function renderSources(files: SourceFile[]): string {
  return files
    .map((f) => {
      const lines = f.text.split(/\r?\n/);
      const width = String(lines.length).length;
      const body = lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`).join("\n");
      return `=== ${f.rel}\n${body}`;
    })
    .join("\n\n");
}

function tool(name: "javac" | "java"): string {
  const home = vscode.workspace.getConfiguration("javaTutor").get<string>("javaHome", "");
  return home ? path.join(home, "bin", name) : name;
}

export interface BuildResult {
  /** javac が見つからなかったときは false。コンパイルの可否は判断できない */
  javacFound: boolean;
  ok: boolean;
  output: string;
  outDir: string;
}

/**
 * 一時フォルダにコンパイルする。学生のプロジェクトにはファイルを増やさない。
 * ファイル数が多いと Windows のコマンドライン長を超えるので、@引数ファイルで渡す。
 */
export async function compile(files: SourceFile[]): Promise<BuildResult> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "java-tutor-"));
  const argFile = path.join(outDir, "sources.txt");
  await fs.writeFile(
    argFile,
    files.map((f) => `"${f.uri.fsPath.replace(/\\/g, "/")}"`).join("\n"),
    "utf8"
  );
  const classes = path.join(outDir, "classes");
  return new Promise((resolve) => {
    execFile(
      tool("javac"),
      ["-J-Dstdout.encoding=UTF-8", "-J-Dstderr.encoding=UTF-8", "-encoding", "UTF-8", "-d", classes, `@${argFile}`],
      { timeout: 60_000, encoding: "utf8" },
      (err, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ javacFound: false, ok: false, output: "", outDir });
          return;
        }
        resolve({ javacFound: true, ok: !err, output, outDir: classes });
      }
    );
  });
}

/** main メソッドを持つクラスの完全修飾名。複数あれば最初のもの */
export function findMainClass(files: SourceFile[]): string | undefined {
  for (const f of files) {
    if (!/static\s+void\s+main\s*\(/.test(f.text)) {
      continue;
    }
    const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(f.text)?.[1];
    const cls = path.basename(f.rel, ".java");
    return pkg ? `${pkg}.${cls}` : cls;
  }
  return undefined;
}

const MAX_RUN_OUTPUT = 8_000;

/** 対話型のコンソールアプリに、入力をまとめて標準入力から流し込んで実行する */
export function runWithInput(classesDir: string, mainClass: string, input: string): Promise<string> {
  const seconds = vscode.workspace.getConfiguration("javaTutor").get<number>("runTimeoutSeconds", 10);
  return new Promise((resolve) => {
    const child = spawn(tool("java"), [
      "-Dfile.encoding=UTF-8",
      "-Dstdout.encoding=UTF-8",
      "-Dstdin.encoding=UTF-8",
      "-cp",
      classesDir,
      mainClass,
    ]);
    let out = "";
    const collect = (b: Buffer) => {
      if (out.length < MAX_RUN_OUTPUT) {
        out += b.toString("utf8");
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      child.kill();
      out += `\n（${seconds}秒で打ち切りました。無限ループか、入力待ちで止まっている可能性があります）`;
    }, seconds * 1000);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve(`実行できませんでした: ${e.message}`);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out.slice(0, MAX_RUN_OUTPUT));
    });
    child.stdin.end(input.endsWith("\n") ? input : input + "\n");
  });
}

export async function cleanup(dir: string): Promise<void> {
  // classes の親（mkdtemp で作ったフォルダ）ごと消す
  const root = path.basename(dir) === "classes" ? path.dirname(dir) : dir;
  await fs.rm(root, { recursive: true, force: true });
}
