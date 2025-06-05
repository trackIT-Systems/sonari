import { Popover as HeadlessPopover } from "@headlessui/react";

import type { ReactElement, ReactNode } from "react";

export default function Popover({
  button,
  children,
  placement = "bottom",
  offset = 4,
}: {
  button: ReactNode;
  children: ({ close }: { close: () => void }) => ReactElement;
  placement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top-start"
    | "top-end"
    | "bottom-start"
    | "bottom-end"
    | "left-start"
    | "left-end"
    | "right-start"
    | "right-end";
  autoPlacement?: boolean;
  offset?: number;
}) {
  // Generate positioning classes based on placement
  const getPositionClasses = (placement: string) => {
    const offsetClass = `${Math.abs(offset)}`;
    
    switch (placement) {
      case "top":
        return `bottom-full left-1/2 -translate-x-1/2 mb-${offsetClass}`;
      case "top-start":
        return `bottom-full left-0 mb-${offsetClass}`;
      case "top-end":
        return `bottom-full right-0 mb-${offsetClass}`;
      case "bottom":
        return `top-full left-1/2 -translate-x-1/2 mt-${offsetClass}`;
      case "bottom-start":
        return `top-full left-0 mt-${offsetClass}`;
      case "bottom-end":
        return `top-full right-0 mt-${offsetClass}`;
      case "left":
        return `right-full top-1/2 -translate-y-1/2 mr-${offsetClass}`;
      case "left-start":
        return `right-full top-0 mr-${offsetClass}`;
      case "left-end":
        return `right-full bottom-0 mr-${offsetClass}`;
      case "right":
        return `left-full top-1/2 -translate-y-1/2 ml-${offsetClass}`;
      case "right-start":
        return `left-full top-0 ml-${offsetClass}`;
      case "right-end":
        return `left-full bottom-0 ml-${offsetClass}`;
      default:
        return `top-full left-1/2 -translate-x-1/2 mt-${offsetClass}`;
    }
  };

  return (
    <HeadlessPopover as="div" className="relative inline-block text-left">
      <HeadlessPopover.Button as="div">{button}</HeadlessPopover.Button>
      <HeadlessPopover.Panel 
        className={`
          absolute z-10 w-72 ${getPositionClasses(placement)}
          transition transform duration-200 ease-out
          data-[closed]:scale-95 data-[closed]:opacity-0
          data-[enter]:duration-200 data-[leave]:duration-150
          data-[enter]:ease-out data-[leave]:ease-in
        `}
        focus 
        unmount
      >
        {({ close }) => children({ close })}
      </HeadlessPopover.Panel>
    </HeadlessPopover>
  );
}