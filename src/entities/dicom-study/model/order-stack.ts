import { dot, type Vec3 } from "@/shared/lib/geometry";

import { compareUid } from "./compare-uid";
import {
  orientationAxes,
  POSITION_TOLERANCE_MM,
  sameAxes,
} from "./orientation";
import type {
  StackImageRef,
  StackOrderResult,
  StackOrderWarning,
} from "./types";

type SpatialCheck =
  | { ok: true; normal: Vec3 }
  | {
      ok: false;
      reason: Extract<
        StackOrderWarning,
        "missing-position" | "invalid-orientation" | "inconsistent-orientation"
      >;
    };

/**
 * 스택 영상을 해부학적 위치 순서로 정렬한다.
 * 위치·방향 → InstanceNumber → SOP Instance UID 순으로 대체하며 파일명 순서는 쓰지 않는다.
 */
export function orderStackImages<T extends StackImageRef>(
  images: readonly T[],
): StackOrderResult<T> {
  if (images.length === 0)
    return { ordered: [], method: "empty", warnings: [] };
  if (images.length === 1)
    return { ordered: [...images], method: "single", warnings: [] };

  const spatial = checkSpatial(images);
  if (spatial.ok) {
    const { ordered, hasDuplicate } = sortByPosition(images, spatial.normal);
    return {
      ordered,
      method: "spatial",
      warnings: hasDuplicate ? ["duplicate-position"] : [],
    };
  }

  if (images.every((image) => isFiniteNumber(image.instanceNumber))) {
    return {
      ordered: [...images].sort(compareByInstance),
      method: "instance-number",
      warnings: [spatial.reason],
    };
  }

  return {
    ordered: [...images].sort(compareByIdentity),
    method: "unordered",
    warnings: [
      spatial.reason,
      "missing-instance-number",
      "no-ordering-metadata",
    ],
  };
}

/**
 * 위치를 슬라이스 법선에 투영한 정확한 거리로 먼저 전순서 정렬한 뒤,
 * 앵커(그룹 첫 영상) 기준 허용 오차 이내 영상을 같은 위치 그룹으로 묶는다.
 * 허용 오차를 비교 함수 안에서 "같음"으로 처리하면 비교 관계가 추이적이지 않아
 * (a≈b, b≈c 이지만 a≠c) 정렬 결과가 입력 순서에 따라 달라지므로 쓰지 않는다.
 * 그룹 안에서는 InstanceNumber → SOP UID → frame 순으로 정렬한다.
 */
function sortByPosition<T extends StackImageRef>(
  images: readonly T[],
  normal: Vec3,
): { ordered: T[]; hasDuplicate: boolean } {
  const keyed = images
    .map((image) => ({
      image,
      distance: dot(image.imagePositionPatient!, normal),
    }))
    .sort(
      (a, b) => a.distance - b.distance || compareByInstance(a.image, b.image),
    );

  const groups: (typeof keyed)[] = [];
  for (const entry of keyed) {
    const group = groups.at(-1);
    if (group && entry.distance - group[0]!.distance <= POSITION_TOLERANCE_MM) {
      group.push(entry);
    } else {
      groups.push([entry]);
    }
  }

  return {
    ordered: groups.flatMap((group) =>
      group.map((entry) => entry.image).sort(compareByInstance),
    ),
    hasDuplicate: groups.some((group) => group.length > 1),
  };
}

/**
 * 공간 정렬 가능 여부를 판단한다. 결과가 입력 순서에 의존하지 않도록
 * 1) 모든 방향의 유효성을 먼저 검사하고 2) 참조 방향은 입력 첫 영상이 아니라
 * SOP UID·frame 이 가장 작은 영상에서 고른 뒤 3) 모든 영상을 그 참조와 비교한다.
 */
function checkSpatial(images: readonly StackImageRef[]): SpatialCheck {
  if (
    images.some((image) => !image.imagePositionPatient?.every(Number.isFinite))
  ) {
    return { ok: false, reason: "missing-position" };
  }

  const axes = images.map((image) =>
    orientationAxes(image.imageOrientationPatient),
  );
  if (axes.some((axis) => axis === null)) {
    return { ok: false, reason: "invalid-orientation" };
  }

  let referenceIndex = 0;
  images.forEach((image, i) => {
    if (compareByIdentity(image, images[referenceIndex]!) < 0) {
      referenceIndex = i;
    }
  });
  const reference = axes[referenceIndex]!;

  const consistent = axes.every((axis) => sameAxes(axis!, reference));
  return consistent
    ? { ok: true, normal: reference.normal }
    : { ok: false, reason: "inconsistent-orientation" };
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function compareByInstance(a: StackImageRef, b: StackImageRef): number {
  const left = isFiniteNumber(a.instanceNumber)
    ? a.instanceNumber
    : Number.POSITIVE_INFINITY;
  const right = isFiniteNumber(b.instanceNumber)
    ? b.instanceNumber
    : Number.POSITIVE_INFINITY;
  if (left !== right) return left < right ? -1 : 1;
  return compareByIdentity(a, b);
}

function compareByIdentity(a: StackImageRef, b: StackImageRef): number {
  return (
    compareUid(a.sopInstanceUid, b.sopInstanceUid) ||
    (a.frameNumber ?? 0) - (b.frameNumber ?? 0)
  );
}
