import assert from "node:assert/strict";
import test from "node:test";
import {
  appendConversationMessage,
  appendFollowUpGeneration,
  buildFollowUpGenerationRequest,
  MAX_AI_CONVERSATION_MESSAGES,
  normalizeConversationMessages,
  removeConversationMessage,
} from "@/lib/follow-up/context";
import { followUpGenerationRequestSchema, followUpGenerationResponseSchema } from "@/lib/follow-up/volcengine";
import type { ConversationMessage, FollowUpGeneration, MessageContent, Task } from "@/types";

const content: MessageContent = {
  identityAnalysis: "confirmed identity", businessConnection: "possible fit", recommendedAngle: "ask first", invitationEn: "Hello", firstMessageEn: "Thanks", invitationZh: "您好", firstMessageZh: "谢谢", personalizationBasis: "confirmed role", uncertaintyNotice: "Need to confirm air demand",
};

function makeTask(id = "task-a"): Task {
  return {
    id,
    customer: { id: `customer-${id}`, name: `Customer ${id}`, title: "Engineer", companyName: `Company ${id}`, country: "UK", industry: "Manufacturing", customerType: "终端工厂" },
    analysis: { mainBusiness: "Manufacturing", decisionInfluence: "中", potentialApplications: "Possible plant air", recommendedAngle: "Confirm actual demand", completeness: 70, uncertainties: "Air demand not confirmed", conflicts: [], evidence: [] },
    analysisSource: "volcengine", images: [],
    config: { channel: "LinkedIn", purpose: "二次跟进", customerType: "终端工厂", tone: "专业正式", length: "标准", language: "中英对照", product: "永磁变频螺杆空压机", notes: "" },
    versions: [{ id: `version-${id}`, label: "当前结果", createdAt: "2026-08-10T00:00:00.000Z", reason: "test", content }], selectedVersionId: `version-${id}`,
    createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z", status: "已回复", followUpDate: "", notes: "", followUps: [],
    conversationMessages: [], followUpGenerations: [], followUpStage: "new", lastContactAt: "",
  };
}

const message = (taskId: string, id: string, role: ConversationMessage["role"] = "customer"): ConversationMessage => ({ id, taskId, role, platform: "linkedin", content: `${taskId}-${id}`, createdAt: `2026-08-10T01:${id.padStart(2, "0")}:00.000Z` });
const requestInput = { replyGoal: "了解需求" as const, customReplyGoal: "", tone: "专业" as const, businessFacts: "" };

test("旧跟进数据只保留绑定当前 task.id 的消息", () => {
  const messages = normalizeConversationMessages([message("task-a", "01"), message("task-b", "02")], "task-a");
  assert.deepEqual(messages.map(item => item.id), ["01"]);
});

test("新增和删除消息都严格绑定当前任务", () => {
  const task = makeTask();
  const current = message(task.id, "01");
  const withMessage = appendConversationMessage(task, current);
  assert.equal(withMessage.conversationMessages.length, 1);
  assert.equal(withMessage.lastContactAt, current.createdAt);
  assert.equal(removeConversationMessage(withMessage, current).conversationMessages.length, 0);
  assert.throws(() => appendConversationMessage(task, message("task-b", "02", "salesperson")), /FOLLOW_UP_TASK_MISMATCH/);
  assert.throws(() => removeConversationMessage(withMessage, { ...current, taskId: "task-b" }), /FOLLOW_UP_TASK_MISMATCH/);
});

test("两个客户的沟通记录和AI生成记录不会混淆", () => {
  const taskA = appendConversationMessage(makeTask("task-a"), message("task-a", "01"));
  const taskB = appendConversationMessage(makeTask("task-b"), message("task-b", "02"));
  assert.deepEqual(taskA.conversationMessages.map(item => item.taskId), ["task-a"]);
  assert.deepEqual(taskB.conversationMessages.map(item => item.taskId), ["task-b"]);
  const generation: FollowUpGeneration = { id: "gen-a", taskId: "task-a", sourceMessageIds: ["01"], replyGoal: "了解需求", customReplyGoal: "", tone: "专业", businessFacts: "", englishReply: "Reply", chineseTranslation: "回复", customerIntent: "Intent", nextAction: "Ask", missingInformation: [], riskWarnings: [], safeTransitionReplyEnglish: "Could you clarify?", safeTransitionReplyChinese: "可以说明吗？", createdAt: "2026-08-10T02:00:00.000Z", updatedAt: "2026-08-10T02:00:00.000Z" };
  assert.equal(appendFollowUpGeneration(taskA, generation).followUpGenerations.length, 1);
  assert.throws(() => appendFollowUpGeneration(taskB, generation), /FOLLOW_UP_TASK_MISMATCH/);
});

test("AI 请求只包含当前任务最近消息并带上当前开发信", () => {
  const task = makeTask();
  task.conversationMessages = Array.from({ length: 25 }, (_, index) => message(task.id, String(index + 1)));
  const request = buildFollowUpGenerationRequest(task, requestInput);
  assert.equal(request.taskId, task.id);
  assert.equal(request.messages.length, MAX_AI_CONVERSATION_MESSAGES);
  assert.equal(request.messages[0]?.id, "6");
  assert.ok(request.messages.every(item => item.taskId === task.id));
  assert.match(request.currentOutreach, /Hello/);
  assert.equal(followUpGenerationRequestSchema.safeParse(request).success, true);
});

test("服务端 Schema 拒绝混入其他 task.id 的消息", () => {
  const request = buildFollowUpGenerationRequest(makeTask(), { ...requestInput, latestCustomerReply: "Latest reply" });
  request.messages = [message("task-b", "01")];
  assert.equal(followUpGenerationRequestSchema.safeParse(request).success, false);
});

test("AI 输出必须包含风险、缺失信息和安全过渡回复", () => {
  const valid = { replyEnglish: "Thanks for your message.", replyChinese: "感谢您的消息。", customerIntent: "Wants more information", nextAction: "Confirm application", missingInformation: ["Required flow"], riskWarnings: ["Do not promise delivery"], safeTransitionReplyEnglish: "Could you share the application details?", safeTransitionReplyChinese: "方便提供应用信息吗？" };
  assert.equal(followUpGenerationResponseSchema.safeParse(valid).success, true);
  assert.equal(followUpGenerationResponseSchema.safeParse({ ...valid, safeTransitionReplyEnglish: undefined }).success, false);
});
