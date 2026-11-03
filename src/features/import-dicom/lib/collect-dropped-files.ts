/** FileSystemEntry 중 이 기능이 쓰는 부분(브라우저 webkitGetAsEntry 결과와 호환) */
export interface DroppedEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (
    resolve: (file: File) => void,
    reject?: (error: unknown) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      resolve: (entries: DroppedEntry[]) => void,
      reject?: (error: unknown) => void,
    ) => void;
  };
}

export interface CollectedFile {
  path: string;
  file: File;
}

/**
 * 드롭한 항목(파일·폴더)에서 파일을 모두 모은다. 폴더는 하위까지 순회하며 상대 경로를 이름으로 쓴다.
 * 항목 API(webkitGetAsEntry)가 없으면 dataTransfer.files 를 그대로 쓴다.
 */
export async function collectDroppedFiles(
  entries: readonly DroppedEntry[],
  fallback: readonly File[],
): Promise<CollectedFile[]> {
  if (entries.length === 0)
    return fallback.map((file) => ({ path: file.name, file }));
  const collected: CollectedFile[] = [];
  for (const entry of entries) await walk(entry, "", collected);
  return collected;
}

async function walk(
  entry: DroppedEntry,
  prefix: string,
  out: CollectedFile[],
): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    // 브라우저 FileSystemFileEntry.file 은 receiver(this)가 필요하므로 메서드로 호출한다.
    const file = await new Promise<File>((resolve, reject) =>
      entry.file!(resolve, reject),
    );
    out.push({ path, file });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<DroppedEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, path, out);
    }
  }
}
