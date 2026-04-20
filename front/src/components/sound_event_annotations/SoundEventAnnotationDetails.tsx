import { DescriptionData, DescriptionTerm } from "@/components/Description";
import { H4 } from "@/components/Headings";

import type { SoundEventAnnotation } from "@/types";

export default function SoundEventAnnotationDetails({
  soundEventAnnotation,
}: {
  soundEventAnnotation: SoundEventAnnotation;
}) {
  const creatorUsername = soundEventAnnotation.created_by?.username;
  const useSpeciesConfidence = creatorUsername == "yolobat";
  const confidenceFeatureName = useSpeciesConfidence
    ? "species_confidence"
    : "detection_confidence";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap">
          Details
        </H4>
      </div>
      <div className="flex flex-row flex-wrap gap-4">
        {soundEventAnnotation.features
          ?.filter((feature) => feature.name === confidenceFeatureName)
          .map((feature) => (
            <div key={feature.name}>
              <DescriptionTerm>Confidence</DescriptionTerm>
              <DescriptionData>{feature.value.toLocaleString()}</DescriptionData>
            </div>
          ))}
        {soundEventAnnotation.created_by && (
          <div>
            <DescriptionTerm>Created by</DescriptionTerm>
            <DescriptionData>{soundEventAnnotation.created_by.username}</DescriptionData>
          </div>
        )}
      </div>
    </div>
  );
}
