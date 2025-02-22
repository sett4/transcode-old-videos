import * as winston from "winston";
import { mkdir } from "fs/promises";
import { join } from "path";
import { parseArgs } from "util";
import { createReadStream } from "fs";
import { readdir } from "fs/promises";
import { Readable } from "stream";

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
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
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
logger.info("アプリケーションが起動しました");
logger.warn("警告メッセージ");
logger.error("エラーが発生しました", { error: "エラーの詳細" });
logger.info("作業ディレクトリを作成しました", { workDir });

// 動画ファイルの拡張子
const VIDEO_EXTENSIONS = new Set([".mp4", ".avi", ".mov", ".mkv", ".wmv"]);

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

if (!values.src) {
  throw new Error("--src オプションは必須です");
}

const videoStream = Readable.from(listVideoFiles(values.src));

videoStream.on("error", (error) => {
  logger.error("ファイル列挙中にエラーが発生しました", { error });
});

for await (const chunk of videoStream) {
  logger.info(chunk);
}
