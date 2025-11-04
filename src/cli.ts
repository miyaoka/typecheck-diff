/**
 * CLIコマンドの定義と引数解析
 */
import {
  Command,
  Option,
  InvalidArgumentError,
} from "@commander-js/extra-typings";

// 許可される型チェッカー
const ALLOWED_TYPE_CHECKERS = ["tsc", "vue-tsc"];

/**
 * Git参照（ブランチ、タグ、コミット等）の妥当性を検証する関数
 * 参照名にスペースが有るとrm -rfのようなコマンドになりかねない
 * またbranch.のような名前だと origin/branch...HEAD のようにおかしくなる
 */
function validateGitRef(value: string): string {
  // スペースのチェック
  if (/\s/.test(value)) {
    throw new InvalidArgumentError(`Ref name "${value}" cannot contain spaces`);
  }

  // ピリオドで開始・終了するかチェック
  if (value.startsWith(".") || value.endsWith(".")) {
    throw new InvalidArgumentError(
      `Ref name "${value}" cannot start or end with a period`,
    );
  }

  // 連続するピリオドのチェック
  if (value.includes("..")) {
    throw new InvalidArgumentError(
      `Ref name "${value}" cannot contain consecutive periods`,
    );
  }

  return value;
}

/**
 * 型チェッカーの種類を検証する関数
 * ここではtscとvue-tscだけに絞る
 */
function validateCheckerType(value: string): string {
  if (!ALLOWED_TYPE_CHECKERS.includes(value)) {
    throw new InvalidArgumentError(
      `Invalid type checker: "${value}". Available: ${ALLOWED_TYPE_CHECKERS.join(", ")}`,
    );
  }

  return value;
}

/**
 * CLIコマンドを作成する
 */
export function createCommand() {
  return new Command()
    .name("typecheck-diff")
    .description(
      "Git diffで変更されたTypeScript/Vueファイルのみを対象に型チェックを実行する",
    )
    .addOption(
      new Option("--staged", "ステージングされた変更のみチェック")
        .default(false)
        .conflicts("base"),
    )
    .addOption(
      new Option(
        "--base <ref>",
        "比較元の参照を指定（ブランチ、タグ、コミット等）",
      )
        .argParser(validateGitRef)
        .conflicts("staged"),
    )
    .addOption(
      new Option("--head <ref>", "比較先の参照を指定（デフォルト: HEAD）")
        .argParser(validateGitRef)
        .default("HEAD"),
    )
    .addOption(
      new Option("--checker <type>", "型チェッカーを指定")
        .default("tsc")
        .argParser(validateCheckerType),
    )
    .addOption(
      new Option(
        "--ignore-pattern <pattern>",
        "除外するエラーパターン（正規表現）",
      ),
    )
    .configureOutput({
      outputError: (str, write) => write(str),
    });
}
