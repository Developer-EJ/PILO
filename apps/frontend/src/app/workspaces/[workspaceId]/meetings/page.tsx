import { MeetingPage } from "@/features/meeting/page";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ workspaceId: "PILO" }];
}

export default MeetingPage;
