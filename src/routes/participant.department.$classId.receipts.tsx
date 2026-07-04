import { createFileRoute } from "@tanstack/react-router";
import { ReceiptsList } from "./participant.receipts.index";

export const Route = createFileRoute("/participant/department/$classId/receipts")({
  component: ScopedReceipts,
});

function ScopedReceipts() {
  const { classId } = Route.useParams();
  return <ReceiptsList classId={classId} />;
}
