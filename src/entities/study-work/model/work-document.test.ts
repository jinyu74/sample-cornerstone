import { describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "./labels";
import type { Annotation, StudyWork } from "./types";
import {
  applyWorkAction,
  createStudyWork,
  deriveWorkStatus,
} from "./work-document";

const NOW = "2026-11-02T10:00:00.000Z";
const LATER = "2026-11-02T10:05:00.000Z";

function annotation(
  id: string,
  overrides: Partial<Annotation> = {},
): Annotation {
  return {
    id,
    tool: "length",
    reference: {
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.10",
      sopInstanceUid: "2.25.100",
    },
    imagePoints: [
      [0, 0],
      [3, 4],
    ],
    note: "",
    visible: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const lesion = DEFAULT_LABELS.find((label) => label.category === "lesion")!;
const organ = DEFAULT_LABELS.find((label) => label.category === "organ")!;

function base(): StudyWork {
  return createStudyWork("2.25.1", NOW);
}

describe("createStudyWork", () => {
  it("기본 라벨·빈 주석·revision 0 의 버전 있는 문서를 만든다", () => {
    expect(base()).toEqual({
      schemaVersion: 1,
      studyInstanceUid: "2.25.1",
      labels: [...DEFAULT_LABELS],
      targets: [],
      annotations: [],
      completed: false,
      revision: 0,
      updatedAt: NOW,
    });
  });
});

describe("applyWorkAction", () => {
  it("주석 추가·수정·가시성·삭제마다 revision 과 updatedAt 을 갱신하고 입력 문서는 바꾸지 않는다", () => {
    const start = base();
    const added = applyWorkAction(
      start,
      { type: "annotation/add", annotation: annotation("a1") },
      LATER,
    );
    expect(added.ok && added.work.annotations.map((item) => item.id)).toEqual([
      "a1",
    ]);
    expect(added.ok && added.work.revision).toBe(1);
    expect(start.annotations).toEqual([]);

    const moved = applyWorkAction(
      added.ok ? added.work : start,
      {
        type: "annotation/update",
        id: "a1",
        patch: {
          imagePoints: [
            [1, 1],
            [2, 2],
          ],
          note: "메모",
        },
      },
      LATER,
    );
    expect(moved.ok && moved.work.annotations[0]).toMatchObject({
      imagePoints: [
        [1, 1],
        [2, 2],
      ],
      note: "메모",
      updatedAt: LATER,
      createdAt: NOW,
    });

    const hidden = applyWorkAction(
      moved.ok ? moved.work : start,
      { type: "annotation/update", id: "a1", patch: { visible: false } },
      LATER,
    );
    expect(hidden.ok && hidden.work.annotations[0]!.visible).toBe(false);

    const removed = applyWorkAction(
      hidden.ok ? hidden.work : start,
      { type: "annotation/delete", id: "a1" },
      LATER,
    );
    expect(removed.ok && removed.work.annotations).toEqual([]);
    expect(removed.ok && removed.work.revision).toBe(4);
  });

  it("잘못된 포인트·중복 id·없는 주석·없는 라벨·라벨과 다른 대상 연결을 거부한다", () => {
    const work = base();
    const withOne = applyWorkAction(
      work,
      { type: "annotation/add", annotation: annotation("a1") },
      LATER,
    );
    if (!withOne.ok) throw new Error("setup");

    expect(
      applyWorkAction(
        work,
        {
          type: "annotation/add",
          annotation: annotation("x", { imagePoints: [[0, 0]] }),
        },
        LATER,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining("포인트 수") });
    expect(
      applyWorkAction(
        withOne.work,
        { type: "annotation/add", annotation: annotation("a1") },
        LATER,
      ),
    ).toMatchObject({ ok: false, error: "이미 있는 주석 ID 입니다: a1" });
    expect(
      applyWorkAction(work, { type: "annotation/delete", id: "nope" }, LATER),
    ).toMatchObject({ ok: false, error: "주석을 찾을 수 없습니다: nope" });
    expect(
      applyWorkAction(
        withOne.work,
        { type: "annotation/update", id: "a1", patch: { labelId: "missing" } },
        LATER,
      ),
    ).toMatchObject({ ok: false, error: "라벨을 찾을 수 없습니다: missing" });

    const targeted = applyWorkAction(
      withOne.work,
      {
        type: "target/add",
        target: { id: "t1", labelId: lesion.id, name: `${lesion.name} 1` },
      },
      LATER,
    );
    if (!targeted.ok) throw new Error("setup");
    expect(
      applyWorkAction(
        targeted.work,
        {
          type: "annotation/update",
          id: "a1",
          patch: { labelId: organ.id, targetId: "t1" },
        },
        LATER,
      ),
    ).toMatchObject({
      ok: false,
      error: "대상 t1 은(는) 선택한 라벨에 속하지 않습니다",
    });
    expect(
      applyWorkAction(
        targeted.work,
        {
          type: "annotation/update",
          id: "a1",
          patch: { labelId: lesion.id, targetId: "t1" },
        },
        LATER,
      ).ok,
    ).toBe(true);
  });

  it("라벨 변경 시 다른 라벨의 대상 연결은 해제한다", () => {
    let work = base();
    for (const action of [
      { type: "annotation/add", annotation: annotation("a1") },
      {
        type: "target/add",
        target: { id: "t1", labelId: lesion.id, name: "x 1" },
      },
      {
        type: "annotation/update",
        id: "a1",
        patch: { labelId: lesion.id, targetId: "t1" },
      },
    ] as const) {
      const result = applyWorkAction(work, action, LATER);
      if (!result.ok) throw new Error(result.error);
      work = result.work;
    }

    const relabeled = applyWorkAction(
      work,
      { type: "annotation/update", id: "a1", patch: { labelId: organ.id } },
      LATER,
    );

    expect(relabeled.ok && relabeled.work.annotations[0]).toMatchObject({
      labelId: organ.id,
      targetId: undefined,
    });
  });

  it("사용자 정의 라벨 추가·수정은 검증을 거친다", () => {
    const added = applyWorkAction(
      base(),
      {
        type: "label/add",
        label: { id: "c1", name: "혈관", color: "#a855f7", category: "organ" },
      },
      LATER,
    );
    expect(added.ok && added.work.labels.at(-1)).toEqual({
      id: "c1",
      name: "혈관",
      color: "#a855f7",
      category: "organ",
    });
    expect(
      applyWorkAction(
        base(),
        {
          type: "label/add",
          label: {
            id: "c2",
            name: organ.name,
            color: "#000000",
            category: "organ",
          },
        },
        LATER,
      ),
    ).toMatchObject({
      ok: false,
      error: "같은 분류에 같은 이름의 라벨이 있습니다",
    });

    const renamed = applyWorkAction(
      added.ok ? added.work : base(),
      {
        type: "label/update",
        id: "c1",
        patch: { name: "대혈관", color: "#7c3aed" },
      },
      LATER,
    );
    expect(
      renamed.ok && renamed.work.labels.find((label) => label.id === "c1"),
    ).toEqual({
      id: "c1",
      name: "대혈관",
      color: "#7c3aed",
      category: "organ",
    });
  });

  it("대상의 라벨은 존재해야 하고 대상 id 는 중복될 수 없다", () => {
    expect(
      applyWorkAction(
        base(),
        {
          type: "target/add",
          target: { id: "t1", labelId: "missing", name: "x" },
        },
        LATER,
      ),
    ).toMatchObject({ ok: false, error: "라벨을 찾을 수 없습니다: missing" });
  });

  it("완료 표시를 바꾼다", () => {
    const done = applyWorkAction(
      base(),
      { type: "work/complete", completed: true },
      LATER,
    );
    expect(done.ok && done.work.completed).toBe(true);
  });
});

describe("영상 좌표·world 좌표 정합성", () => {
  it("imagePoints 만 바꾸면 이전 worldPoints 를 남기지 않는다(오래된 world 좌표 방지)", () => {
    const withWorld = applyWorkAction(
      base(),
      {
        type: "annotation/add",
        annotation: annotation("a1", {
          worldPoints: [
            [0, 0, 0],
            [3, 4, 0],
          ],
        }),
      },
      LATER,
    );
    if (!withWorld.ok) throw new Error("setup");

    const moved = applyWorkAction(
      withWorld.work,
      {
        type: "annotation/update",
        id: "a1",
        patch: {
          imagePoints: [
            [1, 1],
            [9, 9],
          ],
        },
      },
      LATER,
    );

    expect(moved.ok && moved.work.annotations[0]!.worldPoints).toBeUndefined();
  });

  it("imagePoints 와 함께 worldPoints 를 주면 둘 다 반영하고, 개수가 다르면 거부한다", () => {
    const added = applyWorkAction(
      base(),
      { type: "annotation/add", annotation: annotation("a1") },
      LATER,
    );
    if (!added.ok) throw new Error("setup");

    const both = applyWorkAction(
      added.work,
      {
        type: "annotation/update",
        id: "a1",
        patch: {
          imagePoints: [
            [1, 1],
            [2, 2],
          ],
          worldPoints: [
            [1, 1, 0],
            [2, 2, 0],
          ],
        },
      },
      LATER,
    );
    expect(both.ok && both.work.annotations[0]!.worldPoints).toEqual([
      [1, 1, 0],
      [2, 2, 0],
    ]);
    expect(
      applyWorkAction(
        added.work,
        {
          type: "annotation/update",
          id: "a1",
          patch: {
            imagePoints: [
              [1, 1],
              [2, 2],
            ],
            worldPoints: [[1, 1, 0]],
          },
        },
        LATER,
      ),
    ).toMatchObject({
      ok: false,
      error: "world 좌표 수가 영상 좌표 수와 다릅니다",
    });
  });
});

describe("work/replace (결과 가져오기)", () => {
  it("같은 검사의 문서로 내용을 바꾸고 revision 은 현재 문서 기준으로 올린다", () => {
    const current = { ...base(), revision: 7 };
    const incoming = {
      ...base(),
      revision: 2,
      completed: true,
      annotations: [annotation("imported")],
    };

    const result = applyWorkAction(
      current,
      { type: "work/replace", work: incoming },
      LATER,
    );

    expect(result.ok && result.work).toMatchObject({
      completed: true,
      revision: 8,
      updatedAt: LATER,
    });
    expect(result.ok && result.work.annotations.map((item) => item.id)).toEqual(
      ["imported"],
    );
  });

  it("다른 검사의 문서로는 바꾸지 않는다", () => {
    const other = createStudyWork("2.25.999", NOW);

    expect(
      applyWorkAction(base(), { type: "work/replace", work: other }, LATER),
    ).toEqual({
      ok: false,
      error: "다른 검사(2.25.999)의 결과로 바꿀 수 없습니다",
    });
  });
});

describe("deriveWorkStatus (S3-2)", () => {
  it("결과가 없으면 미작업, 주석이 있으면 작업 중, 완료 표시면 완료", () => {
    expect(deriveWorkStatus(undefined)).toBe("untouched");
    expect(deriveWorkStatus(base())).toBe("untouched");
    const withAnnotation = applyWorkAction(
      base(),
      { type: "annotation/add", annotation: annotation("a1") },
      LATER,
    );
    expect(
      deriveWorkStatus(withAnnotation.ok ? withAnnotation.work : undefined),
    ).toBe("in-progress");
    expect(deriveWorkStatus({ ...base(), completed: true })).toBe("done");
  });
});
