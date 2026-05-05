#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DESKTOP_DIR = path.join(REPO_ROOT, "desktop");
const ELECTRON_BUILDER_CLI = path.join(DESKTOP_DIR, "node_modules", "electron-builder", "cli.js");

const COMMANDS = {
  "dist:win": {
    label: "Windows NSIS 安装包",
    builderArgs: ["--win", "nsis"],
    support: "nsis",
  },
  "dist:win:f": {
    label: "Windows NSIS 安装包（输出到 /mnt/f）",
    builderArgs: ["--win", "nsis", "--config", "./electron-builder.win-f.json"],
    support: "nsis",
  },
  "dist:win:f:zip": {
    label: "Windows Zip 包（输出到 /mnt/f）",
    builderArgs: ["--win", "--config", "./electron-builder.win-f-zip.json"],
    support: "zip",
  },
  "dist:win:zip": {
    label: "Windows Zip 包",
    builderArgs: ["--win", "--config", "./electron-builder.win-zip.json"],
    support: "zip",
  },
};

function getUsage() {
  const names = Object.keys(COMMANDS).join(", ");
  return `用法: node scripts/desktop/run-desktop-windows-build.mjs [--check] <${names}>`;
}

function detectEnvironment() {
  const platform = process.platform;
  const release = os.release();
  const isWsl = platform === "linux" && (
    Boolean(process.env.WSL_DISTRO_NAME) ||
    Boolean(process.env.WSL_INTEROP) ||
    release.toLowerCase().includes("microsoft")
  );

  return {
    platform,
    release,
    isWindows: platform === "win32",
    isLinux: platform === "linux",
    isMac: platform === "darwin",
    isWsl,
  };
}

function describeEnvironment(env) {
  if (env.isWindows) {
    return `Windows (${env.release})`;
  }

  if (env.isWsl) {
    return `WSL/Linux (${env.release})`;
  }

  if (env.isLinux) {
    return `Linux (${env.release})`;
  }

  if (env.isMac) {
    return `macOS (${env.release})`;
  }

  return `${env.platform} (${env.release})`;
}

function hasCommand(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });

  return !result.error;
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function validateEnvironment(commandName) {
  const command = COMMANDS[commandName];
  if (!command) {
    throw new Error(`未知命令 "${commandName}"。\n${getUsage()}`);
  }

  const env = detectEnvironment();
  const issues = [];
  const tips = [];

  if (!(await fileExists(ELECTRON_BUILDER_CLI))) {
    issues.push("未找到 `desktop/node_modules/electron-builder/cli.js`，当前桌面端依赖可能尚未安装。");
    tips.push("先在 `desktop/` 目录执行 `npm install`。");
  }

  if (command.support === "zip" && !env.isWindows) {
    issues.push("`dist:win:zip` 当前仅验证原生 Windows 环境可用；Linux/WSL 下会在 electron Windows 二进制解包阶段失败。");
    tips.push("请在 Windows PowerShell 或 CMD 中执行同名命令。");
  }

  if (command.support === "nsis" && (env.isLinux || env.isWsl)) {
    if (!hasCommand("wine") && !hasCommand("wine64")) {
      issues.push("Linux/WSL 下构建 Windows NSIS 安装包需要 `wine`。");
      tips.push("安装 `wine`/`wine64` 后重试，或改在原生 Windows 环境执行。");
    }
  }

  if (env.isMac) {
    issues.push("当前仓库未验证 macOS 上的 Windows 打包链路，请改在原生 Windows 或带 `wine` 的 Linux 环境执行。");
    tips.push("优先使用 Windows PowerShell/CMD，或在 Linux/WSL 环境安装 `wine` 后执行 `dist:win`。");
  }

  return {
    command,
    commandName,
    env,
    issues,
    tips,
    ok: issues.length === 0,
  };
}

function printValidation(result, checkOnly) {
  const header = checkOnly ? "Windows 打包环境检查" : "Windows 打包入口预检";
  process.stdout.write(`${header}\n`);
  process.stdout.write(`- 命令: ${result.commandName}\n`);
  process.stdout.write(`- 目标: ${result.command.label}\n`);
  process.stdout.write(`- 当前环境: ${describeEnvironment(result.env)}\n`);

  if (result.ok) {
    process.stdout.write("- 结果: 通过\n");
    return;
  }

  process.stderr.write("- 结果: 不支持当前环境\n");
  for (const issue of result.issues) {
    process.stderr.write(`- 原因: ${issue}\n`);
  }
  for (const tip of result.tips) {
    process.stderr.write(`- 建议: ${tip}\n`);
  }
}

async function run() {
  const args = process.argv.slice(2);
  const checkOnly = args[0] === "--check";
  const commandName = checkOnly ? args[1] : args[0];

  if (!commandName) {
    throw new Error(getUsage());
  }

  const validation = await validateEnvironment(commandName);
  printValidation(validation, checkOnly);

  if (!validation.ok) {
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    return;
  }

  const child = spawn(process.execPath, [ELECTRON_BUILDER_CLI, ...validation.command.builderArgs], {
    cwd: DESKTOP_DIR,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
