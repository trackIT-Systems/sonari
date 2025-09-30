import Button from "@/components/Button";
import Card from "@/components/Card";
import { CloseIcon } from "@/components/icons";
import LocationInput, {
  type Location,
  formatLocation,
} from "@/components/inputs/Location";
import Popover from "@/components/Popover";

function LocationButton({
  latitude,
  longitude,
  disabled,
}: {
  latitude?: number | null;
  longitude?: number | null;
  disabled?: boolean;
}) {
  const hasLocation = latitude != null && longitude != null;
  return (
    <Button mode="text" variant="secondary" padding="py-1" disabled={disabled}>
      {hasLocation ? (
        formatLocation({ latitude, longitude })
      ) : (
        <span className="text-sm text-stone-400 dark:text-stone-600">
          No location
        </span>
      )}
    </Button>
  );
}

export default function RecordingLocation({
  latitude,
  longitude,
  onChange,
  disabled,
}: {
  latitude?: number | null;
  longitude?: number | null;
  onChange?: (value: Location) => void;
  disabled?: boolean;
}) {
  if ((latitude == null || longitude == null) && disabled) {
    return (
      <LocationButton latitude={latitude} longitude={longitude} disabled />
    );
  }

  return (
    <Popover
      button={<LocationButton latitude={latitude} longitude={longitude} />}
    >
      {() => (
        <Card className="bg-stone-800 w-80">
          <LocationInput
            value={{ latitude, longitude }}
            onChange={onChange}
            disabled={disabled}
          />
          {!disabled && (
            <Button
              mode="text"
              variant="danger"
              onClick={() => onChange?.({ latitude: null, longitude: null })}
            >
              <CloseIcon className="inline-block mr-1 w-5 h-5" />
              Clear
            </Button>
          )}
        </Card>
      )}
    </Popover>
  );
}
