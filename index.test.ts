import { expect, test, describe } from "bun:test";
import path from "path";
import { changeExtension } from "./util";

describe("changeExtension", () => {
  test("単純なファイル名の拡張子を変更", () => {
    expect(changeExtension("video.avi", ".mp4")).toBe("video.mp4");
  });

  test("パスを含むファイル名の拡張子を変更", () => {
    expect(changeExtension("/path/to/video.avi", ".mp4")).toBe(
      "/path/to/video.mp4"
    );
  });

  test("拡張子のないファイル名に拡張子を追加", () => {
    expect(changeExtension("video", ".mp4")).toBe("video.mp4");
  });

  test("ドットから始まる拡張子を正しく処理", () => {
    expect(changeExtension("video.avi", "mp4")).toBe("video.mp4");
  });

  test("複数の拡張子を持つファイル名を処理", () => {
    expect(changeExtension("video.old.avi", ".mp4")).toBe("video.old.mp4");
  });
});
