import path from "node:path";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { getDefaultDesktopConfig, normalizeDesktopConfig } from "../shared-config.mjs";

const STORAGE_META_SCHEMA_VERSION = 1;
const DESKTOP_STORAGE_SCHEMA_VERSION = 1;
const LAST_GOOD_SUFFIX = ".last-good.json";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeParseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function pathExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function getBackupPath(filePath) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}${LAST_GOOD_SUFFIX}`);
}

function getCorruptPath(filePath, label = "corrupt") {
  const parsed = path.parse(filePath);
  const ext = parsed.ext || ".json";
  return path.join(parsed.dir, `${parsed.name}.${label}.${Date.now()}${ext}`);
}

async function readFileText(filePath) {
  try {
    return {
      exists: true,
      text: await readFile(filePath, "utf-8")
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { exists: false, text: null };
    }
    throw error;
  }
}

function parseJSONResult(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function normalizeStorageMeta(meta) {
  if (!isPlainObject(meta)) {
    return {
      schemaVersion: STORAGE_META_SCHEMA_VERSION,
      documents: {}
    };
  }
  return {
    schemaVersion: STORAGE_META_SCHEMA_VERSION,
    documents: isPlainObject(meta.documents) ? meta.documents : {}
  };
}

async function writeJSONAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}

async function syncLastGoodBackup(filePath) {
  if (!(await pathExists(filePath))) return null;
  const backupPath = getBackupPath(filePath);
  await copyFile(filePath, backupPath).catch(() => {});
  return backupPath;
}

async function persistVersionedJSON(filePath, data) {
  if (await pathExists(filePath)) {
    await syncLastGoodBackup(filePath);
  }
  await writeJSONAtomic(filePath, data);
  await syncLastGoodBackup(filePath);
}

function valuesDiffer(left, right) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function normalizeLegacyConfig(value) {
  if (!isPlainObject(value)) {
    return { value: getDefaultDesktopConfig(), repaired: true };
  }
  const normalized = normalizeDesktopConfig(value);
  return {
    value: normalized,
    repaired: valuesDiffer(value, normalized)
  };
}

function normalizeLegacyRules(value) {
  if (!Array.isArray(value)) {
    return { value: [], repaired: true };
  }
  const normalized = value.filter((item) => isPlainObject(item));
  return {
    value: normalized,
    repaired: normalized.length !== value.length
  };
}

function normalizeLegacyState(value) {
  if (!isPlainObject(value)) {
    return { value: {}, repaired: true };
  }
  return { value, repaired: false };
}

function getDesktopStorageDefinitions(paths) {
  return {
    config: {
      filePath: paths.config,
      fallback: () => getDefaultDesktopConfig(),
      migrate: (value) => normalizeLegacyConfig(value)
    },
    rules: {
      filePath: paths.rules,
      fallback: () => [],
      migrate: (value) => normalizeLegacyRules(value)
    },
    state: {
      filePath: paths.state,
      fallback: () => ({}),
      migrate: (value) => normalizeLegacyState(value)
    }
  };
}

async function tryRestoreFromBackup(filePath, migrate) {
  const backupPath = getBackupPath(filePath);
  const backupText = await readFileText(backupPath);
  if (!backupText.exists || typeof backupText.text !== "string") {
    return null;
  }
  const parsedBackup = parseJSONResult(backupText.text);
  if (!parsedBackup.ok) return null;
  const migrated = migrate(parsedBackup.value);
  return {
    value: migrated.value,
    repaired: Boolean(migrated.repaired),
    backupPath
  };
}

async function ensureDocument({ key, definition, meta, logger }) {
  const actions = [];
  const currentMeta = isPlainObject(meta.documents[key]) ? meta.documents[key] : {};
  const currentVersion = Number.isFinite(currentMeta.version)
    ? Math.max(0, Number(currentMeta.version))
    : 0;
  const targetVersion = DESKTOP_STORAGE_SCHEMA_VERSION;
  const raw = await readFileText(definition.filePath);

  let value = definition.fallback();
  let shouldPersist = false;
  let fromVersion = currentVersion;
  let recoveredFromBackup = false;
  let recoveredFromFallback = false;
  let quarantinedPath = null;

  if (!raw.exists) {
    const restored = await tryRestoreFromBackup(definition.filePath, definition.migrate);
    if (restored) {
      value = restored.value;
      recoveredFromBackup = true;
      shouldPersist = true;
      actions.push("主文件缺失，从最近可用备份重建");
    } else {
      if (currentVersion > 0) {
        actions.push(`缺失后按 v${currentVersion} 元数据重建`);
      } else {
        actions.push("创建默认文件");
      }
      fromVersion = 0;
      shouldPersist = true;
      recoveredFromFallback = true;
    }
  } else {
    const parsed = parseJSONResult(raw.text);
    if (!parsed.ok) {
      quarantinedPath = await rename(definition.filePath, getCorruptPath(definition.filePath, "corrupt"))
        .catch(() => null);
      actions.push("隔离损坏 JSON");
      const restored = await tryRestoreFromBackup(definition.filePath, definition.migrate);
      if (restored) {
        value = restored.value;
        recoveredFromBackup = true;
        shouldPersist = true;
        actions.push("从最近可用备份恢复");
      } else {
        value = definition.fallback();
        recoveredFromFallback = true;
        shouldPersist = true;
        actions.push("备份不可用，回退到安全默认值");
      }
      fromVersion = 0;
    } else {
      value = parsed.value;
    }
  }

  if (!recoveredFromBackup && !recoveredFromFallback) {
    const migrated = definition.migrate(value);
    value = migrated.value;
    if (migrated.repaired) {
      shouldPersist = true;
      actions.push("修复非法结构或缺失字段");
    }
  }

  if (fromVersion < targetVersion) {
    shouldPersist = true;
    actions.push(`schema v${fromVersion} -> v${targetVersion}`);
  }

  if (shouldPersist) {
    await persistVersionedJSON(definition.filePath, value);
  }

  const nextMeta = {
    version: targetVersion,
    updatedAt: shouldPersist ? new Date().toISOString() : String(currentMeta.updatedAt || "")
  };
  const metaChanged = valuesDiffer(currentMeta, nextMeta);
  if (metaChanged) {
    meta.documents[key] = nextMeta;
  }

  if (logger && actions.length > 0) {
    const message = `[storage:${key}] ${actions.join("，")}`;
    logger(message);
  }

  return {
    key,
    value,
    report: {
      key,
      filePath: definition.filePath,
      actions,
      versionBefore: fromVersion,
      versionAfter: targetVersion,
      quarantinedPath,
      metaChanged
    }
  };
}

async function ensureDesktopStorageDocuments(paths, keys, logger) {
  const definitions = getDesktopStorageDefinitions(paths);
  const metaRaw = await readJSON(paths.storageMeta, null);
  const meta = normalizeStorageMeta(metaRaw);
  const values = {};
  const reports = [];
  let metaChanged = valuesDiffer(metaRaw, meta);

  for (const key of keys) {
    const result = await ensureDocument({
      key,
      definition: definitions[key],
      meta,
      logger
    });
    values[key] = result.value;
    reports.push(result.report);
    metaChanged = metaChanged || Boolean(result.report.metaChanged);
  }

  if (metaChanged) {
    await writeJSONAtomic(paths.storageMeta, meta);
  }
  return { values, reports };
}

export async function readJSON(filePath, fallback) {
  try {
    const txt = await readFile(filePath, "utf-8");
    return safeParseJSON(txt, fallback);
  } catch {
    return fallback;
  }
}

export async function writeJSON(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function getDataPaths(app) {
  const base = app.getPath("userData");
  return {
    base,
    storageMeta: path.join(base, "storage-meta.json"),
    config: path.join(base, "config.json"),
    rules: path.join(base, "rules.json"),
    state: path.join(base, "state.json"),
    events: path.join(base, "events.jsonl"),
    universeUS: path.join(base, "universe_us_symbols.json"),
    universeFmpDefault: path.join(base, "universe_fmp_default.json"),
    universeFmpFinancial: path.join(base, "universe_fmp_financial.json")
  };
}

export async function initializeDesktopStorage(paths, logger = null) {
  await ensureDir(paths.base);
  return ensureDesktopStorageDocuments(paths, ["config", "rules", "state"], logger);
}

export async function loadDesktopConfig(paths, logger = null) {
  const result = await ensureDesktopStorageDocuments(paths, ["config"], logger);
  return result.values.config;
}

export async function saveDesktopConfig(paths, cfg) {
  const metaRaw = await readJSON(paths.storageMeta, null);
  const meta = normalizeStorageMeta(metaRaw);
  const value = normalizeLegacyConfig(cfg).value;
  await persistVersionedJSON(paths.config, value);
  meta.documents.config = {
    version: DESKTOP_STORAGE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };
  await writeJSONAtomic(paths.storageMeta, meta);
}

export async function loadDesktopRules(paths, logger = null) {
  const result = await ensureDesktopStorageDocuments(paths, ["rules"], logger);
  return result.values.rules;
}

export async function saveDesktopRules(paths, rules) {
  const metaRaw = await readJSON(paths.storageMeta, null);
  const meta = normalizeStorageMeta(metaRaw);
  const value = normalizeLegacyRules(rules).value;
  await persistVersionedJSON(paths.rules, value);
  meta.documents.rules = {
    version: DESKTOP_STORAGE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };
  await writeJSONAtomic(paths.storageMeta, meta);
}

export async function loadDesktopState(paths, logger = null) {
  const result = await ensureDesktopStorageDocuments(paths, ["state"], logger);
  return result.values.state;
}

export async function saveDesktopState(paths, state) {
  const metaRaw = await readJSON(paths.storageMeta, null);
  const meta = normalizeStorageMeta(metaRaw);
  const value = normalizeLegacyState(state).value;
  await persistVersionedJSON(paths.state, value);
  meta.documents.state = {
    version: DESKTOP_STORAGE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };
  await writeJSONAtomic(paths.storageMeta, meta);
}

export async function resetTestDataFiles(paths) {
  const files = [
    paths.storageMeta,
    paths.config,
    paths.rules,
    paths.state,
    paths.events,
    paths.universeUS,
    paths.universeFmpDefault,
    paths.universeFmpFinancial,
    getBackupPath(paths.config),
    getBackupPath(paths.rules),
    getBackupPath(paths.state)
  ];
  const removed = [];
  for (const filePath of files) {
    await rm(filePath, { force: true }).catch(() => {});
    removed.push(filePath);
  }
  return removed;
}
