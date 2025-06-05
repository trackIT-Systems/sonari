import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Fragment, useRef, useEffect, useState } from "react";
import { useHover } from "react-use";
import { createPortal } from "react-dom";

import type { ReactNode } from "react";

export default function Tooltip({
  children,
  tooltip,
  placement = "right",
  offset = 8,
  interactive = false,
  portal = false, // Add portal option
}: {
  children: ReactNode;
  tooltip: ReactNode;
  placement?:
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-start"
  | "top-end"
  | "right-start"
  | "right-end"
  | "bottom-start"
  | "bottom-end"
  | "left-start"
  | "left-end";
  offset?: number;
  interactive?: boolean;
  portal?: boolean; // New prop to control portaling
}) {
  const content = <span className="max-w-fit">{children}</span>;
  const [hoverable, hovered] = useHover(content);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position when portaling
  useEffect(() => {
    if (hovered && portal && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (placement) {
        case "top":
          top = rect.top + window.scrollY - offset;
          left = rect.left + window.scrollX + rect.width / 2;
          break;
        case "right":
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.right + window.scrollX + offset;
          break;
        case "bottom":
          top = rect.bottom + window.scrollY + offset;
          left = rect.left + window.scrollX + rect.width / 2;
          break;
        case "left":
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.left + window.scrollX - offset;
          break;
        // Add other placements as needed
        default:
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.right + window.scrollX + offset;
      }

      setPosition({ top, left });
    }
  }, [hovered, portal, placement, offset]);

  // Generate positioning classes based on placement
  const getPositionClasses = (placement: string) => {
    const baseClasses = {
      "top": "bottom-full left-1/2 -translate-x-1/2",
      "top-start": "bottom-full left-0",
      "top-end": "bottom-full right-0",
      "bottom": "top-full left-1/2 -translate-x-1/2",
      "bottom-start": "top-full left-0",
      "bottom-end": "top-full right-0",
      "left": "right-full top-1/2 -translate-y-1/2",
      "left-start": "right-full top-0",
      "left-end": "right-full bottom-0",
      "right": "left-full top-1/2 -translate-y-1/2",
      "right-start": "left-full top-0",
      "right-end": "left-full bottom-0",
    };

    return baseClasses[placement as keyof typeof baseClasses] || baseClasses.right;
  };

  const getOffsetStyle = (placement: string) => {
    const offsetPx = `${offset}px`;

    if (placement.startsWith('top')) return { marginBottom: offsetPx };
    if (placement.startsWith('bottom')) return { marginTop: offsetPx };
    if (placement.startsWith('left')) return { marginRight: offsetPx };
    if (placement.startsWith('right')) return { marginLeft: offsetPx };
    return { marginLeft: offsetPx }; // default
  };

  const getTransformClasses = (placement: string) => {
    switch (placement) {
      case "top":
      case "bottom":
        return "-translate-x-1/2";
      case "left":
      case "right":
        return "-translate-y-1/2";
      default:
        return "";
    }
  };

  const tooltipContent = hovered && (
    <div
      className={`
      ${portal ? 'fixed' : 'absolute'} z-[9999] ${portal ? getTransformClasses(placement) : getPositionClasses(placement)}
      rounded p-2 shadow-lg bg-stone-50 dark:bg-stone-700 
      text-stone-600 dark:text-stone-400 text-sm pointer-events-none
      transition duration-100 ease-out
      animate-in fade-in-0 zoom-in-95 whitespace-nowrap
    `}
      style={portal ? {
        top: position.top,
        left: position.left,
      } : getOffsetStyle(placement)}
    >
      {tooltip}
    </div>
  );

  return (
    <Popover as="div" className="relative inline-block">
      <div ref={triggerRef}>
        {interactive ? (
          <PopoverButton as={Fragment}>{hoverable}</PopoverButton>
        ) : (
          <div>{hoverable}</div>
        )}
      </div>

      {portal && typeof document !== 'undefined'
        ? createPortal(tooltipContent, document.body)
        : tooltipContent
      }
    </Popover>
  );
}