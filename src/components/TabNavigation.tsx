import { LayoutGrid, Film } from "lucide-react";
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
        <TabsTrigger value="storyboard" className="text-sm px-3 h-7 gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          Storyboard
        </TabsTrigger>
        <TabsTrigger value="editor" className="text-sm px-3 h-7 gap-1.5">
          <Film className="h-3.5 w-3.5" />
          Editor
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
