import { extractAiSessionContext, extractAssistantContext } from "./ai-task-registry.mjs";

export const PRIMARY_ROLE_ID = "primary";

const ROLE_LABELS = {
  primary: "主角色",
  planner: "规划器",
  validator: "校验器",
  synthesizer: "综合器",
  rule_reviewer: "规则评审员",
  diagnostics_advisor: "诊断顾问"
};

function truncateText(text, maxLength = 6000) {
  const raw = String(text || "");
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength)}\n...（内容过长，已截断）`;
}

function buildSourceContextMarkdown(task) {
  const userContents = (Array.isArray(task?.messages) ? task.messages : [])
    .filter((message) => message?.role === "user")
    .map((message) => String(message?.content || ""));
  return truncateText(userContents.join("\n\n"));
}

function buildQuestionLine(task) {
  const { prompt } = extractAiSessionContext(task?.payload);
  return prompt || "（用户未提供额外问题，请基于附加上下文直接分析）";
}

function filterAttachments(task, types) {
  const { attachments } = extractAssistantContext(task?.payload);
  return attachments.filter((item) => types.includes(item.type));
}

function buildAttachmentsMarkdown(attachments) {
  if (attachments.length === 0) return "（当前没有可用的附加上下文）";
  return attachments
    .map((item) => {
      const body = typeof item.content === "string"
        ? item.content
        : JSON.stringify(item.content, null, 2);
      return `### ${item.label}（type=${item.type}）\n${truncateText(body, 4000)}`;
    })
    .join("\n\n");
}

export function getAgentRoleLabel(roleId) {
  return ROLE_LABELS[String(roleId || "")] || String(roleId || "未知角色");
}

export function listAgentRoleIds() {
  return ["primary", "validator", "synthesizer", "rule_reviewer", "diagnostics_advisor"];
}

export function getAgentRoleDefinition(roleId) {
  switch (String(roleId || "")) {
    case PRIMARY_ROLE_ID:
      return PRIMARY_ROLE;
    case "validator":
      return VALIDATOR_ROLE;
    case "synthesizer":
      return SYNTHESIZER_ROLE;
    case "rule_reviewer":
      return RULE_REVIEWER_ROLE;
    case "diagnostics_advisor":
      return DIAGNOSTICS_ADVISOR_ROLE;
    default:
      return null;
  }
}

export function hasAttachmentType(task, types) {
  return filterAttachments(task, types).length > 0;
}

// 依据任务附加上下文挑选可并行分析的分支角色，供 role_pipeline / llm_planner 使用
export function selectFanOutAnalystRoles(task) {
  const roles = [];
  if (!task || task.kind !== "assistant" || task.mode !== "chat") return roles;
  if (hasAttachmentType(task, ["rules"])) roles.push("rule_reviewer");
  if (hasAttachmentType(task, ["logs", "last_run", "schedule"])) roles.push("diagnostics_advisor");
  return roles;
}

const PRIMARY_ROLE = {
  id: PRIMARY_ROLE_ID,
  outputKind: "final",
  buildMessages({ task }) {
    // 主角色直接使用任务注册表产出的原始 messages，保证与单任务模式一致
    return Array.isArray(task?.messages) ? task.messages : [];
  }
};

const VALIDATOR_ROLE = {
  id: "validator",
  outputKind: "verdict",
  appliesTo(task) {
    return task?.mode === "builder" && Array.isArray(task?.mappingTargets) && task.mappingTargets.length > 0;
  },
  buildMessages({ task, upstream }) {
    const candidate = upstream?.primaryStructured || null;
    return [
      {
        role: "system",
        content:
          "你是 OpenStock 桌面端智能体流水线里的校验器。你的唯一职责是复核主角色生成的结构化输出，判断其中的 formIntents 是否可以放行给用户。\n" +
          "要求：\n" +
          "1. 只输出一个 JSON 对象，不要输出 markdown 代码块或额外说明。\n" +
          "2. verdict 只允许 approved / needs_fix / rejected。\n" +
          "3. needs_fix 表示整体可用但个别 intent 有问题；rejected 表示整体不可靠。\n" +
          "4. rejectedIntents 按 formIntents 下标列出被拒项和具体原因。\n" +
          "5. 不得因为风格问题拒绝，只基于字段自洽性、数值合理性下判断。"
      },
      {
        role: "user",
        content:
          `原始输入上下文（可能截断）：\n${buildSourceContextMarkdown(task)}\n\n` +
          `待校验的结构化输出：\n${JSON.stringify(candidate, null, 2)}\n\n` +
          `校验要点：\n` +
          `1. ruleDraft：conditions 缺失或全部无效时必须拒绝；universe=manual 但 symbols 为空时必须拒绝；数值阈值与源数据明显矛盾（如市值门槛超过源市值数量级）时必须拒绝。\n` +
          `2. screenerPreset / financialPreset：maxScan、阈值数值是否在合理范围。\n` +
          `3. scheduleDraft：intervalSec 是否在 30-86400 秒的合理区间。\n` +
          `4. formIntents 为空时直接 approved。\n\n` +
          `输出 JSON：{"verdict":"approved"|"needs_fix"|"rejected","rejectedIntents":[{"index":0,"reason":"..."}],"notes":["..."]}`
      }
    ];
  }
};

