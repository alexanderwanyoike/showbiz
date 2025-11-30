"use client";

import { useRef, useState } from "react";
import { ArrowUp, ArrowDown, X, Upload, Sparkles, Copy, Loader2, RefreshCw, ImageIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(shot.id, e.target.files[0]);
    }
  };

  const hasImage = shot.uploaded_image || shot.generated_image;

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      {/* Shot Header */}
      <CardHeader className="bg-muted/50 px-4 py-3 border-b border-border flex flex-row justify-between items-center space-y-0">
        <div className="font-semibold text-foreground">Shot #{shot.order}</div>
        <div className="flex items-center space-x-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onMove(index, "up")}
                  disabled={index === 0}
                  className="h-8 w-8"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Up</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onMove(index, "down")}
                  disabled={index === totalShots - 1}
                  className="h-8 w-8"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Down</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(shot.id)}
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Shot</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Image Source */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Visual Source
            </label>
            <div className="aspect-video bg-muted rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors relative overflow-hidden group">
              {hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot.uploaded_image || shot.generated_image || ""}
                  alt="Shot source"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 pointer-events-none">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <span className="text-sm">Upload Image or Generate</span>
                </div>
              )}

              {/* Interaction Overlay */}
              <div
                className={`absolute inset-0 bg-black/60 transition-opacity flex items-center justify-center gap-2 ${
                  hasImage ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                }`}
              >
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
                    <TooltipContent>Upload Image</TooltipContent>
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
                    <TooltipContent>Generate with AI</TooltipContent>
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
                        <TooltipContent>Copy from Shot</TooltipContent>
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
          </div>
          {shot.gemini_prompt && (
            <p className="text-xs text-muted-foreground italic truncate">
              Gen Prompt: {shot.gemini_prompt}
            </p>
          )}
        </div>

        {/* Right Column: Configuration */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Video Prompt
            </label>
            <Textarea
              className="min-h-[80px] text-sm"
              rows={3}
              placeholder="Describe the movement (e.g., 'Camera pans right, river flows rapidly')"
              value={shot.video_prompt}
              onChange={(e) => onUpdate(shot.id, { video_prompt: e.target.value })}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Video duration: 8 seconds (fixed by Veo 3)
          </p>

          {/* Video Generation Section */}
          <div className="mt-4 pt-4 border-t border-border">
            {shot.status === "generating" ? (
              <div className="flex items-center justify-center py-4 text-primary">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                <span className="text-sm font-medium">Generating video...</span>
              </div>
            ) : shot.video_url ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="default" className="bg-primary/20 text-primary border-0">
                    Video Generated
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onGenerateVideo(shot.id)}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate
                  </Button>
                </div>
                <video src={shot.video_url} controls className="w-full rounded-lg shadow-sm" />
              </div>
            ) : (
              <Button
                onClick={() => onGenerateVideo(shot.id)}
                disabled={!shot.video_prompt.trim()}
                className="w-full"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Video
              </Button>
            )}

            {shot.status === "failed" && (
              <p className="text-xs text-destructive mt-2 text-center">
                Video generation failed. Try again.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
