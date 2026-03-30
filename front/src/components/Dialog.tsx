import { Dialog as HeadlessDialog, Transition, TransitionChild, DialogTitle, DialogPanel } from "@headlessui/react";
import classNames from "classnames";
import { Fragment, useState } from "react";

import Button from "@/components/Button";
import { CloseIcon } from "@/components/icons";

import type { ComponentProps, ReactNode } from "react";

const PANEL_DIALOG_PANEL_CLASS =
  "overflow-hidden w-full text-left align-middle z-[100] p-0 rounded-md border border-stone-200 dark:border-stone-500 bg-stone-50 dark:bg-stone-700 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900/5 text-stone-700 dark:text-stone-300";

const PANEL_DIALOG_DEFAULT_WIDTH = "max-w-md sm:w-96";

const MODAL_DIALOG_PANEL_CLASS =
  "overflow-hidden p-6 w-full text-left align-middle rounded-2xl shadow-xl transition-all transform max-w-fit bg-stone-50 text-stone-700 z-[100] dark:bg-stone-700 dark:text-stone-300";

export default function Dialog({
  title,
  children,
  label,
  open = false,
  width = "max-w-md",
  ...rest
}: {
  title?: ReactNode;
  label: ReactNode;
  open?: boolean;
  width?: string;
  children: ({ close }: { close: () => void }) => ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "title" | "children">) {
  let [isOpen, setIsOpen] = useState(open);
  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)} {...rest}>
        {label}
      </Button>
      <DialogOverlay
        title={<div>{title}</div>}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        {({ close }) => <div className={width}>{children({ close })}</div>}
      </DialogOverlay>
    </>
  );
}

export function DialogOverlay({
  title,
  children,
  onClose,
  isOpen = true,
  variant = "modal",
  panelClassName,
}: {
  title?: ReactNode;
  children: ({ close }: { close: () => void }) => ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
  /** `panel`: same surface as filter popover (annotation task table). */
  variant?: "modal" | "panel";
  /** Extra classes for the dialog surface (merged when `variant` is `panel`). */
  panelClassName?: string;
}) {
  const isPanel = variant === "panel";

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <HeadlessDialog
        as="div"
        className="relative z-50"
        onClose={() => onClose?.()}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity" />
        </TransitionChild>
        <div className="overflow-y-auto fixed inset-0">
          <div className="flex justify-center items-center p-4 min-h-full text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className={classNames(
                  isPanel ? PANEL_DIALOG_PANEL_CLASS : MODAL_DIALOG_PANEL_CLASS,
                  isPanel && (panelClassName ?? PANEL_DIALOG_DEFAULT_WIDTH),
                )}
              >
                <DialogTitle
                  as="div"
                  className={
                    isPanel
                      ? "flex flex-row items-center justify-between gap-3 border-b border-stone-100 px-4 pt-4 pb-3 dark:border-stone-600"
                      : "mb-4 flex flex-row items-center justify-between gap-4"
                  }
                >
                  {title != null && (
                    <h3
                      className={
                        isPanel
                          ? "text-base font-semibold leading-6 text-stone-800 dark:text-stone-200"
                          : "text-lg font-medium leading-6 text-stone-900 dark:text-stone-100"
                      }
                    >
                      {title}
                    </h3>
                  )}
                  <Button
                    onClick={() => onClose?.()}
                    variant="secondary"
                    mode="text"
                  >
                    <CloseIcon className="w-5 h-5" />
                  </Button>
                </DialogTitle>
                <div className={isPanel ? "space-y-5 p-4" : "mt-2"}>
                  {children({ close: () => onClose?.() })}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
