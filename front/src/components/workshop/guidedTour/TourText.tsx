import { Fragment, type ComponentType, type HTMLProps, type ReactNode } from "react";

import {
  AddIcon,
  ArrowTrendingDownIcon,
  BackIcon,
  BoundingBoxIcon,
  DeleteIcon,
  DisableIcon,
  EnterFullscreenIcon,
  FilterIcon,
  HelpIcon,
  LockOpenIcon,
  LoopIcon,
  NextIcon,
  PlayIcon,
  PlayPauseIcon,
  PreviousIcon,
  SearchIcon,
  SelectIcon,
  SettingsIcon,
  SpeedIcon,
  TagIcon,
  TimeIntervalIcon,
} from "@/components/icons";

import { formatKeyLabel } from "./manifest";

type IconComponent = ComponentType<HTMLProps<SVGSVGElement>>;

/** Icons of the app's buttons, so a lesson can show what to look for. */
export const TOUR_ICONS: Record<string, IconComponent> = {
  play: PlayPauseIcon as IconComponent,
  loop: LoopIcon as IconComponent,
  autoplay: PlayIcon as IconComponent,
  speed: SpeedIcon as IconComponent,
  create: AddIcon as IconComponent,
  select: SelectIcon as IconComponent,
  delete: DeleteIcon as IconComponent,
  interval: TimeIntervalIcon as IconComponent,
  box: BoundingBoxIcon as IconComponent,
  zoom: SearchIcon as IconComponent,
  reset: BackIcon as IconComponent,
  aspect: LockOpenIcon as IconComponent,
  measure: ArrowTrendingDownIcon as IconComponent,
  settings: SettingsIcon as IconComponent,
  "hide-spectrogram": DisableIcon as IconComponent,
  "hide-events": TagIcon as IconComponent,
  fullscreen: EnterFullscreenIcon as IconComponent,
  filter: FilterIcon as IconComponent,
  help: HelpIcon as IconComponent,
  prev: PreviousIcon as IconComponent,
  next: NextIcon as IconComponent,
};

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-stone-300 bg-white px-1.5 py-px align-baseline font-mono text-xs font-semibold text-stone-700 shadow-[0_1px_0_0] shadow-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:shadow-stone-600">
      {children}
    </kbd>
  );
}

function InlineIcon({ name }: { name: string }) {
  const Icon = TOUR_ICONS[name];
  if (!Icon) return <>{name}</>;
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-300 bg-stone-100 align-middle text-stone-700 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200">
      <Icon className="h-4 w-4" aria-label={name} />
    </span>
  );
}

const TOKEN = /(`[^`]+`|\{icon:[a-z-]+\})/g;

/**
 * Renders lesson text with inline markup:
 *   `c`            a key cap (Ctrl is shown as ⌘ on macOS)
 *   {icon:create}  the icon of the matching app button (see TOUR_ICONS)
 */
export default function TourText({ text }: { text: string }): ReactNode {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <Kbd key={i}>{formatKeyLabel(part.slice(1, -1))}</Kbd>;
    }
    const icon = /^\{icon:([a-z-]+)\}$/.exec(part);
    if (icon) return <InlineIcon key={i} name={icon[1]} />;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Icon names used in a text, e.g. to validate a manifest. */
export function iconNamesIn(text: string): string[] {
  return Array.from(text.matchAll(/\{icon:([a-z-]+)\}/g), (m) => m[1]);
}
