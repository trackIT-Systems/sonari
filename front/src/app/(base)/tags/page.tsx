"use client";
import { useState } from "react";

import { useAuth } from "@/components/auth/AuthContext";
import Hero from "@/components/Hero";
import { TagIcon, TagsIcon } from "@/components/icons";
import Tabs from "@/components/Tabs";
import GroupsTab from "@/components/tags/management/GroupsTab";
import PresetsTab from "@/components/tags/management/PresetsTab";
import SpeciesTab from "@/components/tags/management/SpeciesTab";
import TagsTab, { type GroupFilter } from "@/components/tags/management/TagsTab";
import { useTagGroups, useTagPresets } from "@/hooks/api/useTagManagement";

type TabId = "tags" | "species" | "groups" | "presets";

export default function TagsPage() {
  const { user } = useAuth();
  const isSuperuser = user?.is_superuser === true;
  const [tab, setTab] = useState<TabId>("tags");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");

  const groups = useTagGroups();
  const presets = useTagPresets();

  return (
    <>
      <Hero text="Tags" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            tabs={[
              {
                id: "tags",
                title: "All tags",
                isActive: tab === "tags",
                icon: <TagIcon className="h-5 w-5 align-middle" />,
                onClick: () => setTab("tags"),
              },
              {
                id: "species",
                title: "Same species",
                isActive: tab === "species",
                icon: <TagsIcon className="h-5 w-5 align-middle" />,
                onClick: () => setTab("species"),
              },
              {
                id: "groups",
                title: "Groups",
                isActive: tab === "groups",
                icon: <TagsIcon className="h-5 w-5 align-middle" />,
                onClick: () => setTab("groups"),
              },
              {
                id: "presets",
                title: "Presets",
                isActive: tab === "presets",
                icon: <TagsIcon className="h-5 w-5 align-middle" />,
                onClick: () => setTab("presets"),
              },
            ]}
          />
          {!isSuperuser && (
            <span className="text-xs text-stone-500">
              Only administrators can merge tags.
            </span>
          )}
        </div>
        {tab === "tags" && (
          <TagsTab
            groups={groups.data ?? []}
            canMerge={isSuperuser}
            groupFilter={groupFilter}
            onGroupFilterChange={setGroupFilter}
          />
        )}
        {tab === "species" && (
          <SpeciesTab groups={groups.data ?? []} canMerge={isSuperuser} />
        )}
        {tab === "groups" && (
          <GroupsTab
            groups={groups.data ?? []}
            onShowTags={(groupId) => {
              setGroupFilter(groupId);
              setTab("tags");
            }}
          />
        )}
        {tab === "presets" && (
          <PresetsTab
            presets={presets.data ?? []}
            groups={groups.data ?? []}
            isSuperuser={isSuperuser}
          />
        )}
      </div>
    </>
  );
}
