import Image from "next/image";
import React from "react";

interface PassData {
  time_period_start: string;
  time_period_end: string;
  species_tag: string;
  event_count: number;
  pass_threshold: number;
  is_pass: boolean;
}

interface PassesChartProps {
  chartImage: string;
}

export default function PassesChart({ 
  chartImage, 
}: PassesChartProps) {


  return (
    <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <Image 
            src={`data:image/png;base64,${chartImage}`}
            alt="Passes Chart"
            className="w-full h-auto max-w-full"
            style={{ maxHeight: '600px', objectFit: 'contain' }}
            width={800}
            height={400}
          />
        </div>
    </div>
  );
}
