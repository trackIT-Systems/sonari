import React from 'react';
import Image from 'next/image';

interface YearlyActivityChartProps {
  chartImage: string;
}

export default function YearlyActivityChart({ chartImage }: YearlyActivityChartProps) {
  if (!chartImage) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No chart data available</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Image
        src={`data:image/png;base64,${chartImage}`}
        alt="Yearly Activity Heatmap"
        className="w-full h-auto rounded-lg shadow-sm"
      />
    </div>
  );
}
