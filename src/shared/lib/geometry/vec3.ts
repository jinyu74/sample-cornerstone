export type Vec3 = readonly [number, number, number];

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** 길이가 0 이거나 유한하지 않으면 null */
export function normalize(a: Vec3): Vec3 | null {
  const len = length(a);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return [a[0] / len, a[1] / len, a[2] / len];
}
