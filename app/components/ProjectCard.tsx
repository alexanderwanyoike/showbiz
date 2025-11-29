"use client";

import Link from "next/link";

interface ProjectCardProps {
  id: string;
  name: string;
  updatedAt: string;
  onDelete: (id: string) => void;
}

export default function ProjectCard({
  id,
  name,
  updatedAt,
  onDelete,
}: ProjectCardProps) {
  const formattedDate = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all">
      <Link href={`/project/${id}`} className="block p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {name}
            </h3>
            <p className="text-sm text-gray-500 mt-1">Updated {formattedDate}</p>
          </div>
          <div className="ml-4 text-4xl opacity-50 group-hover:opacity-100 transition-opacity">
            🎬
          </div>
        </div>
      </Link>
      <div className="px-6 pb-4 flex justify-end">
        <button
          onClick={(e) => {
            e.preventDefault();
            if (confirm(`Delete project "${name}"?`)) {
              onDelete(id);
            }
          }}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
