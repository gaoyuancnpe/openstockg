/* Yuren Harness - 品牌与界面定制插件(浏览器半)
 * 由 host 半追加进 __DSH_BOOT__ 启动图,经 /branding/client.js 提供。
 * 职责:
 *   1. 注册侧栏与对话页的品牌插槽(覆盖默认的官方标识及其回退图)
 *   2. 把空会话首页标语从默认口号替换为业务描述
 *   3. 把首启"填 API Key"引导改造成自由配置:DeepSeek/GLM/Kimi/OpenAI/
 *      Anthropic/自定义均可,且 OpenAI 与 Anthropic 两种接入协议都可选
 *      (多数厂商两种端点都提供,切换协议时联动换 baseURL)
 * 实现要点(与运行时内部机制的对应关系):
 *   - settings.onboarding 是 list 型插槽,外壳按 order 一次只挂载一个未完成
 *     步骤;本步骤 order=-50 排在官方 deepseek-official(0)之前。任意可用
 *     提供方存在时官方步骤的 readiness 会自动完成,不会再弹它的对话框。
 *   - 自定义提供方写入 llm-pi-ai 命名空间 providers/<route>(api 字段为
 *     openai-completions 或 anthropic-messages),凭证走
 *     api.credentials.set(ref=派生名)。
 */
