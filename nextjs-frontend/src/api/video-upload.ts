import { unwrap } from "@/api/client-service";
import {
  initVideoUpload as initVideoUploadApi,
  confirmVideoUpload as confirmVideoUploadApi,
} from "@/api/openapi-client";

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(url);
      video.remove();
    };
    video.onerror = () => {
      reject(new Error("Failed to read video metadata"));
      URL.revokeObjectURL(url);
      video.remove();
    };
    video.src = url;
  });
}


export async function uploadToPresignedUrl(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
    };

    const finish = (
      callback: () => void,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const handleAbort = () => xhr.abort();

    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    xhr.open("PUT", url);
    xhr.timeout = 0; // Disable the browser's request timeout

    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    xhr.upload.onloadstart = () => {
      console.log("Video upload started:", file.size, "bytes");
    };

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(
          Math.round((event.loaded / event.total) * 100),
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => {
          console.log("R2 upload completed:", xhr.status);
          resolve();
        });
      } else {
        finish(() => {
          reject(
            new Error(
              `Upload failed: HTTP ${xhr.status} - ${xhr.responseText}`,
            ),
          );
        });
      }
    };

    xhr.onerror = () => {
      finish(() => {
        reject(new Error("Upload failed: network or CORS error"));
      });
    };

    xhr.ontimeout = () => {
      finish(() => {
        reject(new Error("Video upload timed out."));
      });
    };

    xhr.onabort = () => {
      finish(() => {
        reject(new DOMException("Upload aborted", "AbortError"));
      });
    };

    signal?.addEventListener("abort", handleAbort, {
      once: true,
    });

    xhr.send(file);
  });
}


export async function uploadLessonVideoViaPresigned(
  courseId: string,
  lessonId: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
) {
  const { upload_url, video_key } = (await unwrap(
    initVideoUploadApi({
      path: { course_id: courseId, lesson_id: lessonId },
      body: { file_name: file.name, content_type: file.type, file_size: file.size },
    }),
  )) as { upload_url: string; video_key: string };

  const [duration] = await Promise.all([
    getVideoDuration(file),
    uploadToPresignedUrl(upload_url, file, onProgress, signal),
  ]);

  const lesson = await unwrap(
    confirmVideoUploadApi({
      path: { course_id: courseId, lesson_id: lessonId },
      body: { video_key, duration_seconds: Math.ceil(duration) },
    }),
  );

  return lesson;
}
