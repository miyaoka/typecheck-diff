/**
 * 型定義
 */

export interface TypeCheckOptions {
  isStaged: boolean;
  baseRef?: string;
  headRef: string;
  typeChecker: string;
  ignorePattern?: string;
}
