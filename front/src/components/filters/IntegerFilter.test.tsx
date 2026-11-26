import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegerFilter, integerCountMatches } from "./Filters";

function setFirst(operation: string, value: string) {
  fireEvent.change(screen.getByLabelText("Amount: operation"), { target: { value: operation } });
  fireEvent.change(screen.getByLabelText("Amount: value"), { target: { value } });
}

function addSecond(operation: string, value: string) {
  fireEvent.click(screen.getByText(/^\+ and/));
  fireEvent.change(screen.getByLabelText("Amount: second operation"), { target: { value: operation } });
  fireEvent.change(screen.getByLabelText("Amount: second value"), { target: { value } });
}

describe("IntegerFilter", () => {
  afterEach(cleanup);

  it("sets an exact amount, with no second bound offered", () => {
    const onChange = vi.fn();
    render(<IntegerFilter name="Amount" onChange={onChange} />);
    setFirst("eq", "3");
    expect(screen.queryByText(/^\+ and/)).toBeNull();
    fireEvent.click(screen.getByText("set"));
    expect(onChange).toHaveBeenCalledWith({ eq: 3 });
  });

  it.each([
    ["gt", { gt: 2 }],
    ["ge", { ge: 2 }],
    ["lt", { lt: 2 }],
    ["le", { le: 2 }],
  ])("sets %s alone", (operation, expected) => {
    const onChange = vi.fn();
    render(<IntegerFilter name="Amount" onChange={onChange} />);
    setFirst(operation, "2");
    fireEvent.click(screen.getByText("set"));
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("sets a range: greater than x and smaller than y", () => {
    const onChange = vi.fn();
    render(<IntegerFilter name="Amount" onChange={onChange} />);
    setFirst("gt", "2");
    addSecond("lt", "5");
    fireEvent.click(screen.getByText("set"));
    expect(onChange).toHaveBeenCalledWith({ gt: 2, lt: 5 });
  });

  it("drops the second bound when removed", () => {
    const onChange = vi.fn();
    render(<IntegerFilter name="Amount" onChange={onChange} />);
    setFirst("ge", "1");
    addSecond("le", "4");
    fireEvent.click(screen.getByLabelText("Amount: remove second bound"));
    fireEvent.click(screen.getByText("set"));
    expect(onChange).toHaveBeenCalledWith({ ge: 1 });
  });

  it("starts from the range set so far", () => {
    render(<IntegerFilter name="Amount" value={{ ge: 1, lt: 3 }} onChange={vi.fn()} />);
    expect((screen.getByLabelText("Amount: operation") as HTMLSelectElement).value).toBe("ge");
    expect((screen.getByLabelText("Amount: value") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Amount: second operation") as HTMLSelectElement).value).toBe("lt");
    expect((screen.getByLabelText("Amount: second value") as HTMLInputElement).value).toBe("3");
  });

  it("refuses a range no amount fits", () => {
    const onChange = vi.fn();
    render(<IntegerFilter name="Amount" onChange={onChange} />);
    setFirst("gt", "4");
    addSecond("lt", "5");
    expect(screen.getByText("No amount fits both bounds.")).toBeTruthy();
    fireEvent.click(screen.getByText("set"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("integerCountMatches", () => {
  it("turns the bounds into the amounts they let through", () => {
    expect(integerCountMatches({ gt: 2, lt: 5 })).toEqual({ min: 3, max: 4 });
    expect(integerCountMatches({ ge: 2, le: 2 })).toEqual({ min: 2, max: 2 });
    expect(integerCountMatches({ gt: 1 })).toEqual({ min: 2, max: Infinity });
  });
});
