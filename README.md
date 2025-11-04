# typecheck-diff

Git 差分に基づいて変更されたファイルのみを対象に型チェックを実行する高速ツール

## 使い方

デフォルト（オプションなし）では、working tree の全変更（コミットされていない変更 + 新規ファイル）をチェックします。

```bash
# working treeの全変更（未コミットの変更）をチェック
typecheck-diff

# ステージングされた変更のみチェック
typecheck-diff --staged

# 特定のベースrefとの差分をチェック（ブランチ、タグ、コミット等）
typecheck-diff --base origin/develop
typecheck-diff --base=develop  # この書き方も可能
typecheck-diff --base v1.0.0   # タグも指定可能

# 比較先のrefを指定（デフォルト: HEAD）
typecheck-diff --base origin/main --head feature/branch

# 特定のチェッカーを使用（デフォルト: tsc）
typecheck-diff --checker vue-tsc
typecheck-diff --checker=vue-tsc  # この書き方も可能

# 特定のエラーパターンを除外（正規表現）
typecheck-diff --ignore-pattern "Property '\\$.*' does not exist"
typecheck-diff --ignore-pattern "error TS2339:"  # エラーコードで除外

# エラーをファイルに保存
typecheck-diff > errors.log

# ヘルプを表示
typecheck-diff --help
```

## オプション

### `--base <ref>`

比較の基準となる Git 参照を指定します。ブランチ、タグ、コミットハッシュなどが指定可能です。
指定した ref と`--head`の差分をチェックします（デフォルトは`--head HEAD`）

### `--head <ref>`

比較先の Git 参照を指定します（デフォルト: `HEAD`）。
`--base`と組み合わせて使用し、`base..head`の差分をチェックします

### `--staged`

ステージングされた変更のみを対象にします。`--base`と同時に使用することはできません

### `--checker <command>`

使用する型チェッカーを指定します（デフォルト: `tsc`）

### `--ignore-pattern <pattern>`

除外するエラーパターンを正規表現で指定します。マッチしたエラーブロック全体が除外されます

例：

- `--ignore-pattern "Property '\\$.*' does not exist"` - Vue.js の`$t`、`$store`などのグローバルプロパティエラーを除外
- `--ignore-pattern "error TS2339:"` - 特定の TypeScript エラーコード（TS2339）を除外

### `--help, -h`

ヘルプメッセージを表示します

## 仕組み

### 1. 差分の取得

Git コマンドを使用して変更された TypeScript ファイルを特定

### 2. 一時ディレクトリの作成

変更されたファイルのみを含む最小限の環境を構築

- プロジェクトの`node_modules/.cache`ディレクトリ内に一時的な`tsconfig.json`と`.tsbuildinfo`ファイルを作成
- これにより差分ファイルのみの高速な型チェックを実現

### 3. 型チェックの実行

指定されたチェッカーで差分ファイルのみをチェック

- 一時的な tsconfig.json で、元の tsconfig.json を継承しつつ`include`を差分ファイルのみに限定
- 型定義ファイル（\*.d.ts）は常に含めることで、外部ライブラリの型情報を維持
- インクリメンタルビルド機能を有効化し、`.tsbuildinfo`ファイルで前回の型チェック結果をキャッシュ
- 型チェッカーの出力から差分ファイルのエラーのみを抽出して表示

### 4. 結果の表示

エラーがある場合は標準出力に、進捗情報は標準エラー出力に表示

- 型エラー（メインの出力）は標準出力へ出力
- エラーパスは絶対パスに変換され、VSCode などのエディタでクリック可能
- 進捗表示（診断情報）は標準エラー出力へ出力
- これにより `typecheck-diff > errors.log` でエラーのみをファイルに保存し、進捗は画面で確認可能

## 実装詳細

このツールはビルドステップなしで TypeScript を直接実行します：

- **Bun ランタイム**: エントリーポイント（index.ts）に shebang `#!/usr/bin/env bun` を記述
- **pnpm の自動処理**: shebang を読み取り、Bun で実行するラッパースクリプトを `node_modules/.bin` に生成
- **即座に利用可能**: TypeScript のトランスパイル不要で、変更が即座に反映される

## パフォーマンス

プロジェクト全体の型チェックと比較して、変更されたファイルのみをチェックするため：

- 大規模プロジェクトでも数秒で完了
- CI/CD パイプラインでの高速フィードバック
- 開発中の即座なエラー検出

## CI/CD 統合

### GitHub Actions + Reviewdog

モノレポ環境で各ワークスペースの typecheck:diff を実行して CI 統合する（型エラー内容を reviewdog に渡す）には下記のようにします。

モノレポルートの`package.json`での設定例：

```json
"typecheck:diff": "pnpm -r --parallel --no-bail --reporter=append-only --reporter-hide-prefix typecheck:diff"
```

各オプションの役割：

- `-r`: 全ワークスペースで再帰的に実行（デフォルトで 4 並列）
- `--parallel`: トポロジカル順序を無視して全ワークスペースを同時実行し、出力をストリーミング
- `--no-bail`: エラーがあっても全ワークスペースの実行を継続
- `--reporter=append-only`: 完了したタスクの出力を順次追加（バッファリングなし）
- `--reporter-hide-prefix`: ワークスペース名のプレフィックスを除去（append-only と組み合わせ必須）

**重要**: `--reporter-hide-prefix`により、各ワークスペースからの型エラー出力が統一されたフォーマットで出力されます。これにより、Reviewdog などの CI ツールがエラーを正しく解析し、PR 上にアノテーションを追加できます。

GitHub Actions での使用例：

```yaml
- name: Run typecheck:diff
  run: |
    pnpm typecheck:diff --base=${{ github.base_ref }} | reviewdog -f=tsc -reporter=github-pr-annotations -fail-level=error
```

## 制限事項

- **型の波及的な影響は検出されません**:
  - 例: `utils.ts` で関数の戻り値の型を変更しても、それをインポートしている `main.ts` に差分がなければ、`main.ts` の型エラーは検出されません
  - このツールは差分のあるファイルのみをチェックするため、エクスポートされた型や関数のシグネチャ変更による他ファイルへの影響は見逃される可能性があります
- プロジェクトルートに`tsconfig.json`が必要です
- Git リポジトリ内で実行する必要があります
