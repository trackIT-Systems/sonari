import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import Button from "@/components/Button";
import Card from "@/components/Card";
import { CloseIcon } from "@/components/icons";
import { Input, InputGroup } from "@/components/inputs";
import Popover from "@/components/Popover";
import useDebounceSubmit from "@/hooks/forms/useDebounceSubmit";

function DateButton({
  date,
  disabled,
}: {
  date?: Date | null;
  disabled?: boolean;
}) {
  return (
    <Button mode="text" variant="secondary" padding="py-1" disabled={disabled}>
      {date != null ? (
        date.toLocaleDateString()
      ) : (
        <span className="text-sm text-stone-400 dark:text-stone-600">-</span>
      )}
    </Button>
  );
}

function toString(date: Date | null | undefined) {
  if (date == null) return "";
  return date.toISOString().split("T")[0];
}

const schema = z.object({
  date: z.coerce.date().nullish(),
});

export default function RecordingDate({
  date,
  onChange,
  disabled = false,
}: {
  date?: Date | null;
  onChange?: (value: { date?: Date | null }) => void;
  disabled?: boolean;
}) {
  const { register, handleSubmit, watch } = useForm<{ date: string }>({
    mode: "onChange",
    values: { date: toString(date) },
    disabled,
  });

  const onSubmit = useCallback(
    (values: { date: string }) => {
      const { date } = schema.parse({
        date: values.date === "" ? null : values.date,
      });
      onChange?.({ date });
    },
    [onChange],
  );

  useDebounceSubmit({
    onSubmit,
    watch,
    handleSubmit,
  });

  const [value] = watch(["date"]);

  if (disabled) return <DateButton date={date} disabled />;

  return (
    <Popover button={<DateButton date={date} />}>
      {() => (
        <Card className="bg-stone-800">
          <InputGroup
            name="date"
            label="Date"
            help="Change date of recording. Format: YYYY-MM-DD"
          >
            <Input type="date" {...register("date")} value={value} />
          </InputGroup>
          <Button
            mode="text"
            variant="danger"
            onClick={() => onChange?.({ date: null })}
          >
            <CloseIcon className="inline-block mr-1 w-5 h-5" />
            Clear
          </Button>
        </Card>
      )}
    </Popover>
  );
}
