import { describe, expect, test } from "vitest";

import { parseCandidates } from "./suggest-stream";

const texts = (buffer: string) => parseCandidates(buffer).map((c) => c.text);

describe("parseCandidates — the happy path", () => {
  test("parses one compact JSON object per line", () => {
    const buffer = [
      '{"targetText":"It was great.","meaning":"很好。"}',
      '{"targetText":"Pretty busy.","meaning":"挺忙的。"}',
      '{"targetText":"Nothing special.","meaning":"没什么特别的。"}',
    ].join("\n");
    expect(texts(buffer)).toEqual(["It was great.", "Pretty busy.", "Nothing special."]);
    expect(parseCandidates(buffer)[0]?.meaning).toBe("很好。");
  });

  test("keeps segments and drops readings identical to the surface", () => {
    const buffer =
      '{"targetText":"元気です","meaning":"我很好","segments":[{"t":"元気","r":"げんき","role":"content"},{"t":"です","r":"です","role":"particle"}]}';
    expect(parseCandidates(buffer)[0]?.segments).toEqual([
      { t: "元気", r: "げんき", role: "content" },
      { t: "です", role: "particle" },
    ]);
  });

  test("never returns more than three suggestions", () => {
    const buffer = Array.from(
      { length: 6 },
      (_, i) => `{"targetText":"Reply ${i}","meaning":"m"}`,
    ).join("\n");
    expect(texts(buffer)).toHaveLength(3);
  });
});

describe("parseCandidates — formats the model actually emits", () => {
  test("recovers objects wrapped in a markdown code fence", () => {
    const buffer = [
      "```json",
      '{"targetText":"Sounds good.","meaning":"听起来不错。"}',
      '{"targetText":"Let me think.","meaning":"让我想想。"}',
      "```",
    ].join("\n");
    expect(texts(buffer)).toEqual(["Sounds good.", "Let me think."]);
  });

  test("recovers pretty-printed objects spread over several lines", () => {
    const buffer = [
      "{",
      '  "targetText": "Hi there",',
      '  "meaning": "你好"',
      "}",
      "{",
      '  "targetText": "Good morning",',
      '  "meaning": "早上好"',
      "}",
    ].join("\n");
    expect(texts(buffer)).toEqual(["Hi there", "Good morning"]);
  });

  test("recovers objects returned inside a JSON array", () => {
    const buffer =
      '[{"targetText":"A","meaning":"a"},{"targetText":"B","meaning":"b"},{"targetText":"C","meaning":"c"}]';
    expect(texts(buffer)).toEqual(["A", "B", "C"]);
  });

  test("ignores prose the model puts before the JSON", () => {
    const buffer =
      'Here are three replies:\n{"targetText":"Yes, please.","meaning":"好的。"}';
    expect(texts(buffer)).toEqual(["Yes, please."]);
  });

  test("is not confused by braces or escaped quotes inside strings", () => {
    const buffer =
      '{"targetText":"He said \\"hi\\" {twice}","meaning":"他说了两次 {hi}"}\n{"targetText":"OK","meaning":"好"}';
    expect(texts(buffer)).toEqual(['He said "hi" {twice}', "OK"]);
  });
});

describe("parseCandidates — mid-stream partials", () => {
  test("shows the text of the object still being generated", () => {
    expect(texts('{"targetText":"It was gre')).toEqual(["It was gre"]);
  });

  test("keeps completed objects while the next one streams in", () => {
    const buffer =
      '{"targetText":"Done one","meaning":"一"}\n{"targetText":"Half tw';
    expect(texts(buffer)).toEqual(["Done one", "Half tw"]);
  });

  test("drops the dangling backslash of an unfinished escape", () => {
    expect(texts('{"targetText":"Line\\')).toEqual(["Line"]);
  });

  test("waits for the next frame when a unicode escape is half written", () => {
    expect(texts('{"targetText":"Line\\u00')).toEqual([]);
  });


  test("grows monotonically as deltas arrive", () => {
    const full = '{"targetText":"Sounds good to me.","meaning":"我同意。"}';
    for (let i = 1; i <= full.length; i++) {
      expect(parseCandidates(full.slice(0, i)).length).toBeLessThanOrEqual(1);
    }
    expect(texts(full)).toEqual(["Sounds good to me."]);
  });
});

describe("parseCandidates — plain-text fallback", () => {
  test("falls back to numbered plain lines", () => {
    expect(texts("1. Sounds good\n2. Sure thing\n3. Maybe later")).toEqual([
      "Sounds good",
      "Sure thing",
      "Maybe later",
    ]);
  });

  test("falls back to bulleted plain lines and strips the fence", () => {
    expect(texts("```\n- Yes\n- No\n```")).toEqual(["Yes", "No"]);
  });

  test("returns a single plain sentence rather than nothing", () => {
    expect(texts("That sounds great!")).toEqual(["That sounds great!"]);
  });

  test("returns nothing only when there is nothing to show", () => {
    expect(parseCandidates("")).toEqual([]);
    expect(parseCandidates("   \n\n  ")).toEqual([]);
  });

  test("an object with an empty targetText does not fake a suggestion", () => {
    expect(parseCandidates('{"targetText":"","meaning":"空"}')).toEqual([]);
  });
});
