// Who may open the dashboard, from the ACCESS setting in wrangler.jsonc.
//
// ACCESS is a comma-separated list. A viewer gets in when any entry matches:
//
//   anyone       every employee who can sign in to Monotree
//   admins       CMS admins
//   editors      CMS editors
//   managers     anyone who manages at least one group
//   group:12     members of group 12 (a department, profession or custom group)
//   manager:12   managers of group 12
//
// The rule is checked once, at sign-in, against the claims Monotree puts in the
// id_token. A change in Monotree (a new manager, someone leaving a group) takes
// effect at the viewer's next sign-in, at most SESSION_HOURS later.

export type Viewer = {
  sub: string;
  roles?: string[];
  groups?: string[];
  managed_groups?: string[];
};

export type Rule = (viewer: Viewer) => boolean;

const has = (list: string[] | undefined, value: string) => list?.includes(value) ?? false;

export function parseAccess(spec: string): Rule[] {
  const entries = spec.split(",").map((entry) => entry.trim()).filter(Boolean);

  // fail closed: a missing or misspelt setting must never open the dashboard
  if (entries.length === 0) {
    throw new Error("ACCESS is empty. Set it in wrangler.jsonc, e.g. \"admins\" or \"group:12\".");
  }

  return entries.map((entry): Rule => {
    if (entry === "anyone") return () => true;
    if (entry === "admins") return (viewer) => has(viewer.roles, "admin");
    if (entry === "editors") return (viewer) => has(viewer.roles, "editor");
    if (entry === "managers") return (viewer) => (viewer.managed_groups?.length ?? 0) > 0;

    const match = entry.match(/^(group|manager):(\d+)$/);
    if (match) {
      const [, kind, id] = match as [string, string, string];
      return kind === "group"
        ? (viewer) => has(viewer.groups, id)
        : (viewer) => has(viewer.managed_groups, id);
    }

    throw new Error(`Unknown ACCESS entry "${entry}". Use anyone, admins, editors, managers, group:<id> or manager:<id>.`);
  });
}

export function allows(rules: Rule[], viewer: Viewer): boolean {
  return rules.some((rule) => rule(viewer));
}
