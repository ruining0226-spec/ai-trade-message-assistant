import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { FollowUpGenerationError, generateFollowUpWithVolcengine } from "@/lib/follow-up/volcengine";
import type { FollowUpGenerationRequest } from "@/types";

const request: FollowUpGenerationRequest = {
  taskId: "task-a",
  customer: { id: "customer-a", name: "Alex", title: "Engineer", companyName: "Example Ltd", country: "UK", industry: "Manufacturing", customerType: "终端工厂" },
  analysis: { mainBusiness: "Manufacturing", decisionInfluence: "中", potentialApplications: "Possible plant air", recommendedAngle: "Confirm demand", uncertainties: "Demand not confirmed", conflicts: [] },
  currentOutreach: "Hello Alex",
  followUpStage: "replied",
  replyGoal: "了解需求",
  customReplyGoal: "",
  tone: "专业",
  businessFacts: "",
  messages: [{ id: "message-a", taskId: "task-a", role: "customer", platform: "linkedin", content: "Please share more details.", createdAt: "2026-08-10T00:00:00.000Z" }],
  latestCustomerReply: "Please share more details.",
};

test("AI 返回非结构化结果时安全报错", async () => {
  const previousKey = process.env.ARK_API_KEY;
  const previousModel = process.env.ARK_MODEL_ID;
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_MODEL_ID = "test-model";
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ replyEnglish: "Incomplete" }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  try {
    await assert.rejects(generateFollowUpWithVolcengine(request), (error: unknown) => error instanceof FollowUpGenerationError && error.code === "MODEL_OUTPUT_INVALID");
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ARK_MODEL_ID; else process.env.ARK_MODEL_ID = previousModel;
  }
});
