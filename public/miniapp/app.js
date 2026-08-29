const checkInBtn = document.getElementById("checkInBtn");
const statusMessage = document.getElementById("statusMessage");
const warningBox = document.getElementById("warningBox");
const distanceInfo = document.getElementById("distanceInfo");
const scannerBox = document.getElementById("scannerBox");
const btnSpinner = document.getElementById("btnSpinner");
const btnIcon = document.getElementById("btnIcon");
const btnLabel = document.getElementById("btnLabel");

const tg = window.Telegram?.WebApp;
const token = localStorage.getItem("eyc_auth_token");

if (!token) {
  // If no token exists, kick them back to the login page
  window.location.href = "/login";
}

if (tg) tg.ready();

// ---------- Live clock ----------
const clockTime = document.getElementById("clockTime");
const clockPeriod = document.getElementById("clockPeriod");
const clockDate = document.getElementById("clockDate");

function tickClock() {
  const now = new Date();
  let hours = now.getHours();
  const period = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");

  clockTime.textContent = `${hours}:${minutes}`;
  clockPeriod.textContent = period;
  clockDate.textContent = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

tickClock();
setInterval(tickClock, 1000);

checkInBtn.addEventListener("click", handleCheckIn);

async function handleCheckIn() {
  resetUI();
  setLoading(true);

  try {
    const { lat, lng } = await getUserCoordinates();
    await sendLocationToServer(lat, lng);
  } catch (err) {
    statusMessage.textContent = err.message || "Unable to get your location.";
  } finally {
    setLoading(false);
  }
}

function getUserCoordinates() {
  return new Promise((resolve, reject) => {
    // 1. SMART CHECK: Are we inside Telegram?
    const isInsideTelegram = tg && tg.platform && tg.platform !== "unknown";

    if (isInsideTelegram && tg.LocationManager) {
      // THE FIX: Set a 3-second safety timer!
      // If Telegram freezes (common on Desktop), this triggers the fallback.
      const telegramTimeout = setTimeout(() => {
        console.warn(
          "Telegram LocationManager timed out. Falling back to browser GPS.",
        );
        fallbackToBrowserGeolocation(resolve, reject);
      }, 3000);

      tg.LocationManager.init(() => {
        tg.LocationManager.getLocation((data) => {
          // If Telegram actually responds, cancel the 3-second timer!
          clearTimeout(telegramTimeout);

          if (data && data.latitude) {
            resolve({ lat: data.latitude, lng: data.longitude });
          } else {
            fallbackToBrowserGeolocation(resolve, reject);
          }
        });
      });
      return;
    }

    // 3. If in normal Chrome or LocationManager doesn't exist at all
    fallbackToBrowserGeolocation(resolve, reject);
  });
}

function fallbackToBrowserGeolocation(resolve, reject) {
  if (!navigator.geolocation) {
    reject(new Error("Geolocation is not supported on this device."));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    },
    () =>
      reject(new Error("Location permission denied. Enable GPS to check in.")),
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

// --- Step B: send coords to backend ---
async function sendLocationToServer(lat, lng) {
  const res = await fetch("/api/attendance/check-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Location check failed.");
  }

  if (data.isInside) {
    scannerBox.classList.remove("hidden");
    statusMessage.textContent = "Location verified.";
  } else {
    warningBox.classList.remove("hidden");
    distanceInfo.textContent = `You are ${data.distanceMeters}m away (allowed: ${data.allowedRadiusMeters}m).`;
  }
}

function resetUI() {
  statusMessage.textContent = "";
  warningBox.classList.add("hidden");
  scannerBox.classList.add("hidden");
}

function setLoading(isLoading) {
  checkInBtn.disabled = isLoading;
  btnSpinner.classList.toggle("hidden", !isLoading);
  btnIcon.classList.toggle("hidden", isLoading);
  btnLabel.textContent = isLoading ? "Checking..." : "Check in";
}

// ---------- Tab switching ----------
const scanTab = document.getElementById("scanTab");
const historyTab = document.getElementById("historyTab");
const scanPanel = document.getElementById("scanPanel");
const historyPanel = document.getElementById("historyPanel");

scanTab.addEventListener("click", () => switchTab("scan"));
historyTab.addEventListener("click", () => switchTab("history"));

function switchTab(tab) {
  const isScan = tab === "scan";
  scanTab.classList.toggle("active", isScan);
  historyTab.classList.toggle("active", !isScan);
  scanPanel.classList.toggle("hidden", !isScan);
  historyPanel.classList.toggle("hidden", isScan);

  if (!isScan && !historyLoadedForMonth(currentMonth)) {
    loadHistory(currentMonth);
  }
}

// ---------- Calendar / History ----------
const historyStatus = document.getElementById("historyStatus");
const historyEmpty = document.getElementById("historyEmpty");
const currentMonthLabel = document.getElementById("currentMonthLabel");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const calendarGrid = document.getElementById("calendarGrid");

const CURRENT_YEAR = new Date().getFullYear(); // calendar never goes earlier than this
let currentMonth = new Date(); // defaults to today's month
let loadedMonths = new Set();

function historyLoadedForMonth(date) {
  return loadedMonths.has(monthKey(date));
}

function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

prevMonthBtn.addEventListener("click", () => shiftMonth(-1));
nextMonthBtn.addEventListener("click", () => shiftMonth(1));

function shiftMonth(delta) {
  const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
  if (next.getFullYear() < CURRENT_YEAR) return; // don't allow browsing before this year
  currentMonth = next;
  loadHistory(currentMonth);
}

function updateNavState() {
  const atYearStart =
    currentMonth.getFullYear() === CURRENT_YEAR && currentMonth.getMonth() === 0;
  prevMonthBtn.disabled = atYearStart;
}

async function loadHistory(date) {
  currentMonthLabel.textContent = date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  updateNavState();
  historyStatus.textContent = "Loading...";
  historyEmpty.classList.add("hidden");

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  try {
    const res = await fetch(`/api/attendance/my-history?year=${year}&month=${month}`);
    const contentType = res.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      // Backend endpoint isn't live yet — fail gracefully instead of crashing on HTML.
      throw new Error("History service is not available yet.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load history.");
    }

    loadedMonths.add(monthKey(date));
    historyStatus.textContent = "";
    renderCalendar(date, data.logs || []);
  } catch (err) {
    historyStatus.textContent = err.message || "Unable to load attendance history.";
    renderCalendar(date, []); // still show the grid with weekends/empty days
  }
}

