import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const navigationFiles = await Promise.all(
  [
    "../src/features/calendar/navigation.ts",
    "../src/features/github-integration/navigation.ts",
    "../src/features/board/navigation.ts",
    "../src/features/pr-review/navigation.ts",
    "../src/features/meeting/navigation.ts",
    "../src/features/canvas/navigation.ts"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
);
const githubApiClient = await readFile(
  new URL("../src/features/github-integration/api/client.ts", import.meta.url),
  "utf8"
);
const calendarTypes = await readFile(
  new URL("../src/features/calendar/types.ts", import.meta.url),
  "utf8"
);
const calendarApiClient = await readFile(
  new URL("../src/features/calendar/api/client.ts", import.meta.url),
  "utf8"
);
const calendarHook = await readFile(
  new URL(
    "../src/features/calendar/hooks/use-calendar-month-events.ts",
    import.meta.url
  ),
  "utf8"
);
const calendarPanel = await readFile(
  new URL("../src/features/calendar/components/calendar-panel.tsx", import.meta.url),
  "utf8"
);
const routePages = await Promise.all(
  [
    "../src/app/calendar/page.tsx",
    "../src/app/github/page.tsx",
    "../src/app/board/page.tsx",
    "../src/app/pr-review/page.tsx",
    "../src/app/meeting/page.tsx",
    "../src/app/canvas/page.tsx"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
);
const featurePages = await Promise.all(
  [
    "../src/features/calendar/page.tsx",
    "../src/features/github-integration/page.tsx",
    "../src/features/board/page.tsx",
    "../src/features/pr-review/page.tsx",
    "../src/features/meeting/page.tsx",
    "../src/features/canvas/page.tsx"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
);
const navigation = navigationFiles.join("\n");
const routes = routePages.join("\n");
const pages = featurePages.join("\n");

assert.match(navigation, /Calendar/);
assert.match(navigation, /GitHub sync/);
assert.match(navigation, /Board/);
assert.match(navigation, /PR review/);
assert.match(navigation, /Voice meeting/);
assert.match(navigation, /Canvas/);
assert.match(githubApiClient, /\/api\/v1/);
assert.match(githubApiClient, /NEXT_PUBLIC_PILO_APP_SERVER_URL/);
assert.match(calendarTypes, /export type CalendarEvent/);
assert.match(calendarTypes, /export type CreateCalendarEventInput/);
assert.match(calendarTypes, /export type UpdateCalendarEventInput/);
assert.match(calendarApiClient, /createCalendarApiClient/);
assert.match(calendarApiClient, /listEvents/);
assert.match(calendarApiClient, /getEvent/);
assert.match(calendarApiClient, /createEvent/);
assert.match(calendarApiClient, /updateEvent/);
assert.match(calendarApiClient, /deleteEvent/);
assert.match(calendarApiClient, /Authorization/);
assert.match(calendarApiClient, /success === true/);
assert.match(calendarHook, /useCalendarMonthEvents/);
assert.match(calendarHook, /getCalendarMonthRange/);
assert.match(calendarHook, /getCalendarMonthGridRange/);
assert.match(calendarHook, /calendarGridWeekCount = 6/);
assert.match(calendarHook, /calendarWeekdayCount = 7/);
assert.match(calendarHook, /-monthStartDate\.getDay\(\)/);
assert.match(calendarPanel, /useCalendarMonthEvents/);
assert.match(calendarPanel, /일정을 보려면 로그인이 필요합니다/);
assert.doesNotMatch(calendarPanel, /pilo_access_token 대기 중/);
assert.doesNotMatch(calendarPanel, /API client 준비 완료/);
assert.doesNotMatch(calendarPanel, /from "@\/components\/ui\/input"/);
assert.match(routes, /as default/);
assert.doesNotMatch(routes, /MainShell/);
assert.match(pages, /MainShell/);
assert.match(pages, /Panel/);
