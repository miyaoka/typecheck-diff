/**
 * 型チェック関連の処理
 */
import * as fs from "fs";
import * as path from "path";
import { $ } from "bun";
import { printResult } from "./utils";
// 定数定義
const CACHE_DIR_PATH = ["node_modules", ".cache", "typecheck-diff"] as const;
const TSCONFIG_DIFF_FILENAME = "tsconfig.diffcheck.json";
const TSCONFIG_BUILD_INFO_FILENAME = "tsconfig.tsbuildinfo";

/**
 * キャッシュディレクトリを作成する
 * @returns キャッシュディレクトリのパス
 */
function ensureCacheDir(): string {
  const cacheDir = path.join(...CACHE_DIR_PATH);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

/**
 * 差分ファイルのみを対象とするtsconfig.jsonを動的に生成
 *
 * 既存のtsconfig.jsonを継承し、チェック対象を限定することで
 * 型チェックの実行時間を短縮する
 *
 * @param files チェック対象のファイルパス配列
 */
export function createDiffTsConfig(files: string[]): string {
  const cacheDir = ensureCacheDir();
  const tsconfigPath = path.join(cacheDir, TSCONFIG_DIFF_FILENAME);

  // キャッシュディレクトリからプロジェクトルートへの相対パスを動的に計算
  const rootRelativePath = path.relative(cacheDir, process.cwd());

  const tsconfig = {
    extends: path.join(rootRelativePath, "tsconfig.json"),
    include: [
      // グローバル型定義ファイルを含める（@types、ambient modules等）
      path.join(rootRelativePath, "**/*.d.ts"),
      // 差分ファイルのみを対象に追加
      ...files.map((file) => path.join(rootRelativePath, file)),
    ],
    compilerOptions: {
      noEmit: true,
      incremental: true,
      tsBuildInfoFile: `./${TSCONFIG_BUILD_INFO_FILENAME}`, // 同じディレクトリに保存
    },
  };

  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
  return tsconfigPath;
}

/**
 * TypeScriptエラー出力をパースして差分ファイルのエラーのみを抽出
 *
 * 型チェッカーの出力から差分ファイルに関連するエラーのみをフィルタリングし、
 * VSCodeでクリック可能な絶対パス形式で出力する
 *
 * @param output 型チェッカーの標準出力・エラー出力
 * @param targetFiles 差分チェック対象のファイルパス配列
 * @param ignorePattern 除外するエラーパターン（正規表現）
 * @returns 差分ファイルに関連するエラーメッセージの配列
 */
export function parseTypeScriptErrors(
  output: string,
  targetFiles: string[],
  ignorePattern?: string,
): string[] {
  const lines = output.split("\n");
  const diffFilePaths = new Set(targetFiles.map((f) => path.resolve(f)));
  const relevantErrors: string[] = [];
  const currentDir = process.cwd();
  let isRelevantError = false;
  let currentErrorBlock: string[] = [];
  // TypeScriptエラー行をパースする正規表現: ファイルパス(行番号,列番号): エラー内容
  const errorLinePattern = /^(.+?)\((\d+),(\d+)\):(.*)$/;
  // 除外パターンの正規表現を作成
  const ignoreRegex = ignorePattern ? new RegExp(ignorePattern) : null;

  for (const line of lines) {
    const errorMatch = line.match(errorLinePattern);

    if (errorMatch) {
      // 前のエラーブロックを処理
      if (currentErrorBlock.length > 0 && isRelevantError) {
        // エラーブロック全体をチェック
        const errorBlockText = currentErrorBlock.join("\n");
        if (!ignoreRegex || !ignoreRegex.test(errorBlockText)) {
          relevantErrors.push(...currentErrorBlock);
        }
      }

      // 新しいエラー行を検出
      const [, filePath, lineNum, colNum, restOfLine] = errorMatch;
      const errorFile = path.resolve(filePath);
      isRelevantError = diffFilePaths.has(errorFile);
      currentErrorBlock = [];

      if (isRelevantError) {
        // 相対パスから絶対パス形式に変換
        // 実行ディレクトリに関わらず参照できるように絶対パスにする
        const absolutePath = path.join(currentDir, filePath);
        currentErrorBlock.push(
          `${absolutePath}(${lineNum},${colNum}):${restOfLine}`,
        );
      }
    } else if (isRelevantError && line.trim()) {
      // エラーの詳細情報（複数行にわたる場合）
      currentErrorBlock.push(line);
    } else if (!line.trim()) {
      // 空行でエラーブロックの終了
      if (currentErrorBlock.length > 0 && isRelevantError) {
        const errorBlockText = currentErrorBlock.join("\n");
        if (!ignoreRegex || !ignoreRegex.test(errorBlockText)) {
          relevantErrors.push(...currentErrorBlock);
        }
      }
      isRelevantError = false;
      currentErrorBlock = [];
    }
  }

  // 最後のエラーブロックを処理
  if (currentErrorBlock.length > 0 && isRelevantError) {
    const errorBlockText = currentErrorBlock.join("\n");
    if (!ignoreRegex || !ignoreRegex.test(errorBlockText)) {
      relevantErrors.push(...currentErrorBlock);
    }
  }

  return relevantErrors;
}

/**
 * 型チェッカーを実行し、差分ファイルのエラーのみをフィルタリング
 *
 * @param files チェック対象のファイルパス配列
 * @param typeChecker 使用する型チェッカー（tsc、vue-tsc等）
 * @param tsconfigPath tsconfigファイルのパス
 * @param ignorePattern 除外するエラーパターン（正規表現）
 * @returns 型チェックが成功したかどうか
 */
export async function runTypeCheck(
  files: string[],
  typeChecker: string,
  tsconfigPath: string,
  ignorePattern?: string,
): Promise<boolean> {
  // 指定された型チェッカーを実行
  const { stdout, stderr, exitCode } =
    await $`${typeChecker} --project ${tsconfigPath}`.quiet().nothrow();

  // エラーなしの場合
  if (exitCode === 0) {
    return true;
  }

  // コマンド実行エラー（コマンドが見つからない等）
  const stderrStr = stderr.toString().trim();
  if (stderrStr) {
    printResult(stderrStr);
    return false;
  }

  // 型エラー

  // 標準出力と標準エラー出力を結合
  const output = stdout.toString() + stderr.toString();
  // 差分ファイルのエラーのみを抽出
  const relevantErrors = parseTypeScriptErrors(output, files, ignorePattern);

  if (relevantErrors.length > 0) {
    printResult("TypeScript errors found in changed files:");
    printResult(relevantErrors.join("\n"));
    return false;
  }

  // 他のファイルのエラーのみの場合は成功扱い
  return true;
}
