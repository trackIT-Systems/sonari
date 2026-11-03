import { describe, expect, it } from "vitest";

import { filenameFromContentDisposition } from "./contentDisposition";

describe("filenameFromContentDisposition", () => {
  it("drops the quotes around a quoted filename", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="rec.wav"'),
    ).toBe("rec.wav");
  });

  it("reads a bare filename", () => {
    expect(
      filenameFromContentDisposition("attachment; filename=export.csv"),
    ).toBe("export.csv");
  });

  it("stops at the next parameter", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="a.flac"; size=10'),
    ).toBe("a.flac");
  });

  it("prefers the RFC 5987 extended filename", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=utf-8''M%C3%BCnster%20night.wav",
      ),
    ).toBe("Münster night.wav");
  });

  it("returns null without a filename", () => {
    expect(filenameFromContentDisposition("attachment")).toBeNull();
    expect(filenameFromContentDisposition(undefined)).toBeNull();
  });
});
