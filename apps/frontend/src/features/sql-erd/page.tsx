import { SqlErdPanel } from "@/features/sql-erd/components/sql-erd-panel";

export function SqlErdPage() {
  return (
    <div className="sql-erd-full-bleed -m-6 h-[calc(100vh-3.5rem)] overflow-hidden">
      <SqlErdPanel />
    </div>
  );
}
