import Button from "@/components/Button";
import { DialogOverlay } from "@/components/Dialog";
import type { ReleaseNotesEntry } from "@/utils/version";

export default function ReleaseNotesDialog({
  tag,
  notes,
  isOpen,
  onClose,
}: {
  tag: string;
  notes: ReleaseNotesEntry;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <DialogOverlay
      title={`What's new in ${tag}`}
      isOpen={isOpen}
      onClose={onClose}
    >
      {({ close }) => (
        <div className="max-w-lg space-y-4">
          <ul className="space-y-3 text-left">
            {notes.highlights.map((item) => (
              <li key={item.title}>
                <p className="font-medium text-stone-900 dark:text-stone-100">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                    {item.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="primary" onClick={close}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </DialogOverlay>
  );
}
