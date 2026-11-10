// Deterministic text features for the lexical baseline: normalized terms, CJK bigrams, and intent concepts.
// Concepts let differently worded questions ("push back on a stakeholder" / "disagreement") share a feature.

const STOPWORDS = new Set(("a an the and or but of to in on at for with from by as is are was were be been being it its this that these those " +
  "i me my we our you your he she they them their his her what which who whom when where why how do does did done can could would should will " +
  "shall may might must have has had having about into over under than then so if not no yes just also very really more most some any one " +
  "tell describe share give talk walk explain example time times please let us candidate candidates there here such like").split(" "));

// Each concept lists surface patterns (English regex fragments or Chinese phrases). Matching runs on lowercased text.
export const CONCEPTS: Record<string, string[]> = {
  conflict: ["conflict", "disagree", "disagreement", "push(ed)? back", "pushback", "clash", "tension", "friction", "argu(e|ment)", "dispute", "opposing", "differing (views|opinions|priorities)", "competing priorit", "冲突", "分歧", "意见不(一致|合)", "争执"],
  alignment: ["align", "consensus", "buy-in", "(on|onto) the same page", "want(ed)? different things", "convince", "persuad", "influence", "win (them|people) over", "get .{0,20}on board", "对齐", "说服", "共识"],
  stakeholder: ["stakeholder", "partner team", "cross-functional", "cross functional", "other teams", "利益相关", "跨部门", "跨团队"],
  leadership: ["leader(ship)?", "\\blead\\b", "\\bled\\b", "took charge", "take charge", "step(ped)? up", "rally", "领导", "带领", "牵头"],
  ownership: ["ownership", "\\bown(ed)?\\b", "took initiative", "initiative", "proactive", "负责", "主动"],
  "no-authority": ["without (formal )?authority", "no authority", "not (your|the) manager", "没有权力"],
  failure: ["fail(ed|ure)?", "mistake", "did(n't| not) work", "went wrong", "setback", "did(n't| not) go (well|as planned)", "wrong", "失败", "错误", "没成功", "搞砸"],
  learning: ["learn(ed|ing)?", "lesson", "grow(th)?", "reflect", "in hindsight", "(would|you'd) (you )?do differently", "学到", "教训", "成长", "反思"],
  feedback: ["feedback", "critici", "critique", "constructive", "反馈", "批评"],
  hindsight: ["rebuil(d|t)", "(would|you'd) (you )?do (it )?differently", "differently (now|today|next time)", "start over", "if you could redo", "redo", "in hindsight", "improve .{0,20}project", "重新做", "重做", "如果再来"],
  prioritization: ["priorit", "trade-?off", "triage", "what to cut", "deprioriti", "取舍", "优先级", "权衡"],
  constraint: ["constrain", "limited (time|resources|capacity|engineering|data)", "capacity", "resource", "bandwidth", "tight", "资源有限", "限制"],
  deadline: ["deadline", "time pressure", "under pressure", "fast-paced", "fast paced", "tight timeline", "behind schedule", "late", "slip", "截止", "时间紧", "赶工"],
  "changing-priorities": ["changing priorit", "priorities changed", "shifting", "pivot", "multiple (projects|workstreams|tasks)", "juggl", "multitask", "多线程", "多个项目", "优先级变"],
  "speed-quality": ["ship(ping)? (fast|quickly)", "speed", "quality", "perfect", "polish", "\\bmvp\\b", "good enough", "reliab", "速度", "质量"],
  ambiguity: ["ambigu", "unclear", "uncertain(ty)?", "undefined", "vague", "no (clear |existing |established )?(playbook|direction|guidance|path|requirements)", "unknown", "模糊", "不确定", "不明确"],
  "zero-to-one": ["zero[- ]to[- ]one", "from zero", "0 to 1", "0-1", "from scratch", "from the ground up", "brand new", "new product", "build(ing)? something new", "从零", "从0"],
  "ownership-gap": ["nobody owns", "no one owns", "no owner", "between (two |different |multiple )?teams", "no one (is )?(picking|taking) (it )?up", "fall(s)? through the cracks", "unclear ownership", "没人负责"],
  data: ["\\bdata\\b", "dataset", "analy(sis|tics|ze|zed)", "numbers", "quantitative", "sql", "数据", "分析"],
  experiment: ["experiment", "a/?b test", "\\ba/b\\b", "test(ed|ing)? (a|the) hypothesis", "hypothes", "实验", "ab ?测试"],
  metric: ["metric", "kpi", "numerator", "denominator", "baseline", "measure", "calculat", "指标", "衡量"],
  causality: ["caus(al|ed|ation)", "attribut", "correlat", "因果", "归因"],
  "evidence-change": ["changed (your|the) (mind|recommendation)", "data[- ]driven", "evidence", "insight", "数据驱动", "改变了.{0,6}(决定|建议)"],
  customer: ["customer", "\\busers?\\b", "client", "user need", "pain point", "user research", "客户", "用户", "需求", "痛点"],
  "product-sense": ["good product", "great product", "makes a product", "product sense", "product taste", "好产品", "产品感"],
  "favorite-product": ["favou?rite (product|app)", "app you (especially )?like", "(product|app) you (really |especially )?(love|like|use)", "最喜欢的(产品|应用|app)"],
  "product-critique": ["weakness of (the|this) (app|product)", "improve (it|the product|the app)", "(fix|change) about it", "dislike", "pain point", "改进", "缺点"],
  microsoft: ["microsoft", "msft", "microsoft teams", "\\bloop\\b", "office", "outlook", "excel", "windows", "azure", "copilot", "微软"],
  motivation: ["why (do you want|are you interested|this (role|company|team))", "why microsoft", "why (pm|product management)", "motivat", "interested in", "passion", "career goal", "为什么(选择|想|要)", "动机"],
  "pm-role": ["product manag", "\\bpm\\b", "effective pm", "good pm", "产品经理"],
  career: ["career", "background", "journey", "path", "trajectory", "resume", "\\bcv\\b", "yourself", "introduc", "背景", "自我介绍", "简历"],
  internship: ["internship", "intern\\b", "previous (role|job)", "past (role|job)", "实习"],
  strength: ["strength", "good at", "best (quality|skill)", "superpower", "优点", "优势", "长处"],
  weakness: ["weakness", "get(ting)? better at", "improv(e|ing) on", "improve (on|about yourself)", "area(s)? (of|for) (improvement|growth)", "working on", "缺点", "短板", "不足"],
  technical: ["technical", "technology", "architecture", "system design", "engineering", "algorithm", "model", "machine learning", "\\bml\\b", "pipeline", "技术", "架构", "算法", "模型"],
  tools: ["programming", "language(s)?", "framework", "python", "javascript", "typescript", "sql", "react", "library", "libraries", "stack", "编程", "框架"],
  api: ["\\bapis?\\b", "endpoint", "integrat", "sdk", "接口"],
  "explain-simply": ["non-?technical", "explain .{0,30}(simply|plain|layman)", "simplif", "plain language", "layman", "five year old", "grandparent", "explain .{0,20}to (a|an|your)", "通俗", "解释给"],
  communication: ["communicat", "present(ed|ation)?", "explain", "skeptic", "sell (an|the|your) idea", "沟通", "表达", "汇报"],
  collaboration: ["collaborat", "work(ed|ing)? with", "teammates?", "engineers?", "designers?", "data scientists?", "researchers?", "partners?", "合作", "协作", "工程师", "设计师"],
  "team-roles": ["responsibilit(y|ies) (were )?divided", "divid(e|ed) (up )?(the )?work", "who (was|were) on (the|that|your) team", "split (up )?(the )?work", "who did what", "division of (labor|work)", "roles? (and|&) responsibilit", "分工"],
  "beyond-scope": ["outside (your|the|of your) (formal )?(scope|role|job)", "beyond (your|the) (scope|role|responsibilit)", "above and beyond", "went the extra mile", "not your job", "extra responsibilit", "超出.{0,4}(职责|范围)", "份外"],
  innovation: ["innovat", "creative", "unconventional", "novel", "out of the box", "non-?obvious", "different approach", "new way", "创新", "创意", "新方法"],
  risk: ["risk", "\\bbet\\b", "gamble", "uncertain approach", "calculated", "downside", "风险", "冒险"],
  process: ["process", "workflow", "automat", "streamlin", "efficien", "operational", "manual (work|steps)", "流程", "自动化", "效率"],
  ai: ["\\bai\\b", "artificial intelligence", "\\bllms?\\b", "chatgpt", "gpt", "copilot", "claude", "generative", "genai", "人工智能", "大模型"],
  "human-judgment": ["human judg", "verif(y|ied|ication)", "responsib(le|ly) use", "hallucinat", "trust", "人工判断", "核实", "验证"],
  hypothetical: ["imagine", "what would you do", "how would you (handle|respond|approach)", "suppose", "hypothetical", "if you (were|joined)", "假设", "如果你"],
  onboarding: ["join(ing|ed)? (a|an) (new|unfamiliar) team", "first (few )?(weeks|days|30|60|90)", "onboard", "ramp up", "new team", "加入新团队", "入职"],
  "eng-pushback": ["infeasible", "not feasible", "can('|no)?t be (built|done|delivered)", "can't (build|ship|deliver)", "cannot be built", "engineering says", "engineers say", "technically impossible", "不可行", "做不了"],
  executive: ["senior leader", "executive", "\\bvp\\b", "director", "your (boss|manager)", "leadership (wants|asks|requests)", "higher-?up", "领导要求", "高层"],
  "data-conflict": ["qualitative .{0,30}quantitative", "quantitative .{0,30}qualitative", "data (says|shows) .{0,20}(but|while)", "opposite direction", "contradict", "定性.{0,10}定量"],
  underperformance: ["underperform", "miss(es|ed)? (commitments|deadlines)", "slack", "not pulling", "low performer", "表现不好"],
  launch: ["launch", "go-?to-?market", "\\bgtm\\b", "adoption", "rollout", "roll out", "上线", "发布", "推广"],
  "ui-functionality": ["user[- ]interface", "\\bui\\b", "visual", "design quality", "look and feel", "functionality", "features? vs", "界面", "功能"],
  scale: ["more (customers|users)", "scale", "expand", "broader", "useful to more", "扩展", "规模化"],
  trends: ["trend", "keep up", "stay (current|up to date|informed)", "hype", "news", "follow (the )?(industry|tech)", "趋势", "关注"],
  ethics: ["ethic", "privacy", "safety", "bias", "fairness", "responsible", "伦理", "隐私", "安全"],
  inclusion: ["inclusi", "divers", "quiet(er)? (teammates|voices)", "remote teammates", "everyone heard", "包容"],
  "delay-recovery": ["delayed project", "behind schedule", "slippage", "recover", "get .{0,10}back on track", "延期", "补救"],
  "disagree-commit": ["disagree and commit", "challenged? (a|the) decision", "overruled", "went with (their|the other)", "supported the final", "被否决"],
};

