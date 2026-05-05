export function formatDevModeInfo(paths) {
  if (!paths) return "";
  const usingCustom = Boolean(paths.usingCustomDataDir);
  if (usingCustom) {
    return `当前为开发测试模式：已使用独立测试数据目录。\n测试目录：${paths.base}\n建议：继续联调时保持这个目录，避免旧配置污染结果。`;
  }
  return `当前为默认数据目录模式：${paths.base}\n建议开发联调时使用 OPENSTOCK_USER_DATA_DIR 指向独立测试目录，避免影响正式配置。`;
}

export function safeParseJSON(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseSymbols(text) {
  const raw = String(text || "")
    .split(/[\n,]/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(raw));
}
