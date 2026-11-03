export interface RetainedRegistry<K, V> {
  /** 키의 자원을 돌려준다. 없으면 만든다(렌더 중에 불러도 되는 멱등 조회). */
  get(key: K): V;
  /** 자원을 보유한다. 돌려준 함수로 해제하며, 마지막 해제 뒤 다음 매크로태스크에 정리한다. */
  retain(key: K): () => void;
}

interface Entry<V> {
  value: V;
  holders: number;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * 키별로 공유하는 자원(계정별 저장소 등)의 수명을 보유 수로 관리한다.
 * 해제 직후 같은 틱에 다시 보유하면(StrictMode 재마운트, 같은 계정 화면 이동) 정리하지 않는다.
 * 정리는 다음 매크로태스크로 미뤄, 같은 커밋의 자식 정리(언마운트 저장 시작)가 먼저 실행되게 한다.
 */
export function createRetainedRegistry<K, V>({
  create,
  dispose,
}: {
  create: (key: K) => V;
  dispose: (value: V) => void;
}): RetainedRegistry<K, V> {
  const entries = new Map<K, Entry<V>>();

  function entry(key: K): Entry<V> {
    let found = entries.get(key);
    if (!found) {
      found = { value: create(key), holders: 0 };
      entries.set(key, found);
    }
    return found;
  }

  return {
    get: (key) => entry(key).value,
    retain(key) {
      const target = entry(key);
      clearTimeout(target.timer);
      target.timer = undefined;
      target.holders += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        target.holders -= 1;
        if (target.holders > 0) return;
        target.timer = setTimeout(() => {
          if (target.holders > 0 || entries.get(key) !== target) return;
          entries.delete(key);
          dispose(target.value);
        }, 0);
      };
    },
  };
}
