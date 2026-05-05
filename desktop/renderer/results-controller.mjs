function formatCellNumber(value, digits = 2) {
  return value?.toFixed ? value.toFixed(digits) : value;
}

function formatFinancialNumber(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? "-" : Number(value).toFixed(digits);
}

export function createResultsController({
  el,
  state,
  getIsFmpProvider,
  addSymbolsToAlertPool,
  explainAiTarget,
  buildAiTarget
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
        buildBtn.textContent = "生成模板";
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
        buildBtn.textContent = "生成模板";
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
    table.innerHTML = `
      <thead>
        <tr>
          <th>股票</th>
          <th>公司</th>
          <th>报告期</th>
          <th>营收同比</th>
          <th>毛利率</th>
          <th>EBITDA</th>
          <th>EBITDA同比</th>
          <th>EBITDA利润率</th>
          <th>经营利润率</th>
          <th>经营现金流</th>
          <th>自由现金流</th>
          <th>负债权益比</th>
          <th>命中原因</th>
          <th>AI</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
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

      const actionTd = document.createElement("td");
      const explainBtn = document.createElement("button");
      explainBtn.textContent = "AI聊天";
      explainBtn.disabled = state.aiPanelBusy;
      explainBtn.addEventListener("click", async () => {
        await explainAiTarget("financial", row);
      });
      actionTd.appendChild(explainBtn);

      const buildBtn = document.createElement("button");
      buildBtn.textContent = "生成模板";
      buildBtn.disabled = state.aiPanelBusy;
      buildBtn.addEventListener("click", async () => {
        await buildAiTarget("financial", row);
      });
      actionTd.appendChild(buildBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }

    el.financialTable.appendChild(table);
  }

  return {
    renderScreenerTable,
    renderFinancialTable
  };
}
