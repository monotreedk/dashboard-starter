// The example dashboard. Each load("<name>") is a dataset from src/data.ts.
//
// Live, it comes from /data/<name> on the Worker. In a snapshot (the <html>
// element carries data-snapshot), every dataset comes from data.json next to
// this file instead.

const snapshot = document.documentElement.hasAttribute("data-snapshot");
let snapshotData;

async function load(name) {
  if (snapshot) {
    snapshotData ??= fetch("data.json").then((response) => response.json());
    return (await snapshotData).datasets[name];
  }

  const response = await fetch(`/data/${encodeURIComponent(name)}`);
  if (response.status === 401) {
    // the session ran out: sign in again and come back here
    location.href = `/auth/login?return=${encodeURIComponent(location.pathname + location.search)}`;
    return new Promise(() => {});
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? `HTTP ${response.status}`);
  return response.json();
}

const number = new Intl.NumberFormat();
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function element(tag, attributes = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, attributes);
  if (text !== undefined) node.textContent = text;
  return node;
}

function failed(container, error) {
  container.replaceChildren(element("p", { className: "error" }, `Could not load: ${error.message}`));
}

async function viewer() {
  if (snapshot) {
    const { generated_at } = await (snapshotData ??= fetch("data.json").then((response) => response.json()));
    document.getElementById("viewer").textContent = `Snapshot from ${new Date(generated_at).toLocaleString()}`;
    return;
  }
  const response = await fetch("/auth/me");
  if (response.ok) {
    const me = await response.json();
    const node = document.getElementById("viewer");
    node.replaceChildren(`${me.name ?? "Signed in"} · `, element("a", { href: "/auth/logout" }, "Sign out"));
  }
}

async function tiles() {
  const container = document.getElementById("tiles");
  try {
    const users = await load("users");
    const tiles = [
      ["Employees", users.total],
      ["Registered", users.registered],
      ["Active last 7 days", users.active_7d],
      ["Active last 30 days", users.active_30d],
    ];
    container.replaceChildren(...tiles.map(([label, value]) => {
      const tile = element("div", { className: "tile" });
      tile.append(element("div", { className: "value" }, number.format(value)), element("div", { className: "label" }, label));
      return tile;
    }));
    document.getElementById("subtitle").textContent = `${number.format(users.active_7d)} of ${number.format(users.registered)} registered employees were active this week`;
  } catch (error) {
    failed(container, error);
  }
}

async function engagement() {
  const canvas = document.getElementById("engagement");
  try {
    const rows = await load("engagement");
    new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map((row) => row.label),
        datasets: [{
          label: "Active employees",
          data: rows.map((row) => row.active_users),
          borderColor: css("--accent"),
          backgroundColor: css("--accent-soft"),
          fill: true,
          tension: 0.3,
        }],
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  } catch (error) {
    failed(canvas.parentElement, error);
  }
}

async function adoption() {
  const canvas = document.getElementById("adoption");
  try {
    const { average, departments } = await load("adoption");
    document.getElementById("adoption-average").textContent = `Average ${average}% active`;

    const top = departments.slice(0, 15);
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: top.map((department) => department.name),
        datasets: [{ label: "% active", data: top.map((department) => department.average), backgroundColor: css("--accent") }],
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100 } },
      },
    });
  } catch (error) {
    failed(canvas.parentElement, error);
  }
}

async function content() {
  const body = document.querySelector("#content tbody");
  try {
    const data = await load("content");
    const labels = {
      posts: "Posts",
      comments: "Comments",
      reactions: "Reactions",
      chat_messages: "Chat messages",
      todo_tasks_completed: "Tasks completed",
    };
    body.replaceChildren(...Object.entries(labels).filter(([key]) => data[key]).map(([key, label]) => {
      const row = element("tr");
      row.append(
        element("td", {}, label),
        element("td", {}, number.format(data[key].this_week)),
        element("td", {}, number.format(data[key].last_week)),
      );
      return row;
    }));
  } catch (error) {
    failed(body.closest(".card"), error);
  }
}

viewer();
tiles();
engagement();
adoption();
content();
