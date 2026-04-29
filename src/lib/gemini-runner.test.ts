import { describe, expect, it } from "vitest";
import { extractJsonObject, stripCodeFences } from "./gemini-runner";

describe("stripCodeFences", () => {
  it("removes fenced wrappers", () => {
    expect(stripCodeFences('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });
});

describe("extractJsonObject", () => {
  it("extracts JSON after gemini yolo banner lines", () => {
    const raw = [
      "YOLO mode is enabled. All tool calls will be automatically approved.",
      "YOLO mode is enabled. All tool calls will be automatically approved.",
      '{"ok":true,"message":"hello"}',
    ].join("\n");

    expect(extractJsonObject(raw)).toBe('{"ok":true,"message":"hello"}');
  });

  it("extracts fenced JSON payload", () => {
    const raw = '```json\n{"title":"Doc","highlights":["a","b"]}\n```';
    expect(extractJsonObject(raw)).toBe(
      '{"title":"Doc","highlights":["a","b"]}',
    );
  });

  it("handles braces inside strings", () => {
    const raw =
      'preface\n{"markdown":"Example { brace } text","summary":"ok"}\npostface';
    expect(extractJsonObject(raw)).toBe(
      '{"markdown":"Example { brace } text","summary":"ok"}',
    );
  });
});
