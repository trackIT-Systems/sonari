import { useEffect, useState } from "react";
import { AnnotationProject } from "@/types";
import api from "@/app/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";

export default function AnnotationProjectTagCounts({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTagCounts() {
      const tasks = await api.annotationTasks.getMany({
        annotation_project: annotationProject,
      });

      const tagCounter = new Map<string, number>();
      for (const task of tasks.items) {
        const annotation = await api.annotationTasks.getAnnotations(task);
        const tags = [
          ...(annotation.tags ?? []),
          ...((annotation.sound_events ?? []).flatMap(se => se.tags ?? [])),
        ];

        for (const tag of tags) {
          const key = `${tag.key}=${tag.value}`;
          tagCounter.set(key, (tagCounter.get(key) ?? 0) + 1);
        }
      }

      const tagObj: Record<string, number> = {};
      for (const [key, value] of Array.from(tagCounter.entries())) {
        tagObj[key] = value;
      }

      setTagCounts(tagObj);
      setLoading(false);
    }

    fetchTagCounts();
  }, [annotationProject]);

  if (loading) return <div>Loading tag counts...</div>;

  // Convert tagCounts object to array for recharts
  const data = Object.entries(tagCounts).map(([tag, count]) => ({
    tag,
    count,
  }));

  return (
    <div className="mt-4" style={{ width: "100%", height: 400 }}>
      <h3 className="text-lg font-semibold mb-4">Tag Counts</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 100, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="tag" type="category" width={150} />
          <Tooltip />
          <Bar dataKey="count" fill="#3182ce" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
