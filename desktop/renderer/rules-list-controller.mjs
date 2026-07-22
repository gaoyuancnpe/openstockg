import { summarizeRule } from "./rule-condition-mapper.mjs";

function cloneRule(rule) {
  return JSON.parse(JSON.stringify(rule));
}

export function createRulesListController({
  el,
  state,
  appendLog,
  syncAdvancedJSON,
  openRuleModal
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
      left.className = "listMain";

      const titleRow = document.createElement("div");
      titleRow.className = "listTitleRow";

      const title = document.createElement("div");
      title.className = "listTitle";
      title.textContent = rule.name || `规则 ${idx + 1}`;

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "ruleEnabledToggle";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = Boolean(rule.enabled);
      toggle.addEventListener("change", async () => {
        state.rules[idx].enabled = toggle.checked;
        await persistRules(`规则已${state.rules[idx].enabled ? "启用" : "停用"}：${state.rules[idx].name || `规则 ${idx + 1}`}`);
      });
      const toggleText = document.createElement("span");
      toggleText.textContent = "启用";
      toggleLabel.appendChild(toggle);
      toggleLabel.appendChild(toggleText);
      titleRow.appendChild(title);
      titleRow.appendChild(toggleLabel);

      const meta = document.createElement("div");
      meta.className = "listMeta";
      const symbols = Array.isArray(rule.symbols) ? rule.symbols.join(", ") : "";
      const universeText = rule?.universe?.type === "us_all"
        ? `标的范围: 全量美股（按市值从高到低，固定前 ${rule?.universe?.maxScan ?? 2000}）`
        : `股票代码: ${symbols}`;
      meta.textContent = `${summarizeRule(rule)} · ${universeText}`;

      left.appendChild(titleRow);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.className = "listActions";

      const btnEdit = document.createElement("button");
      btnEdit.textContent = "编辑";
      btnEdit.addEventListener("click", () => openRuleModal(idx));
      right.appendChild(btnEdit);

      const btnDup = document.createElement("button");
      btnDup.textContent = "复制";
      btnDup.addEventListener("click", async () => {
        const copy = cloneRule(rule);
        copy.name = `${rule.name || "规则"}（副本）`;
        state.rules.splice(idx + 1, 0, copy);
        await persistRules(`规则已复制：${copy.name}`);
      });
      right.appendChild(btnDup);

      const btnDel = document.createElement("button");
      btnDel.textContent = "删除";
      btnDel.addEventListener("click", async () => {
        if (!confirm("确定删除该规则？")) return;
        const removedName = state.rules[idx]?.name || `规则 ${idx + 1}`;
        state.rules.splice(idx, 1);
        await persistRules(`规则已删除：${removedName}`);
      });
      right.appendChild(btnDel);

      top.appendChild(left);
      top.appendChild(right);
      item.appendChild(top);
      el.rulesList.appendChild(item);
    });
  }

  function bindImportExport() {
    el.btnExportRules?.addEventListener("click", async () => {
      if (!Array.isArray(state.rules) || state.rules.length === 0) {
        if (typeof appendLog === "function") appendLog("没有可导出的规则");
        return;
      }
      try {
        const result = await window.api.shell.saveFile({
          defaultName: "rules_export.json",
          content: JSON.stringify(state.rules, null, 2)
        });
        if (result?.ok && typeof appendLog === "function") {
          appendLog(`规则已导出：${result.filePath}`);
        }
      } catch (error) {
        if (typeof appendLog === "function") {
          appendLog(`规则导出失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });

    el.btnImportRules?.addEventListener("click", async () => {
      try {
        const result = await window.api.shell.readFile({ extensions: ["json"] });
        if (!result?.ok) return;
        const parsed = JSON.parse(result.content);
        if (!Array.isArray(parsed)) {
          if (typeof appendLog === "function") appendLog("导入失败：规则文件必须是数组");
          alert("导入失败：规则文件必须是数组");
          return;
        }
        if (state.rules.length > 0 && !confirm(`当前已有 ${state.rules.length} 条规则，导入将替换现有规则。是否继续？`)) {
          return;
        }
        state.rules = parsed;
        await persistRules(`规则已导入：共 ${parsed.length} 条`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (typeof appendLog === "function") appendLog(`规则导入失败：${message}`);
        alert(`规则导入失败：${message}`);
      }
    });
  }

  bindImportExport();

  return {
    renderRulesList
  };
}
