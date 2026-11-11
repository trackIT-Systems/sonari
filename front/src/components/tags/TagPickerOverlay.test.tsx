import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TagPickerOverlay, { ConfirmOverlay } from "@/components/tags/TagPickerOverlay";

const options = [
  { tag: { key: "species", value: "Myotis daubentonii" }, count: 3 },
  { tag: { key: "species", value: "Pipistrellus pipistrellus" }, count: 2 },
  { tag: { key: "species", value: "Nyctalus noctula" }, count: 1 },
];

afterEach(cleanup);

const key = (k: string, target: Element = document.activeElement ?? document.body) =>
  act(() => {
    fireEvent.keyDown(target, { key: k });
  });
const activeOption = () => screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true");

function renderPicker() {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<TagPickerOverlay title="Pick" options={options} onSelect={onSelect} onClose={onClose} />);
  return { onSelect, onClose };
}

describe("TagPickerOverlay", () => {
  it("focuses the search field and starts on the first tag", () => {
    renderPicker();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect(activeOption()?.textContent).toContain("Myotis");
  });

  it("↓ / ↑ move through the tags and Enter picks one", () => {
    const { onSelect } = renderPicker();
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowUp");
    expect(activeOption()?.textContent).toContain("Pipistrellus");
    key("Enter");
    expect(onSelect).toHaveBeenCalledWith(options[1]);
  });

  it("stays on the last tag and the first", () => {
    const { onSelect } = renderPicker();
    for (let i = 0; i < 5; i++) key("ArrowDown");
    key("Enter");
    expect(onSelect).toHaveBeenLastCalledWith(options[2]);
    for (let i = 0; i < 5; i++) key("ArrowUp");
    key("Enter");
    expect(onSelect).toHaveBeenLastCalledWith(options[0]);
  });

  it("works when the search field lost the focus, and keeps the keys from the page", () => {
    const pageShortcut = vi.fn();
    window.addEventListener("keydown", pageShortcut);
    try {
      const { onSelect } = renderPicker();
      act(() => (document.activeElement as HTMLElement).blur());
      key("ArrowDown", document.body);
      key("Enter", document.body);
      expect(onSelect).toHaveBeenCalledWith(options[1]);
      // The arrow keys must not also move the spectrogram behind the picker
      expect(pageShortcut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", pageShortcut);
    }
  });

  it("typing filters the tags", () => {
    const { onSelect } = renderPicker();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nyct" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    key("Enter");
    expect(onSelect).toHaveBeenCalledWith(options[2]);
  });

  it("Esc and a click on the backdrop close it; a click picks a tag", () => {
    const { onSelect, onClose } = renderPicker();
    key("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("option")[2]);
    expect(onSelect).toHaveBeenCalledWith(options[2]);
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ConfirmOverlay", () => {
  it("Enter confirms and Esc cancels", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmOverlay title="Delete" message="Sure?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    key("Enter", document.body);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    key("Escape", document.body);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
