---
name: "research-deliverables"
description: "交付文件的标准流程:outputs/ 目录、命名、可点下载链接、报告章节。凡产出 csv/xlsx/报告给用户必读。"
---

# 交付物工作流

## 放哪、叫什么

- 交付物（给用户的最终文件）一律写 `/srv/yuren/workspace/outputs/<主题>/`，命名 `YYYYMMDD_标的或主题_内容.扩展名`，日期用工具取，不要猜。
- 中间产物（脚本、原始拉取数据 raw、验证/对拍文件、临时文件）放任务子目录，**绝不进 outputs/**；python 依赖装工作区根的 `.pylibs/`（pip --target），不要散装。
- 面板『运行 → 产出文件』默认只展示交付物（outputs/ 与 csv/xlsx/md 等文档类），放错位置用户看不到。

## 链接怎么贴（铁律）

凡交付文件，同一条回复里必须给**可点击的下载链接**：

```
[文件名]({{PUBLIC_BASE_URL}}/branding/api/workspace/download?name=相对工作区根的路径)
```

例：`/srv/yuren/workspace/outputs/ndx/ndx_last50_indicators.csv` 贴成
`[ndx_last50_indicators.csv]({{PUBLIC_BASE_URL}}/branding/api/workspace/download?name=outputs/ndx/ndx_last50_indicators.csv)`。
路径含中文/空格必须 encodeURIComponent。只报文件名不给链接 = 交付未完成。

## 产物栏的盲区

对话底部"产物"栏只收录用文件工具直接写出的脚本；**脚本在后台生成的数据文件不会出现在那里**——必须自己贴上面的链接。可附一句：文件也在面板『运行 → 产出文件』可下载。

## 报告固定章节

结论 → 筛选口径与命中 → 财报要点 → 风险与假设 → 数据时间戳。先在对话里给结论摘要，再给文档链接；对话中的关键数字与文档一致。

## 表格文件细节

- csv 用 UTF-8；xlsx 表头用中文，首列日期（YYYY-MM-DD）。
- 大表（>100 行）在对话里只贴摘要统计 + 文件链接，不整表粘贴。
