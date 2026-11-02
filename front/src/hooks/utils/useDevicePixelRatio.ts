import { useEffect, useState } from "react";

function currentRatio() {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/**
 * The screen's device pixel ratio (2 on most HiDPI screens). Updates when it
 * changes, e.g. on browser zoom or when the window moves to another screen.
 */
export default function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(currentRatio);

  useEffect(() => {
    // Browser zoom fires resize; moving between screens changes the resolution
    // media query without one.
    let media: MediaQueryList | null = null;
    const update = () => {
      setRatio(currentRatio());
      media?.removeEventListener("change", update);
      media = window.matchMedia?.(`(resolution: ${currentRatio()}dppx)`) ?? null;
      media?.addEventListener("change", update);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      media?.removeEventListener("change", update);
    };
  }, []);

  return ratio;
}