function renderCalendar(date, logs) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const today = new Date();

  // Map date string ("2026-08-25") -> status
  const logMap = new Map(logs.map((log) => [log.date.slice(0, 10), log.status]));

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Monday-start offset: JS getDay() is 0=Sun..6=Sat, convert to 0=Mon..6=Sun
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

  calendarGrid.innerHTML = "";

  const TOTAL_CELLS = 42; // fixed 6 rows x 7 days, so every month renders the same height

  for (let i = 0; i < leadingBlanks; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-cell blank";
    calendarGrid.appendChild(blank);
  }

  let hasAnyLog = logs.length > 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayOfWeek = cellDate.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = cellDate.toDateString() === today.toDateString();
    const status = logMap.get(dateKey);

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.textContent = day;

    if (status === "On-Time") cell.classList.add("on-time");
    else if (status === "Late") cell.classList.add("late");
    else if (status === "Absent") cell.classList.add("absent");
    else if (isWeekend) cell.classList.add("weekend");

    if (isToday) cell.classList.add("today");

    calendarGrid.appendChild(cell);
  }

  // Pad the remainder with trailing blanks so every month always renders 42 cells (6 rows)
  const filledCells = leadingBlanks + daysInMonth;
  const trailingBlanks = TOTAL_CELLS - filledCells;
  for (let i = 0; i < trailingBlanks; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-cell blank";
    calendarGrid.appendChild(blank);
  }

  historyEmpty.classList.toggle("hidden", hasAnyLog);
}

if (tg) {
  tg.ready();
  tg.expand(); // always request full-height, don't let it sit half-collapsed
  tg.disableVerticalSwipes?.(); // stop Telegram's own swipe-to-close gesture from interfering with scroll
  document.documentElement.style.setProperty(
    "--tg-viewport-height",
    `${tg.viewportStableHeight || window.innerHeight}px`
  );

  tg.onEvent("viewportChanged", () => {
    document.documentElement.style.setProperty(
      "--tg-viewport-height",
      `${tg.viewportStableHeight || window.innerHeight}px`
    );
  });
}