import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cameraErrorMessage,
  describeCamera,
  listCameras,
  mediaDevicesSupported,
  preferredCamera,
  subscribeToCameraChanges,
  type CameraDevice,
} from "./cameras";

function stubMediaDevices(devices: Partial<MediaDeviceInfo>[] | undefined) {
  if (devices === undefined) {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    return { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  }
  const listeners = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      enumerateDevices: vi.fn().mockResolvedValue(devices),
      getUserMedia: vi.fn(),
      ...listeners,
    },
    configurable: true,
  });
  return listeners;
}

function camera(overrides: Partial<CameraDevice> = {}): CameraDevice {
  return { deviceId: "a", label: "", isExternal: false, facing: "unknown", ...overrides };
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

describe("mediaDevicesSupported", () => {
  it("is false when the API is absent, as in an insecure context", () => {
    stubMediaDevices(undefined);
    expect(mediaDevicesSupported()).toBe(false);
  });

  it("is true when enumeration and capture are both available", () => {
    stubMediaDevices([]);
    expect(mediaDevicesSupported()).toBe(true);
  });
});

describe("listCameras", () => {
  it("returns only video inputs", async () => {
    stubMediaDevices([
      { kind: "audioinput", deviceId: "mic", label: "Microphone" },
      { kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" },
      { kind: "audiooutput", deviceId: "spk", label: "Speakers" },
    ]);

    const cameras = await listCameras();

    expect(cameras).toHaveLength(1);
    expect(cameras[0].deviceId).toBe("cam1");
  });

  it("flags an external USB camera and leaves the built-in one unflagged", async () => {
    stubMediaDevices([
      { kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" },
      { kind: "videoinput", deviceId: "cam2", label: "Logitech BRIO USB Camera" },
    ]);

    const cameras = await listCameras();

    expect(cameras.map((item) => item.isExternal)).toEqual([false, true]);
  });

  it("returns an empty list rather than throwing when enumeration fails", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        enumerateDevices: vi.fn().mockRejectedValue(new Error("blocked")),
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    await expect(listCameras()).resolves.toEqual([]);
  });

  it("is empty when the API is unavailable", async () => {
    stubMediaDevices(undefined);
    await expect(listCameras()).resolves.toEqual([]);
  });
});

describe("preferredCamera", () => {
  it("prefers a rear-facing camera on a handheld device", () => {
    const chosen = preferredCamera([
      camera({ deviceId: "front", facing: "user" }),
      camera({ deviceId: "back", facing: "environment" }),
      camera({ deviceId: "usb", isExternal: true }),
    ]);
    expect(chosen?.deviceId).toBe("back");
  });

  it("prefers an external camera on a desktop, since it points at the rig", () => {
    const chosen = preferredCamera([
      camera({ deviceId: "builtin" }),
      camera({ deviceId: "usb", isExternal: true }),
    ]);
    expect(chosen?.deviceId).toBe("usb");
  });

  it("is null when nothing is attached", () => {
    expect(preferredCamera([])).toBeNull();
  });
});

describe("describeCamera", () => {
  it("falls back to a positional name before permission reveals labels", () => {
    expect(describeCamera(camera({ label: "" }), 1)).toBe("Camera 2");
  });

  it("uses the real label once available", () => {
    expect(describeCamera(camera({ label: "Logitech BRIO" }), 0)).toBe("Logitech BRIO");
  });
});

describe("cameraErrorMessage", () => {
  it("distinguishes a missing camera from a denied one", () => {
    expect(cameraErrorMessage(new DOMException("x", "NotFoundError")).reason).toBe(
      "camera-not-found",
    );
    expect(cameraErrorMessage(new DOMException("x", "NotAllowedError")).reason).toBe(
      "permission-denied",
    );
  });

  it("reports a camera held by another application", () => {
    const result = cameraErrorMessage(new DOMException("x", "NotReadableError"));
    expect(result.reason).toBe("camera-busy");
    expect(result.message).toMatch(/already in use/i);
  });

  it("falls back for an unrecognised failure", () => {
    expect(cameraErrorMessage(new Error("boom")).reason).toBe("camera-unavailable");
  });
});

describe("subscribeToCameraChanges", () => {
  it("subscribes and unsubscribes from devicechange", () => {
    const listeners = stubMediaDevices([]);
    const onChange = vi.fn();

    const unsubscribe = subscribeToCameraChanges(onChange);
    expect(listeners.addEventListener).toHaveBeenCalledWith("devicechange", onChange);

    unsubscribe();
    expect(listeners.removeEventListener).toHaveBeenCalledWith("devicechange", onChange);
  });

  it("is a no-op when the API is unavailable", () => {
    stubMediaDevices(undefined);
    expect(() => subscribeToCameraChanges(vi.fn())()).not.toThrow();
  });
});
