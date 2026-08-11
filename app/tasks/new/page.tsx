import { TaskWizard } from "@/components/task/task-wizard";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ id?: string; followUp?: string }> }) {
  const { id, followUp } = await searchParams;
  return <TaskWizard taskId={id} initialFollowUp={followUp === "1"} />;
}
