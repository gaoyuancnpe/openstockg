import { toNumber } from "../shared-runtime.mjs";
import { nowMs, stableStringify } from "./shared.mjs";

export function buildRuleKey(rule) {
  const name = rule.name ? String(rule.name) : "";
  const condition = rule.condition ? stableStringify(rule.condition) : "";
  const symbols = Array.isArray(rule.symbols) ? rule.symbols.map(String).sort().join(",") : "";
  return stableStringify({ name, symbols, condition });
}

export function stateKey(ruleKey, symbol) {
  return `${ruleKey}:${symbol}`;
}

export function evaluate(node, ctx, prevCtx) {
  if (node === null || node === undefined) return null;
  if (typeof node === "number") return node;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;

  if (node.var) return ctx[node.var];
  if (node.prev && node.prev.var) return prevCtx ? prevCtx[node.prev.var] : null;

  if (node.op) {
    const op = node.op;
    if (op === "and" || op === "or") {
      const args = Array.isArray(node.args) ? node.args : [];
      const vals = args.map((item) => Boolean(evaluate(item, ctx, prevCtx)));
      return op === "and" ? vals.every(Boolean) : vals.some(Boolean);
    }
    if (op === "not") return !Boolean(evaluate(node.arg, ctx, prevCtx));
    if (op === "crossesAbove" || op === "crossesBelow") {
      const leftNow = toNumber(evaluate(node.left, ctx, prevCtx));
      const rightNow = toNumber(evaluate(node.right, ctx, prevCtx));
      const leftPrev = prevCtx ? toNumber(evaluate(node.left, prevCtx, null)) : null;
      const rightPrev = prevCtx ? toNumber(evaluate(node.right, prevCtx, null)) : null;
      if (leftNow === null || rightNow === null || leftPrev === null || rightPrev === null) return false;
      if (op === "crossesAbove") return leftPrev <= rightPrev && leftNow > rightNow;
      return leftPrev >= rightPrev && leftNow < rightNow;
    }

    const ln = toNumber(evaluate(node.left, ctx, prevCtx));
    const rn = toNumber(evaluate(node.right, ctx, prevCtx));
    if (ln === null || rn === null) return false;
    if (op === ">") return ln > rn;
    if (op === ">=") return ln >= rn;
    if (op === "<") return ln < rn;
    if (op === "<=") return ln <= rn;
    if (op === "==") return ln === rn;
    if (op === "!=") return ln !== rn;
    return false;
  }

  return null;
}

export function summarizeCondition(node) {
  if (!node || typeof node !== "object") return String(node);
  if (node.var) return `{${node.var}}`;
  if (node.prev && node.prev.var) return `{prev.${node.prev.var}}`;
  if (node.op === "and" || node.op === "or") return `(${(node.args || []).map(summarizeCondition).join(node.op === "and" ? " AND " : " OR ")})`;
  if (node.op === "not") return `(NOT ${summarizeCondition(node.arg)})`;
  if (node.op) return `(${summarizeCondition(node.left)} ${node.op} ${summarizeCondition(node.right)})`;
  return stableStringify(node);
}

function collectVars(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.var) out.add(String(node.var));
  if (node.prev?.var) out.add(`prev.${String(node.prev.var)}`);
  if (Array.isArray(node.args)) {
    for (const arg of node.args) collectVars(arg, out);
  }
  if (node.left) collectVars(node.left, out);
  if (node.right) collectVars(node.right, out);
  if (node.arg) collectVars(node.arg, out);
  return out;
}

export function getFmpUnsupportedVars(rule) {
  const vars = Array.from(collectVars(rule?.condition));
  const supported = new Set(["marketCap", "turnoverM", "recent5dCloseAth"]);
  return vars.filter((name) => !supported.has(name));
}

export function isFmpDefaultRuleCompatible(rule) {
  return getFmpUnsupportedVars(rule).length === 0;
}

export async function fireRuleAlert({
  rule,
  symbol,
  ctx,
  conditionText,
  dryRun,
  state,
  ruleKey,
  cooldownSec,
  emitEvent,
  appendEventLine,
  notify,
  log
}) {
  const sk = stateKey(ruleKey, symbol);
  const prevCtx = state[sk]?.ctx || null;
  const lastFiredAt = state[sk]?.lastFiredAt ? Number(state[sk].lastFiredAt) : null;
  const canFire = !lastFiredAt || (nowMs() - lastFiredAt) >= cooldownSec * 1000;

  state[sk] = { ctx, lastFiredAt: lastFiredAt || null };

  const matched = Boolean(evaluate(rule.condition, ctx, prevCtx));
  if (!matched || !canFire) return false;

  const event = {
    type: "alert",
    provider: String(rule.provider || ""),
    rule: { name: String(rule.name || ""), key: ruleKey, cooldownSec },
    symbol,
    conditionText,
    ctx,
    matchedAt: new Date().toISOString()
  };

  if (emitEvent) emitEvent(event);
  if (appendEventLine) await appendEventLine(event);
  if (notify) {
    await notify({
      event,
      rule,
      symbol,
      ctx,
      conditionText,
      dryRun
    });
  }

  state[sk].lastFiredAt = nowMs();
  if (log) log(`${dryRun ? "DRY_RUN FIRED" : "FIRED"} ${symbol} ${conditionText}`);
  return true;
}
