/**
 * Git関連のユーティリティ関数
 */
import * as path from "path";
import { $ } from "bun";
import type { TypeCheckOptions } from "./types";
import { printProgress } from "./utils";

// TypeScript/Vueファイルを識別する正規表現
const TYPESCRIPT_FILE_EXTENSIONS = /\.(ts|tsx|vue)$/;

interface DiffConfig {
  target: string;
  mode: string;
}

interface RepositoryPaths {
  repoRoot: string;
  currentDir: string;
  relativePath: string;
}

/**
 * リポジトリのパス情報を取得
 */
export async function getRepositoryPaths(): Promise<RepositoryPaths> {
  const {
    stdout: gitRoot,
    stderr,
    exitCode,
  } = await $`git rev-parse --show-toplevel`.quiet().nothrow();

  if (exitCode !== 0) {
    throw new Error(
      `git rev-parse failed with exit code ${exitCode}: ${stderr}`,
    );
  }

  const repoRoot = gitRoot.toString().trim();
  const currentDir = process.cwd();
  const relativePath = path.relative(repoRoot, currentDir);

  return { repoRoot, currentDir, relativePath };
}

/**
 * git diffで変更されたファイルを取得
 *
 * @param relativePath リポジトリルートから現在ディレクトリへの相対パス
 * @param target diffターゲット（HEAD、--staged等）
 * @returns 変更されたファイルのリスト（現在ディレクトリからの相対パス）
 */
export async function getChangedFiles(
  relativePath: string,
  target: string,
): Promise<string[]> {
  // git diff --diff-filter=d で削除ファイルを除外して取得
  // これにより後続のfs.existsSyncチェックが不要になる
  const diffCommand = $`git diff ${target} --name-only --diff-filter=d`;
  const { stdout, stderr, exitCode } = await diffCommand.quiet().nothrow();

  if (exitCode !== 0) {
    throw new Error(`git diff failed with exit code ${exitCode}: ${stderr}`);
  }

  const output = stdout.toString().trim();
  if (!output) {
    return [];
  }

  return (
    output
      .split("\n")
      // 現在のworkspace配下のファイルのみ対象
      .filter((file) => file.startsWith(relativePath))
      // リポジトリルートパスから現在ディレクトリの相対パスに変換
      .map((file) => path.relative(relativePath, file))
  );
}

/**
 * git ls-filesで未追跡の新規ファイルを取得
 *
 * @returns 新規ファイルのリスト（現在ディレクトリからの相対パス）
 */
export async function getUntrackedFiles(): Promise<string[]> {
  const untrackedCommand = $`git ls-files --others --exclude-standard`;
  const { stdout, stderr, exitCode } = await untrackedCommand.quiet().nothrow();

  if (exitCode !== 0) {
    throw new Error(
      `git ls-files failed with exit code ${exitCode}: ${stderr}`,
    );
  }

  const output = stdout.toString().trim();
  if (!output) {
    return [];
  }

  // ls-filesは現在ディレクトリからの相対パスを返すため、そのまま使用
  return output.split("\n");
}

/**
 * git diffのオプションとモードを取得
 */
export function getDiffConfig(options: TypeCheckOptions): DiffConfig {
  if (options.baseRef) {
    // ..でベースからヘッドまでの直接差分を取る
    return {
      target: `${options.baseRef}..${options.headRef}`,
      mode: `diff from ${options.baseRef}`,
    };
  }
  if (options.isStaged) {
    return {
      target: "--staged",
      mode: "staged",
    };
  }
  return {
    target: options.headRef,
    mode: "working tree",
  };
}

/**
 * 2つのファイルリストを重複なくマージ
 */
function mergeFileLists(list1: string[], list2: string[]): string[] {
  const uniqueFiles = new Set(list1);
  list2.forEach((file) => uniqueFiles.add(file));
  return Array.from(uniqueFiles);
}

/**
 * Git diffで変更されたファイルと新規ファイルを取得
 *
 * モノレポ対応：現在のworkspaceディレクトリ配下のファイルのみを対象とする
 *
 * @param options コマンドラインオプション
 * @returns 現在のディレクトリからの相対パスのファイル配列
 */
export async function getDiffFiles(
  options: TypeCheckOptions,
): Promise<string[]> {
  const diffConfig = getDiffConfig(options);

  // モノレポのルートと現在のディレクトリの関係を取得
  const { relativePath } = await getRepositoryPaths();

  // 変更ファイルの取得
  const changedFiles = await getChangedFiles(relativePath, diffConfig.target);

  // 新規ファイルの取得（working treeモードのみ）
  const newFiles =
    !options.isStaged && !options.baseRef ? await getUntrackedFiles() : [];

  // ファイルリストの結合（重複を除外）
  const allFiles = mergeFileLists(changedFiles, newFiles);

  // TypeScriptとVueファイルのみフィルタリング
  // 実際はフィルタリングせずにtsconfigに設定しても大丈夫だが
  // typecheckしないファイルがログに出ないようにする
  const typeCheckFiles = allFiles.filter((file) =>
    TYPESCRIPT_FILE_EXTENSIONS.test(file),
  );

  if (typeCheckFiles.length === 0) {
    printProgress("No TypeScript files found in changes.");
  }

  return typeCheckFiles;
}
