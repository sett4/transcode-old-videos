import * as winston from "winston";
import { mkdir } from "fs/promises";
import { statSync } from "fs";
import path, { join } from "path";
import { parseArgs } from "util";
import { readdir } from "fs/promises";
import { Readable } from "stream";
import { ffprobe } from "fluent-ffmpeg";
import type * as Ffmpeg from "fluent-ffmpeg";
import { $ } from "bun";
import { changeExtension } from "./util";

// コマンドライン引数のパース
const { values } = parseArgs({
  options: {
    workDir: { type: "string" },
    src: { type: "string", required: true },
  },
});

const workDir =
  values.workDir ??
  join(
    process.cwd(),
    `output-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );

// 作業ディレクトリの作成
await mkdir(workDir, { recursive: true });

// Winstonロガーの設定
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    // コンソールへの出力
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // ファイルへの出力を作業ディレクトリ内に変更
    new winston.transports.File({
      filename: join(workDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: join(workDir, "combined.log"),
    }),
  ],
});

// ログの出力例
logger.info("作業ディレクトリを作成しました", { workDir });

if (!values.src) {
  throw new Error("--src オプションは必須です");
}

// 動画ファイルの拡張子
const VIDEO_EXTENSIONS = new Set([".mp4", ".avi", ".mov", ".mkv"]);

// 既存のimportの下に追加
type TranscodeResult = {
  inputFile: string;
  outputFile: string;
  inputSize: number;
  outputSize: number;
  transcodeRatio: number;
};

// 動画ファイルを列挙するストリームを作成
async function* listVideoFiles(directory: string): AsyncGenerator<string> {
  const files = await readdir(directory, { withFileTypes: true });

  for (const file of files) {
    const fullPath = join(directory, file.name);
    if (file.isDirectory()) {
      yield* listVideoFiles(fullPath);
    } else if (
      VIDEO_EXTENSIONS.has(file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "")
    ) {
      yield fullPath;
    }
  }
}

async function* filterOldCodecVideoFiles(
  files: AsyncGenerator<string>
): AsyncGenerator<string> {
  for await (const file of files) {
    try {
      const metadata: Ffmpeg.FfprobeData = await new Promise(
        (resolve, reject) => {
          ffprobe(file, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        }
      );

      for (const stream of metadata.streams) {
        if (stream.codec_type === "video") {
          logger.info("動画ストリームを検出しました", {
            codec_name: stream.codec_name,
            codec_long_name: stream.codec_long_name,
            file: file,
          });
          if (isModernCodec(stream.codec_name || "")) {
            logger.info("Codecが新しいのでスキップ", {
              codec_name: stream.codec_name,
              codec_long_name: stream.codec_long_name,
              file: file,
            });
            continue;
          }
          yield file;
        }
      }
    } catch (err) {
      logger.error("メタデータ取得中にエラーが発生しました。スキップします", {
        err,
        file: file,
      });
    }
  }
}

// transcodeVideo関数の戻り値の型を指定
async function transcodeVideo(inputFile: string): Promise<TranscodeResult> {
  logger.info("動画ファイルを変換します", { file: inputFile });
  const relativePath = path.relative(values.src || "/", inputFile);

  const outputFile = changeExtension(path.join(workDir, relativePath), ".mp4");
  await mkdir(path.dirname(outputFile), { recursive: true });
  // await $`nice -n 19 ffmpeg -i ${inputFile} -c:v libsvtav1 -q:v 25 -c:a copy ${outputFile}`;
  await $`nice -n 19 ffmpeg -vaapi_device /dev/dri/renderD128 -i ${inputFile} -c:v hevc_vaapi -vf 'format=nv12,hwupload' -qp 24 -c:a copy ${outputFile}`;

  const inputSize = statSync(inputFile).size;
  const outputSize = statSync(outputFile).size;

  return {
    inputFile,
    outputFile,
    inputSize,
    outputSize,
    transcodeRatio: Math.trunc((outputSize / inputSize) * 100),
  };
}

// transcodeVideoFileStreamの戻り値の型も更新
async function* transcodeVideoFileStream(
  files: AsyncGenerator<string>
): AsyncGenerator<TranscodeResult> {
  for await (const file of files) {
    yield await transcodeVideo(file);
  }
}

function isModernCodec(codec_name: string) {
  const modernCodecList = ["hevc", "av1", "h265"];

  for (const modernCodecName of modernCodecList) {
    if (codec_name.toLowerCase().includes(modernCodecName)) {
      return true;
    }
  }
  return false;
}

const videoFiles = listVideoFiles(values.src);
const oldCodecVideoFiles = filterOldCodecVideoFiles(videoFiles);
const transcodedVideoFiles = transcodeVideoFileStream(oldCodecVideoFiles);

for await (const transcodeResult of transcodedVideoFiles) {
  logger.info("変換後の動画ファイルを検出しました", { transcodeResult });
}