const SYNTHESIZER_ROLE = {
  id: "synthesizer",
  outputKind: "final",
  appliesTo(task) {
    return task?.mode === "chat";
  },
  buildMessages({ task, upstream }) {
    const branches = Array.isArray(upstream?.branches) ? upstream.branches : [];
    const branchBlocks = branches
      .map((branch) => `### 分支：${getAgentRoleLabel(branch.role)}\n${truncateText(branch.text, 3000)}`)
      .join("\n\n");
    return [
      {
        role: "system",
        content:
          "你是 OpenStock 桌面端智能体流水线里的综合器。多个分析分支已经各自给出结论，你需要把它们合并成一份最终中文回答。\n" +
          "要求：\n" +
          "1. 只基于分支输出合并，不得引入分支里没有的新事实。\n" +
          "2. 分支结论冲突时明确指出冲突点，不要强行调和。\n" +
          "3. 保持控制台风格：直接、量化、可执行。\n" +
          "4. 不要提及内部角色或流水线细节，直接给用户可读的答案。"
      },
      {
        role: "user",
        content:
          `用户问题：${buildQuestionLine(task)}\n\n各分支输出：\n\n${branchBlocks || "（没有分支输出）"}`
      }
    ];
  }
};

const RULE_REVIEWER_ROLE = {
  id: "rule_reviewer",
  outputKind: "branch",
  appliesTo(task) {
    return hasAttachmentType(task, ["rules"]);
  },
  buildMessages({ task }) {
    const attachments = filterAttachments(task, ["rules"]);
    return [
      {
        role: "system",
        content:
          "你是 OpenStock 桌面端智能体流水线里的规则评审员。你只负责分析用户附上的规则配置，从单一路径给出结论。\n" +
          "要求：\n" +
          "1. 只基于规则快照判断，不假设外部数据。\n" +
          "2. 输出控制在 10 行以内，先给结论，再列最多 3 条依据。\n" +
          "3. 指出规则过宽、过窄或阈值可疑的具体字段。"
      },
      {
        role: "user",
        content:
          `用户问题：${buildQuestionLine(task)}\n\n规则上下文：\n${buildAttachmentsMarkdown(attachments)}`
      }
    ];
  }
};

const DIAGNOSTICS_ADVISOR_ROLE = {
  id: "diagnostics_advisor",
  outputKind: "branch",
  appliesTo(task) {
    return hasAttachmentType(task, ["logs", "last_run", "schedule"]);
  },
  buildMessages({ task }) {
    const attachments = filterAttachments(task, ["logs", "last_run", "schedule"]);
    return [
      {
        role: "system",
        content:
          "你是 OpenStock 桌面端智能体流水线里的运行诊断顾问。你只负责分析定时、最近运行与日志类上下文，从单一路径给出结论。\n" +
          "要求：\n" +
          "1. 只基于给出的运行事实判断，不猜测未提供的环节。\n" +
          "2. 输出控制在 10 行以内，先给结论，再列最多 3 条依据或排查建议。\n" +
          "3. 明确区分“已确认”与“待确认”的问题。"
      },
      {
        role: "user",
        content:
          `用户问题：${buildQuestionLine(task)}\n\n运行上下文：\n${buildAttachmentsMarkdown(attachments)}`
      }
    ];
  }
};

// llm_planner 角色本身不进流水线执行，只在规划阶段被调用一次
export const PLANNER_PROMPT_ROLES = listAgentRoleIds();

export function buildPlannerMessages({ task, runtimeConfig }) {
  const roleLines = PLANNER_PROMPT_ROLES
    .map((roleId) => `- ${roleId}：${getAgentRoleLabel(roleId)}`)
    .join("\n");
  const maxSteps = Number(runtimeConfig?.orchestration?.maxSteps || 4);
  return [
    {
      role: "system",
      content:
        "你是 OpenStock 桌面端智能体流水线的规划器。你的唯一职责是把任务分解为最多 " + maxSteps + " 步的角色执行计划。\n" +
        "要求：\n" +
        "1. 只输出一个 JSON 对象，不要输出 markdown 代码块或额外说明。\n" +
        `2. 可选角色（steps[*].role 只允许这些值）：\n${roleLines}\n` +
        "3. primary 表示任务本身的执行角色，计划里必须且只能包含一个 primary。\n" +
        "4. builder 类任务建议 primary 之后加 validator；多分支分析最后必须由 synthesizer 汇总。\n" +
        "5. 简单任务不要为了凑步数而加角色，1-2 步往往就够。"
    },
    {
      role: "user",
      content:
        `任务：kind=${task?.kind} mode=${task?.mode} subject=${task?.subject}\n` +
        `用户问题：${buildQuestionLine(task)}\n\n` +
        `输出 JSON：{"steps":[{"role":"primary","purpose":"..."}]}`
    }
  ];
}