window.__ModuleLoader__.load({
	id: "yuren-brand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const jsx = require("react/jsx-runtime").jsx;
		const jsxs = require("react/jsx-runtime").jsxs;
		const react = require("react");
		const { useState, useEffect, useMemo } = react;

		/* ───────────────────────── 品牌组件 ───────────────────────── */

		/** 层状几何标:四层圆角台阶自下而上收窄。 */
		function TailingsBrandMark({ size, className }) {
			const bars = [
				["8", "34", "32", "#3557d8"],
				["12", "26", "24", "#4f7cff"],
				["16", "18", "16", "#6f90ff"],
				["20", "10", "8", "#93b0ff"],
			];
			return jsx("svg", {
				width: size,
				height: size,
				viewBox: "0 0 48 48",
				className,
				"aria-hidden": "true",
				children: bars.map(([x, y, w, fill]) => jsx("rect", {
					key: x, x, y, width: w, height: "6", rx: "2", fill,
				})),
			});
		}

		/** 侧栏产品名。容器已带 18px/600 样式,这里只管文字与间距。 */
		function TailingsBrandName() {
			return jsx("span", {
				style: { letterSpacing: "0.02em", whiteSpace: "nowrap" },
				children: "Yuren Harness",
			});
		}

		/**
		 * 把 document.title 变成带替换的存取器:渲染器的 DocumentTitle 组件
		 * 会在每次会话切换时写 "会话名 — DeepSeek Harness",属性拦截让所有
		 * 写入都被换成"Yuren Harness",避免标题被 React 重置。
		 */
		function installTitleInterceptor() {
			if (typeof document === "undefined") return;
			const PRODUCT = "DeepSeek Harness";
			const OURS = "Yuren Harness";
			const rewrite = (v) => typeof v === "string" ? v.replaceAll(PRODUCT, OURS) : v;
			let current = rewrite(document.title);
			try {
				Object.defineProperty(document, "title", {
					configurable: true,
					get() { return current; },
					set(v) { current = rewrite(v); },
				});
				document.title = current;
			} catch { /* 极端环境下退化为一次性改写 */ }
		}

		/* ───────────────── 自由模型配置引导(settings.onboarding 步骤) ───────────────── */

		const PI_AI_NS = "llm-pi-ai";
		const DEEPSEEK_OFFICIAL_REF = "DEEPSEEK_API_KEY"; // llm-deepseek 的默认凭证名
		const ROUTE_PATTERN = /^[a-z][a-z0-9-]*$/;
		const deriveKeyRef = (route) => `${route.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;

		/** 把常见平台/网络报错翻译成人话+动作建议,保留原始信息供管理员诊断。 */
		const friendlyError = (msg) => {
			const text = String(msg);
			if (/invalid authentication|api key is invalid|401|unauthorized/i.test(text))
				return "密钥无效,或与所选平台不匹配:请检查密钥是否复制完整,并确认「提供商」与密钥来源一致(订阅 Key 不要选成按量,反之亦然)。[" + text + "]";
			if (/429|rate limit|限流/i.test(text))
				return "短时间内请求过多,触发平台限流:请等几分钟再试。[" + text + "]";
			if (/insufficient|balance|402|余额|quota|arrears/i.test(text))
				return "账户余额不足:请到对应平台的官网充值后再试。[" + text + "]";
			if (/failed to fetch|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text))
				return "网络连接失败:请检查网络后重试;持续失败请重启软件。[" + text + "]";
			return text;
		};
		/** 两种接入协议。dsh 的 llm-pi-ai 适配器原生支持,写入 profile 的 api 字段。 */
		const PROTOCOL_CHOICES = [
			["openai", "OpenAI 兼容（openai-completions）"],
			["anthropic", "Anthropic 兼容（anthropic-messages）"],
		];
		const PROTOCOL_IDS = { openai: "openai-completions", anthropic: "anthropic-messages" };

		/** 提供方预设。official 走 llm-deepseek 官方凭证,其余建自定义路由。
		 *  options 按协议给出该厂商的端点与模型;hint 写在弹窗里提示 Key↔端点
		 *  匹配规则。端点快照 2026-08-28 官方文档核对(超 30 天未核对应重新确认):
		 *  - 智谱分三套:开放平台按量(bigmodel.cn /api/paas/v4)、GLM 编程套餐
		 *    订阅(OpenAI 协议走专用 /api/coding/paas/v4,Anthropic 协议与按量同
		 *    一个 /api/anthropic)、国际版 Z.ai(api.z.ai,Key 与国内不通用)。
		 *  - Kimi 分两套:Kimi Code 订阅(api.kimi.com/coding,模型名 k3/
		 *    kimi-for-coding)与开放平台按量(api.moonshot.ai,模型名 kimi-k3),
		 *    Key 与端点必须匹配,混用一律 401 Invalid Authentication。
		 *  - OpenAI/Anthropic 无订阅 Key 一说:ChatGPT Plus、Claude Pro/Max 是
		 *    消费级会员,不能当 API Key 用。 */
		const PRESETS = {
			deepseek: { label: "DeepSeek 官方", official: true,
				keyUrl: "https://platform.deepseek.com/api_keys", keyLabel: "DeepSeek 开放平台" },
			glm: {
				label: "智谱 GLM（按量 Key）", route: "glm", displayName: "智谱 GLM", options: {
					openai: { baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-5.3, glm-5.3-flash" },
					anthropic: { baseURL: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.3, glm-5.3-flash" },
				},
				hint: "按量计费 Key(open.bigmodel.cn 控制台创建);编程套餐订阅 Key 请选下面的编程套餐预设。",
				keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys", keyLabel: "智谱个人中心 API Keys 页",
			},
			"glm-coding": {
				label: "GLM 编程套餐（订阅 Key）", route: "glm-coding", displayName: "GLM 编程套餐", options: {
					openai: { baseURL: "https://open.bigmodel.cn/api/coding/paas/v4", model: "glm-5.3, glm-5.2" },
					anthropic: { baseURL: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.3, glm-5.2" },
				},
				hint: "套餐 Key 在 套餐概览 页创建(团队套餐 Key 与平台 Key 不通用);官方声明套餐额度仅限指定编程工具,自建应用可能按量计费;模型以套餐概览页为准。",
				keyUrl: "https://docs.bigmodel.cn/cn/coding-plan/quick-start", keyLabel: "编程套餐开通与创建指引",
			},
			zai: {
				label: "Z.ai 国际版（海外 Key）", route: "zai", displayName: "Z.ai 国际版", options: {
					openai: { baseURL: "https://api.z.ai/api/paas/v4", model: "glm-5.3, glm-5.3-flash" },
					anthropic: { baseURL: "https://api.z.ai/api/anthropic", model: "glm-5.3, glm-5.3-flash" },
				},
				hint: "海外平台 z.ai 的 Key,与国内 bigmodel.cn 不通用;编程套餐 Key 选 OpenAI 协议时地址需改为 api.z.ai/api/coding/paas/v4。",
				keyUrl: "https://z.ai/manage-apikey/apikey-list", keyLabel: "Z.ai API Keys 页",
			},
			"kimi-code": {
				label: "Kimi Code（订阅 Key）", route: "kimi-code", displayName: "Kimi Code（订阅）", options: {
					openai: { baseURL: "https://api.kimi.com/coding/v1", model: "k3, kimi-for-coding" },
					anthropic: { baseURL: "https://api.kimi.com/coding/", model: "k3, kimi-for-coding" },
				},
				hint: "kimi.com/code 订阅 Key;模型名与开放平台不同(是 k3 不是 kimi-k3);限流约 300–1200 次/5 小时。",
				keyUrl: "https://www.kimi.com/code/console", keyLabel: "Kimi Code 控制台",
			},
			kimi: {
				label: "Kimi 开放平台（按量 Key）", route: "kimi", displayName: "Kimi", options: {
					openai: { baseURL: "https://api.moonshot.ai/v1", model: "kimi-k3" },
					anthropic: { baseURL: "https://api.moonshot.ai/anthropic", model: "kimi-k3" },
				},
				hint: "platform.kimi.ai 发的按量 Key;旧 platform.moonshot.cn 的 Key 请把地址换成 api.moonshot.cn。",
				keyUrl: "https://platform.kimi.com/console/api-keys", keyLabel: "Kimi 开放平台控制台",
			},
			openai: {
				label: "OpenAI", route: "openai", displayName: "OpenAI", options: {
					openai: { baseURL: "https://api.openai.com/v1", model: "gpt-5.6-sol, gpt-5-chat-latest" },
				},
				hint: "ChatGPT Plus/Pro 是消费级会员,不能当 API Key 用;需在 platform.openai.com 充值后创建 API Key。",
				keyUrl: "https://platform.openai.com/api-keys", keyLabel: "OpenAI 平台",
			},
			anthropic: {
				label: "Anthropic Claude", route: "anthropic", displayName: "Anthropic Claude", options: {
					anthropic: { baseURL: "https://api.anthropic.com", model: "claude-sonnet-5, claude-opus-5" },
				},
				hint: "Claude Pro/Max 订阅不能当 API Key 用;需在 console.anthropic.com 单独开通 API(按量计费)。",
				keyUrl: "https://console.anthropic.com/settings/keys", keyLabel: "Anthropic 控制台",
			},
			custom: {
				label: "自定义", custom: true, options: {
					openai: { baseURL: "", model: "" },
					anthropic: { baseURL: "", model: "" },
				},
			},
		};

		/* 内联样式(复用全局 design token,弹窗外观与应用一致) */
		const S = {
			overlay: {
				position: "fixed", inset: 0, zIndex: 1000,
				display: "flex", alignItems: "center", justifyContent: "center",
				background: "rgba(0,0,0,.5)", padding: "24px",
			},
			card: {
				width: "min(480px, 92vw)", maxHeight: "88vh", overflow: "auto",
				background: "var(--dsw-alias-bg-elevated, #1c2129)",
				color: "var(--dsw-alias-label-primary, #d7dce6)",
				border: "1px solid var(--dsw-alias-border-subtle, #2b3240)",
				borderRadius: "12px", padding: "28px 28px 22px", boxShadow: "0 12px 40px rgba(0,0,0,.45)",
				fontFamily: "inherit",
			},
			title: { margin: 0, fontSize: "19px", fontWeight: 600 },
			desc: { margin: "10px 0 0", fontSize: "13px", lineHeight: "20px",
				color: "var(--dsw-alias-label-secondary, #93a1b8)" },
			hint: { margin: "8px 0 0", fontSize: "12px", lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary, #7d8aa0)",
				padding: "8px 10px", borderRadius: "8px",
				background: "var(--dsw-alias-bg-sunken, #161a22)",
				border: "1px solid var(--dsw-alias-border-subtle, #2b3240)" },
			keyLink: { margin: "8px 0 0 10px", fontSize: "12px", lineHeight: "18px" },
			keyAnchor: { color: "#6f90ff", textDecoration: "none" },
			advBox: { marginTop: "16px" },
			advToggle: { background: "none", border: "0", padding: "0", cursor: "pointer",
				fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #7d8aa0)" },
			field: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "16px" },
			label: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #93a1b8)" },
			input: {
				boxSizing: "border-box", width: "100%", padding: "9px 12px", fontSize: "14px",
				color: "inherit", background: "var(--dsw-alias-bg-base, #141821)",
				border: "1px solid var(--dsw-alias-border-subtle, #2b3240)", borderRadius: "8px",
				outline: "none",
			},
			actions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" },
			secondary: {
				padding: "9px 18px", fontSize: "14px", cursor: "pointer", color: "inherit",
				background: "transparent", border: "1px solid var(--dsw-alias-border-subtle, #2b3240)",
				borderRadius: "8px",
			},
			primary: {
				padding: "9px 22px", fontSize: "14px", cursor: "pointer", color: "#fff",
				background: "#3557d8", border: "0", borderRadius: "8px",
			},
			failure: { margin: "14px 0 0", fontSize: "13px", lineHeight: "19px",
				color: "var(--dsw-alias-state-error-primary, #e08a8a)" },
		};

		/**
		 * 自由配置引导步骤。挂载后先探测是否已有可用提供方(有则静默完成,
		 * 不打扰老用户),没有则展示自由配置表单。
		 * @param props - 外壳传入 complete;注册注入传入 api 与 describeFace。
		 */
		function FreeProviderSetup(props) {
			const { complete, api, describeFace } = props;
			const [phase, setPhase] = useState("checking");
			const [takenRoutes, setTakenRoutes] = useState([]);
			const [presetKey, setPresetKey] = useState("deepseek");
			const [protocolKey, setProtocolKey] = useState("openai");
			const [keyDraft, setKeyDraft] = useState("");
			const [routeDraft, setRouteDraft] = useState("my-llm");
			const [nameDraft, setNameDraft] = useState("");
			const [baseURLDraft, setBaseURLDraft] = useState("");
			const [modelsDraft, setModelsDraft] = useState("");
			const [busy, setBusy] = useState(false);
			const [failure, setFailure] = useState(void 0);
			const [advanced, setAdvanced] = useState(false);
			const preset = PRESETS[presetKey];
			const protocolChoices = preset.options ? Object.keys(preset.options) : [];

			/* 启动探测:已存在任一可用提供方 → 静默完成本步骤 */
			useEffect(() => {
				let cancelled = false;
				(async () => {
					try {
						const [providersRes] = await Promise.all([
							api.llm.providers({}), describeFace.ensure(),
						]);
						if (cancelled) return;
						const entries = providersRes.result.ok
							? providersRes.result.value.providers : [];
						setTakenRoutes(entries
							.filter((e) => e.settingsNs === PI_AI_NS)
							.map((e) => e.provider));
						const refs = [];
						for (const e of entries) {
							if (!e.active) continue;
							refs.push(e.settingsNs === "llm-deepseek"
								? DEEPSEEK_OFFICIAL_REF : deriveKeyRef(e.provider));
						}
						if (refs.length > 0) {
							const cred = await api.credentials.describe({ refs });
							if (cred.result.ok) {
								const configured = cred.result.value.credentials;
								const usable = refs.some((ref) => configured[ref]?.configured === true);
								if (usable) { complete(); return; }
							}
						}
					} catch { /* 探测失败不拦路,直接给表单 */ }
					if (!cancelled) setPhase("form");
				})();
				return () => { cancelled = true; };
			}, []);

			/* 切换预设/协议时带出对应端点与模型的默认值 */
			useEffect(() => {
				setFailure(void 0);
				if (preset.official) return;
				setProtocolKey((prev) =>
					prev in preset.options ? prev : Object.keys(preset.options)[0]);
			}, [presetKey]);

			useEffect(() => {
				setFailure(void 0);
				if (preset.official) return;
				const option = preset.options[protocolKey] ?? Object.values(preset.options)[0];
				setBaseURLDraft(option.baseURL ?? "");
				setModelsDraft(option.model ?? "");
			}, [presetKey, protocolKey]);

			const revision = useMemo(() => {
				const view = describeFace.getSnapshot().view;
				const ns = view?.namespaces.find((v) => v.ns === PI_AI_NS);
				return ns?.revision;
			}, [phase]);

			const save = async () => {
				setBusy(true);
				setFailure(void 0);
				try {
					const key = keyDraft.trim();
					if (key.length === 0) { setFailure("请输入 API 密钥。"); return; }
					if (preset.official) {
						const res = await api.credentials.set({ ref: DEEPSEEK_OFFICIAL_REF, value: key });
						if (!res.result.ok) { setFailure(friendlyError(res.result.error.message)); return; }
					} else {
						const route = preset.custom ? routeDraft.trim() : preset.route;
						if (!ROUTE_PATTERN.test(route)) {
							setFailure("提供方 ID 需以小写字母开头,仅含小写字母、数字和短横线。");
							return;
						}
						if (takenRoutes.includes(route)) {
							setFailure(`提供方 ID “${route}” 已被使用,请换一个。`);
							return;
						}
						const baseURL = baseURLDraft.trim();
						if (baseURL.length === 0) { setFailure("请填写 API 地址(baseURL)。"); return; }
						const models = modelsDraft.split(/[,，\s]+/).filter(Boolean);
						if (models.length === 0) { setFailure("请至少填写一个模型 ID。"); return; }
						const ref = deriveKeyRef(route);
						const profile = {
							displayName: nameDraft.trim() || preset.displayName || route,
							apiKeyEnv: ref,
							api: PROTOCOL_IDS[protocolKey] ?? PROTOCOL_IDS.openai,
							baseURL,
							models: models.map((id) => ({ id, contextWindow: 131072, maxTokens: 8192 })),
						};
						const res = await api.settings.mutate({
							ns: PI_AI_NS,
							ops: [{ op: "set", path: ["providers", route], value: profile }],
							...(revision !== void 0 ? { expectedRevision: revision } : {}),
						});
						if (!res.result.ok) { setFailure(friendlyError(res.result.error.message)); return; }
						const stored = await api.credentials.set({ ref, value: key });
						if (!stored.result.ok) { setFailure(stored.result.error.message); return; }
					}
					complete();
				} catch (error) {
					setFailure(friendlyError(error instanceof Error ? error.message : String(error)));
				} finally {
					setBusy(false);
				}
			};

			if (phase !== "form") return null;
			const field = (label, children) => jsxs("label", { style: S.field, children: [
				jsx("span", { style: S.label, children: label }), children,
			] });
			return jsx("div", {
				style: S.overlay, role: "dialog", "aria-modal": "true",
				"aria-label": "配置模型 API",
				children: jsx("div", { style: S.card, children: jsxs("div", { children: [
				jsx("h2", { style: S.title, children: "配置模型 API 开始使用" }),
				jsx("p", { style: S.desc, children:
					"支持 DeepSeek、智谱 GLM、Kimi、Z.ai、OpenAI、Anthropic,以及任意 OpenAI / Anthropic 兼容接口;也可稍后在 设置 → 模型 里修改。" }),
				preset.hint !== void 0 ? jsx("p", { style: S.hint, children: preset.hint }) : null,
				preset.keyUrl !== void 0 ? jsx("p", { style: S.keyLink, children: jsxs("a", {
					href: preset.keyUrl, target: "_blank", rel: "noreferrer", style: S.keyAnchor,
					children: ["还没有密钥？去", preset.keyLabel, "创建 →"] }) }) : null,
				field("提供商", jsx("select", {
					style: S.input, value: presetKey,
					onChange: (e) => setPresetKey(e.target.value),
					children: Object.entries(PRESETS).map(([k, p]) =>
						jsx("option", { value: k, children: p.label }, k)),
				})),
				preset.custom ? field("提供方 ID", jsx("input", {
					style: S.input, value: routeDraft,
					placeholder: "my-llm",
					onChange: (e) => setRouteDraft(e.target.value),
				})) : null,
				preset.custom ? field("显示名称（可选）", jsx("input", {
					style: S.input, value: nameDraft,
					placeholder: "公司内部网关",
					onChange: (e) => setNameDraft(e.target.value),
				})) : null,
				!preset.official && protocolChoices.length > 1 ? jsxs("div", { style: S.advBox, children: [
					jsx("button", { type: "button", style: S.advToggle,
						onClick: () => setAdvanced(!advanced),
						children: (advanced ? "▾ " : "▸ ") + "高级选项（一般不用改）" }),
					advanced ? field("API 协议", jsx("select", {
						style: S.input, value: protocolKey,
						onChange: (e) => setProtocolKey(e.target.value),
						children: PROTOCOL_CHOICES.filter(([k]) => protocolChoices.includes(k))
							.map(([k, label]) => jsx("option", { value: k, children: label }, k)),
					})) : null,
				] }) : null,
				!preset.official ? field("API 地址（baseURL）", jsx("input", {
					style: S.input, value: baseURLDraft,
					placeholder: protocolKey === "anthropic"
						? "https://api.example.com/anthropic" : "https://api.example.com/v1",
					onChange: (e) => setBaseURLDraft(e.target.value),
				})) : null,
				!preset.official ? field("模型 ID（多个用逗号分隔）", jsx("input", {
					style: S.input, value: modelsDraft,
					placeholder: "例如 glm-5.3, glm-5.3-flash",
					onChange: (e) => setModelsDraft(e.target.value),
				})) : null,
				field("API 密钥", jsx("input", {
					style: S.input, type: "password", value: keyDraft,
					placeholder: "sk-…", autoFocus: true,
					onChange: (e) => setKeyDraft(e.target.value),
				})),
				failure !== void 0 ? jsx("p", { style: S.failure, children: failure }) : null,
				jsxs("div", { style: S.actions, children: [
					jsx("button", { type: "button", style: S.secondary, disabled: busy,
						onClick: complete, children: "稍后配置" }),
					jsx("button", { type: "button", style: S.primary, disabled: busy,
						onClick: save, children: busy ? "保存中…" : "保存并继续" }),
				] }),
			] }) }),
			});
		}

		/** Required services: 插槽注册 + 词条表 + 连接 API + 设置镜像。 */
		const inject = ["slots", "locale", "connection", "settingsScope"];
		/**
		 * 填充品牌插槽、覆盖首页标语,并注册自由配置引导步骤。
		 * @param ctx - 客户端根上下文。
		 */
		function apply(ctx) {
			installTitleInterceptor();
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", () => ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, TailingsBrandMark);
				yield ctx.slots.register({ name: "sidebar.brand.name" }, TailingsBrandName);
				yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, TailingsBrandMark);
			})));
			// register() 对同命名空间+语言重复注册会抛异常,词条覆盖只能直接改字典后手动发布。
			// 各插件的词典注册时机不确定(可能晚于本插件激活,把改过的字典对象整个换掉),
			// 所以轮询重试直到两个目标命名空间都已注册;每次成功后 publish 触发重渲染。
			try {
				const applied = { hero: false, models: false };
				const applyLocaleOverrides = () => {
					// 命名空间首次出现后字典对象不再会被替换(重复注册会抛异常),应用一次即稳定
					const overrideDicts = (nsName, overrides) => {
						const ns = ctx.locale.dicts && ctx.locale.dicts.get(nsName);
						if (!ns) return false;
						let touched = false;
						for (const [locale, entries] of Object.entries(overrides)) {
							const dict = ns.get(locale);
							if (!dict) continue;
							for (const [key, value] of Object.entries(entries)) {
								if (key in dict) { dict[key] = value; touched = true; }
							}
						}
						return touched;
					};
					let fresh = false;
					if (!applied.hero) {
						applied.hero = overrideDicts("conversation", {
							zh: { "hero.headline": "智能体工作台 · 领域随需定制" },
							en: { "hero.headline": "Agent workspace, customized per domain" },
						});
						fresh = fresh || applied.hero;
					}
					if (!applied.models) {
						applied.models = overrideDicts("settings.models", {
							zh: {
								"welcomeTitle": "欢迎使用Yuren Harness",
								"welcomeBody": "Yuren Harness 是可定制的智能体工作台:接入领域工具与知识后,即可承担资料检索、指标测算、方案撰写、报告生成等专业工作。\n\n可以这样开始:①「帮我检索××领域的标准/法规,整理成对照表」;②「按这组参数算出关键指标,并生成正式报告」。\n\n当前版本仍在快速迭代,使用中如遇问题请联系技术支持。",
								"onboardingTitle": "添加模型 API Key",
								"onboardingDescription": "配置任一模型提供方(DeepSeek/GLM/Kimi/Z.ai/OpenAI/Anthropic 及 OpenAI/Anthropic 兼容接口)即可开始使用。",
							},
							en: {
								"welcomeTitle": "Welcome to Yingbao Assistant",
								"welcomeBody": "Yuren Harness is a customizable agent workspace: plug in domain tools and knowledge for search, calculation, planning and report writing.\n\nTry asking: summarize the standards of your domain into a table, or compute metrics and draft a formal report from your data.\n\nThis build iterates quickly; contact support if anything misbehaves.",
								"onboardingTitle": "Add a model API key",
								"onboardingDescription": "Configure any provider (DeepSeek/GLM/Kimi/Z.ai/OpenAI/Anthropic, OpenAI- or Anthropic-compatible) to get started.",
							},
						});
						fresh = fresh || applied.models;
					}
					if (fresh) ctx.locale.publish(ctx.locale.getLocale().active, false);
					return applied.hero && applied.models;
				};
				let attempt = 0;
				const retry = () => {
					let done = false;
					try { done = applyLocaleOverrides(); } catch { /* 单次失败继续重试 */ }
					if (!done && ++attempt < 20) setTimeout(retry, 300);
				};
				retry();
			} catch { /* 词条覆盖失败不影响其余功能 */ }
			// 自由模型配置引导(order=-50,先于官方 DeepSeek 步骤)
			const api = ctx.connection.api;
			const describeFace = ctx.settingsScope.describe();
			ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
				name: "settings.onboarding",
				id: "free-provider-setup",
				order: -50,
				inject: () => ({ api, describeFace }),
			}, FreeProviderSetup));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
