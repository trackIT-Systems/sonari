"use client";
import { Transition } from "@headlessui/react";
import { ToastIcon, Toaster, resolveValue } from "react-hot-toast";

export default function Notification() {
  return (
    <Toaster position="top-right">
      {(t) => (
        <Transition
          as="div"
          appear
          show={t.visible}
          enter="transition-all duration-150"
          enterFrom="opacity-0 scale-50"
          enterTo="opacity-100 scale-100"
          leave="transition-all duration-150"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-75"
        >
          <ToastIcon toast={t} />
          <div className="pl-4 text-sm font-normal transform p-4 flex rounded items-center divide-x divide-stone-300 space-x-4 space-x border dark:divide-stone-500 shadow-lg bg-stone-50 border-stone-200 dark:bg-stone-700 dark:border-stone-800">
            <p className="px-2">{resolveValue(t.message, t)}</p>
          </div>
        </Transition>
      )}
    </Toaster>
  );
}
