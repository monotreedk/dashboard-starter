// The example dashboard: the departments a manager runs, against the whole
// company. Each load("<name>") is a dataset from src/data.ts.
//
// Live, datasets come from /data/<name> on the Worker and /auth/me says who is
// looking. In a snapshot (the <html> element carries data-snapshot) there is no
// viewer: the shared datasets come from data.json next to this file, and the
// per-viewer ones are missing.

const snapshot = document.documentElement.hasAttribute("data-snapshot");
let snapshotData;

const readSnapshot = () => (snapshotData ??= fetch("data.json").then((response) => response.json()));

async function load(name) {
  if (snapshot) return (await readSnapshot()).datasets[name];

  const response = await fetch(`/data/${encodeURIComponent(name)}`);
  if (response.status === 401) {
    // the session ran out: sign in again and come back here
    location.href = `/auth/login?return=${encodeURIComponent(location.pathname + location.search)}`;
    return new Promise(() => {});
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? `HTTP ${response.status}`);
  return response.json();
}

async function me() {
  if (snapshot) return null;
  const response = await fetch("/auth/me");
  return response.ok ? response.json() : null;
}

// helpers

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const byId = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// completion over a set of courses, weighted by how many people each has
function completion(courses) {
  const people = courses.reduce((sum, course) => sum + course.people, 0);
  const done = courses.reduce((sum, course) => sum + course.completed, 0);
  return people ? Math.round((done / people) * 100) : null;
}

const lastWeek = (rows) => rows?.at(-1)?.active_pct ?? null;

function delta(team, company) {
  const difference = team - company;
  const kind = difference > 0 ? "ahead" : difference < 0 ? "behind" : "level";
  const text = difference === 0 ? "level" : `${difference > 0 ? "+" : "−"}${Math.abs(difference)} pts`;
  return el("span", `delta ${kind}`, text);
}

// sections

function header(viewer, team, generatedAt) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = viewer?.name?.split(" ")[0];

  byId("greeting").textContent = first ? `${hello}, ${first}` : "Team pulse";

  if (team?.departments?.length) {
    byId("eyebrow").textContent = team.departments.map((department) => department.name).join(" · ");
    byId("lede").textContent = "How the departments you manage are doing, next to the whole company.";
  } else if (snapshot) {
    byId("eyebrow").textContent = "Whole company";
    byId("lede").textContent = `A snapshot from ${new Date(generatedAt).toLocaleString()}.`;
  } else {
    byId("eyebrow").textContent = "Whole company";
    byId("lede").textContent = "You don't manage a department, so this shows the whole company.";
  }

  if (viewer) {
    const initials = (viewer.name ?? "?").split(" ").map((part) => part[0]).slice(0, 2).join("");
    const signOut = el("a", "", "Sign out");
    signOut.href = "/auth/logout";
    byId("viewer").replaceChildren(el("span", "avatar", initials), signOut);
  }
}

function versus(company, team) {
  const compare = Boolean(team?.departments?.length);
  // compare on the courses the team takes, so both figures cover the same courses
  const teamIds = new Set(team?.courses?.map((course) => course.id));
  const companyCourses = compare ? company.courses.filter((course) => teamIds.has(course.id)) : company.courses;

  const duels = [
    { label: "Course completion", team: compare ? completion(team.courses) : null, company: completion(companyCourses), unit: "%" },
    { label: "Active last week", team: compare ? lastWeek(team.weekly_active) : null, company: lastWeek(company.weekly_active), unit: "%" },
  ];

  byId("versus").replaceChildren(...duels.map((duel) => {
    const card = el("div", "card duel");
    const numbers = el("div", "numbers");

    if (compare && duel.team !== null) {
      numbers.append(el("span", "big", `${duel.team}${duel.unit}`), el("span", "against", `company ${duel.company ?? "–"}${duel.unit}`));
      if (duel.company !== null) numbers.append(delta(duel.team, duel.company));
    } else {
      numbers.append(el("span", "big", duel.company === null ? "–" : `${duel.company}${duel.unit}`));
    }

    card.append(el("div", "label", duel.label), numbers);
    return card;
  }));
}

