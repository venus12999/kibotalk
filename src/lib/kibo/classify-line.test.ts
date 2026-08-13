import { describe, expect, test } from "vitest";
import { angleFor, classifyLine } from "./classify-line";

describe("classifyLine", () => {
  test("closed yes/no questions", () => {
    expect(classifyLine("Do you have experience with React?")).toBe("closed");
    expect(classifyLine("Is this your first time here?")).toBe("closed");
    expect(classifyLine("可以加班吗？")).toBe("closed");
    expect(classifyLine("大丈夫ですか？")).toBe("closed");
  });

  test("open requests", () => {
    expect(classifyLine("What can you do?")).toBe("open");
    expect(classifyLine("Tell me about yourself.")).toBe("open");
    expect(classifyLine("怎么去车站？")).toBe("open");
    expect(classifyLine("どんな仕事をしていますか？")).toBe("open");
  });

  test("statements / small talk", () => {
    expect(classifyLine("I like coffee.")).toBe("statement");
    expect(classifyLine("今天天气不错。")).toBe("statement");
    expect(classifyLine("")).toBe("statement");
  });
});

describe("angleFor", () => {
  test("returns three distinct closed angles", () => {
    const a = [angleFor("closed", 0), angleFor("closed", 1), angleFor("closed", 2)];
    expect(new Set(a).size).toBe(3);
    expect(a[0]).toMatch(/YES/i);
    expect(a[1]).toMatch(/NO/i);
  });
});
