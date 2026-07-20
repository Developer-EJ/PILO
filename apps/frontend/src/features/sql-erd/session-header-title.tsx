"use client";

import { useSyncExternalStore } from "react";

import {
  getSqlErdSessionHeaderTitleSnapshot,
  subscribeSqlErdSessionHeaderTitle
} from "@/features/sql-erd/session-header-title-store";

export function SqlErdSessionHeaderTitle({ fallback }: { fallback: string }) {
  const snapshot = useSyncExternalStore(
    subscribeSqlErdSessionHeaderTitle,
    getSqlErdSessionHeaderTitleSnapshot,
    () => null
  );

  return <span className="truncate">{snapshot?.title ?? fallback}</span>;
}
