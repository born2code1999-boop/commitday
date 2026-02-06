// Register Service Worker
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try { await navigator.serviceWorker.register("./sw.js"); } catch { }
    });
}

const LS_GOALS = "gh_goals_v1";
const LS_CHECKINS = "gh_checkins_v1";
const $ = (id) => document.getElementById(id);

function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function dayKey(d) {
    const x = startOfDay(d);
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function formatRu(d) {
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

const state = {
    selectedDay: startOfDay(new Date()),
    rangeStart: startOfDay(new Date(2026, 1, 1)), // 1 Feb 2026
    rangeEnd: startOfDay(new Date(2026, 3, 7))  // 7 Apr 2026 (оставляем)
};


function loadGoals() {
    try { return JSON.parse(localStorage.getItem(LS_GOALS) || "[]"); }
    catch { return []; }
}
function saveGoals(goals) {
    localStorage.setItem(LS_GOALS, JSON.stringify(goals));
}
function loadCheckins() {
    try { return JSON.parse(localStorage.getItem(LS_CHECKINS) || "{}"); }
    catch { return {}; }
}
function saveCheckins(checkins) {
    localStorage.setItem(LS_CHECKINS, JSON.stringify(checkins));
}
function ensureDay(checkins, dKey) {
    if (!checkins[dKey]) checkins[dKey] = {};
    return checkins[dKey];
}

function getLevel(intensity) {
    if (intensity <= 0) return 0;
    if (intensity <= 0.25) return 1;
    if (intensity <= 0.50) return 2;
    if (intensity <= 0.75) return 3;
    return 4;
}
function intensityForDay(d, goals, checkins) {
    if (goals.length === 0) return 0;
    const dk = dayKey(d);
    const day = checkins[dk] || {};
    let done = 0;
    for (const g of goals) if (day[g.id] === true) done++;
    return done / goals.length;
}

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function todayAnchor() {
    const today = startOfDay(new Date());
    // если вдруг диапазон заканчивается раньше сегодняшнего
    return (today > state.rangeEnd) ? state.rangeEnd : today;
}


// ---------- UI ----------
function render() {
    const goals = loadGoals();
    const checkins = loadCheckins();
    const anchor = todayAnchor();
    if (state.selectedDay > anchor) state.selectedDay = anchor;
    if (state.selectedDay < state.rangeStart) state.selectedDay = state.rangeStart;


    $("selectedDateLabel").textContent = formatRu(state.selectedDay);

    renderGoals(goals);
    renderCheckins(goals, checkins);
    renderMonths(goals, checkins);
    renderStats(goals, checkins);
}

function renderGoals(goals) {
    const root = $("goalsList");
    root.innerHTML = "";

    if (goals.length === 0) {
        root.innerHTML = `<p class="muted">Пока нет goals. Добавь первую цель выше.</p>`;
        return;
    }

    for (const g of goals) {
        const el = document.createElement("div");
        el.className = "goal";
        el.innerHTML = `
        <div class="goal-left">
          <span class="badge">goal</span>
          <div class="goal-title" title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</div>
        </div>
        <div class="goal-actions">
          <button class="btn" data-action="rename" data-id="${g.id}">Переименовать</button>
          <button class="btn danger" data-action="delete" data-id="${g.id}">Удалить</button>
        </div>
      `;
        root.appendChild(el);
    }

    root.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            if (action === "delete") deleteGoal(id);
            if (action === "rename") renameGoal(id);
        });
    });
}

