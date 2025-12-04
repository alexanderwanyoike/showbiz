"use client";

import { useRef, useState } from "react";
import { ArrowUp, ArrowDown, X, Upload, Sparkles, Copy, Loader2, RefreshCw, ImageIcon, Play, AlertCircle, Paintbrush, History, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
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
import ImageVersionTimeline from "./ImageVersionTimeline";
import type { ImageVersionNodeWithUrl, ImageVersionWithUrl } from "../actions/image-version-actions";

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
  error_message?: string | null;
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
  // Version support
  versions: ImageVersionNodeWithUrl[];
  currentVersion: ImageVersionWithUrl | null;
  versionCount: number;
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onGenerateImage: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  onCopyImageFromShot: (targetShotId: string, sourceShotId: string) => void;
  onGenerateVideo: (id: string) => void;
  // Version callbacks
  onVersionSelect: (shotId: string, versionId: string) => void;
  onBranchFrom: (shotId: string, versionId: string) => void;
  onEditImage: (shotId: string, versionId: string) => void;
  // Prompt generation callbacks
  onGenerateVideoPrompt: (shotId: string) => void;
  onEnhanceVideoPrompt: (shotId: string) => void;
  isGeneratingPrompt?: boolean;
  isEnhancingPrompt?: boolean;
}

export default function ShotCard({
  shot,
  index,
  totalShots,
  otherShotsWithImages,
  versions,
  currentVersion,
  versionCount,
  onUpdate,
  onDelete,
  onMove,
  onGenerateImage,
  onUploadImage,
  onCopyImageFromShot,
  onGenerateVideo,
  onVersionSelect,
  onBranchFrom,
  onEditImage,
  onGenerateVideoPrompt,
  onEnhanceVideoPrompt,
  isGeneratingPrompt,
  isEnhancingPrompt,
}: ShotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute top-2 right-2 z-10">
                    <Badge variant="destructive" className="text-xs cursor-help">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-sm">{shot.error_message || "Video generation failed"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Image Action Overlay - appears on hover */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
            {/* Primary actions row */}
            <div className="flex items-center gap-2">
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

            {/* Edit actions row - only shown when there's an image */}
            {hasImage && currentVersion && (
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onEditImage(shot.id, currentVersion.id)}
                      >
                        <Paintbrush className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit Image</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {versionCount > 1 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowVersionHistory(!showVersionHistory)}
                        >
                          <History className="h-4 w-4" />
                          <span className="ml-1 text-xs">{versionCount}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Version History</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
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

        {/* Version Timeline - collapsible */}
        {versionCount > 0 && showVersionHistory && (
          <div className="border-t border-border bg-muted/30 p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Version History ({versionCount})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => setShowVersionHistory(false)}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
            </div>
            <ImageVersionTimeline
              versions={versions}
              currentVersionId={currentVersion?.id || null}
              onVersionSelect={(versionId) => onVersionSelect(shot.id, versionId)}
              onBranchFrom={(versionId) => onBranchFrom(shot.id, versionId)}
              onEditFrom={(versionId) => onEditImage(shot.id, versionId)}
              compact
            />
          </div>
        )}

        {/* Version indicator bar - shown when there are multiple versions but timeline is collapsed */}
        {versionCount > 1 && !showVersionHistory && (
          <button
            onClick={() => setShowVersionHistory(true)}
            className="w-full flex items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border"
          >
            <History className="h-3 w-3" />
            <span>v{currentVersion?.version_number || 1} of {versionCount}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        )}

        {/* Content Area */}
        <div className="p-3 space-y-2">
          {/* Video Prompt with AI Buttons */}
          <div className="relative">
            <Textarea
              className="min-h-[60px] text-xs resize-none pr-14"
              rows={2}
              placeholder="Video prompt..."
              value={shot.video_prompt}
              onChange={(e) => onUpdate(shot.id, { video_prompt: e.target.value })}
            />
            {/* Prompt AI action buttons */}
            <div className="absolute top-1 right-1 flex items-center gap-0.5">
              {/* Generate from Image button */}
              {hasImage && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onGenerateVideoPrompt(shot.id)}
                        disabled={isGeneratingPrompt}
                      >
                        {isGeneratingPrompt ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ImageIcon className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate prompt from image</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Enhance Prompt button */}
              {shot.video_prompt.trim() && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onEnhanceVideoPrompt(shot.id)}
                        disabled={isEnhancingPrompt}
                      >
                        {isEnhancingPrompt ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Enhance prompt</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>

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
