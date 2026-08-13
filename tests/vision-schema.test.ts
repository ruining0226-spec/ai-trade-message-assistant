import assert from "node:assert/strict";
import test from "node:test";
import { ModelOutputError, normalizeStructuredField, parseModelOutput } from "@/lib/vision/schema";
import { VISION_SYSTEM_PROMPT } from "@/lib/vision/volcengine";

const coreCustomer = { customer: { companyName: { value: "Synthetic Industrial Ltd", source: "screenshot", evidence: "Synthetic Industrial Ltd", confidence: "high", needsReview: false } } };

test("完整合法 JSON 可以通过", () => {
  const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, confirmedFacts: ["Synthetic company name is visible"], reasonableInferences: [], unknownInformation: ["Current demand"] }));
  assert.equal(parsed.customer.companyName.value, "Synthetic Industrial Ltd");
});

test("JSON 被 json Markdown 代码块包裹时可以提取", () => {
  const parsed = parseModelOutput(`\`\`\`json\n${JSON.stringify(coreCustomer)}\n\`\`\``);
  assert.equal(parsed.customer.companyName.value, "Synthetic Industrial Ltd");
});

test("JSON 前后带少量说明文字时可以安全提取", () => {
  const parsed = parseModelOutput(`Analysis follows:\n${JSON.stringify(coreCustomer)}\nEnd of analysis.`);
  assert.equal(parsed.customer.companyName.value, "Synthetic Industrial Ltd");
});

test("v0.7 新增数组字段缺失或 null 时使用空数组", () => {
  const missing = parseModelOutput(JSON.stringify(coreCustomer));
  assert.deepEqual(missing.confirmedFacts, []);
  assert.deepEqual(missing.reasonableInferences, []);
  assert.deepEqual(missing.unknownInformation, []);
  const withNull = parseModelOutput(JSON.stringify({ ...coreCustomer, confirmedFacts: null, reasonableInferences: null, unknownInformation: null }));
  assert.deepEqual(withNull.confirmedFacts, []);
  assert.deepEqual(withNull.reasonableInferences, []);
  assert.deepEqual(withNull.unknownInformation, []);
});

test("新增数组字段的单个字符串安全归一化为单项数组", () => {
  const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, confirmedFacts: "Synthetic company name is visible", reasonableInferences: "May serve factories", unknownInformation: "Current demand" }));
  assert.deepEqual(parsed.confirmedFacts, ["Synthetic company name is visible"]);
  assert.deepEqual(parsed.reasonableInferences, ["May serve factories"]);
  assert.deepEqual(parsed.unknownInformation, ["Current demand"]);
});

test("数组中的非法对象不会被伪造成事实", () => {
  const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, confirmedFacts: [{ statement: "invented" }, "Visible fact"] }));
  assert.deepEqual(parsed.confirmedFacts, ["Visible fact"]);
});

test("customerType 大小写、中文和 v0.6 别名可以归一化", () => {
  for (const [value, expected] of [["Distributor", "distributor"], ["工程公司", "system_integrator"], ["oem_integrator", "system_integrator"]]) {
    const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, customer: { ...coreCustomer.customer, customerType: { value, source: "Inference", evidence: null, confidence: "Medium" } } }));
    assert.equal(parsed.customer.customerType.value, expected);
  }
});

test("无法识别的 customerType 安全回退为 Unknown", () => {
  const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, customer: { ...coreCustomer.customer, customerType: { value: "wholesaler_by_title_only", source: "inference" } } }));
  assert.equal(parsed.customer.customerType.value, null);
  assert.equal(parsed.customer.customerType.source, "unknown");
});

test("缺少非关键质量字段不会导致分析失败", () => {
  const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, outreach: null, inferences: null, recommendedApproach: null }));
  assert.deepEqual(parsed.inferences, []);
  assert.deepEqual(parsed.recommendedApproach, []);
  assert.equal(parsed.outreach.bodyEn, "");
});

test("模型将核心字段简化为字符串时保留为待确认推断", () => {
  const parsed = parseModelOutput(JSON.stringify({ customer: { companyName: "Synthetic Simple Company", customerType: "Distributor" } }));
  assert.equal(parsed.customer.companyName.value, "Synthetic Simple Company");
  assert.equal(parsed.customer.companyName.source, "inference");
  assert.equal(parsed.customer.companyName.needsReview, true);
  assert.equal(parsed.customer.customerType.value, "distributor");
});

test("缺少全部核心客户资料时仍然安全失败", () => {
  assert.throws(() => parseModelOutput("{}"), (error: unknown) => error instanceof ModelOutputError && error.code === "MODEL_CORE_DATA_MISSING");
});

