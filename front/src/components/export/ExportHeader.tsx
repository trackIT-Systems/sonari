import {
    useRouter,
    useSearchParams,
    useSelectedLayoutSegment,
} from "next/navigation";

import Header from "@/components/Header";
import { H1 } from "@/components/Headings";
import Tabs from "@/components/Tabs";

export default function ExportHeader() {
    const router = useRouter();
    const params = useSearchParams();
    const selectedLayoutSegment = useSelectedLayoutSegment();

    return (
        <Header>
            <div className="flex overflow-x-auto flex-row space-x-4 w-full">
                <H1 className="overflow-auto max-w-xl whitespace-nowrap">
                    Export
                </H1>
                <Tabs
                    tabs={[
                        {
                            id: "passes",
                            title: "Passes",
                            isActive: selectedLayoutSegment === "passes",
                            onClick: () => {
                                router.push(`/export/passes/?${params.toString()}`);
                            },
                        },
                        {
                            id: "time",
                            title: "Events/Time",
                            isActive: selectedLayoutSegment === "time",
                            onClick: () => {
                                router.push(`/export/time/?${params.toString()}`);
                            },
                        },
                        {
                            id: "stats",
                            title: "Statistics",
                            isActive: selectedLayoutSegment === "stats",
                            onClick: () => {
                                router.push(`/export/stats/?${params.toString()}`);
                            },
                        },
                        {
                            id: "yearly-activity",
                            title: "Activity",
                            isActive: selectedLayoutSegment === "yearly-activity",
                            onClick: () => {
                                router.push(`/export/yearly-activity/?${params.toString()}`);
                            },
                        },
                        {
                            id: "multibase",
                            title: "MultiBase",
                            isActive: selectedLayoutSegment === "multibase",
                            onClick: () => {
                                router.push(`/export/multibase/?${params.toString()}`);
                            },
                        },
                        {
                            id: "dump",
                            title: "Dump",
                            isActive: selectedLayoutSegment === "dump",
                            onClick: () => {
                                router.push(`/export/dump/?${params.toString()}`);
                            },
                        },
                    ]}
                />
            </div>
        </Header>
    );
}
