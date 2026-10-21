"use client";

import { ImageUp, Link2, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { AxiosError } from "axios";

import { client } from "@/api/openapi-client/client.gen";
import { getErrorMessage } from "@/lib/error-handler";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const MAX_IMAGE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE / (1024 * 1024);

interface ImagePickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
}

export function ImagePicker({
  value,
  onChange,
  label = "Image",
  className,
}: ImagePickerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`Image must be ${MAX_IMAGE_SIZE_MB}MB or less`);
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await client.instance.post<{ data?: string }>(
        "/api/admin/media/upload",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const url = res.data?.data;
      if (!url) {
        throw new Error("Upload returned no URL");
      }
      onChange(url);
      toast.success("Image uploaded");
    } catch (err) {
      const axiosError = err as AxiosError;
      if (axiosError.response?.status === 413) {
        toast.error(`Image too large. Maximum size is ${MAX_IMAGE_SIZE_MB}MB.`);
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {value ? (
        <div className="relative overflow-hidden border border-border/60 bg-dark group rounded">
          <img
            src={value}
            alt="Preview"
            className="w-full max-h-64 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-red-600 text-white rounded-sm flex items-center justify-center transition-colors"
            title="Remove image"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full aspect-video max-h-48 bg-surface border-2 border-dashed border-border/60 hover:border-gold/40 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-center gap-2 text-text-muted"
        >
          <ImageUp size={28} />
          <span className="text-2xs font-mono uppercase tracking-widest">
            {isUploading ? "Uploading..." : `Upload ${label}`}
          </span>
        </button>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-3 py-2 border border-border text-2xs font-mono uppercase tracking-widest text-text-muted hover:text-gold hover:border-gold transition-colors disabled:opacity-40 rounded"
        >
          {isUploading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <ImageUp size={12} />
          )}
          Choose file
        </button>
        <button
          type="button"
          onClick={() => {
            setShowUrl((s) => !s);
            setUrlDraft(value);
          }}
          className={cn(
            "flex items-center gap-2 px-3 py-2 border text-2xs font-mono uppercase tracking-widest transition-colors disabled:opacity-40 rounded",
            showUrl
              ? "border-gold text-gold"
              : "border-border text-text-muted hover:text-gold hover:border-gold"
          )}
        >
          <Link2 size={12} />
          Use URL
        </button>
      </div>

      {showUrl && (
        <div className="flex gap-2">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="flex-1 bg-dark border border-border px-3 py-2 text-sm text-text-main focus:border-gold outline-none rounded"
          />
          <button
            type="button"
            onClick={() => {
              if (urlDraft.trim()) {
                onChange(urlDraft.trim());
                setShowUrl(false);
              }
            }}
            className="px-4 py-2 bg-gold text-dark text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity rounded"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
