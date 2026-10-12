import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QrScanner from "./qr-scanner";

const scannerMocks = vi.hoisted(() => ({
  decodeFromConstraints: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromConstraints = scannerMocks.decodeFromConstraints;
  },
}));

describe("QrScanner", () => {
  beforeEach(() => {
    scannerMocks.decodeFromConstraints.mockReset();
    scannerMocks.stop.mockReset();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  it("stops scanner controls when unmounted", async () => {
    scannerMocks.decodeFromConstraints.mockResolvedValue({
      stop: scannerMocks.stop,
    });
    const view = render(
      <QrScanner active onDetected={vi.fn()} onCameraError={vi.fn()} />,
    );
    await waitFor(() =>
      expect(scannerMocks.decodeFromConstraints).toHaveBeenCalledOnce(),
    );

    view.unmount();
    expect(scannerMocks.stop).toHaveBeenCalledOnce();
  });

  it("reports camera permission denial", async () => {
    scannerMocks.decodeFromConstraints.mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    const onCameraError = vi.fn();
    render(
      <QrScanner active onDetected={vi.fn()} onCameraError={onCameraError} />,
    );

    await waitFor(() =>
      expect(onCameraError).toHaveBeenCalledWith(
        expect.stringContaining("Quyền truy cập camera bị từ chối"),
      ),
    );
  });

  it("accepts only the first decoded frame and pauses the scanner", async () => {
    let decodeCallback:
      | ((
          result: { getText: () => string },
          error: undefined,
          controls: { stop: () => void },
        ) => void)
      | undefined;
    scannerMocks.decodeFromConstraints.mockImplementation(
      async (
        _constraints: MediaStreamConstraints,
        _video: HTMLVideoElement,
        callback: (
          result: { getText: () => string },
          error: undefined,
          controls: { stop: () => void },
        ) => void,
      ) => {
        decodeCallback = callback;
        return { stop: scannerMocks.stop };
      },
    );
    const onDetected = vi.fn();
    render(
      <QrScanner active onDetected={onDetected} onCameraError={vi.fn()} />,
    );
    await waitFor(() => expect(decodeCallback).toBeTypeOf("function"));

    act(() => {
      decodeCallback?.({ getText: () => "opaque" }, undefined, {
        stop: scannerMocks.stop,
      });
      decodeCallback?.({ getText: () => "opaque" }, undefined, {
        stop: scannerMocks.stop,
      });
    });

    expect(onDetected).toHaveBeenCalledOnce();
    expect(onDetected).toHaveBeenCalledWith("opaque");
    expect(scannerMocks.stop).toHaveBeenCalledOnce();
  });
});
