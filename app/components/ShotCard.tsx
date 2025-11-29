"use client";

import { useRef } from "react";

export type ShotStatus = "pending" | "generating" | "complete" | "failed";

export interface Shot {
  id: string;
  order: number;
  duration: number; // 1-10 seconds
  
  // Image
  uploaded_image: string | null;
  gemini_prompt: string | null;
  generated_image: string | null;
  
  // Video
  video_prompt: string;
  video_url: string | null;
  status: ShotStatus;
}

interface ShotCardProps {
  shot: Shot;
  index: number;
  totalShots: number;
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onGenerateImage: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  onGenerateVideo: (id: string) => void;
}

export default function ShotCard({
  shot,
  index,
  totalShots,
  onUpdate,
  onDelete,
  onMove,
  onGenerateImage,
  onUploadImage,
  onGenerateVideo,
}: ShotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(shot.id, e.target.files[0]);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md">
      {/* Shot Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <div className="font-semibold text-gray-700">Shot #{shot.order}</div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onMove(index, "up")}
            disabled={index === 0}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            title="Move Up"
          >
            ↑
          </button>
          <button
            onClick={() => onMove(index, "down")}
            disabled={index === totalShots - 1}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            title="Move Down"
          >
            ↓
          </button>
          <button
            onClick={() => onDelete(shot.id)}
            className="p-1 text-red-400 hover:text-red-600 ml-2"
            title="Delete Shot"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Left Column: Image Source */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Visual Source
            </label>
            <div className="aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors relative overflow-hidden group">
              {shot.uploaded_image || shot.generated_image ? (
                 // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={shot.uploaded_image || shot.generated_image || ""} 
                  alt="Shot source" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 pointer-events-none">
                  <span className="block text-2xl mb-2">🖼️</span>
                  <span className="text-sm">Upload Image or Generate</span>
                </div>
              )}
              
              {/* Interaction Overlay */}
              <div className={`absolute inset-0 bg-black/50 transition-opacity flex items-center justify-center space-x-3 text-white font-medium ${shot.uploaded_image || shot.generated_image ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="hover:underline px-2 py-1"
                 >
                   Upload
                 </button>
                 <span>|</span>
                 <button 
                   onClick={() => onGenerateImage(shot.id)}
                   className="hover:underline px-2 py-1"
                 >
                   Generate
                 </button>
              </div>
              
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          </div>
          {shot.gemini_prompt && (
            <p className="text-xs text-gray-500 italic truncate">
              Gen Prompt: {shot.gemini_prompt}
            </p>
          )}
        </div>

        {/* Right Column: Configuration */}
        <div className="space-y-4">
          <div>
             <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Video Prompt
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-800"
              rows={3}
              placeholder="Describe the movement (e.g., 'Camera pans right, river flows rapidly')"
              value={shot.video_prompt}
              onChange={(e) => onUpdate(shot.id, { video_prompt: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Duration: {shot.duration}s
            </label>
            <div className="flex gap-2">
              {[4, 6, 8].map((d) => (
                <button
                  key={d}
                  onClick={() => onUpdate(shot.id, { duration: d })}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                    shot.duration === d
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
          
          {/* Video Generation Section */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            {shot.status === "generating" ? (
              <div className="flex items-center justify-center py-4 text-blue-600">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-medium">Generating video...</span>
              </div>
            ) : shot.video_url ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-green-600 uppercase tracking-wider">
                    Video Generated
                  </label>
                  <button
                    onClick={() => onGenerateVideo(shot.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Regenerate
                  </button>
                </div>
                <video src={shot.video_url} controls className="w-full rounded-lg shadow-sm" />
              </div>
            ) : (
              <button
                onClick={() => onGenerateVideo(shot.id)}
                disabled={!shot.video_prompt.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>Generate Video</span>
              </button>
            )}

            {shot.status === "failed" && (
              <p className="text-xs text-red-500 mt-2 text-center">
                Video generation failed. Try again.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
