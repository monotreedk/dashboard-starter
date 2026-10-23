// The data this dashboard shows. This is the file to change.
//
// Each entry becomes GET /data/<name> for signed-in viewers, and a key in
// data.json for a snapshot. `load` runs on the server with the Monotree API key;
// only what it returns reaches the browser. So:
//
// - return only what the page shows: counts and aggregates, not lists of people
// - never pass a path or a filter from the browser through to the API. Every
//   viewer would then hold the key's full power. Add a named dataset instead
// - give the key only the scopes these loaders need (read:stats for this example)
//
// `cacheSeconds` keeps a result for that long, so many viewers cost a single
// API call. The API allows 60 requests a minute per key.
//
// Endpoints and response shapes: https://docs.monotree.com/llms.txt

import type { OpenApi } from "./monotree.ts";

export type Dataset = {
  cacheSeconds: number;
  load: (api: OpenApi) => Promise<unknown>;
};

export const datasets: Record<string, Dataset> = {
  // GET /stats/users, cached by Monotree for an hour
  users: {
    cacheSeconds: 3600,
    load: async (api) => (await api.get("/stats/users")).data,
  },

  // GET /stats/engagement: one row per week, the last 12 weeks
  engagement: {
    cacheSeconds: 3600,
    load: async (api) => {
      const { data } = await api.get("/stats/engagement", { granularity: "week", scope: 12 });
      return data.map((row: any) => ({
        label: `${row.year} w${row.week}`,
        active_users: row.active_users,
        total_users: row.total_users,
      }));
    },
  },

  // GET /stats/adoption: share of active employees per department
  adoption: {
    cacheSeconds: 3600,
    load: async (api) => {
      const { data } = await api.get("/stats/adoption");
      return {
        average: data.adoption_rate.average,
        departments: data.adoption_rate.departments
          .map((department: any) => ({ name: department.name, average: department.average, total: department.total_employees }))
          .sort((a: any, b: any) => b.average - a.average),
      };
    },
  },

  // GET /stats/content: this week against last week
  content: {
    cacheSeconds: 3600,
    load: async (api) => (await api.get("/stats/content")).data,
  },
};
