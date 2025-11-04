import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { parseTypeScriptErrors } from "./typecheck";

describe("parseTypeScriptErrors", () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    // テスト用の作業ディレクトリ
    process.cwd = () => "/home/user/project";
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  test("差分ファイルのエラーのみを抽出", () => {
    const output = `src/file1.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
  const num: number = 'string';
             ~~~~~~

src/other.ts(5,1): error TS2304: Cannot find name 'unknown'.
  unknown();
  ~~~~~~~

src/file2.ts(20,10): error TS2339: Property 'foo' does not exist on type 'Bar'.
  bar.foo();
      ~~~
`;

    const targetFiles = ["src/file1.ts", "src/file2.ts"];
    const errors = parseTypeScriptErrors(output, targetFiles);

    // 差分ファイルのエラーのみ含まれる
    expect(errors).toEqual([
      "/home/user/project/src/file1.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "  const num: number = 'string';",
      "             ~~~~~~",
      "/home/user/project/src/file2.ts(20,10): error TS2339: Property 'foo' does not exist on type 'Bar'.",
      "  bar.foo();",
      "      ~~~",
    ]);
  });

  test("複数行にわたるエラーメッセージ", () => {
    const output = `src/component.vue(15,3): error TS2322: Type '{ invalid: true; }' is not assignable to type 'Props'.
  Object literal may only specify known properties, and 'invalid' does not exist in type 'Props'.
    Type 'string' is not assignable to type 'number'.
      Types have separate declarations of a private property '_value'.

src/other.ts(5,1): error TS2304: Cannot find name 'test'.
`;

    const targetFiles = ["src/component.vue"];
    const errors = parseTypeScriptErrors(output, targetFiles);

    expect(errors).toEqual([
      "/home/user/project/src/component.vue(15,3): error TS2322: Type '{ invalid: true; }' is not assignable to type 'Props'.",
      "  Object literal may only specify known properties, and 'invalid' does not exist in type 'Props'.",
      "    Type 'string' is not assignable to type 'number'.",
      "      Types have separate declarations of a private property '_value'.",
    ]);
  });

  test("エラーがない場合", () => {
    const output = "Compilation complete. Watching for file changes.";
    const targetFiles = ["src/file1.ts"];
    const errors = parseTypeScriptErrors(output, targetFiles);

    expect(errors).toEqual([]);
  });

  test("絶対パスと相対パスの混在", () => {
    const output = `src/relative.ts(1,1): error TS2304: Cannot find name 'test'.
/absolute/path/file.ts(2,2): error TS2304: Cannot find name 'test2'.
./current/file.ts(3,3): error TS2304: Cannot find name 'test3'.
`;

    const targetFiles = ["src/relative.ts", "./current/file.ts"];
    const errors = parseTypeScriptErrors(output, targetFiles);

    expect(errors).toEqual([
      "/home/user/project/src/relative.ts(1,1): error TS2304: Cannot find name 'test'.",
      "/home/user/project/current/file.ts(3,3): error TS2304: Cannot find name 'test3'.",
    ]);
  });

  test("エラー詳細が空行で区切られている場合", () => {
    const output = `src/file1.ts(10,5): error TS2322: Type error.
  詳細行1
  詳細行2

  この行は次のエラーではない（インデントあり）

src/file2.ts(20,10): error TS2339: Property error.
`;

    const targetFiles = ["src/file1.ts"];
    const errors = parseTypeScriptErrors(output, targetFiles);

    expect(errors).toEqual([
      "/home/user/project/src/file1.ts(10,5): error TS2322: Type error.",
      "  詳細行1",
      "  詳細行2",
    ]);
  });

  describe("ignorePatternオプション", () => {
    test("指定したパターンにマッチするエラーを除外", () => {
      const output = `src/file1.ts(10,5): error TS2339: Property '$t' does not exist on type 'Component'.
  Property '$t' is not defined.

src/file2.ts(20,10): error TS2322: Type 'string' is not assignable to type 'number'.
  The types are incompatible.

src/file3.vue(30,15): error TS2339: Property '$store' does not exist on type 'Component'.
  Property '$store' is not defined.
`;

      const targetFiles = ["src/file1.ts", "src/file2.ts", "src/file3.vue"];
      const ignorePattern = "Property '\\$.*' does not exist";
      const errors = parseTypeScriptErrors(output, targetFiles, ignorePattern);

      // $t と $store のエラーは除外され、型の不一致エラーのみが含まれる
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.includes("TS2322"))).toBe(true);
      expect(errors.some((e) => e.includes("$t"))).toBe(false);
      expect(errors.some((e) => e.includes("$store"))).toBe(false);
    });

    test("ignorePatternが指定されていない場合は全てのエラーを含める", () => {
      const output = `src/file1.ts(10,5): error TS2339: Property '$t' does not exist on type 'Component'.
  Property '$t' is not defined.

src/file2.ts(20,10): error TS2322: Type 'string' is not assignable to type 'number'.
`;

      const targetFiles = ["src/file1.ts", "src/file2.ts"];
      const errors = parseTypeScriptErrors(output, targetFiles);

      // 全てのエラーが含まれる
      expect(errors.some((e) => e.includes("TS2339"))).toBe(true);
      expect(errors.some((e) => e.includes("TS2322"))).toBe(true);
      expect(errors.some((e) => e.includes("$t"))).toBe(true);
    });

    test("エラーコードで除外", () => {
      const output = `src/file1.ts(10,5): error TS2339: Property '$t' does not exist on type 'Component'.
  Property '$t' is not defined.

src/file2.ts(20,10): error TS2322: Type 'string' is not assignable to type 'number'.
  The types are incompatible.

src/file3.vue(30,15): error TS2339: Property 'foo' does not exist on type 'Component'.
  Property 'foo' is not defined.
`;

      const targetFiles = ["src/file1.ts", "src/file2.ts", "src/file3.vue"];
      const ignorePattern = "error TS2339:";
      const errors = parseTypeScriptErrors(output, targetFiles, ignorePattern);

      // TS2339エラーは全て除外され、TS2322のみが含まれる
      expect(errors.some((e) => e.includes("TS2339"))).toBe(false);
      expect(errors.some((e) => e.includes("TS2322"))).toBe(true);
    });
  });
});
