import { describe, expect, test } from "bun:test";

import { parseLatestMarkerInt } from "./session-markers";

describe("parseLatestMarkerInt", () => {
  test("returns null when snapshot is missing", () => {
    expect(parseLatestMarkerInt(null, "__PID__")).toBeNull();
  });

  test("returns the last marker value when multiple are present", () => {
    expect(parseLatestMarkerInt("__PID__101\n__PID__202\n", "__PID__")).toBe(202);
  });

  test("parses other markers independently", () => {
    expect(parseLatestMarkerInt("__FRESH__300\n__FRESH__301\n", "__FRESH__")).toBe(301);
  });

  test("escapes marker text safely", () => {
    expect(parseLatestMarkerInt("a+b?7\na+b?9\n", "a+b?")).toBe(9);
  });
});