function renderCheckins(goals, checkins) {
    const root = $("checkinsList");
    root.innerHTML = "";

    if (goals.length === 0) {
        root.innerHTML = `<p class="muted">Добавь goal, чтобы отмечать выполнение.</p>`;
        return;
    }

    const dk = dayKey(state.selectedDay);
    const day = ensureDay(checkins, dk);

    const isFutureDay = state.selectedDay > todayAnchor();
    if (isFutureDay) {
        root.insertAdjacentHTML("afterbegin",
            `<p class="muted small">Будущие дни нельзя отмечать.</p>`
        );
    }


    for (const g of goals) {
        const isDone = day[g.id] === true;
        const el = document.createElement("div");
        el.className = "checkin";
        el.innerHTML = `
        <div class="toggle">
          <div class="switch ${isDone ? "on" : ""}" role="switch" aria-checked="${isDone}" tabindex="0" data-goal="${g.id}"></div>
          <div title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</div>
        </div>
        <span class="muted">${isDone ? "выполнено" : "нет"}</span>
      `;
        root.appendChild(el);
    }

    root.querySelectorAll(".switch").forEach(sw => {
        const goalId = sw.dataset.goal;

        const toggle = () => {
            if (state.selectedDay > todayAnchor()) return; // <-- запрет будущих дней

            const dk2 = dayKey(state.selectedDay);
            const checkins2 = loadCheckins();
            const day2 = ensureDay(checkins2, dk2);
            day2[goalId] = !(day2[goalId] === true);
            saveCheckins(checkins2);
            render();
        };

        sw.addEventListener("click", toggle);
        sw.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
    });

    saveCheckins(checkins);
}

// ---------- Months calendar ----------
function renderMonths(goals, checkins) {
    const root = $("months");
    root.innerHTML = "";

    const start = startOfDay(state.rangeStart);
    const end = startOfDay(state.rangeEnd);

    if (state.selectedDay < start) state.selectedDay = start;
    if (state.selectedDay > end) state.selectedDay = end;

    const year = start.getFullYear();

    const febStart = start;                          // 7 Feb
    const febEnd = new Date(year, 2, 0);             // last day of Feb (month 2 day 0)
    const marStart = new Date(year, 2, 1);           // 1 Mar
    const marEnd = end;                              // 7 Apr

    root.appendChild(renderMonthBlock("Февраль", febStart, febEnd, start, end, goals, checkins));
    root.appendChild(renderMonthBlock("Март", marStart, marEnd, start, end, goals, checkins, {
        subtitle: "включая 1–7 апреля",
        otherMonthDays: true
    }));
}

function renderMonthBlock(title, monthRangeStart, monthRangeEnd, globalStart, globalEnd, goals, checkins, opts = {}) {
    const dowMon0 = (d) => (d.getDay() + 6) % 7; // Mon=0 .. Sun=6

    const monthEl = document.createElement("div");
    monthEl.className = "month";

    const head = document.createElement("div");
    head.className = "month-title";

    const h = document.createElement("h3");
    h.textContent = title;

    const sub = document.createElement("div");
    sub.className = "month-sub";
    sub.textContent = opts.subtitle || "";

    head.appendChild(h);
    head.appendChild(sub);
    monthEl.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "month-grid";

    // weekday headers
    const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    for (const w of weekdays) {
        const wd = document.createElement("div");
        wd.className = "weekday";
        wd.textContent = w;
        grid.appendChild(wd);
    }

    const start = startOfDay(monthRangeStart);
    const end = startOfDay(monthRangeEnd);

    // padding
    const pad = dowMon0(start);
    for (let i = 0; i < pad; i++) {
        const p = document.createElement("div");
        p.className = "daycell pad";
        grid.appendChild(p);
    }

    // days
    const cur = new Date(start);
    while (cur <= end) {
        const dateForCell = startOfDay(new Date(cur));
        const isFuture = dateForCell > todayAnchor();
        const inGlobal = (cur >= globalStart && cur <= globalEnd);
        const intensity = inGlobal ? intensityForDay(cur, goals, checkins) : 0;
        const lvl = getLevel(intensity);

        const cell = document.createElement("div");
        cell.className = `daycell l${lvl}`;

        // april in "March block" (other month)
        if (opts.otherMonthDays) {
            const isApril = cur.getMonth() === 3;
            if (isApril) cell.classList.add("other");
        }

        if (dayKey(cur) === dayKey(state.selectedDay)) cell.classList.add("selected");

        const num = document.createElement("div");
        num.className = "daynum";
        num.textContent = String(cur.getDate());
        cell.appendChild(num);

        if (inGlobal) {
            cell.title = `${formatRu(cur)} • ${(intensity * 100).toFixed(0)}%`;

            const dateForCell = startOfDay(new Date(cur));
            const isFuture = dateForCell > todayAnchor();

            if (inGlobal && !isFuture) {
                cell.title = `${formatRu(dateForCell)} • ${(intensity * 100).toFixed(0)}%`;
                cell.addEventListener("click", () => {
                    state.selectedDay = dateForCell;
                    render();
                });
            } else if (isFuture) {
                cell.classList.add("disabled");
                cell.title = "Будущий день";
            } else {
                cell.classList.add("pad");
                cell.style.opacity = "0.25";
                cell.title = "Вне диапазона";
            }


        } else {
            // вне диапазона (если вдруг появится)
            cell.classList.add("pad");
            cell.style.opacity = "0.25";
            cell.title = "Вне диапазона";
        }

        grid.appendChild(cell);

        cur.setDate(cur.getDate() + 1);
        cur.setHours(0, 0, 0, 0);
    }

    // trailing padding to full week
    const totalCells = grid.children.length - 7; // minus weekday headers
    const rem = totalCells % 7;
    if (rem !== 0) {
        for (let i = 0; i < (7 - rem); i++) {
            const p = document.createElement("div");
            p.className = "daycell pad";
            grid.appendChild(p);
        }
    }

    monthEl.appendChild(grid);
    return monthEl;
}

