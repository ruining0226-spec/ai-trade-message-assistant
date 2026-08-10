import { TaskWizard } from "@/components/task/task-wizard";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <TaskWizard taskId={id} />;
}
