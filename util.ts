import path from "path";

export function changeExtension(filename: string, ext: string) {
  const pathObj = path.parse(filename);
  pathObj.ext = ext;
  return path.format({ dir: pathObj.dir, name: pathObj.name, ext: ext });
}
