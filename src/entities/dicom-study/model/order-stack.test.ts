import { describe, expect, it } from "vitest";

import { orderStackImages } from "./order-stack";
import type { StackImageRef } from "./types";

const AXIAL = [1, 0, 0, 0, 1, 0] as const;
const SAGITTAL = [0, 1, 0, 0, 0, -1] as const;

function axial(uid: string, z: number, instanceNumber?: number): StackImageRef {
  return {
    sopInstanceUid: uid,
    instanceNumber,
    imagePositionPatient: [-100, -120, z],
    imageOrientationPatient: AXIAL,
  };
}

const uids = (images: readonly StackImageRef[]) =>
  images.map(
    (image) =>
      `${image.sopInstanceUid}${image.frameNumber ? `#${image.frameNumber}` : ""}`,
  );

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describe("orderStackImages", () => {
  describe("S1-1/S1-2 공간 정렬", () => {
    it("축상 영상을 InstanceNumber·입력 순서가 아닌 위치 투영값 오름차순으로 정렬한다", () => {
      // InstanceNumber 가 위치와 반대 순서여도 위치를 우선한다.
      const input = [axial("c", 5, 1), axial("a", -5, 3), axial("b", 0, 2)];

      const result = orderStackImages(input);

      expect(result.method).toBe("spatial");
      expect(uids(result.ordered)).toEqual(["a", "b", "c"]);
      expect(result.warnings).toEqual([]);
    });

    it("시상면에서는 z 가 아닌 슬라이스 법선(row × column)에 투영한다", () => {
      // row=(0,1,0), column=(0,0,-1) → normal=(-1,0,0). x 가 클수록 투영값이 작다.
      const at = (uid: string, x: number): StackImageRef => ({
        sopInstanceUid: uid,
        imagePositionPatient: [x, 0, 0],
        imageOrientationPatient: SAGITTAL,
      });

      const result = orderStackImages([
        at("x10", 10),
        at("x30", 30),
        at("x20", 20),
      ]);

      expect(result.method).toBe("spatial");
      expect(uids(result.ordered)).toEqual(["x30", "x20", "x10"]);
    });

    it("사선 방향과 소수점 오차가 있는 방향 벡터도 같은 방향으로 판단한다", () => {
      const s = Math.SQRT1_2;
      const normal = [-s, s, 0] as const;
      const make = (
        uid: string,
        step: number,
        rounding: number,
      ): StackImageRef => ({
        sopInstanceUid: uid,
        imagePositionPatient: [1 + normal[0] * step, 2 + normal[1] * step, 3],
        imageOrientationPatient: [s + rounding, s - rounding, 0, 0, 0, -1],
      });

      const result = orderStackImages([
        make("s2", 5, 0),
        make("s0", 0, 1e-6),
        make("s1", 2.5, -1e-6),
      ]);

      expect(result.method).toBe("spatial");
      expect(uids(result.ordered)).toEqual(["s0", "s1", "s2"]);
    });

    it("입력 순서를 바꿔도 같은 결과를 내고 입력 배열을 변경하지 않는다", () => {
      const input = [
        axial("a", 0, 1),
        axial("b", 2, 2),
        axial("c", 4, 3),
        axial("d", 6, 4),
      ];
      const shuffled = [input[2]!, input[0]!, input[3]!, input[1]!];
      const snapshot = [...shuffled];

      expect(uids(orderStackImages(shuffled).ordered)).toEqual(
        uids(orderStackImages(input).ordered),
      );
      expect(shuffled).toEqual(snapshot);
    });

    it("멀티프레임의 프레임별 위치로 프레임을 정렬한다", () => {
      const frame = (frameNumber: number, z: number): StackImageRef => ({
        sopInstanceUid: "mf",
        frameNumber,
        instanceNumber: 1,
        imagePositionPatient: [0, 0, z],
        imageOrientationPatient: AXIAL,
      });

      const result = orderStackImages([
        frame(1, 20),
        frame(2, 10),
        frame(3, 0),
      ]);

      expect(result.method).toBe("spatial");
      expect(uids(result.ordered)).toEqual(["mf#3", "mf#2", "mf#1"]);
    });
  });

  describe("S1-3 같은 위치", () => {
    it("투영값이 같으면 InstanceNumber, 그다음 SOP UID 로 결정적 정렬하고 경고한다", () => {
      const result = orderStackImages([
        axial("1.2.3", 0, 5),
        axial("1.2.9", 0, 3),
        axial("1.2.1", 0, 3),
        axial("1.2.0", -1, 9),
      ]);

      expect(result.method).toBe("spatial");
      expect(uids(result.ordered)).toEqual([
        "1.2.0",
        "1.2.1",
        "1.2.9",
        "1.2.3",
      ]);
      expect(result.warnings).toEqual(["duplicate-position"]);
    });
  });

  describe("S1-2 입력 순열 독립성(전순서)", () => {
    const summarize = (images: readonly StackImageRef[]) => {
      const result = orderStackImages(images);
      return JSON.stringify([
        result.method,
        result.warnings,
        uids(result.ordered),
      ]);
    };

    it("허용 오차 이내 위치가 연쇄되어도 거리 순 앵커 그룹으로 결정적으로 묶는다", () => {
      // 0 과 0.00075 는 같은 위치 그룹(앵커 0 기준 1µm 이내), 0.0015 는 앵커와 1µm 초과 → 다음 그룹.
      const images = [
        axial("1.1", 0, 3),
        axial("1.2", 0.00075, 2),
        axial("1.3", 0.0015, 1),
      ];

      const results = new Set(permutations(images).map(summarize));

      expect([...results]).toEqual([
        JSON.stringify([
          "spatial",
          ["duplicate-position"],
          ["1.2", "1.1", "1.3"],
        ]),
      ]);
    });

    it("방향 미세 오차가 연쇄될 때 참조 방향 선택이 입력 순서에 의존하지 않는다", () => {
      // 행 방향 y 성분 0, 0.8e-4, 1.6e-4: 가운데 영상 기준이면 모두 허용 오차 이내,
      // 양 끝 영상 기준이면 반대쪽 끝이 허용 오차를 넘는다.
      const tilted = (uid: string, tilt: number, z: number): StackImageRef => ({
        sopInstanceUid: uid,
        instanceNumber: Number(uid.split(".").at(-1)),
        imagePositionPatient: [0, 0, z],
        imageOrientationPatient: [1, tilt, 0, -tilt, 1, 0],
      });
      const images = [
        tilted("2.1", 0, 10),
        tilted("2.2", 0.8e-4, 0),
        tilted("2.3", 1.6e-4, 5),
      ];

      const results = new Set(permutations(images).map(summarize));

      expect(results.size).toBe(1);
    });
  });

  describe("S1-2/S1-4 공간 정렬 불가 원인의 순열 독립성", () => {
    it("무효 방향과 방향 불일치가 함께 있으면 입력 순서와 무관하게 invalid-orientation", () => {
      const images: StackImageRef[] = [
        axial("3.1", 0, 1),
        {
          sopInstanceUid: "3.2",
          instanceNumber: 2,
          imagePositionPatient: [0, 0, 1],
          imageOrientationPatient: SAGITTAL,
        },
        {
          sopInstanceUid: "3.3",
          instanceNumber: 3,
          imagePositionPatient: [0, 0, 2],
          imageOrientationPatient: [0, 0, 0, 0, 1, 0],
        },
      ];

      const warnings = new Set(
        permutations(images).map((order) =>
          orderStackImages(order).warnings.join(","),
        ),
      );

      expect([...warnings]).toEqual(["invalid-orientation"]);
    });
  });

  describe("S1-4 공간 정렬 불가 → InstanceNumber", () => {
    it("일부 영상에 위치가 없으면 InstanceNumber 로 정렬하고 원인을 경고한다", () => {
      const noPosition: StackImageRef = {
        sopInstanceUid: "b",
        instanceNumber: 2,
        imageOrientationPatient: AXIAL,
      };

      const result = orderStackImages([
        axial("c", -10, 3),
        noPosition,
        axial("a", 10, 1),
      ]);

      expect(result.method).toBe("instance-number");
      expect(uids(result.ordered)).toEqual(["a", "b", "c"]);
      expect(result.warnings).toEqual(["missing-position"]);
    });

    it("방향이 영상마다 다르면(예: scout + axial) 공간 정렬하지 않는다", () => {
      const scout: StackImageRef = {
        sopInstanceUid: "scout",
        instanceNumber: 1,
        imagePositionPatient: [0, 0, 100],
        imageOrientationPatient: SAGITTAL,
      };

      const result = orderStackImages([
        axial("ax2", 0, 3),
        scout,
        axial("ax1", 5, 2),
      ]);

      expect(result.method).toBe("instance-number");
      expect(uids(result.ordered)).toEqual(["scout", "ax1", "ax2"]);
      expect(result.warnings).toEqual(["inconsistent-orientation"]);
    });

    it.each([
      ["길이 0 벡터", [0, 0, 0, 0, 1, 0]],
      ["행·열 방향이 직교하지 않음", [1, 0, 0, 1, 0, 0]],
      ["유한하지 않은 값", [Number.NaN, 0, 0, 0, 1, 0]],
    ] as const)(
      "방향 벡터가 무효(%s)이면 invalid-orientation",
      (_case, orientation) => {
        const make = (uid: string, z: number, n: number): StackImageRef => ({
          sopInstanceUid: uid,
          instanceNumber: n,
          imagePositionPatient: [0, 0, z],
          imageOrientationPatient: orientation,
        });

        const result = orderStackImages([make("b", 0, 2), make("a", 10, 1)]);

        expect(result.method).toBe("instance-number");
        expect(uids(result.ordered)).toEqual(["a", "b"]);
        expect(result.warnings).toEqual(["invalid-orientation"]);
      },
    );

    it("InstanceNumber 가 같은 멀티프레임 프레임은 프레임 번호 순서를 따른다", () => {
      const frame = (frameNumber: number): StackImageRef => ({
        sopInstanceUid: "mf",
        frameNumber,
        instanceNumber: 1,
      });

      const result = orderStackImages([frame(3), frame(1), frame(2)]);

      expect(result.method).toBe("instance-number");
      expect(uids(result.ordered)).toEqual(["mf#1", "mf#2", "mf#3"]);
      expect(result.warnings).toEqual(["missing-position"]);
    });
  });

  describe("S1-5 정렬 메타데이터 부족", () => {
    it("위치와 InstanceNumber 가 모두 부족하면 UID 구성요소를 숫자로 비교해 결정적으로 둔다", () => {
      const result = orderStackImages<StackImageRef>([
        { sopInstanceUid: "1.2.840.10", instanceNumber: 1 },
        { sopInstanceUid: "1.2.840.9" },
        { sopInstanceUid: "1.2.840.2", instanceNumber: 2 },
      ]);

      expect(result.method).toBe("unordered");
      expect(uids(result.ordered)).toEqual([
        "1.2.840.2",
        "1.2.840.9",
        "1.2.840.10",
      ]);
      expect(result.warnings).toEqual([
        "missing-position",
        "missing-instance-number",
        "no-ordering-metadata",
      ]);
    });
  });

  describe("S1-6 경계", () => {
    it("빈 입력은 empty", () => {
      expect(orderStackImages([])).toEqual({
        ordered: [],
        method: "empty",
        warnings: [],
      });
    });

    it("영상 1개는 메타데이터와 무관하게 single", () => {
      const only: StackImageRef = { sopInstanceUid: "only" };

      expect(orderStackImages([only])).toEqual({
        ordered: [only],
        method: "single",
        warnings: [],
      });
    });
  });
});
