#!/usr/bin/env bun
/**
 * TypeScript差分チェックスクリプト
 *
 * Git diffで変更されたTypeScript/Vueファイルのみを対象に型チェックを実行する
 * エラー出力は絶対パスで出力し、VSCodeの.logファイルでCtrl+クリック可能にする
 *
 * 使い方:
 *   pnpm typecheck:diff          # すべての変更をチェック（変更されたファイルと新規ファイル）
 *   pnpm typecheck:diff --staged  # ステージングされた変更のみチェック
 *   pnpm typecheck:diff --base dev  # 指定ブランチとの差分をチェック
 *   pnpm typecheck:diff --checker vue-tsc  # 型チェッカーを指定（デフォルト: tsc）
 *
 * ファイル出力:
 *   pnpm typecheck:diff > errors.log  # エラーをファイルに保存
 */
import { createCommand } from "./cli";
import { main } from "./main";

// プログラムの作成と設定
const command = createCommand();

// 引数を解析
command.parse(Bun.argv);
const options = command.opts();

// エントリーポイント
const exitCode = await main({
  isStaged: options.staged,
  baseRef: options.base,
  headRef: options.head,
  typeChecker: options.checker,
  ignorePattern: options.ignorePattern,
});

process.exit(exitCode);