function courses(company, team) {
  const compare = Boolean(team?.departments?.length);
  const companyById = new Map(company.courses.map((course) => [course.id, course]));
  const legend = byId("course-legend");

  let rows;
  if (compare) {
    rows = team.courses
      .map((course) => ({ title: course.title, team: course.completed_pct, company: companyById.get(course.id)?.completed_pct ?? null }))
      .map((row) => ({ ...row, gap: row.team - (row.company ?? row.team) }))
      // the biggest differences first, either way; on a tie, where the team is behind
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.gap - b.gap);
    byId("course-hint").textContent = "Completion per course. The biggest differences from the company come first.";
    legend.replaceChildren(legendItem("team", "Your departments"), legendItem("company", "Company"));
  } else {
    rows = company.courses
      .map((course) => ({ title: course.title, team: null, company: course.completed_pct }))
      .sort((a, b) => a.company - b.company);
    byId("course-hint").textContent = "Completion per course. The least completed come first.";
    // nothing to compare against, so draw the company in the strong colour
    legend.replaceChildren(legendItem("team", "Company"));
  }

  byId("courses").replaceChildren(...rows.slice(0, 12).map((row) => {
    const item = el("li", "dumbbell");
    const track = el("div", "track");

    if (row.team !== null && row.company !== null && row.team !== row.company) {
      const span = el("div", `span ${row.team > row.company ? "ahead" : "behind"}`);
      span.style.left = `${Math.min(row.team, row.company)}%`;
      span.style.width = `${Math.abs(row.team - row.company)}%`;
      track.append(span);
    }
    if (row.company !== null) track.append(dotAt(compare ? "company" : "team", row.company));
    if (row.team !== null) track.append(dotAt("team", row.team));

    const value = row.team !== null ? `${row.team}% · company ${row.company ?? "–"}%` : `${row.company}%`;
    item.append(el("span", "title", row.title), el("span", "value", value), track);
    item.title = row.title;
    return item;
  }));
}

function legendItem(kind, text) {
  const item = el("span");
  item.append(el("span", `dot ${kind}`), text);
  return item;
}

function dotAt(kind, pct) {
  const dot = el("span", `dot ${kind}`);
  dot.style.left = `${pct}%`;
  return dot;
}

function weekly(company, team) {
  const compare = Boolean(team?.departments?.length);
  const datasets = [];

  if (compare) {
    datasets.push({
      label: "Your departments",
      data: team.weekly_active.map((row) => row.active_pct),
      borderColor: css("--team"),
      backgroundColor: css("--team-soft"),
      fill: true,
      tension: 0.35,
      pointRadius: 0,
    });
  }
  datasets.push({
    label: "Company",
    data: company.weekly_active.map((row) => row.active_pct),
    borderColor: css("--company"),
    borderDash: compare ? [5, 4] : [],
    tension: 0.35,
    pointRadius: 0,
  });

  new Chart(byId("weekly"), {
    type: "line",
    data: { labels: company.weekly_active.map((row) => row.week), datasets },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: compare, labels: { color: css("--muted"), boxWidth: 12 } } },
      scales: {
        y: { min: 0, max: 100, ticks: { color: css("--muted"), callback: (value) => `${value}%` }, grid: { color: css("--line") } },
        x: { ticks: { color: css("--muted"), maxRotation: 0, autoSkip: true }, grid: { display: false } },
      },
    },
  });
}

function identity(viewer, team) {
  if (!viewer) return;

  const names = new Map(team?.departments?.map((department) => [department.id, department.name]));
  const chips = (values, label = (value) => value) =>
    values?.length ? values.map((value) => el("span", "chip", label(value))) : [el("span", "chip none", "none")];

  const facts = [
    ["Name", [el("span", "", viewer.name ?? "–")]],
    ["Monotree user id", chips([viewer.sub])],
    ["CMS roles", chips(viewer.roles)],
    ["Manages groups", chips(viewer.managed_groups, (id) => (names.has(id) ? `${id} · ${names.get(id)}` : id))],
    ["Member of", viewer.groups ? [el("span", "", `${viewer.groups.length} groups`)] : [el("span", "chip none", "not kept: too many groups")]],
  ];

  byId("facts").replaceChildren(...facts.flatMap(([term, values]) => {
    const dd = el("dd");
    dd.append(...values);
    return [el("dt", "", term), dd];
  }));
  byId("claims").textContent = JSON.stringify(viewer, null, 2);
  byId("identity").hidden = false;
}

function failed(error) {
  byId("greeting").textContent = "Something went wrong";
  byId("lede").replaceChildren(el("span", "error", `Could not load the dashboard: ${error.message}`));
}

async function main() {
  try {
    const [viewer, company, team] = await Promise.all([me(), load("company"), snapshot ? null : load("team")]);
    const generatedAt = snapshot ? (await readSnapshot()).generated_at : null;

    header(viewer, team, generatedAt);
    versus(company, team);
    courses(company, team);
    weekly(company, team);
    identity(viewer, team);
  } catch (error) {
    failed(error);
  }
}

main();
