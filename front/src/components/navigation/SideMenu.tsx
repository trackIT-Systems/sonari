import classnames from "classnames";
import { usePathname, useRouter } from "next/navigation";

import {
  useSpecialKeyShortcuts,
  getMetaKeyLabel,
  ShortcutConfig,
  GO_PROJECTS_SHORTCUT,
  GO_PROFILE_SHORTCUT,
  LOGOUT_SHORTCUT,
  GO_DATASETS_SHORTCUT,
  getSpecialKeyLabel
} from "@/utils/keyboard";

import KeyboardKey from "../KeyboardKey";
import {
  AnnotationProjectIcon,
  DatasetsIcon,
  LogOutIcon,
  UserIcon,
  WhombatIcon,
} from "@/components/icons";
import Button from "@/components/Button";
import Link from "@/components/Link";
import Tooltip from "@/components/Tooltip";
import useActiveUser from "@/hooks/api/useActiveUser";

import type { User } from "@/types";
import type { ComponentProps } from "react";


function SideMenuLink({
  children,
  tooltip,
  isActive,
  href,
  keyboardKeys,
  ...props
}: ComponentProps<typeof Link> & {
  tooltip?: string;
  isActive?: boolean;
  href?: string;
  keyboardKeys?: string[];
}) {
  return (
    <Tooltip
      tooltip={
        <p className="whitespace-nowrap text-stone-700 dark:text-stone-300">
          {tooltip}
          {keyboardKeys ? (
            <span className="pl-2">
              {keyboardKeys.map((keyboardKey: string) => (
                <KeyboardKey key="key1" code={keyboardKey} />
              ))
              }
            </span>
          ) : (null)
          }
        </p>
      }
    >
      <Link
        href={href ?? ""}
        mode="text"
        variant={isActive ? "primary" : "secondary"}
        className={classnames(
          isActive
            ? "bg-stone-200 dark:bg-stone-900"
            : "hover:bg-stone-200 hover:text-stone-700 hover:dark:bg-stone-900 hover:dark:text-stone-300",
        )}
        {...props}
      >
        {children}
      </Link>
    </Tooltip>
  );
}

function SideMenuButton({
  children,
  tooltip,
  isActive,
  keyboardKeys,
  ...props
}: ComponentProps<typeof Button> & {
  tooltip?: string;
  isActive?: boolean;
  keyboardKeys?: string[];
}) {
  return (
    <Tooltip
      tooltip={
        <p className="whitespace-nowrap text-stone-700 dark:text-stone-300">
          {tooltip}
          {keyboardKeys ? (
            <span className="pl-2">
              {keyboardKeys.map((keyboardKey: string) => (
                <KeyboardKey key="key2" code={keyboardKey} />
              ))
              }
            </span>
          ) : (null)
          }
        </p>
      }
    >
      <Button
        mode="text"
        variant={isActive ? "primary" : "secondary"}
        className={classnames(
          isActive
            ? "bg-stone-200 dark:bg-stone-900"
            : "hover:bg-stone-200 hover:text-stone-700 hover:dark:bg-stone-900 hover:dark:text-stone-300",
        )}
        {...props}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function MainNavigation({ pathname }: { pathname?: string }) {
  return (
    <ul className="flex flex-col space-y-3 py-4 text-stone-400">
      <li className="px-3">
        <SideMenuLink
          isActive={pathname?.startsWith("/datasets")}
          tooltip={"Datasets"}
          href="/datasets"
          keyboardKeys={[`${getSpecialKeyLabel("Shift")}`, `${getMetaKeyLabel()}`, "1"]}
        >
          <DatasetsIcon className="w-6 h-6" />
        </SideMenuLink>
      </li>
      <li className="px-3">
        <SideMenuLink
          isActive={pathname?.startsWith("/annotation_projects")}
          tooltip={"Annotation Projects"}
          href="/annotation_projects"
          keyboardKeys={[`${getSpecialKeyLabel("Shift")}`, `${getMetaKeyLabel()}`, "2"]}
        >
          <AnnotationProjectIcon className="w-6 h-6" />
        </SideMenuLink>
      </li>
    </ul>
  );
}

function SecondaryNavigation({
  user,
  pathname,
  onLogout,
}: {
  user: User;
  pathname?: string;
  onLogout?: () => void;
}) {
  const {
    logout: { mutate: logout },
  } = useActiveUser({ user, onLogout });

  return (
    <ul className="flex flex-col space-y-3 py-4 text-stone-400">
      <li className="px-3">
        <SideMenuLink href="/profile" tooltip={"User"}
          keyboardKeys={[`${getSpecialKeyLabel("Shift")}`, `${getMetaKeyLabel()}`, "9"]}>
          <UserIcon className="w-6 h-6" />
        </SideMenuLink>
      </li>
      <li className="px-3">
        <SideMenuButton tooltip={"Log Out"}
          keyboardKeys={[`${getSpecialKeyLabel("Shift")}`, `${getMetaKeyLabel()}`, "0"]}>
          <LogOutIcon onClick={() => logout()} className="w-6 h-6" />
        </SideMenuButton>
      </li>
    </ul>
  );
}

export function SideMenu({
  onLogout,
  user,
}: {
  onLogout: () => void;
  user: User;
}) {
  const pathname = usePathname();
  const router = useRouter()

  const shortcuts: ShortcutConfig[] = [
    {
      key: GO_DATASETS_SHORTCUT,
      shiftKey: true,
      metaKey: true,
      action: () => { router.push("/datasets") },
    },
    {
      key: GO_PROJECTS_SHORTCUT,
      shiftKey: true,
      metaKey: true,
      action: () => { router.push("/annotation_projects") },
    },
    {
      key: GO_PROFILE_SHORTCUT,
      shiftKey: true,
      metaKey: true,
      action: () => { router.push("/profile") },
    },
    {
      key: LOGOUT_SHORTCUT,
      shiftKey: true,
      metaKey: true,
      action: () => { onLogout() },
    }
  ];

  useSpecialKeyShortcuts(shortcuts);

  return (
    <aside
      id="side-menu"
      className="sticky left-0 top-0 z-40 flex h-screen w-16 flex-shrink-0 flex-col shadow-md"
      aria-label="Sidebar"
    >
      <div className="flex flex-grow flex-col justify-between overflow-y-auto overflow-x-hidden bg-stone-50 dark:bg-stone-800">
        <div className="flex flex-col items-center">
          <Link href="/" className="px-2 py-4" mode="text">
            <WhombatIcon width={46} height={46} />
          </Link>
          <MainNavigation pathname={pathname} />
        </div>
        <SecondaryNavigation
          pathname={pathname}
          user={user}
          onLogout={onLogout}
        />
      </div>
    </aside>
  );
}
