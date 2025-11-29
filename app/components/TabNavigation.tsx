interface TabNavigationProps {
  activeTab: "storyboard" | "editor";
  onTabChange: (tab: "storyboard" | "editor") => void;
}

export default function TabNavigation({
  activeTab,
  onTabChange,
}: TabNavigationProps) {
  return (
    <div className="flex border-b border-gray-200 bg-white">
      <button
        onClick={() => onTabChange("storyboard")}
        className={`px-6 py-3 text-sm font-medium transition-colors relative ${
          activeTab === "storyboard"
            ? "text-blue-600"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Storyboard
        {activeTab === "storyboard" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
        )}
      </button>
      <button
        onClick={() => onTabChange("editor")}
        className={`px-6 py-3 text-sm font-medium transition-colors relative ${
          activeTab === "editor"
            ? "text-blue-600"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Editor
        {activeTab === "editor" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
        )}
      </button>
    </div>
  );
}
