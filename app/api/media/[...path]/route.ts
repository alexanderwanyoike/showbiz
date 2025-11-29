import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MEDIA_DIR = path.join(process.cwd(), "media");

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const relativePath = pathSegments.join("/");
  const filepath = path.join(MEDIA_DIR, relativePath);

  // Security: Prevent directory traversal
  const resolvedPath = path.resolve(filepath);
  if (!resolvedPath.startsWith(MEDIA_DIR)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Check if file exists
  if (!fs.existsSync(filepath)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Get file stats and extension
  const stats = fs.statSync(filepath);
  const ext = path.extname(filepath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  // Read file
  const fileBuffer = fs.readFileSync(filepath);

  // Return response with appropriate headers
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": stats.size.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
