import { expect, it } from "vitest";

import {
  collectDroppedFiles,
  type DroppedEntry,
} from "./collect-dropped-files";

it("브라우저 FileSystemFileEntry.file 메서드의 receiver를 보존한다", async () => {
  const file = new File(["fixture"], "image.dcm");
  const entry: DroppedEntry = {
    name: file.name,
    isFile: true,
    isDirectory: false,
    file(resolve) {
      if (this !== entry) throw new TypeError("Illegal invocation");
      resolve(file);
    },
  };
  await expect(collectDroppedFiles([entry], [])).resolves.toEqual([
    { path: file.name, file },
  ]);
});
