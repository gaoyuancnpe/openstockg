import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DESKTOP_ROOT = path.join(REPO_ROOT, "desktop");
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);

const FORBIDDEN_ROOTS = [
  { path: path.join(REPO_ROOT, "app"), label: "Web app" },
  { path: path.join(REPO_ROOT, "components"), label: "Web components" },
  { path: path.join(REPO_ROOT, "lib", "actions"), label: "Web server actions" },
  { path: path.join(REPO_ROOT, "scripts"), label: "CLI scripts" },
];

const ALLOWED_SHARED_ROOTS = [
  path.join(REPO_ROOT, "shared"),
  path.join(REPO_ROOT, "packages", "shared"),
];

const IMPORT_PATTERNS = [
  /\bimport\s+[^"'`]*?\s+from\s*["']([^"']+)["']/g,
  /\bexport\s+[^"'`]*?\s+from\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

async function collectSourceFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function isInsideRoot(candidatePath, rootPath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function normalizeSpecifier(filePath, specifier) {
  if (specifier.startsWith("@/")) {
    return path.resolve(REPO_ROOT, specifier.slice(2));
  }

  if (specifier.startsWith("/")) {
    return path.resolve(REPO_ROOT, specifier.slice(1));
  }

  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(filePath), specifier);
  }

  return null;
}

function classifyViolation(resolvedPath) {
  for (const forbiddenRoot of FORBIDDEN_ROOTS) {
    if (isInsideRoot(resolvedPath, forbiddenRoot.path)) {
      return {
        type: "forbidden-root",
        message: `desktop 不允许直接 import ${forbiddenRoot.label}（${path.relative(REPO_ROOT, forbiddenRoot.path)}）`,
      };
    }
  }

  if (isInsideRoot(resolvedPath, DESKTOP_ROOT)) {
    return null;
  }

  for (const sharedRoot of ALLOWED_SHARED_ROOTS) {
    if (isInsideRoot(resolvedPath, sharedRoot)) {
      return null;
    }
  }

  return {
    type: "undeclared-shared-boundary",
    message: `desktop 只能引用 desktop/ 内部模块或显式共享目录，当前目标未声明共享边界（${path.relative(REPO_ROOT, resolvedPath)}）`,
  };
}

function collectImports(content) {
  const matches = [];

  for (const pattern of IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      matches.push({
        specifier: match[1],
        index: match.index ?? 0,
      });
    }
  }

  return matches;
}

async function main() {
  const sourceFiles = await collectSourceFiles(DESKTOP_ROOT);
  const violations = [];

  for (const filePath of sourceFiles) {
    const content = await fs.readFile(filePath, "utf8");
    const imports = collectImports(content);

    for (const entry of imports) {
      const resolvedPath = normalizeSpecifier(filePath, entry.specifier);
      if (!resolvedPath) {
        continue;
      }

      const violation = classifyViolation(resolvedPath);
      if (!violation) {
        continue;
      }

      violations.push({
        filePath,
        line: getLineNumber(content, entry.index),
        specifier: entry.specifier,
        ...violation,
      });
    }
  }

  if (violations.length > 0) {
    console.error("Desktop 边界检查失败：\n");
    for (const violation of violations) {
      console.error(
        `- ${path.relative(REPO_ROOT, violation.filePath)}:${violation.line} -> "${violation.specifier}"`,
      );
      console.error(`  ${violation.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const sharedRootsSummary = ALLOWED_SHARED_ROOTS.map((sharedRoot) => path.relative(REPO_ROOT, sharedRoot)).join(", ");
  console.log(`Desktop 边界检查通过：已扫描 ${sourceFiles.length} 个文件。`);
  console.log(`允许的共享边界：desktop/、${sharedRootsSummary}。`);
  console.log("禁止直接引用：app/、components/、lib/actions/、scripts/。");
}

main().catch((error) => {
  console.error("执行 desktop 边界检查时失败。");
  console.error(error);
  process.exitCode = 1;
});
