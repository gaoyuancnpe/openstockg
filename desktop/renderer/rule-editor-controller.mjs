import {
  CONDITION_TYPE_OPTIONS,
  buildFmpDefaultRuleSeed,
  buildRuleSeedFromTemplate,
  conditionFromUI,
  conditionTypeNeedsValue,
  defaultConditionItem,
  getRuleTemplatePresentation,
  uiGroupFromConditionTree,
  usesFmpRuleFields
} from "./rule-condition-mapper.mjs";
import { buildRuleFromDraftFields } from "../rules/rule-draft-adapter.mjs";

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
  appendLog,
  syncAdvancedJSON,
  renderRulesList
}) {
  async function persistRules(successMessage) {
    try {
      await window.api.saveRules(state.rules);
      syncAdvancedJSON();
      renderRulesList();
      if (typeof appendLog === "function" && successMessage) appendLog(successMessage);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof appendLog === "function") appendLog(`规则保存失败：${message}`);
      alert(`规则保存失败：${message}`);
      return false;
    }
  }

  function syncTemplateHints(rule) {
    const presentation = getRuleTemplatePresentation(rule);
    state.modalTemplateKey = presentation.templateKey;
    if (el.ruleTemplate) {
      el.ruleTemplate.value = presentation.templateKey;
    }
    if (el.rulePresetHint) {
      el.rulePresetHint.textContent = presentation.presetHint;
    }
    if (el.ruleFieldHint) {
      el.ruleFieldHint.textContent = presentation.fieldHint;
    }
  }

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
    syncTemplateHints(rule);

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
    el.ruleWebhookType.value = String(rule?.notify?.webhookType || "");
    el.ruleWebhookUrl.value = String(rule?.notify?.webhookUrl || "");

    renderModalConditions();
    el.modal.classList.remove("hidden");
  }

  function applyTemplateToModal(templateKey) {
    const nextSeed = buildRuleSeedFromTemplate(templateKey);
    openRuleModal(state.editingIndex, nextSeed);
  }

  function handleRuleTemplateChange() {
    if (!el.ruleTemplate) return;
    const nextTemplateKey = String(el.ruleTemplate.value || "custom");
    if (nextTemplateKey === state.modalTemplateKey) return;

    if (nextTemplateKey === "custom") {
      state.modalTemplateKey = "custom";
      syncTemplateHints({ templateKey: "custom" });
      return;
    }

    if (state.modalConditions.length > 0 && !window.confirm("切换模板会重置当前规则条件和默认阈值，是否继续？")) {
      el.ruleTemplate.value = state.modalTemplateKey || "custom";
      return;
    }

    applyTemplateToModal(nextTemplateKey);
  }

  function closeRuleModal() {
    el.modal.classList.add("hidden");
    state.editingIndex = null;
    state.modalForceFmp = false;
    state.modalTemplateKey = "custom";
    state.modalConditions = [];
  }

  function addCondition() {
    state.modalConditions.push(getFallbackConditionItem(getIsFmpProvider));
    renderModalConditions();
  }

  async function saveRuleFromModal() {
    const enabled = el.ruleEnabled.value === "true";
    const name = String(el.ruleName.value || "").trim() || "未命名规则";
    const universeType = String(el.ruleUniverse.value || "manual");
    const symbols = universeType === "manual" ? parseSymbols(el.ruleSymbols.value) : [];
    const groupOp = String(el.ruleGroupOp.value || "and").toLowerCase() === "or" ? "or" : "and";
    const cooldownSec = Number.parseInt(String(el.ruleCooldownSec.value || "0"), 10);
    const notifyEmail = String(el.ruleEmailTo.value || "").trim();
    const notifyWebhookType = String(el.ruleWebhookType.value || "").trim().toLowerCase();
    const notifyWebhook = String(el.ruleWebhookUrl.value || "").trim();
    const templateKey = String(state.modalTemplateKey || "custom");

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
      ...(templateKey !== "custom" ? { templateKey } : {}),
      enabled,
      name,
      symbols,
      cooldownSec: Number.isFinite(cooldownSec) ? cooldownSec : 0,
      notify: {
        ...(notifyEmail ? { email: notifyEmail } : {}),
        ...(
          notifyWebhook || notifyWebhookType
            ? {
              ...(notifyWebhook ? { webhookUrl: notifyWebhook } : {}),
              webhookType: notifyWebhookType === "feishu" ? "feishu" : "generic"
            }
            : {}
        )
      },
      ui,
      condition,
      universe
    };

    if (state.editingIndex === null) state.rules.unshift(next);
    else state.rules[state.editingIndex] = next;

    const saved = await persistRules("规则已保存");
    if (saved) closeRuleModal();
    return saved;
  }

  function openRuleModalWithDraft(fields) {
    const draftRule = buildRuleFromDraftFields(fields);
    openRuleModal(null, draftRule);
  }

  async function saveRuleDraft(fields) {
    const draftRule = buildRuleFromDraftFields(fields);
    if (draftRule.universe?.type === "manual" && (!Array.isArray(draftRule.symbols) || draftRule.symbols.length === 0)) {
      openRuleModal(null, draftRule);
      alert("AI 生成的规则草案缺少股票代码，已为你打开规则编辑器，请补全后再保存。");
      return false;
    }
    state.rules.unshift(draftRule);
    return persistRules(`AI 规则已加入列表：${draftRule.name}`);
  }

  return {
    addCondition,
    buildRuleFromDraftFields,
    closeRuleModal,
    handleRuleTemplateChange,
    openRuleModal,
    openRuleModalWithDraft,
    renderModalConditions,
    saveRuleDraft,
    saveRuleFromModal
  };
}
