import { describe, expect, it } from "vitest";
import { isTerminalPaasStatus, SEGMENT_COUNT } from "../src/types";

describe("types", () => {
  it("SEGMENT_COUNT is 7 (a story always has 7 prompts/segments)", () => {
    expect(SEGMENT_COUNT).toBe(7);
  });

  it.each([
    ["completed", true],
    ["failed", true],
    ["canceled", true],
    ["timeout", true],
    ["pending", false],
    ["preparing", false],
    ["processing", false],
    ["unknown", false],
  ] as const)("isTerminalPaasStatus(%s) === %s", (status, expected) => {
    expect(isTerminalPaasStatus(status)).toBe(expected);
  });
});
