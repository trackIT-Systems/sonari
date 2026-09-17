export function blurActiveElement() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) {
    el.blur();
  }
}
