import {
  CONDITION_TYPE_OPTIONS,
  buildFmpDefaultRuleSeed,
  conditionFromUI,
  conditionTypeNeedsValue,
  defaultConditionItem,
  uiGroupFromConditionTree,
  usesFmpRuleFields
} from "./rule-condition-mapper.mjs";

function getFallbackConditionItem(getIsFmpProvider) {
  return defaultConditionItem(Boolean(getIsFmpProvider()));
}

function parseNullableNumber(rawValue) {
  return rawValue === "" ? null : Number(rawValue);
}

export function createRuleEditorController({
  el,
  state,
  parseSymbols,
  getIsFmpProvider,
  updateUniverseUI,
  syncAdvancedJSON,
  renderRulesList
}) {
  function ensureModalConditions() {
    if (!Array.isArray(state.modalConditions) || state.modalConditions.length === 0) {
      state.modalConditions = [getFallbackConditionItem(getIsFmpProvider)];
    }
  }

  function renderModalConditions() {
    el.conditionsList.innerHTML = "";
    ensureModalConditions();

    state.modalConditions.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "condRow";

      const sel = document.createElement("select");
      for (const opt of CONDITION_TYPE_OPTIONS) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        sel.appendChild(option);
      }
      sel.value = String(item.type || "price_above");
      sel.addEventListener("change", () => {
        state.modalConditions[idx].type = sel.value;
        if (!conditionTypeNeedsValue(sel.value)) {
          state.modalConditions[idx].value = null;
        } else if (state.modalConditions[idx].value === null || state.modalConditions[idx].value === undefined) {
          state.modalConditions[idx].value = 0;
        }
        renderModalConditions();
      });

      const value = document.createElement("input");
      value.type = "number";
      value.step = "0.01";
      const needsValue = conditionTypeNeedsValue(sel.value);
      value.disabled = !needsValue;
      value.placeholder = needsValue ? "阈值" : "-";
      value.value = item.value === null || item.value === undefined ? "" : String(item.value);
      value.addEventListener("input", () => {
        const n = Number(value.value);
        state.modalConditions[idx].value = Number.isFinite(n) ? n : null;
      });

      const del = document.createElement("button");
      del.textContent = "删除";
      del.addEventListener("click", () => {
        state.modalConditions.splice(idx, 1);
        renderModalConditions();
      });

      row.appendChild(sel);
      row.appendChild(value);
      row.appendChild(del);
      el.conditionsList.appendChild(row);
    });
  }

  function openRuleModal(indexOrNull, seed) {
    state.editingIndex = indexOrNull;
    const fallbackSeed = indexOrNull === null ? buildFmpDefaultRuleSeed() : null;
    const rule = seed || (indexOrNull !== null ? state.rules[indexOrNull] : null) || fallbackSeed;
    state.modalForceFmp = usesFmpRuleFields(rule);

    el.modalTitle.textContent = indexOrNull === null ? "添加规则" : "编辑规则";
    el.ruleEnabled.value = rule ? String(Boolean(rule.enabled)) : "true";
    el.ruleName.value = rule?.name || "";

    const universe = rule?.universe || { type: "manual" };
    el.ruleUniverse.value = String(universe.type || "manual");
    el.ruleSymbols.value = rule?.symbols ? rule.symbols.join(", ") : "";
    el.ruleUniverseMaxScan.value = String(universe.maxScan ?? 2000);
    el.ruleUniverseMinPrice.value = universe.minPrice === null || universe.minPrice === undefined ? "" : String(universe.minPrice);
    el.ruleUniverseMinMarketCap.value = universe.minMarketCap === null || universe.minMarketCap === undefined ? "" : String(universe.minMarketCap);
    el.ruleUniverseMinTurnoverM.value = universe.minTurnoverM === null || universe.minTurnoverM === undefined ? "" : String(universe.minTurnoverM);
    el.ruleUniverseRecent5dCloseAth.value = String(universe.requireRecent5dCloseAth === false ? "false" : "true");
    el.ruleUniverseMinVolumeRatio.value = universe.minVolumeRatio === null || universe.minVolumeRatio === undefined ? "" : String(universe.minVolumeRatio);
    updateUniverseUI();

    const fallbackItem = getFallbackConditionItem(getIsFmpProvider);
    const group = rule?.ui?.items
      ? { groupOp: rule.ui.groupOp || "and", items: rule.ui.items }
      : uiGroupFromConditionTree(rule?.condition, fallbackItem);
    el.ruleGroupOp.value = String(group.groupOp || "and").toLowerCase() === "or" ? "or" : "and";
    state.modalConditions = Array.isArray(group.items) && group.items.length > 0
      ? group.items.map((it) => ({ type: it.type, value: it.value }))
      : [fallbackItem];
    el.ruleCooldownSec.value = String(rule?.cooldownSec ?? 3600);
    el.ruleEmailTo.value = String(rule?.notify?.email || "");
    el.ruleWebhookUrl.value = String(rule?.notify?.webhookUrl || "");

    renderModalConditions();
    el.modal.classList.remove("hidden");
  }

  function closeRuleModal() {
    el.modal.classList.add("hidden");
    state.editingIndex = null;
    state.modalForceFmp = false;
    state.modalConditions = [];
  }

  function addCondition() {
    state.modalConditions.push(getFallbackConditionItem(getIsFmpProvider));
    renderModalConditions();
  }

  function saveRuleFromModal() {
    const enabled = el.ruleEnabled.value === "true";
    const name = String(el.ruleName.value || "").trim() || "未命名规则";
    const universeType = String(el.ruleUniverse.value || "manual");
    const symbols = universeType === "manual" ? parseSymbols(el.ruleSymbols.value) : [];
    const groupOp = String(el.ruleGroupOp.value || "and").toLowerCase() === "or" ? "or" : "and";
    const cooldownSec = Number.parseInt(String(el.ruleCooldownSec.value || "0"), 10);
    const notifyEmail = String(el.ruleEmailTo.value || "").trim();
    const notifyWebhook = String(el.ruleWebhookUrl.value || "").trim();

    if (universeType === "manual" && symbols.length === 0) {
      alert("请至少填写一个股票代码，或将标的范围切换为“全量美股（按市值从高到低，固定前N）”");
      return false;
    }

    const items = Array.isArray(state.modalConditions) ? state.modalConditions : [];
    if (items.length === 0) {
      alert("请至少添加一个条件");
      return false;
    }

    for (const item of items) {
      if (conditionTypeNeedsValue(item.type) && (item.value === null || item.value === undefined || item.value === "")) {
        alert("存在未填写阈值的条件");
        return false;
      }
    }

    const conds = items.map((item) => conditionFromUI(item.type, conditionTypeNeedsValue(item.type) ? item.value : 0));
    const condition = conds.length === 1 ? conds[0] : { op: groupOp, args: conds };
    const ui = {
      groupOp,
      items: items.map((item) => ({
        type: item.type,
        value: conditionTypeNeedsValue(item.type) ? item.value : null
      }))
    };
    const universe = universeType === "us_all"
      ? {
        type: "us_all",
        maxScan: Number.isFinite(Number(el.ruleUniverseMaxScan.value)) ? Number(el.ruleUniverseMaxScan.value) : 2000,
        minPrice: parseNullableNumber(el.ruleUniverseMinPrice.value),
        minMarketCap: parseNullableNumber(el.ruleUniverseMinMarketCap.value),
        minTurnoverM: parseNullableNumber(el.ruleUniverseMinTurnoverM.value),
        requireRecent5dCloseAth: String(el.ruleUniverseRecent5dCloseAth.value || "true") === "true",
        minVolumeRatio: parseNullableNumber(el.ruleUniverseMinVolumeRatio.value)
      }
      : { type: "manual" };
    const next = {
      enabled,
      name,
      symbols,
      cooldownSec: Number.isFinite(cooldownSec) ? cooldownSec : 0,
      notify: {
        ...(notifyEmail ? { email: notifyEmail } : {}),
        ...(notifyWebhook ? { webhookUrl: notifyWebhook } : {})
      },
      ui,
      condition,
      universe
    };

    if (state.editingIndex === null) state.rules.unshift(next);
    else state.rules[state.editingIndex] = next;

    syncAdvancedJSON();
    renderRulesList();
    closeRuleModal();
    return true;
  }

  return {
    addCondition,
    closeRuleModal,
    openRuleModal,
    renderModalConditions,
    saveRuleFromModal
  };
}
