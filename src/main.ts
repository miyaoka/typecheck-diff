/**
 * メイン処理
 */
import type { TypeCheckOptions } from "./types";
import { printProgress } from "./utils";
import { getDiffFiles, getDiffConfig } from "./git";
import { createDiffTsConfig, runTypeCheck } from "./typecheck";

/**
 * メイン処理
 *
 * Git差分に基づいて型チェックを実行する全体的なフロー：
 * 1. Git diffで変更ファイルを取得
 * 2. 差分用のtsconfig.jsonを生成
 * 3. 型チェッカーで型チェック実行
 * 4. 差分ファイルのエラーのみを出力
 *
 * @returns 終了コード（0: 成功, 1: エラー）
 */
export async function main(options: TypeCheckOptions): Promise<number> {
  try {
    // 変更されたファイルを取得
    const files = await getDiffFiles(options);

    if (files.length === 0) {
      return 0;
    }

    // 進捗表示：チェック対象ファイル一覧
    printProgress(`Checking ${files.length} changed files:`);
    files.forEach((file) => printProgress(`  - ${file}`));
    printProgress("");

    // 差分チェック用の設定ファイルを生成
    const tsconfigPath = createDiffTsConfig(files);

    // 型チェックを実行
    const success = await runTypeCheck(
      files,
      options.typeChecker,
      tsconfigPath,
      options.ignorePattern,
    );

    // 成功時のメッセージ
    if (success) {
      const diffConfig = getDiffConfig(options);
      printProgress(`✅ Type check passed for ${diffConfig.mode} files.`);
    }

    // 終了コードを返す
    return success ? 0 : 1;
  } catch (error) {
    printProgress(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
