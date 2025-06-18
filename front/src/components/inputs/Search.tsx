import { ReactElement, useRef, useCallback } from "react";
import { VisuallyHidden, useSearchField } from "react-aria";
import { type SearchFieldProps, useSearchFieldState } from "react-stately";

import Button from "@/components/Button";
import { CloseIcon, SearchIcon } from "@/components/icons";
import Loading from "@/components/Loading";

import Input from "./Input";

import type { InputHTMLAttributes } from "react";

export default function Search({
  label = "Search",
  placeholder = "Search...",
  isLoading = false,
  icon,
  onKeyDown,
  inputRef,
  isHighlighted = false,
  spellCheck,
  ...props
}: {
  placeholder?: string;
  isLoading?: boolean;
  icon?: ReactElement;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  isHighlighted?: boolean;
} & SearchFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'spellCheck'> & {
    spellCheck?: string;
  }) {
  const state = useSearchFieldState({ label, ...props });
  const localRef = useRef(null);
  const ref = inputRef || localRef;

  const { labelProps, inputProps, clearButtonProps } = useSearchField(
    { label, spellCheck, ...props },
    state,
    ref,
  );

  return (
    <div className="flex items-center">
      <VisuallyHidden>
        <label {...labelProps}>{label}</label>
      </VisuallyHidden>
      <div className="relative w-full">
        <div className="flex absolute inset-y-0 left-0 items-center pl-3 w-8 pointer-events-none">
          {isLoading ? <Loading /> : icon || <SearchIcon />}
        </div>
        <Input
          className={`pl-10 text-sm 5 ${isHighlighted ? 'bg-stone-100 dark:bg-stone-800' : ''
            }`}
          ref={ref}
          {...inputProps}
          onKeyDown={onKeyDown}
        />
        {state.value !== "" && (
          <Button
            variant="primary"
            mode="text"
            className="flex absolute inset-y-0 right-0 items-center ml-2"
            // @ts-ignore
            onClick={clearButtonProps.onPress}
          >
            <CloseIcon className="w-4 h-4" />
            <span className="sr-only">{label}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
