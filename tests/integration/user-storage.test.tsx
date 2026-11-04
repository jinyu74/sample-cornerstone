import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserStorageProvider } from "@/app/providers/user-storage-provider";
import {
  createIndexedDbDicomStore,
  type DicomStore,
  type StoredInstanceRecord,
  useDicomStore,
} from "@/entities/dicom-study";
import {
  createIndexedDbWorkStore,
  type StudyWorkStore,
  useStudyWorkStore,
} from "@/entities/study-work";
import { useStudyWork } from "@/features/edit-study-work";
import { LEGACY_DATABASE_NAME, userDatabaseName } from "@/shared/storage";

/**
 * 같은 브라우저에서 계정을 바꿔도 이전 계정의 원본·작업 결과가 보이지 않고,
 * 화면을 떠나며 시작한 저장은 그 계정 저장소에 끝까지 기록되는지 검증한다.
 */

const A = "8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f";
const B = "c9f0f895-fb98-4b91-8c2d-6e5f4a3b2c1d";
let run = 0;
// fake-indexeddb 는 테스트 파일 사이에서 공유되므로 실행마다 계정 ID 를 바꾼다.
function ids() {
  run += 1;
  const suffix = run.toString(16).padStart(12, "0");
  return {
    a: `${A.slice(0, 24)}${suffix}`,
    b: `${B.slice(0, 24)}${suffix}`,
  };
}

const opened: { close(): void }[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.close();
});
function directDicomStore(databaseName: string): DicomStore {
  const store = createIndexedDbDicomStore({ databaseName });
  opened.push(store);
  return store;
}
function directWorkStore(databaseName: string): StudyWorkStore {
  const store = createIndexedDbWorkStore({ databaseName });
  opened.push(store);
  return store;
}

function record(sopInstanceUid: string): StoredInstanceRecord {
  return {
    sopInstanceUid,
    studyInstanceUid: "2.25.1",
    seriesInstanceUid: "2.25.10",
    contentDigest: `digest-${sopInstanceUid}`,
    byteLength: 4,
    importedAt: "2026-11-03T00:00:00.000Z",
    metadata: {
      sopInstanceUid,
      sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
      studyInstanceUid: "2.25.1",
      seriesInstanceUid: "2.25.10",
      transferSyntaxUid: "1.2.840.10008.1.2.1",
      rows: 2,
      columns: 2,
      numberOfFrames: 1,
      frameKind: "single",
    },
  };
}

/** 현재 계정 저장소의 인스턴스 목록을 보여 주는 탐침 */
function InstanceProbe({ onStore }: { onStore?: (store: DicomStore) => void }) {
  const store = useDicomStore();
  const [uids, setUids] = useState<string[] | undefined>();
  useEffect(() => {
    onStore?.(store);
    let active = true;
    store.listInstances().then((list) => {
      if (active) setUids(list.map((item) => item.sopInstanceUid).sort());
    });
    return () => {
      active = false;
    };
  }, [store, onStore]);
  return (
    <output aria-label="instances">
      {uids === undefined ? "loading" : uids.join(",") || "empty"}
    </output>
  );
}

let editor: ReturnType<typeof useStudyWork> | undefined;
function WorkEditor() {
  const store = useStudyWorkStore();
  const state = useStudyWork({
    store,
    studyInstanceUid: "2.25.1",
    autosaveDelayMs: 60_000,
  });
  // 테스트가 현재 편집 상태를 조작할 수 있게 커밋 후 노출한다
  useEffect(() => {
    editor = state;
  });
  return <output aria-label="work">{state.status}</output>;
}

async function readyEditor() {
  await waitFor(() =>
    expect(screen.getByLabelText("work")).toHaveTextContent("ready"),
  );
  return editor!;
}

function addLabel(target: ReturnType<typeof useStudyWork>, name: string) {
  act(() => {
    const result = target.dispatch({
      type: "label/add",
      label: {
        id: `label-${name}`,
        name,
        category: "lesion",
        color: "#123456",
      },
    });
    expect(result.ok).toBe(true);
  });
}

