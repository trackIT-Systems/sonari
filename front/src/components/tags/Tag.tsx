/** @module Tag.
 * Definition of the Tag component.
 */
import classnames from "classnames";
import { type HTMLProps } from "react";
import { CloseIcon } from "@/components/icons";
import { ALL_COLORS, ALL_COLORS_DARK } from "@/components/colors";
import type { Tag } from "@/types";

const COLOR_NAMES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

const LEVELS = [1, 2, 3, 4, 5, 6];

export function getTagKey(tag: Tag): string {
  return `${tag.key}-${tag.value}`;
}

function tagHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function getTagColor(tagStr: string): {color: string, level: number} {
  const hash = tagHash(tagStr);
  const name = COLOR_NAMES[hash % COLOR_NAMES.length];
  const level = LEVELS[hash % LEVELS.length];
  return { color: name, level };
}

function getTagClassNames(color: string, level: number) {
  const background = `bg-${color}-${level}00 dark:bg-${color}-${10 - level}00`;
  const border = `border-${color}-${level + 2}00 dark:border-${color}-${10 - level - 2
    }00`;
  // Use much darker text for better contrast - always use 800+ for light mode, 100 for dark mode
  const text = `text-${color}-900 dark:text-${color}-100`;
  return  {
    background,
    border,
    text,
  }
}

export type TagCount = {
  tag: Tag;
  count: number;
}

/** A Tag.
 * Will display a tag. The aspect can be customized by specifying
 * the color (hue) and the level (brightness).
 * @component
 */
export default function Tag({
  tag,
  className,
  count,
  compact = false,
  onClick,
  onClose,
  ...props
}: {
  tag: Tag;
  count: number | null,
  compact?: boolean;
  onClick?: () => void;
  onClose?: () => void;
} & HTMLProps<HTMLDivElement>) {

  const {color, level} = getTagColor(getTagKey(tag))
  const classNames = getTagClassNames(color, level);

  return (
    <div
      className={classnames(
        "border rounded-md tracking-tighter inline-flex min-w-0 max-w-full flex-nowrap",
        compact ? "px-0.5 text-xs" : "px-1",
        classNames.background,
        classNames.text,
        classNames.border,
        className,
      )}
      {...props}
    >
      {onClose != null && (
        <button type="button" className="group min-w-fit" onClick={onClose}>
          <CloseIcon className="inline-block w-4 h-4 group-hover:text-red-500 group-hover:stroke-3" />
        </button>
      )}
      <button
        type="button"
        className="group flex min-w-0 max-w-full flex-row items-center overflow-hidden"
        onClick={onClick}
        title={compact ? `${tag.key}: ${tag.value}${count != null ? ` (${count})` : ""}` : undefined}
      >
        <span
          className={classnames(
            "font-thin shrink-0",
            compact && "max-w-[3.5rem] truncate",
          )}
        >
          {tag.key}
        </span>
        <span
          className={classnames(
            "ml-0.5 min-w-0 font-bold italic group-hover:underline group-hover:decoration-2 group-hover:underline-offset-2",
            compact ? "max-w-[5.5rem] truncate sm:max-w-[7rem] lg:max-w-[9rem]" : "grow flex-1",
          )}
        >
          {tag.value}
        </span>
        {count == null ? (
            <span/>
          ) : (
            <span className="min-w-fit shrink-0 ml-0.5 tabular-nums">({count})</span>
          )
        }
      </button>
    </div>
  );
}
export { ALL_COLORS,ALL_COLORS_DARK, COLOR_NAMES, LEVELS, getTagClassNames as getClassNames };