#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, copyFile, stat } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEST_DIR = "/mnt/f/OpenStockAlerts/dist";
const SRC_DIR = path.join(__dirname, "dist");

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function main() {
  await ensureDir(DEST_DIR);

  const files = await readdir(SRC_DIR).catch(() => []);
  const zip = files.find((f) => f.endsWith("-win.zip")) || files.find((f) => f.endsWith(".zip"));
  if (!zip) {
    throw new Error(`No zip artifact found in ${SRC_DIR}`);
  }

  const srcZip = path.join(SRC_DIR, zip);
  const destZip = path.join(DEST_DIR, zip);
  await copyFile(srcZip, destZip);

  const guideSrc = path.join(__dirname, "USER_GUIDE.md");
  const guideDest = path.join(DEST_DIR, "USER_GUIDE.md");
  if (await fileExists(guideSrc)) {
    await copyFile(guideSrc, guideDest);
  }

  process.stdout.write(`Copied:\n- ${destZip}\n`);
  if (await fileExists(guideDest)) process.stdout.write(`- ${guideDest}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

