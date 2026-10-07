import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraArView } from "./CameraArView";

type Listener = () => void;

function stubMediaDevices(devices: Partial<MediaDeviceInfo>[]) {
  const listeners: Listener[] = [];
  const enumerateDevices = vi.fn().mockResolvedValue(devices);
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      enumerateDevices,
      getUserMedia: vi.fn(),
      addEventListener: (_: string, handler: Listener) => listeners.push(handler),
      removeEventListener: vi.fn(),
    },
    configurable: true,
  });
  return {
    enumerateDevices,
    setDevices(next: Partial<MediaDeviceInfo>[]) {
      enumerateDevices.mockResolvedValue(next);
    },
    fireDeviceChange() {
      listeners.forEach((handler) => handler());
    },
  };
}

function renderView() {
  return render(
    <CameraArView
      currentStep={null}
      disabled={false}
      onAction={vi.fn()}
      onTelemetry={vi.fn()}
      expectedMarker="OPEDU-TEST-V1"
    />,
  );
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  vi.restoreAllMocks();
});

describe("CameraArView camera detection", () => {
  it("tells the learner no camera is connected and how to attach one", async () => {
    stubMediaDevices([]);

    renderView();

    expect(await screen.findByText(/no camera detected/i)).toBeVisible();
    expect(screen.getByText(/connect a usb camera/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /check again/i })).toBeEnabled();
  });

  it("reports how many cameras are attached", async () => {
    stubMediaDevices([
      { kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" },
      { kind: "videoinput", deviceId: "cam2", label: "Logitech BRIO USB" },
    ]);

    renderView();

    expect(await screen.findByText("2 cameras detected")).toBeVisible();
  });

  it("offers a picker that marks the external camera, and defaults to it", async () => {
    stubMediaDevices([
      { kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" },
      { kind: "videoinput", deviceId: "cam2", label: "Logitech BRIO USB" },
    ]);

    renderView();

    const picker = (await screen.findByLabelText(/^camera$/i)) as HTMLSelectElement;
    expect(picker).toBeVisible();
    // The external camera is the one pointed at the rig, so it is preselected.
    expect(picker.value).toBe("cam2");
    expect(
      screen.getByRole("option", { name: /logitech brio usb \(external\)/i }),
    ).toBeInTheDocument();
  });

  it("hides the picker when only one camera is attached", async () => {
    stubMediaDevices([{ kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" }]);

    renderView();

    expect(await screen.findByText("1 camera detected")).toBeVisible();
    expect(screen.queryByLabelText(/^camera$/i)).not.toBeInTheDocument();
  });

  it("picks up a camera attached after the page loaded", async () => {
    const media = stubMediaDevices([]);

    renderView();
    expect(await screen.findByText(/no camera detected/i)).toBeVisible();

    // A learner plugs in a USB camera; the browser fires devicechange.
    media.setDevices([{ kind: "videoinput", deviceId: "usb1", label: "USB Camera" }]);
    media.fireDeviceChange();

    expect(await screen.findByText("1 camera detected")).toBeVisible();
  });

  it("re-scans on demand when the learner presses Check again", async () => {
    const media = stubMediaDevices([]);

    renderView();
    expect(await screen.findByText(/no camera detected/i)).toBeVisible();

    media.setDevices([{ kind: "videoinput", deviceId: "usb1", label: "USB Camera" }]);
    fireEvent.click(screen.getByRole("button", { name: /check again/i }));

    expect(await screen.findByText("1 camera detected")).toBeVisible();
  });

  it("keeps entry disabled until the safety confirmation is ticked", async () => {
    stubMediaDevices([{ kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" }]);

    renderView();
    await screen.findByText("1 camera detected");

    const enter = screen.getByRole("button", { name: /enable camera and enter ar/i });
    expect(enter).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(enter).toBeEnabled();
  });

  it("explains that the browser cannot use cameras at all", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });

    renderView();

    expect(await screen.findByText(/cannot access cameras/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /check again/i })).not.toBeInTheDocument();
  });
});

describe("CameraArView start failures", () => {
  it("distinguishes a missing camera from a denied permission", async () => {
    stubMediaDevices([{ kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" }]);
    navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("none", "NotFoundError"));

    renderView();
    await screen.findByText("1 camera detected");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /enable camera and enter ar/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/no camera is connected/i),
    );
  });

  it("reports a camera already held by another application", async () => {
    stubMediaDevices([{ kind: "videoinput", deviceId: "cam1", label: "Integrated Webcam" }]);
    navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("busy", "NotReadableError"));

    renderView();
    await screen.findByText("1 camera detected");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /enable camera and enter ar/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/already in use/i));
  });
});
