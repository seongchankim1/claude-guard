import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("server", () => {
  it("builds without throwing", () => {
    expect(() => buildServer()).not.toThrow();
  });
});
