export function blurActiveElement() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) {
    el.blur();
  }
}

/** Nearest ancestor that actually scrolls vertically (ignores overflow-x wrappers). */
export function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