test("旧版 v0.6 响应格式仍能读取", () => {
  const parsed = parseModelOutput(JSON.stringify({ ...coreCustomer, inferences: [{ content: "Possible project fit", basis: "Engineering business", confidence: "medium" }], recommendedApproach: ["Ask about projects"], completenessScore: 60, conflicts: [], outreach: { subjectEn: "Hello", subjectZh: "您好", bodyEn: "Body", bodyZh: "正文" } }));
  assert.equal(parsed.inferences[0]?.content, "Possible project fit");
  assert.deepEqual(parsed.confirmedFacts, []);
});

test("基础视觉响应无需复杂质量字段即可进入资料确认数据结构", () => {
  const parsed = parseModelOutput(JSON.stringify({
    customer: {
      customerName: { value: "Synthetic Person", source: "screenshot", evidence: "Synthetic Person", confidence: "high", needsReview: false },
      jobTitle: { value: null, source: "unknown", evidence: "", confidence: "low", needsReview: true },
      companyName: { value: "Synthetic Industrial Ltd", source: "screenshot", evidence: "Synthetic Industrial Ltd", confidence: "high", needsReview: false },
      countryOrRegion: { value: null, source: "unknown", evidence: "", confidence: "low", needsReview: true },
      industry: { value: "Industrial equipment", source: "screenshot", evidence: "Industrial equipment", confidence: "medium", needsReview: true },
      otherImportantInformation: [],
    },
    companyBusiness: { value: null, source: "unknown", evidence: "", confidence: "low", needsReview: true },
    conflicts: [],
  }));
  assert.equal(parsed.customer.customerName.value, "Synthetic Person");
  assert.equal(parsed.customer.jobTitle.value, null);
  assert.equal(parsed.customer.customerType.value, null);
  assert.deepEqual(parsed.confirmedFacts, []);
  assert.deepEqual(parsed.recommendedApproach, []);
  assert.equal(parsed.outreach.bodyEn, "");
});

test("视觉提示词只负责截图事实提取，不要求分类、策略或文案输出", () => {
  assert.match(VISION_SYSTEM_PROMPT, /唯一任务.*截图上直接显示了什么/);
  assert.match(VISION_SYSTEM_PROMPT, /不要输出 customerType/);
  const outputShape = VISION_SYSTEM_PROMPT.slice(VISION_SYSTEM_PROMPT.lastIndexOf("输出必须"));
  assert.doesNotMatch(outputShape, /customerType|confirmedFacts|reasonableInferences|outreach/);
});

test("推测只进入 inferences，不会填入缺失的客户事实", () => {
  const parsed = parseModelOutput(JSON.stringify({ customer: { industry: { value: "Industrial engineering", source: "screenshot", evidence: "Industrial engineering", confidence: "high" } }, inferences: [{ content: "可能涉及项目配套", basis: "截图显示机械设备业务", confidence: "medium" }] }));
  assert.equal(parsed.customer.companyName.value, null);
  assert.equal(parsed.inferences[0]?.content, "可能涉及项目配套");
});

test("截断的公司名称被标记为低置信度并需要确认", () => {
  const parsed = normalizeStructuredField({ value: "Example Industrial...", source: "screenshot", evidence: "公司名称在截图右侧被截断", confidence: "high", needsReview: false }, { detectTruncation: true });
  assert.equal(parsed.confidence, "low");
  assert.equal(parsed.needsReview, true);
});

test("非法 JSON 被判定为失败且不包含原始正文", () => {
  assert.throws(() => parseModelOutput("customer-secret not-json"), (error: unknown) => {
    assert.ok(error instanceof ModelOutputError);
    assert.equal(error.code, "INVALID_MODEL_JSON");
    assert.equal(error.diagnostic.extraction?.textLength, "customer-secret not-json".length);
    assert.equal(error.diagnostic.jsonError?.category, "NO_JSON_START");
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /customer-secret/);
    return true;
  });
});

test("截断 JSON 只记录长度、类别和起始位置", () => {
  assert.throws(() => parseModelOutput('{"customer":{"companyName":"Synthetic Secret"'), (error: unknown) => {
    assert.ok(error instanceof ModelOutputError);
    assert.equal(error.code, "INVALID_MODEL_JSON");
    assert.equal(error.diagnostic.jsonError?.category, "UNTERMINATED_JSON");
    assert.equal(error.diagnostic.jsonError?.position, 0);
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /Synthetic Secret/);
    return true;
  });
});

test("Schema 诊断只包含路径和类型，不包含客户字段值", () => {
  assert.throws(() => parseModelOutput(JSON.stringify(["Synthetic Customer Secret"])), (error: unknown) => {
    assert.ok(error instanceof ModelOutputError);
    assert.equal(error.code, "MODEL_SCHEMA_INVALID");
    const diagnostic = JSON.stringify(error.diagnostic);
    assert.match(diagnostic, /\$root|object/);
    assert.doesNotMatch(diagnostic, /Synthetic Customer Secret/);
    return true;
  });
});
