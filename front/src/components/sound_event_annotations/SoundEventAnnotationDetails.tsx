import Card from "@/components/Card";
import { DescriptionData, DescriptionTerm } from "@/components/Description";
import { H4 } from "@/components/Headings";

import type { SoundEventAnnotation } from "@/types";

export default function SoundEventAnnotationDetails({
  soundEventAnnotation,
}: {
  soundEventAnnotation: SoundEventAnnotation;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap">
          Sound Event Details
        </H4>
      </div>
      <div className="flex flex-row flex-wrap gap-4">
        {soundEventAnnotation.sound_event.features?.map((feature) => (
          <div key={feature.name}>
            <DescriptionTerm>{feature.name}</DescriptionTerm>
            <DescriptionData>{feature.value.toLocaleString()}</DescriptionData>
          </div>
        ))}
      </div>
    </div>
  );
}
