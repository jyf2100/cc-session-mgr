import { describe, it, expect } from "vitest";
import { renderJson } from "./json.js";

describe("renderJson", () => {
  it("serializes an object with 2-space indentation", () => {
    const result = renderJson({ name: "test", value: 42 });
    expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
  });

  it("serializes an array", () => {
    const result = renderJson([1, 2, 3]);
    expect(result).toBe("[\n  1,\n  2,\n  3\n]");
  });

  it("serializes nested objects", () => {
    const data = { projects: [{ name: "A", sessions: 5 }] };
    const result = renderJson(data);
    expect(result).toContain('"projects"');
    expect(result).toContain('"name": "A"');
    expect(result).toContain('"sessions": 5');
  });

  it("handles null and boolean values", () => {
    const result = renderJson({ a: null, b: true, c: false });
    expect(result).toContain('"a": null');
    expect(result).toContain('"b": true');
    expect(result).toContain('"c": false');
  });

  it("handles empty object", () => {
    const result = renderJson({});
    expect(result).toBe("{}");
  });
});
