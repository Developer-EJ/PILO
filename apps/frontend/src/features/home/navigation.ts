import { Home } from "lucide-react";

import type { FeatureNavigationItem } from "@/features/navigation-types";

export const homeNavigation: FeatureNavigationItem = {
  id: "home",
  title: "홈",
  label: "Home",
  description: "Workspace 주요 기능과 상태를 한 곳에서 확인합니다.",
  action: "홈 보기",
  href: "/home",
  icon: Home,
  items: []
};
