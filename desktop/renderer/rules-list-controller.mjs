import { summarizeRule } from "./rule-condition-mapper.mjs";

function cloneRule(rule) {
  return JSON.parse(JSON.stringify(rule));
}

export function createRulesListController({
  el,
  state,
  syncAdvancedJSON,
  openRuleModal,
  explainAiTarget,
  buildAiTarget
}) {
  function renderEmptyState() {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "暂无规则。点击“添加规则”创建常用提醒。";
    el.rulesList.appendChild(empty);
  }

  function renderRulesList() {
    el.rulesList.innerHTML = "";
    if (state.rules.length === 0) {
      renderEmptyState();
      return;
    }

    state.rules.forEach((rule, idx) => {
      const item = document.createElement("div");
      item.className = "listItem";

      const top = document.createElement("div");
      top.className = "listTop";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "listTitle";
      title.textContent = rule.name || `规则 ${idx + 1}`;

      const meta = document.createElement("div");
      meta.className = "listMeta";
      const symbols = Array.isArray(rule.symbols) ? rule.symbols.join(", ") : "";
      const universeText = rule?.universe?.type === "us_all"
        ? `标的范围: 全量美股（按市值从高到低，固定前 ${rule?.universe?.maxScan ?? 2000}）`
        : `股票代码: ${symbols}`;
      meta.textContent = `${summarizeRule(rule)} · ${universeText}`;

      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.className = "listActions";

      const pill = document.createElement("span");
      pill.className = `pill ${rule.enabled ? "on" : "off"}`;
      pill.textContent = rule.enabled ? "启用" : "停用";
      right.appendChild(pill);

      const btnEdit = document.createElement("button");
      btnEdit.textContent = "编辑";
      btnEdit.addEventListener("click", () => openRuleModal(idx));
      right.appendChild(btnEdit);

      const btnToggle = document.createElement("button");
      btnToggle.textContent = rule.enabled ? "停用" : "启用";
      btnToggle.addEventListener("click", () => {
        state.rules[idx].enabled = !state.rules[idx].enabled;
        syncAdvancedJSON();
        renderRulesList();
      });
      right.appendChild(btnToggle);

      const btnExplain = document.createElement("button");
      btnExplain.textContent = "AI聊天";
      btnExplain.disabled = state.aiPanelBusy;
      btnExplain.addEventListener("click", async () => {
        await explainAiTarget("rule", rule);
      });
      right.appendChild(btnExplain);

      const btnBuild = document.createElement("button");
      btnBuild.textContent = "生成草案";
      btnBuild.disabled = state.aiPanelBusy;
      btnBuild.addEventListener("click", async () => {
        await buildAiTarget("rule", rule);
      });
      right.appendChild(btnBuild);

      const btnDup = document.createElement("button");
      btnDup.textContent = "复制";
      btnDup.addEventListener("click", () => {
        const copy = cloneRule(rule);
        copy.name = `${rule.name || "规则"}（副本）`;
        state.rules.splice(idx + 1, 0, copy);
        syncAdvancedJSON();
        renderRulesList();
      });
      right.appendChild(btnDup);

      const btnDel = document.createElement("button");
      btnDel.textContent = "删除";
      btnDel.addEventListener("click", () => {
        if (!confirm("确定删除该规则？")) return;
        state.rules.splice(idx, 1);
        syncAdvancedJSON();
        renderRulesList();
      });
      right.appendChild(btnDel);

      top.appendChild(left);
      top.appendChild(right);
      item.appendChild(top);
      el.rulesList.appendChild(item);
    });
  }

  return {
    renderRulesList
  };
}
