import { createFileRoute } from "@tanstack/react-router";
import { ThreadsInbox } from "./participant.threads.index";

export const Route = createFileRoute("/participant/department/$classId/threads")({
  component: ScopedThreads,
});

function ScopedThreads() {
  const { classId } = Route.useParams();
  return <ThreadsInbox classId={classId} />;
}
