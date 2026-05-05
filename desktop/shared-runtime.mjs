export function toNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function describeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = String(error?.cause?.code || "");
  const causeMessage = String(error?.cause?.message || "");
  const details = [message];
  if (code) details.push(`code=${code}`);
  if (causeMessage && causeMessage !== message) details.push(`cause=${causeMessage}`);
  return details.join(" | ");
}

export function normalizeHttpBaseUrl(url, fallback) {
  const raw = String(url || fallback || "").trim();
  return raw.replace(/\/+$/, "");
}

export async function fetchJSON(url, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        body: options.body,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "OpenStock-AlertsDesktop/1.0",
          ...(options.headers || {})
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
      }
      return await res.json();
    } catch (error) {
      lastError = error;
      const code = String(error?.cause?.code || "");
      const transient =
        error?.name === "AbortError" ||
        String(error?.message || "").includes("fetch failed") ||
        code.startsWith("UND_ERR_") ||
        code === "ETIMEDOUT";
      if (!transient || attempt === 1) {
        throw new Error(`请求失败：${url} | ${describeError(error)}`);
      }
    } finally {
      clearTimeout(id);
    }
  }
  throw new Error(`请求失败：${url} | ${describeError(lastError)}`);
}