/** 지연 정리(다음 매크로태스크)와 IndexedDB 완료를 기다린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("UserStorageProvider: 계정별 브라우저 저장소 경계", () => {
  it("계정 A 의 원본은 같은 브라우저의 계정 B 에 보이지 않고, A 로 돌아오면 다시 보인다", async () => {
    const { a, b } = ids();
    await directDicomStore(userDatabaseName(a)).addInstance(
      record("2.25.100"),
      new ArrayBuffer(4),
    );

    const view = render(
      <UserStorageProvider key={a} userId={a}>
        <InstanceProbe />
      </UserStorageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("instances")).toHaveTextContent("2.25.100"),
    );

    view.rerender(
      <UserStorageProvider key={b} userId={b}>
        <InstanceProbe />
      </UserStorageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("instances")).toHaveTextContent("empty"),
    );

    view.rerender(
      <UserStorageProvider key={a} userId={a}>
        <InstanceProbe />
      </UserStorageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("instances")).toHaveTextContent("2.25.100"),
    );
    view.unmount();
  });

  it("같은 계정 안에서 화면이 바뀌어도(다시 렌더링) 같은 저장소를 유지한다", async () => {
    const { a } = ids();
    const seen: DicomStore[] = [];
    const onStore = (store: DicomStore) => seen.push(store);
    const view = render(
      <UserStorageProvider key={a} userId={a}>
        <InstanceProbe onStore={onStore} />
      </UserStorageProvider>,
    );
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    view.rerender(
      <UserStorageProvider key={a} userId={a}>
        <InstanceProbe onStore={onStore} />
        <span>다른 화면 조각</span>
      </UserStorageProvider>,
    );
    await settle();
    expect(new Set(seen).size).toBe(1);
    view.unmount();
  });

  it("저장 전에 화면을 떠나도(Provider 와 함께 언마운트) 마지막 변경을 그 계정 저장소에 저장한다", async () => {
    const { a } = ids();
    const view = render(
      <UserStorageProvider key={a} userId={a}>
        <WorkEditor />
      </UserStorageProvider>,
    );
    addLabel(await readyEditor(), "떠나기 직전");
    view.unmount();
    await settle();

    const saved = await directWorkStore(userDatabaseName(a)).getWork("2.25.1");
    expect(saved?.labels.map((label) => label.name)).toContain("떠나기 직전");
  });

  it("계정이 바뀌는 순간 시작된 A 의 늦은 저장은 A 저장소에만 쓰이고 B 에는 쓰이지 않는다", async () => {
    const { a, b } = ids();
    const view = render(
      <UserStorageProvider key={a} userId={a}>
        <WorkEditor />
      </UserStorageProvider>,
    );
    addLabel(await readyEditor(), "A 전용");

    view.rerender(
      <UserStorageProvider key={b} userId={b}>
        <WorkEditor />
      </UserStorageProvider>,
    );
    const bEditor = await readyEditor();
    expect(bEditor.work?.labels.map((label) => label.name)).not.toContain(
      "A 전용",
    );
    await settle();

    expect(
      (
        await directWorkStore(userDatabaseName(a)).getWork("2.25.1")
      )?.labels.map((label) => label.name),
    ).toContain("A 전용");
    expect(
      await directWorkStore(userDatabaseName(b)).getWork("2.25.1"),
    ).toBeUndefined();
    view.unmount();
  });

  it.each([
    ["Provider 언마운트", "unmount"],
    ["계정 B 로 전환", "switch"],
  ] as const)(
    "첫 저장이 진행 중일 때 두 번째 편집 후 %s 해도 최신 revision 까지 A 에 저장하고 B 는 오염되지 않는다",
    async (_name, mode) => {
      const { a, b } = ids();
      const view = render(
        <UserStorageProvider key={a} userId={a}>
          <WorkEditor />
        </UserStorageProvider>,
      );
      const first = await readyEditor();
      addLabel(first, "첫 편집");
      let firstSave!: Promise<boolean>;
      act(() => {
        firstSave = first.saveNow();
      });
      // 첫 saveWork 가 끝나기 전에 두 번째 편집
      addLabel(editor!, "두 번째 편집");
      const latestRevision = editor!.work!.revision;

      // 저장소 정리 타이머가 첫 저장 완료보다 먼저 실행되는 최악의 순서를 고정한다.
      // (IndexedDB 완료는 setTimeout 이 아닌 경로로 진행되므로 정리 타이머만 앞당긴다)
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        if (mode === "unmount") {
          view.unmount();
        } else {
          view.rerender(
            <UserStorageProvider key={b} userId={b}>
              <WorkEditor />
            </UserStorageProvider>,
          );
        }
        vi.runOnlyPendingTimers();
      } finally {
        vi.useRealTimers();
      }
      await firstSave;
      await settle();
      await settle();

      const saved = await directWorkStore(userDatabaseName(a)).getWork(
        "2.25.1",
      );
      expect(saved?.revision).toBe(latestRevision);
      expect(saved?.labels.map((label) => label.name)).toEqual(
        expect.arrayContaining(["첫 편집", "두 번째 편집"]),
      );
      expect(
        await directWorkStore(userDatabaseName(b)).getWork("2.25.1"),
      ).toBeUndefined();
      if (mode === "switch") {
        const bEditor = await readyEditor();
        expect(bEditor.work?.labels.map((label) => label.name)).not.toContain(
          "두 번째 편집",
        );
        view.unmount();
      }
    },
  );

  it("이전 익명 저장소는 열거나 지우거나 계정에 옮기지 않는다", async () => {
    const { a } = ids();
    const legacy = directDicomStore(LEGACY_DATABASE_NAME);
    await legacy.addInstance(record(`2.25.9${run}`), new ArrayBuffer(4));

    const view = render(
      <UserStorageProvider key={a} userId={a}>
        <InstanceProbe />
      </UserStorageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("instances")).toHaveTextContent("empty"),
    );
    view.unmount();
    await settle();

    expect(
      (await legacy.listInstances()).map((item) => item.sopInstanceUid),
    ).toContain(`2.25.9${run}`);
  });

  it("Provider 밖에서 저장소를 쓰면 전역 저장소로 대체하지 않고 오류를 낸다", () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      expect(() => render(<InstanceProbe />)).toThrow(/UserStorageProvider/);
    } finally {
      console.error = original;
    }
  });
});
