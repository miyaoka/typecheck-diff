/**
 * ユーティリティ関数
 */

// 出力用ヘルパー関数
// 結果はstdoutに出力（CIツールやパイプで結果を取得するため）
export const printResult = (message: string) => console.log(message);
// 進行状況はstderrに出力（標準出力の結果と混在させないため）
export const printProgress = (message: string) => console.error(message);
