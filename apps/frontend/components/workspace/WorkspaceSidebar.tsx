import Link from "next/link";
import { CurrentWorkspaceSwitcher } from "./CurrentWorkspaceSwitcher";

export type WorkspaceSidebarItem = {
  label: string;
  href: string;
  active?: boolean;
  badge?: string;
};

type WorkspaceSidebarProps = {
  items: WorkspaceSidebarItem[];
  id?: string;
  className?: string;
  ariaLabel?: string;
  navAriaLabel?: string;
};

export function WorkspaceSidebar({
  items,
  id,
  className = "sidebar",
  ariaLabel = "PILO navigation",
  navAriaLabel = "Workspace navigation",
}: WorkspaceSidebarProps) {
  return (
    <aside id={id} className={className} aria-label={ariaLabel}>
      <div className="brand">
        <CurrentWorkspaceSwitcher />
      </div>
      <nav className="nav-list" aria-label={navAriaLabel}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.active ? "nav-item active" : "nav-item"}
            aria-current={item.active ? "page" : undefined}
          >
            <span>{item.label}</span>
            {item.badge ? <b>{item.badge}</b> : null}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
