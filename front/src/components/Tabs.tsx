import classnames from "classnames";
import Link from "next/link";
import { useCallback } from "react";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useKeyPressEvent } from "react-use";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import {
  NAVIGATE_FST_ELEMENT_SHORTCUT,
  NAVIGATE_SND_ELEMENT_SHORTCUT,
  NAVIGATE_TRD_ELEMENT_SHORTCUT,
  NAVIGATE_FOT_ELEMENT_SHORTCUT,
  NAVIGATE_FTH_ELEMENT_SHORTCUT,
  NAVIGATE_STH_ELEMENT_SHORTCUT,
} from "@/utils/keyboard";

import Tooltip from "./Tooltip";
import KeyboardKey from "./KeyboardKey";


type TabType = {
  id: string | number;
  title: string;
  isActive: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  href?: string;
  render?: () => React.ReactNode;
};

const BASE_CLASS =
  "whitespace-nowrap rounded-lg bg-stone-50 p-2 text-center text-sm font-medium dark:bg-stone-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/50";

const ACTIVE_CLASS = "text-emerald-500";

const INACTIVE_CLASS =
  "text-stone-700 hover:bg-stone-200 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-300";

function TabButton({
  children,
  active = false,
  className,
  ...props
}: {
  children: ReactNode;
  active?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={classnames(
        BASE_CLASS,
        active ? ACTIVE_CLASS : INACTIVE_CLASS,
        className,
      )}
    >
      {children}
    </button>
  );
}

function TabLink({
  children,
  active = false,
  className,
  ...props
}: { children: ReactNode; active: boolean } & ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={classnames(
        BASE_CLASS,
        active ? ACTIVE_CLASS : INACTIVE_CLASS,
        className,
        "p-2 inline-block",
      )}
    >
      {children}
    </Link>
  );
}

function TabContent({ tab, shortcutNumber }: { tab: TabType; shortcutNumber?: number }) {
  const content = (
    <>
      {tab.icon ? (
        <span className="mr-1 inline-block align-middle">
          {tab.icon}
        </span>
      ) : null}
      {tab.title}
    </>
  );

  if (shortcutNumber !== undefined) {
    return <Tooltip
      tooltip={
        <div className="inline-flex gap-2 items-center">
          Go to {tab.title}
          <div className="text-xs">
            <KeyboardKey code={shortcutNumber?.toString()} />
          </div>
        </div>
      }
      placement="bottom"
      offset={20}
    >
      {content}
    </Tooltip>
  }

  return content;
}

export default function Tabs({ tabs }: { tabs: TabType[] }) {
  const handleNumberKey = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const keyNumber = parseInt(event.key);
    if ((keyNumber >= 5 && keyNumber <= 9) || keyNumber == 0) {
      var tabIndex = keyNumber - 5;
      if (keyNumber == 0) tabIndex = 5;

      if (tabIndex < tabs.length && tabIndex < 6) {
        const tab = tabs[tabIndex];
        if (tab.onClick) {
          tab.onClick();
        } else if (tab.href) {
          window.location.href = tab.href;
        }
      }
    }
  }, [tabs]);

  useKeyPressEvent(useKeyFilter({ key: NAVIGATE_FST_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: NAVIGATE_SND_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: NAVIGATE_TRD_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: NAVIGATE_FOT_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: NAVIGATE_FTH_ELEMENT_SHORTCUT }), handleNumberKey);
  useKeyPressEvent(useKeyFilter({ key: NAVIGATE_STH_ELEMENT_SHORTCUT }), handleNumberKey);

  return (
    <ul className="flex space-x-4">
      {tabs.map((tab, index) => {
        const shortcutNumber = index < 6 ? (index + 5) % 10 : undefined;

        return (
          <li key={tab.id}>
            {tab.href != null ? (
              <TabLink href={tab.href} active={tab.isActive}>
                <TabContent tab={tab} shortcutNumber={shortcutNumber} />
              </TabLink>
            ) : (
              <TabButton onClick={tab.onClick} active={tab.isActive}>
                <TabContent tab={tab} shortcutNumber={shortcutNumber} />
              </TabButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}