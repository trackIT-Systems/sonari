import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import Toggle from "@/components/inputs/Toggle";

interface ExportGroupTagsToggleProps {
  groupSpecies: boolean;
  onGroupSpeciesChange: (value: boolean) => void;
}

export default function ExportGroupTagsToggle({
  groupSpecies,
  onGroupSpeciesChange,
}: ExportGroupTagsToggleProps) {

  return (
    <Card>
      <div>
        <H3 className="text-lg">Group Species</H3>
        <p className="text-stone-500">
          This will group bat species into broader categories (Pipistrelloid, Myotis, Nyctaloid, etc.). Has no effect for birds.
        </p>
      </div>
      <div className="space-y-4">
        <Toggle
          label="Group bat species into categories"
          isSelected={groupSpecies}
          onChange={onGroupSpeciesChange}>
        </Toggle>
      </div>
    </Card>
  );
}
