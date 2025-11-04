import { describe, test, expect } from "bun:test";
import { createCommand } from "./cli";

describe("CLI引数解析", () => {
  test("--baseオプションでスペースを含む値が拒否される", () => {
    const program = createCommand();

    // エラーをキャッチするための設定
    program.exitOverride();
    program.configureOutput({
      outputError: () => {}, // エラー出力を抑制
    });

    expect(() => {
      program.parse(["--base", "rm -rf"], {
        from: "user",
      });
    }).toThrow(
      "error: option '--base <ref>' argument 'rm -rf' is invalid. Ref name \"rm -rf\" cannot contain spaces",
    );
  });

  test("--baseオプションでピリオドで終わる値が拒否される", () => {
    const program = createCommand();

    program.exitOverride();
    program.configureOutput({
      outputError: () => {},
    });

    expect(() => {
      program.parse(["--base", "feature."], {
        from: "user",
      });
    }).toThrow(
      "error: option '--base <ref>' argument 'feature.' is invalid. Ref name \"feature.\" cannot start or end with a period",
    );
  });

  test("--baseオプションで連続するピリオドを含む値が拒否される", () => {
    const program = createCommand();

    program.exitOverride();
    program.configureOutput({
      outputError: () => {},
    });

    expect(() => {
      program.parse(["--base", "feature..test"], {
        from: "user",
      });
    }).toThrow(
      "error: option '--base <ref>' argument 'feature..test' is invalid. Ref name \"feature..test\" cannot contain consecutive periods",
    );
  });

  test("--checkerオプションで無効な型チェッカーが拒否される", () => {
    const program = createCommand();

    program.exitOverride();
    program.configureOutput({
      outputError: () => {},
    });

    expect(() => {
      program.parse(["--checker", "invalid-checker"], { from: "user" });
    }).toThrow(
      "error: option '--checker <type>' argument 'invalid-checker' is invalid. Invalid type checker: \"invalid-checker\". Available: tsc, vue-tsc",
    );
  });

  test("有効なオプションが正しく解析される", () => {
    const program = createCommand();

    program.parse(["--base", "dev", "--checker", "vue-tsc"], { from: "user" });
    const options = program.opts();

    expect(options.base).toBe("dev");
    expect(options.checker).toBe("vue-tsc");
    expect(options.staged).toBe(false);
  });

  test("--stagedと--baseが同時に指定できない", () => {
    const program = createCommand();

    program.exitOverride();
    program.configureOutput({
      outputError: () => {},
    });

    expect(() => {
      program.parse(["--staged", "--base", "dev"], {
        from: "user",
      });
    }).toThrow(
      "error: option '--staged' cannot be used with option '--base <ref>'",
    );
  });
});
