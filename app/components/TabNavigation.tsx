"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TabNavigationProps {
  activeTab: "storyboard" | "editor";
  onTabChange: (tab: "storyboard" | "editor") => void;
}

export default function TabNavigation({
  activeTab,
  onTabChange,
}: TabNavigationProps) {
  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as "storyboard" | "editor")}>
      <TabsList className="h-8">
        <TabsTrigger value="storyboard" className="text-sm px-3 h-7">
          Storyboard
        </TabsTrigger>
        <TabsTrigger value="editor" className="text-sm px-3 h-7">
          Editor
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
