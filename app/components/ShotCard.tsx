"use client";

import { useRef, useState } from "react";
import { ArrowUp, ArrowDown, X, Upload, Sparkles, Copy, Loader2, RefreshCw, ImageIcon, Play } from "lucide-react";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ShotStatus = "pending" | "generating" | "complete" | "failed";

export interface Shot {
  id: string;
  order: number;

  // Image
  uploaded_image: string | null;
  gemini_prompt: string | null;
  generated_image: string | null;

  // Video
  video_prompt: string;
  video_url: string | null;
  status: ShotStatus;
}

export interface ShotImageOption {
  id: string;
  order: number;
  image_url: string;
}

interface ShotCardProps {
  shot: Shot;
  index: number;
  totalShots: number;
  otherShotsWithImages: ShotImageOption[];
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onGenerateImage: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  onCopyImageFromShot: (targetShotId: string, sourceShotId: string) => void;
  onGenerateVideo: (id: string) => void;
}

export default function ShotCard({
  shot,
  index,
  totalShots,
  otherShotsWithImages,
  onUpdate,
  onDelete,
  onMove,
  onGenerateImage,
  onUploadImage,
  onCopyImageFromShot,
  onGenerateVideo,
}: ShotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(shot.id, e.target.files[0]);
    }
  };

  const hasImage = shot.uploaded_image || shot.generated_image;

  return (
    <>
      <Card className="overflow-hidden transition-all hover:shadow-lg group py-0 gap-0">
        {/* Image Area - 16:9 aspect ratio */}
        <div className="aspect-video bg-muted relative overflow-hidden">
          {hasImage ? (
            <img
              src={shot.uploaded_image || shot.generated_image || ""}
              alt={`Shot ${shot.order}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 mb-1 opacity-50" />
              <span className="text-xs">No image</span>
            </div>
          )}

          {/* Shot Number Badge - always visible */}
          <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded">
            #{shot.order}
          </div>

          {/* Status/Video Badge - always visible above overlay */}
          {shot.status === "generating" && (
            <div className="absolute top-2 right-2 z-10">
              <Badge className="bg-primary/90 text-primary-foreground text-xs">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Generating
              </Badge>
            </div>
          )}
          {shot.video_url && shot.status !== "generating" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVideoDialog(true);
              }}
              className="absolute top-2 right-2 z-10 bg-primary/90 hover:bg-primary text-primary-foreground text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors"
            >
              <Play className="h-3 w-3" />
              Video
            </button>
          )}
          {shot.status === "failed" && !shot.video_url && (
            <div className="absolute top-2 right-2 z-10">
              <Badge variant="destructive" className="text-xs">
                Failed
              </Badge>
            </div>
          )}

          {/* Image Action Overlay - appears on hover */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onGenerateImage(shot.id)}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generate</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {otherShotsWithImages.length > 0 && (
              <DropdownMenu open={showCopyMenu} onOpenChange={setShowCopyMenu}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Copy</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="center">
                  {otherShotsWithImages.map((otherShot) => (
                    <DropdownMenuItem
                      key={otherShot.id}
                      onClick={() => {
                        onCopyImageFromShot(shot.id, otherShot.id);
                        setShowCopyMenu(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <img
                        src={otherShot.image_url}
                        alt={`Shot ${otherShot.order}`}
                        className="w-8 h-8 object-cover rounded"
                      />
                      <span>Shot #{otherShot.order}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        {/* Content Area */}
        <div className="p-3 space-y-2">
          {/* Video Prompt */}
          <Textarea
            className="min-h-[60px] text-xs resize-none"
            rows={2}
            placeholder="Video prompt..."
            value={shot.video_prompt}
            onChange={(e) => onUpdate(shot.id, { video_prompt: e.target.value })}
          />

          {/* Actions Row */}
          <div className="flex items-center justify-between gap-2">
            {/* Move & Delete */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onMove(index, "up")}
                disabled={index === 0}
                className="h-7 w-7"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onMove(index, "down")}
                disabled={index === totalShots - 1}
                className="h-7 w-7"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(shot.id)}
                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Generate Video Button */}
            {shot.status === "generating" ? (
              <Button size="sm" disabled className="h-7 text-xs">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Generating
              </Button>
            ) : shot.video_url ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onGenerateVideo(shot.id)}
                className="h-7 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Regen
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onGenerateVideo(shot.id)}
                disabled={!hasImage || !shot.video_prompt.trim()}
                className="h-7 text-xs"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Generate
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Video Preview Dialog */}
      <Dialog open={showVideoDialog} onOpenChange={setShowVideoDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Shot #{shot.order} - Video Preview</DialogTitle>
          </DialogHeader>
          {shot.video_url && (
            <video
              src={shot.video_url}
              controls
              autoPlay
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
