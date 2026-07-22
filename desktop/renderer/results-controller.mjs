function formatCellNumber(value, digits = 2) {
  return value?.toFixed ? value.toFixed(digits) : value;
}

function formatFinancialNumber(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? "-" : Number(value).toFixed(digits);
}

function rowsToCsv(rows, columns) {
  const headers = columns.map((c) => c.label || c.key).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key];
      if (v == null) return "";
      const s = Array.isArray(v) ? v.join("; ") : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  );
  return [headers, ...lines].join("\n");
}

function getScreenerCsvColumns(isFmp) {
  if (isFmp) {
    return [
      { key: "symbol", label: "code" },
      { key: "price", label: "price" },
      { key: "marketCap", label: "market_cap_m" },
      { key: "turnoverM", label: "turnover_m" },
      { key: "recent5dCloseAth", label: "recent_5d_close_ath" }
    ];
  }
  return [
    { key: "symbol", label: "code" },
    { key: "price", label: "price" },
    { key: "changePercent", label: "change_percent" },
    { key: "marketCap", label: "market_cap" },
    { key: "peTTM", label: "pe_ttm" },
    { key: "volumeRatio", label: "volume_ratio" }
  ];
}

export function createResultsController({
  el,
  state,
  getIsFmpProvider,
  addSymbolsToAlertPool,
  explainAiTarget,
  buildAiTarget,
  appendLog
}) {
  function renderScreenerTable(rows) {
    if (!rows || rows.length === 0) {
      el.screenerTable.innerHTML = "";
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    const isFmp = Boolean(getIsFmpProvider());
    const headers = isFmp
      ? ["选择", "代码", "价格", "收盘市值（百万美元）", "成交额（百万美元）", "5日股价新高", "操作"]
      : ["代码", "价格", "涨跌幅", "市值", "市盈率", "量比", "操作"];

    headers.forEach((h) => {
      const th = document.createElement("th");
      if (isFmp && h === "选择") {
        const master = document.createElement("input");
        master.type = "checkbox";
        const allSelected = rows.length > 0 && rows.every((r) => state.screenerSelected.includes(r.symbol));
        master.checked = allSelected;
        master.addEventListener("change", () => {
          state.screenerSelected = master.checked ? rows.map((r) => r.symbol) : [];
          renderScreenerTable(rows);
        });
        th.appendChild(master);
      } else {
        th.textContent = h;
      }
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const td = (v) => {
        const c = document.createElement("td");
        c.textContent = v === null || v === undefined ? "" : String(v);
        return c;
      };

      if (isFmp) {
        const pick = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.screenerSelected.includes(r.symbol);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            state.screenerSelected = Array.from(new Set([...state.screenerSelected, r.symbol]));
          } else {
            state.screenerSelected = state.screenerSelected.filter((sym) => sym !== r.symbol);
          }
        });
        pick.appendChild(checkbox);
        tr.appendChild(pick);
        tr.appendChild(td(r.symbol));
        tr.appendChild(td(formatCellNumber(r.price, 2)));
        tr.appendChild(td(formatCellNumber(r.marketCap, 2)));
        tr.appendChild(td(formatCellNumber(r.turnoverM, 2)));
        tr.appendChild(td(r.recent5dCloseAth ? "是" : "否"));

        const actionTd = document.createElement("td");
        const addBtn = document.createElement("button");
        addBtn.textContent = "加入提醒池";
        addBtn.addEventListener("click", async () => {
          await addSymbolsToAlertPool([r.symbol]);
        });
        actionTd.appendChild(addBtn);

        const explainBtn = document.createElement("button");
        explainBtn.textContent = "AI聊天";
        explainBtn.disabled = state.aiPanelBusy;
        explainBtn.addEventListener("click", async () => {
          await explainAiTarget("screener", r);
        });
        actionTd.appendChild(explainBtn);

        const buildBtn = document.createElement("button");
        buildBtn.textContent = "生成规则";
        buildBtn.disabled = state.aiPanelBusy;
        buildBtn.addEventListener("click", async () => {
          await buildAiTarget("screener", r);
        });
        actionTd.appendChild(buildBtn);
        tr.appendChild(actionTd);
      } else {
        tr.appendChild(td(r.symbol));
        tr.appendChild(td(formatCellNumber(r.price, 2)));
        tr.appendChild(td(formatCellNumber(r.changePercent, 2)));
        tr.appendChild(td(r.marketCap));
        tr.appendChild(td(r.peTTM));
        tr.appendChild(td(formatCellNumber(r.volumeRatio, 2)));

        const actionTd = document.createElement("td");
        const explainBtn = document.createElement("button");
        explainBtn.textContent = "AI聊天";
        explainBtn.disabled = state.aiPanelBusy;
        explainBtn.addEventListener("click", async () => {
          await explainAiTarget("screener", r);
        });
        actionTd.appendChild(explainBtn);

        const buildBtn = document.createElement("button");
        buildBtn.textContent = "生成规则";
        buildBtn.disabled = state.aiPanelBusy;
        buildBtn.addEventListener("click", async () => {
          await buildAiTarget("screener", r);
        });
        actionTd.appendChild(buildBtn);
        tr.appendChild(actionTd);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.screenerTable.innerHTML = "";
    el.screenerTable.appendChild(table);
  }

  function renderFinancialTable(rows) {
    el.financialTable.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "暂无命中结果。可先降低门槛，或减少扫描范围后再试。";
      el.financialTable.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    const selectTh = document.createElement("th");
    const master = document.createElement("input");
    master.type = "checkbox";
    const allSelected = rows.length > 0 && rows.every((r) => state.financialSelected.includes(r.symbol));
    master.checked = allSelected;
    master.addEventListener("change", () => {
      state.financialSelected = master.checked ? rows.map((r) => r.symbol) : [];
      renderFinancialTable(rows);
    });
    selectTh.appendChild(master);
    trh.appendChild(selectTh);

    const headers = ["股票", "公司", "报告期", "营收同比", "毛利率", "EBITDA", "EBITDA同比", "EBITDA利润率", "经营利润率", "经营现金流", "自由现金流", "负债权益比", "命中原因", "AI"];
    headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fin-cb-cell"></td>
        <td>${row.symbol || "-"}</td>
        <td>${row.companyName || "-"}</td>
        <td>${row.reportDate || "-"}</td>
        <td>${formatFinancialNumber(row.revenueGrowthYoY)}%</td>
        <td>${formatFinancialNumber(row.grossMargin)}%</td>
        <td>${formatFinancialNumber(row.ebitdaM, 0)}M</td>
        <td>${formatFinancialNumber(row.ebitdaGrowthYoY)}%</td>
        <td>${formatFinancialNumber(row.ebitdaMargin)}%</td>
        <td>${formatFinancialNumber(row.operatingMargin)}%</td>
        <td>${formatFinancialNumber(row.operatingCashFlowM, 0)}M</td>
        <td>${formatFinancialNumber(row.freeCashFlowM, 0)}M</td>
        <td>${formatFinancialNumber(row.debtToEquity, 2)}x</td>
        <td>${Array.isArray(row.reasons) ? row.reasons.join("；") : "-"}</td>
      `;

      const cbCell = tr.querySelector(".fin-cb-cell");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.financialSelected.includes(row.symbol);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.financialSelected = Array.from(new Set([...state.financialSelected, row.symbol]));
        } else {
          state.financialSelected = state.financialSelected.filter((sym) => sym !== row.symbol);
        }
      });
      cbCell.appendChild(checkbox);

      const actionTd = document.createElement("td");
      const explainBtn = document.createElement("button");
      explainBtn.textContent = "AI聊天";
      explainBtn.disabled = state.aiPanelBusy;
      explainBtn.addEventListener("click", async () => {
        await explainAiTarget("financial", row);
      });
      actionTd.appendChild(explainBtn);

      const buildBtn = document.createElement("button");
      buildBtn.textContent = "生成规则";
      buildBtn.disabled = state.aiPanelBusy;
      buildBtn.addEventListener("click", async () => {
        await buildAiTarget("financial", row);
      });
      actionTd.appendChild(buildBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    el.financialTable.appendChild(table);
  }

  function bindExportScreenerCsv() {
    if (!el.btnExportScreenerCsv) return;
    el.btnExportScreenerCsv.addEventListener("click", async () => {
      const rows = state.screenerResults || [];
      if (rows.length === 0) {
        if (typeof appendLog === "function") appendLog("没有可导出的筛选结果");
        return;
      }
      const isFmp = Boolean(getIsFmpProvider());
      const columns = getScreenerCsvColumns(isFmp);
      const csv = rowsToCsv(rows, columns);
      try {
        const result = await window.api.shell.saveFile({
          defaultName: "screener_results.csv",
          content: csv
        });
        if (result?.ok && typeof appendLog === "function") {
          appendLog(`筛选结果已导出：${result.filePath}`);
        }
      } catch (error) {
        if (typeof appendLog === "function") {
          appendLog(`导出失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
  }

  bindExportScreenerCsv();

  return {
    renderScreenerTable,
    renderFinancialTable
  };
}