// ---------- Stats ----------
function renderStats(goals, checkins) {
    $("statGoals").textContent = String(goals.length);

    const anchor = todayAnchor(); // <-- всегда сегодня (или конец диапазона)

    // Стрик: подряд дней 100% от today назад
    let streak = 0;
    for (let i = 0; i < 365; i++) {
        const d = new Date(anchor);
        d.setDate(anchor.getDate() - i);

        const intensity = intensityForDay(d, goals, checkins);
        if (intensity === 1) streak++;
        else break;
    }
    $("statStreak").textContent = String(streak);

    // Средний % за весь период ДО today (с rangeStart по today), но считаем только дни где были отметки
    let sum = 0;
    let counted = 0;

    const cur = new Date(state.rangeStart);
    while (cur <= anchor) {
        const intensity = intensityForDay(cur, goals, checkins);
        if (intensity > 0) {
            sum += intensity * 100;
            counted++;
        }
        cur.setDate(cur.getDate() + 1);
        cur.setHours(0, 0, 0, 0);
    }

    const avg = counted === 0 ? 0 : Math.round(sum / counted);
    $("statDone7").textContent = `${avg}%`;
}




// ---------- Actions ----------
function addGoal(title) {
    const t = title.trim();
    if (!t) return;
    const goals = loadGoals();
    goals.push({ id: uid(), title: t, createdAt: Date.now() });
    saveGoals(goals);
    $("goalInput").value = "";
    render();
}
function deleteGoal(goalId) {
    saveGoals(loadGoals().filter(g => g.id !== goalId));

    const checkins = loadCheckins();
    for (const dk of Object.keys(checkins)) {
        if (checkins[dk] && checkins[dk][goalId] !== undefined) delete checkins[dk][goalId];
    }
    saveCheckins(checkins);
    render();
}
function renameGoal(goalId) {
    const goals = loadGoals();
    const g = goals.find(x => x.id === goalId);
    if (!g) return;
    const next = prompt("Новое название цели:", g.title);
    if (next === null) return;
    const t = next.trim();
    if (!t) return;
    g.title = t;
    saveGoals(goals);
    render();
}
function exportData() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), goals: loadGoals(), checkins: loadCheckins() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `goals-heatmap-backup-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
async function importData(file) {
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); } catch { alert("Невалидный JSON"); return; }
    if (!payload || !payload.goals || !payload.checkins) { alert("Файл не похож на бэкап этого приложения."); return; }
    localStorage.setItem(LS_GOALS, JSON.stringify(payload.goals));
    localStorage.setItem(LS_CHECKINS, JSON.stringify(payload.checkins));
    render();
}

// ---------- Wire up ----------
window.addEventListener("DOMContentLoaded", () => {
    $("btnAddGoal").addEventListener("click", () => addGoal($("goalInput").value));
    $("goalInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addGoal($("goalInput").value); });

    $("btnToday").addEventListener("click", () => {
        state.selectedDay = startOfDay(new Date());
        render();
    });

    $("btnExport").addEventListener("click", exportData);
    $("fileImport").addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) importData(file);
        e.target.value = "";
    });

    render();
});
