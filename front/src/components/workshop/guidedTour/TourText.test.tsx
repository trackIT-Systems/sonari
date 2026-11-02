import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import TourText from "./TourText";

afterEach(cleanup);

describe("TourText", () => {
  it("renders key caps and button icons inline", () => {
    const { container } = render(
      <p>
        <TourText text="Press `c` or click {icon:create}, then drag." />
      </p>,
    );
    expect(container.querySelector("kbd")?.textContent).toBe("c");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("Press c or click , then drag.");
  });

  it("leaves unknown icons as plain text", () => {
    const { container } = render(<TourText text="{icon:nope}" />);
    expect(container.textContent).toBe("nope");
  });
});
