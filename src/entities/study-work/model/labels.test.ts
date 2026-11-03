import { describe, expect, it } from "vitest";

import { DEFAULT_LABELS, nextTargetName, validateLabel } from "./labels";
import type { Label, Target } from "./types";

const labels: Label[] = [
  { id: "l1", name: "간", color: "#22c55e", category: "organ" },
  { id: "l2", name: "결절", color: "#ef4444", category: "lesion" },
];

describe("기본 라벨", () => {
  it("장기·병변 분류의 기본 라벨을 제공하고 id·이름이 중복되지 않는다", () => {
    expect(DEFAULT_LABELS.some((label) => label.category === "organ")).toBe(
      true,
    );
    expect(DEFAULT_LABELS.some((label) => label.category === "lesion")).toBe(
      true,
    );
    expect(new Set(DEFAULT_LABELS.map((label) => label.id)).size).toBe(
      DEFAULT_LABELS.length,
    );
    for (const label of DEFAULT_LABELS)
      expect(validateLabel(label, DEFAULT_LABELS)).toBeNull();
  });
});

describe("validateLabel (S5-4)", () => {
  it("정상 라벨은 통과", () => {
    expect(
      validateLabel(
        { id: "l3", name: "신장", color: "#3b82f6", category: "organ" },
        labels,
      ),
    ).toBeNull();
  });

  it("이름은 앞뒤 공백을 빼고 비어 있으면 안 된다", () => {
    expect(
      validateLabel(
        { id: "l3", name: "   ", color: "#3b82f6", category: "organ" },
        labels,
      ),
    ).toBe("empty-name");
  });

  it("같은 분류 안에서 대소문자·공백을 무시하고 이름이 중복되면 거부, 자기 자신 수정은 허용", () => {
    expect(
      validateLabel(
        { id: "l3", name: " 간 ", color: "#000000", category: "organ" },
        labels,
      ),
    ).toBe("duplicate-name");
    expect(
      validateLabel(
        { id: "l3", name: "간", color: "#000000", category: "lesion" },
        labels,
      ),
    ).toBeNull();
    expect(
      validateLabel(
        { id: "l1", name: "간", color: "#000000", category: "organ" },
        labels,
      ),
    ).toBeNull();
  });

  it("색상은 #rrggbb, 분류는 organ/lesion 만 허용", () => {
    expect(
      validateLabel(
        { id: "l3", name: "a", color: "red", category: "organ" },
        labels,
      ),
    ).toBe("invalid-color");
    expect(
      validateLabel(
        {
          id: "l3",
          name: "a",
          color: "#000000",
          category: "bone" as Label["category"],
        },
        labels,
      ),
    ).toBe("invalid-category");
  });
});

describe("nextTargetName (S5-5)", () => {
  it("라벨 이름 뒤에 그 라벨의 다음 번호를 붙인다(삭제로 빈 번호는 재사용하지 않음)", () => {
    const targets: Target[] = [
      { id: "t1", labelId: "l2", name: "결절 1" },
      { id: "t3", labelId: "l2", name: "결절 3" },
      { id: "t2", labelId: "l1", name: "간 1" },
    ];

    expect(nextTargetName(labels[1]!, targets)).toBe("결절 4");
    expect(nextTargetName(labels[0]!, targets)).toBe("간 2");
    expect(nextTargetName(labels[0]!, [])).toBe("간 1");
  });
});
