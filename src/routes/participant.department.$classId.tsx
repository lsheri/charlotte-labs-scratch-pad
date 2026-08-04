import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/participant/department/$classId")({
  component: () => <Outlet />,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6">
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild variant="link" className="mt-2 px-0">
        <Link to="/participant/department"><ArrowLeft className="mr-1 h-4 w-4" /> All classes</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Class not found.</div>
  ),
});
