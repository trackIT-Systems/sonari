import { DescriptionData, DescriptionTerm } from "@/components/Description";
import { H4 } from "@/components/Headings";

import type { SoundEventAnnotation } from "@/types";

function getConfidenceFeatures(
  features: SoundEventAnnotation["features"],
  creatorUsername: string | undefined,
) {
  const allFeatures = features ?? [];
  const speciesFeatures = allFeatures.filter((f) =>
    f.name.startsWith("species_confidence"),
  );
  const detectionFeatures = allFeatures.filter((f) =>
    f.name.startsWith("detection_confidence"),
  );

  if (creatorUsername === "birdedge" && speciesFeatures.length > 0) {
    return speciesFeatures;
  }
  if (detectionFeatures.length > 0) {
    return detectionFeatures;
  }
  return speciesFeatures;
}

export default function SoundEventAnnotationDetails({
  soundEventAnnotation,
}: {
  soundEventAnnotation: SoundEventAnnotation;
}) {
  const creatorUsername = soundEventAnnotation.created_by?.username;
  const confidenceFeatures = getConfidenceFeatures(
    soundEventAnnotation.features,
    creatorUsername,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap">Details</H4>
      </div>
      <div className="flex flex-row flex-wrap gap-4">
        {confidenceFeatures.map((feature) => (
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
