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
    <div className="flex flex-col gap-1 text-sm leading-tight">
      <div className="flex justify-between items-center mb-1">
        <H4 className="text-center whitespace-nowrap text-base leading-snug">
          Sound Event Details
        </H4>
      </div>
      <div className="flex flex-row flex-wrap gap-x-4 gap-y-1">
        {soundEventAnnotation.sound_event.features?.map((feature) => (
          <div key={feature.name} className="min-w-[6rem]">
            <DescriptionTerm className="text-xs">{feature.name}</DescriptionTerm>
            <DescriptionData className="text-xs font-medium">
              {feature.value.toLocaleString()}
            </DescriptionData>
          </div>
        ))}
      </div>
    </div>
  );  
}