const COMPILED = Object.entries(CONCEPTS).map(([concept, patterns]) => ({
  concept,
  regex: new RegExp(patterns.map((pattern) => (/[\u4e00-\u9fff]/.test(pattern) ? pattern : `(?:${pattern})`)).join("|"), "i"),
}));

export function normalize(text: string) {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

export function conceptsOf(text: string): string[] {
  const value = normalize(text);
  return COMPILED.filter(({ regex }) => regex.test(value)).map(({ concept }) => concept);
}

// Light suffix stripping keeps "prioritized"/"prioritizing" and "conflicts"/"conflict" together.
export function stem(word: string) {
  if (word.length <= 4) return word;
  return word
    .replace(/(?:ies)$/, "y")
    .replace(/(?:ing|ed|ly|es|s)$/, "")
    .replace(/(?:ation|ment)$/, "");
}

export function wordTokens(text: string): string[] {
  const value = normalize(text);
  const latin = (value.match(/[a-z0-9][a-z0-9.+#-]*[a-z0-9+#]|[a-z0-9]/g) || [])
    .filter((word) => !STOPWORDS.has(word))
    .map(stem);
  const cjk: string[] = [];
  for (const run of value.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) cjk.push(run);
    for (let index = 0; index < run.length - 1; index += 1) cjk.push(run.slice(index, index + 2));
  }
  return [...latin, ...cjk];
}

// Distinctive terms worth matching against answer bodies: named products, companies, tools, and acronyms.
export function entityTerms(text: string): string[] {
  const raw = text.match(/\b(?:[A-Z][a-zA-Z0-9.+#-]*[a-zA-Z0-9+#]|[A-Z]{2,}|[a-z]+\.(?:com|js|ai))\b/g) || [];
  const ignore = new Set(["tell", "describe", "what", "how", "why", "when", "walk", "imagine", "give", "can", "could", "would", "have", "did", "do", "choose", "explain", "share", "please", "i", "a", "the", "and", "if", "let", "so", "ok", "okay", "great", "thanks", "thank", "now", "next", "also", "one", "pick", "which", "where", "who", "is", "are", "was", "you", "your", "in", "on", "for"]);
  return [...new Set(raw.map((term) => term.toLowerCase()).filter((term) => !ignore.has(term)))];
}

export function features(text: string, conceptWeight = 2) {
  const counts = new Map<string, number>();
  for (const token of wordTokens(text)) counts.set(token, (counts.get(token) || 0) + 1);
  for (const concept of conceptsOf(text)) counts.set(`@${concept}`, (counts.get(`@${concept}`) || 0) + conceptWeight);
  return counts;
}
