/**
 * Where a printed marker is in 3D, from the four corners the QR detector reports.
 *
 * The marker is a flat square, so its image is a homography of that square. With the camera's
 * focal length the homography splits into a rotation and a translation: the marker's pose. The
 * bench is then drawn standing on the marker, tilting as the marker tilts, by a 3D camera that
 * matches the phone's.
 *
 * Browsers do not report a camera's focal length, so it is estimated from a typical phone field
 * of view. A wrong guess changes how far away the bench seems, not which way it faces; the bench
 * still sits on the marker and follows it.
 */

export type Point = { x: number; y: number };
export type Vec3 = [number, number, number];

/** A typical horizontal field of view for a phone's main rear camera. */
export const DEFAULT_HORIZONTAL_FOV_DEGREES = 66;

/** Corners of a unit marker in its own plane: top-left, top-right, bottom-right, bottom-left. */
const SQUARE: Point[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

/** Solves A·x = b by Gaussian elimination with partial pivoting; null when A is singular. */
export function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, index) => [...row, b[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
    }
    if (Math.abs(m[pivot][column]) < 1e-12) return null;
    [m[column], m[pivot]] = [m[pivot], m[column]];
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = m[row][column] / m[column][column];
      for (let k = column; k <= n; k += 1) m[row][k] -= factor * m[column][k];
    }
  }
  return m.map((row, index) => row[n] / row[index]);
}

/** The 3×3 homography (row-major, h33 = 1) taking the unit square to the four image points. */
export function homographyFromSquare(corners: Point[]): number[] | null {
  if (corners.length !== 4) return null;
  const a: number[][] = [];
  const b: number[] = [];
  SQUARE.forEach((source, index) => {
    const { x: u, y: v } = corners[index];
    a.push([source.x, source.y, 1, 0, 0, 0, -u * source.x, -u * source.y]);
    b.push(u);
    a.push([0, 0, 0, source.x, source.y, 1, -v * source.x, -v * source.y]);
    b.push(v);
  });
  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
const normalize = (a: Vec3) => scale(a, 1 / length(a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export type Camera = { focal: number; cx: number; cy: number };

/**
 * Rotation columns and translation of the marker in camera coordinates (x right, y down,
 * z forward), with the marker's side as the unit of length.
 */
export function poseFromHomography(
  h: number[],
  camera: Camera,
): { r1: Vec3; r2: Vec3; r3: Vec3; t: Vec3 } | null {
  const { focal, cx, cy } = camera;
  // K⁻¹ applied to each column of H.
  const column = (index: number): Vec3 => {
    const x = h[index];
    const y = h[3 + index];
    const z = h[6 + index];
    return [(x - cx * z) / focal, (y - cy * z) / focal, z];
  };
  let h1 = column(0);
  let h2 = column(1);
  let h3 = column(2);
  const lambda = 2 / (length(h1) + length(h2));
  if (!Number.isFinite(lambda)) return null;
  h1 = scale(h1, lambda);
  h2 = scale(h2, lambda);
  h3 = scale(h3, lambda);
  // The marker is in front of the camera.
  if (h3[2] < 0) {
    h1 = scale(h1, -1);
    h2 = scale(h2, -1);
    h3 = scale(h3, -1);
  }
  const r1 = normalize(h1);
  const r2 = normalize(subtract(h2, scale(r1, dot(r1, h2))));
  const r3 = cross(r1, r2);
  return { r1, r2, r3, t: h3 };
}

export type ArPose = {
  /** Column-major 4×4 for three.js, placing the bench on the marker in camera space. */
  matrix: number[];
  /** Vertical field of view for a three.js camera filling the displayed view. */
  fov: number;
  aspect: number;
};

export type PoseInput = {
  corners: Point[];
  video: { width: number; height: number };
  display: { width: number; height: number };
  /** How many marker widths one unit of the bench is. */
  benchScale?: number;
  horizontalFovDegrees?: number;
};

/**
 * The bench's pose for a video drawn with `object-fit: cover`, in the coordinates of a three.js
 * camera placed at the origin and looking down −z.
 */
export function markerPose3d({
  corners,
  video,
  display,
  benchScale = 0.42,
  horizontalFovDegrees = DEFAULT_HORIZONTAL_FOV_DEGREES,
}: PoseInput): ArPose | null {
  if (!video.width || !video.height || !display.width || !display.height) return null;
  const cover = Math.max(display.width / video.width, display.height / video.height);
  const offsetX = (display.width - video.width * cover) / 2;
  const offsetY = (display.height - video.height * cover) / 2;
  const shown = corners.map((point) => ({
    x: point.x * cover + offsetX,
    y: point.y * cover + offsetY,
  }));
  const videoFocal = video.width / 2 / Math.tan(((horizontalFovDegrees / 2) * Math.PI) / 180);
  const camera = { focal: videoFocal * cover, cx: display.width / 2, cy: display.height / 2 };
  const h = homographyFromSquare(shown);
  if (!h) return null;
  const pose = poseFromHomography(h, camera);
  if (!pose) return null;
  const { r1, r2, r3, t } = pose;
  // The bench's right is the marker's right, its up points out of the marker towards the
  // camera, and its front is the marker's bottom edge. OpenCV axes become three.js axes by
  // flipping y and z.
  const flip = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]];
  const x = scale(flip(r1), benchScale);
  const y = scale(flip(scale(r3, -1)), benchScale);
  const z = scale(flip(r2), benchScale);
  const origin = flip(t);
  return {
    matrix: [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, ...origin, 1],
    fov: (2 * Math.atan(display.height / 2 / camera.focal) * 180) / Math.PI,
    aspect: display.width / display.height,
  };
}

/** Projects a 3D point in camera coordinates (x right, y down, z forward) to the image. */
export function project(point: Vec3, camera: Camera): Point {
  return {
    x: (camera.focal * point[0]) / point[2] + camera.cx,
    y: (camera.focal * point[1]) / point[2] + camera.cy,
  };
}
