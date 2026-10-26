"use client";

import { useEffect, useRef } from "react";

export type QrScannerProps = {
  active: boolean;
  onDetected: (token: string) => void;
  onCameraError: (message: string) => void;
};

function stopVideo(video: HTMLVideoElement | null) {
  const stream = video?.srcObject;
  if (stream && "getTracks" in stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (video) video.srcObject = null;
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Quyền truy cập camera bị từ chối. Hãy cho phép camera hoặc dán mã vé thủ công.";
    }
    if (error.name === "NotFoundError") {
      return "Không tìm thấy camera trên thiết bị này. Bạn vẫn có thể dán mã vé thủ công.";
    }
    if (error.name === "NotReadableError") {
      return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó hoặc dán mã vé thủ công.";
    }
  }
  return "Không thể mở camera trên trình duyệt này. Hãy dùng HTTPS hoặc dán mã vé thủ công.";
}

export default function QrScanner({
  active,
  onDetected,
  onCameraError,
}: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!active) {
      stopVideo(video);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onCameraError(
        "Trình duyệt không hỗ trợ camera. Bạn vẫn có thể dán mã vé thủ công.",
      );
      return;
    }

    let disposed = false;
    let controls: { stop: () => void } | undefined;
    detectedRef.current = false;

    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (disposed || !video) return;
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 180,
        });
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (result, _error, scannerControls) => {
            if (!result || disposed || detectedRef.current) return;
            detectedRef.current = true;
            scannerControls.stop();
            stopVideo(video);
            onDetected(result.getText());
          },
        );
        if (disposed) controls.stop();
      })
      .catch((error: unknown) => {
        if (!disposed) onCameraError(cameraErrorMessage(error));
      });

    return () => {
      disposed = true;
      controls?.stop();
      stopVideo(video);
    };
  }, [active, onCameraError, onDetected]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/10 bg-black">
      <video
        ref={videoRef}
        aria-label="Camera quét mã QR"
        className="aspect-[3/4] w-full object-cover sm:aspect-video"
        muted
        playsInline
      />
      <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-sun shadow-[0_0_0_999px_rgba(2,6,23,0.38)]" />
      <p className="absolute inset-x-4 bottom-4 rounded-full bg-canvas/80 px-4 py-2 text-center text-xs text-ink backdrop-blur">
        Đưa mã QR vào giữa khung
      </p>
    </div>
  );
}
