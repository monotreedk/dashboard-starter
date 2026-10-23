// The data this dashboard shows. This is the file to change.
//
// Each entry becomes GET /data/<name> for signed-in viewers. `load` runs on the
// server with the Monotree API key; only what it returns reaches the browser. So:
//
// - return only what the page shows: counts and rates, not lists of people
// - never pass a path or a filter from the browser through to the API. Every
//   viewer would then hold the key's full power. Add a named dataset instead
// - give the key only the scopes these loaders need. This example needs
//   read:stats and read:groups
//
// Two kinds of dataset:
//
// - shared: the same for every viewer. `load(api)` gets no viewer, and one
//   result is cached for everyone
// - per viewer: give it a `viewerKey`. `load(api, viewer)` then gets the
//   signed-in employee (sub, name, roles, groups, managed_groups, straight from
//   Sign in with Monotree), and results are cached per viewerKey. Make the key
//   cover everything `load` reads from the viewer, or one viewer sees another's
//   result
//
// `cacheSeconds` keeps a result for that long, so many viewers cost a single
// API call. The API allows 60 requests a minute per key.
//
// Endpoints and response shapes: https://docs.monotree.com/llms.txt

import type { Viewer } from "./access.ts";
import type { OpenApi } from "./monotree.ts";

export type Dataset =
  | { cacheSeconds: number; viewerKey?: undefined; load: (api: OpenApi) => Promise<unknown> }
  | { cacheSeconds: number; viewerKey: (viewer: Viewer) => string; load: (api: OpenApi, viewer: Viewer) => Promise<unknown> };

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// GET /stats/academy/courses: completion per published course, optionally
// narrowed to the members of some groups
async function courseCompletion(api: OpenApi, groupIds?: string[]) {
  const { data } = await api.get("/stats/academy/courses", groupIds ? { group_ids: groupIds.join(",") } : {});
  return data
    .map((course: any) => ({
      id: course.id,
      title: course.title,
      completed: course.completed,
      people: course.completed + course.not_completed,
      completed_pct: percent(course.completed, course.completed + course.not_completed),
    }))
    .filter((course: any) => course.people > 0);
}

// GET /stats/engagement: share of employees active per week, last 12 weeks
async function weeklyActive(api: OpenApi, groupIds?: string[]) {
  const { data } = await api.get("/stats/engagement", {
    granularity: "week",
    scope: 12,
    ...(groupIds ? { group_ids: groupIds.join(",") } : {}),
  });
  return data.map((row: any) => ({ week: `${row.year}-W${String(row.week).padStart(2, "0")}`, active_pct: percent(row.active_users, row.total_users) }));
}

export const datasets: Record<string, Dataset> = {
  // the whole company, the same for everyone. Scope: read:stats
  company: {
    cacheSeconds: 3600,
    load: async (api) => ({
      courses: await courseCompletion(api),
      weekly_active: await weeklyActive(api),
    }),
  },

  // the departments the viewer manages. Scopes: read:groups, read:stats
  team: {
    cacheSeconds: 3600,
    viewerKey: (viewer) => [...(viewer.managed_groups ?? [])].sort().join(","),
    load: async (api, viewer) => {
      // managed_groups also holds custom groups and the App Managers group, which
      // every manager is in: keep the departments only
      const managed = new Set(viewer.managed_groups ?? []);
      const departments = (await api.all("/groups", { type: "department" }))
        .filter((group: any) => managed.has(String(group.id)))
        .map((group: any) => ({ id: String(group.id), name: group.name }));

      if (departments.length === 0) return { departments: [] };

      const ids = departments.map((department) => department.id);
      return {
        departments,
        courses: await courseCompletion(api, ids),
        weekly_active: await weeklyActive(api, ids),
      };
    },
  },
};
