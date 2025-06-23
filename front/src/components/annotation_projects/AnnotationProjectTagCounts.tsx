import { useEffect, useState } from "react";
import { AnnotationProject } from "@/types";
import api from "@/app/api";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import Card from "@/components/Card";

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload || payload.length === 0) return null;
  
    return (
      <div
        style={{
          backgroundColor: "#2D3748", // dark background
          border: "1px solid #4A5568",
          padding: "10px",
          borderRadius: "5px",
          color: "#ffffff",
        }}
      >
        <p style={{ fontWeight: "bold", marginBottom: "6px" }}>{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey} style={{ color: entry.color, margin: 0 }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  
  

export default function AnnotationProjectTagCounts({
    annotationProject,
}: {
    annotationProject: AnnotationProject;
}) {
    type TagCount = {
        tag: string;
        completed: number;
        verified: number;
        rejected: number;
        assigned: number;
    };

    const [tagCounts, setTagCounts] = useState<TagCount[]>([]);

    const [loading, setLoading] = useState(true);
    useEffect(() => {
        async function fetchTagCounts() {
            const tasks = await api.annotationTasks.getMany({
                annotation_project: annotationProject,
            });

            const tagStatusCounter = new Map<
                string,
                { completed: number; verified: number; rejected: number; assigned: number }
            >();

            for (const task of tasks.items) {
                const annotation = await api.annotationTasks.getAnnotations(task);

                const latestBadge = task.status_badges
                    ?.slice()
                    .sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())[0];

                const status = latestBadge?.state ?? "assigned"; // default fallback

                const tags = [
                    ...(annotation.tags ?? []),
                    ...((annotation.sound_events ?? []).flatMap((se) => se.tags ?? [])),
                ];

                for (const tag of tags) {
                    const key = `${tag.key}=${tag.value}`;
                    const current = tagStatusCounter.get(key) ?? {
                        completed: 0,
                        verified: 0,
                        rejected: 0,
                        assigned: 0,
                    };
                    current[status] += 1;
                    tagStatusCounter.set(key, current);
                }
            }

            const formattedData = Array.from(tagStatusCounter.entries()).map(
                ([tag, counts]) => ({
                    tag,
                    ...counts,
                })
            );

            setTagCounts(formattedData);
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
        <Card>
        <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">Tag Counts</h3>
            <div style={{ width: "100%", height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                data={tagCounts}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
                >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="tag" type="category" width={150} />
                <Tooltip content={<CustomTooltip />} />
                
                <Bar dataKey="completed" stackId="a" fill="#38a169" name="Accepted" />
                <Bar dataKey="verified" stackId="a" fill="#4299e1" name="Verified" />
                <Bar dataKey="rejected" stackId="a" fill="#e53e3e" name="Rejected" />
                <Bar dataKey="assigned" stackId="a" fill="#ecc94b" name="Unsure" />
                </BarChart>
            </ResponsiveContainer>
            </div>
        </div>
        </Card>
    );
}
