import { describe, expect, it } from "vitest";

import {
  homographyFromSquare,
  markerPose3d,
  poseFromHomography,
  project,
  type Camera,
  type Vec3,
} from "./markerPose";

const camera: Camera = { focal: 900, cx: 640, cy: 360 };

function rotation(xDegrees: number, yDegrees: number): [Vec3, Vec3, Vec3] {
  const a = (xDegrees * Math.PI) / 180;
  const b = (yDegrees * Math.PI) / 180;
  // R = Ry · Rx, returned as columns.
  const rx = [
    [1, 0, 0],
    [0, Math.cos(a), -Math.sin(a)],
    [0, Math.sin(a), Math.cos(a)],
  ];
  const ry = [
    [Math.cos(b), 0, Math.sin(b)],
    [0, 1, 0],
    [-Math.sin(b), 0, Math.cos(b)],
  ];
  const r = ry.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * rx[k][j], 0)));
  return [0, 1, 2].map((j) => [r[0][j], r[1][j], r[2][j]] as Vec3) as [Vec3, Vec3, Vec3];
}

function cornersFor(r1: Vec3, r2: Vec3, t: Vec3) {
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([x, y]) => project([0, 1, 2].map((i) => r1[i] * x + r2[i] * y + t[i]) as Vec3, camera));
}

describe("marker pose", () => {
  it("recovers a tilted, turned marker's rotation and distance", () => {
    const [r1, r2, r3] = rotation(-50, 25);
    const t: Vec3 = [0.3, -0.2, 4];
    const h = homographyFromSquare(cornersFor(r1, r2, t));
    expect(h).not.toBeNull();
    const pose = poseFromHomography(h!, camera)!;
    for (let i = 0; i < 3; i += 1) {
      expect(pose.r1[i]).toBeCloseTo(r1[i], 4);
      expect(pose.r2[i]).toBeCloseTo(r2[i], 4);
      expect(pose.r3[i]).toBeCloseTo(r3[i], 4);
      expect(pose.t[i]).toBeCloseTo(t[i], 3);
    }
  });

  it("stands the bench up out of a marker lying flat on a table", () => {
    // A marker on a table seen from above and in front: tipped away from the camera.
    const [r1, r2] = rotation(-60, 0);
    const t: Vec3 = [0, 0.5, 5];
    const video = { width: 1280, height: 720 };
    const pose = markerPose3d({
      corners: cornersFor(r1, r2, t),
      video,
      display: video,
      horizontalFovDegrees: (2 * Math.atan(640 / 900) * 180) / Math.PI,
      benchScale: 1,
    })!;
    const up = pose.matrix.slice(4, 7);
    // In three.js, the bench's up should point mostly upward on screen and towards the viewer.
    expect(up[1]).toBeGreaterThan(0.4);
    expect(up[2]).toBeGreaterThan(0);
    // The bench sits in front of the camera, which looks down −z.
    expect(pose.matrix[14]).toBeCloseTo(-5, 1);
    expect(pose.aspect).toBeCloseTo(16 / 9, 5);
  });

  it("accounts for a cropped video", () => {
    const [r1, r2] = rotation(-30, 10);
    const corners = cornersFor(r1, r2, [0, 0, 4]);
    const full = markerPose3d({
      corners,
      video: { width: 1280, height: 720 },
      display: { width: 1280, height: 720 },
    })!;
    // A phone in portrait shows the middle of the same frame, scaled up.
    const portrait = markerPose3d({
      corners,
      video: { width: 1280, height: 720 },
      display: { width: 390, height: 720 },
    })!;
    for (let i = 0; i < 12; i += 1) expect(portrait.matrix[i]).toBeCloseTo(full.matrix[i], 3);
    expect(portrait.aspect).toBeCloseTo(390 / 720, 5);
  });

  it("gives up on corners that do not form a square's image", () => {
    const collapsed = [0, 1, 2, 3].map(() => ({ x: 10, y: 10 }));
    expect(homographyFromSquare(collapsed)).toBeNull();
  });
});
