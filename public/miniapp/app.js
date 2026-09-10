const checkInBtn = document.getElementById("checkInBtn");
const statusMessage = document.getElementById("statusMessage");
const warningBox = document.getElementById("warningBox");
const distanceInfo = document.getElementById("distanceInfo");
const scannerBox = document.getElementById("scannerBox");
const btnSpinner = document.getElementById("btnSpinner");
const btnIcon = document.getElementById("btnIcon");
const btnLabel = document.getElementById("btnLabel");
const qrScannerElement = document.getElementById("qrScanner");

const tg = window.Telegram?.WebApp;
const token = localStorage.getItem("eyc_auth_token");
let qrScanner = null;
let qrScannerStarted = false;

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

function calculateWorkingHours(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return "--:--";

  const start = new Date(checkInTime);
  const end = new Date(checkOutTime);
  const diffMs = end - start;

  if (diffMs < 0) return "0h 0m";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m`;
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
    startQrScanner();
  } else {
    warningBox.classList.remove("hidden");
    distanceInfo.textContent = `You are ${data.distanceMeters}m away (allowed: ${data.allowedRadiusMeters}m).`;
  }
}

async function startQrScanner() {
  if (!window.Html5Qrcode || !qrScannerElement) {
    statusMessage.textContent =
      "Camera library is unavailable in this browser.";
    return;
  }

  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) {
      statusMessage.textContent = "No camera found on this device.";
      return;
    }

    if (!qrScanner) {
      qrScanner = new Html5Qrcode("qrScanner");
    }

    if (qrScannerStarted) {
      return;
    }

    await qrScanner.start(
      devices[0].id,
      {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1,
      },
      async (decodedText) => {
        await scanQrToken(decodedText);
      },
      () => {
        // Ignore frame-level scan noise. We only act on successful decode.
      },
    );

    qrScannerStarted = true;
    statusMessage.textContent = "Camera ready. Scan your QR code.";
  } catch (error) {
    console.error("QR scanner failed to start:", error);
    statusMessage.textContent = "Unable to start the camera. Please retry.";
  }
}

async function scanQrToken(decodedText) {
  if (!decodedText) return;

  try {
    if (qrScanner && qrScannerStarted) {
      await qrScanner.stop();
      qrScannerStarted = false;
    }

    const response = await fetch("/api/attendance/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("eyc_auth_token")}`,
      },
      body: JSON.stringify({ qrToken: decodedText }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "QR scan failed.");
    }

    const timeOnly = new Date(data.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const statusNote = data.statusLabel ? ` (${data.statusLabel})` : "";

    // 1. TRIGGER YOUR CUSTOM SUCCESS TOAST
    const toastTitle =
      data.action === "check-in"
        ? "Check-In Successful"
        : "Check-Out Successful";
    showNotification(`${data.message} at ${timeOnly}${statusNote}`, "success", {
      title: toastTitle,
    });

    // 2. KEEP THE STATIC UI IN SYNC
    statusMessage.textContent = `${data.message} ${timeOnly}${statusNote}`;
    statusMessage.style.color = "#0f172a"; // Reset to standard text color

    scannerBox.classList.remove("hidden");
    scannerBox.querySelector("span").textContent =
      `Scanned successfully — ${timeOnly}`;

    if (data.action === "check-in") {
      btnLabel.textContent = "Check out";
      const checkInDisplay = document.getElementById("statCheckIn");
      if (checkInDisplay) checkInDisplay.textContent = timeOnly;
    } else {
      btnLabel.textContent = "Checked out";
      const checkOutDisplay = document.getElementById("statCheckOut");
      if (checkOutDisplay) checkOutDisplay.textContent = timeOnly;

      const checkInDisplay = document.getElementById("statCheckIn");
      const workingHrsDisplay = document.getElementById("statWorkingHrs");
      if (checkInDisplay && workingHrsDisplay) {
        workingHrsDisplay.textContent = calculateWorkingHours(
          new Date().toDateString() + " " + checkInDisplay.textContent,
          data.timestamp,
        );
      }
    }
  } catch (error) {
    console.error("Scan processing failed:", error);

    const isCompleted = error.message.includes("already completed");
    const isTooEarly = error.message.includes("Too early"); // Matches the 1-hour restriction message

    if (isCompleted || isTooEarly) {
      // 1. Show the sleek top-screen notification
      showNotification(error.message, true);

      // 2. If fully completed, shut down the UI
      if (isCompleted) {
        btnLabel.textContent = "Checked out";
        checkInBtn.disabled = true;
        if (qrScanner && qrScannerStarted) {
          await qrScanner.stop();
          qrScannerStarted = false;
        }
      }

      // 3. We return early so it doesn't mess with the statusMessage box at all!
      return;
    }

    // Normal errors (e.g., bad network) still go to the status box
    statusMessage.textContent = error.message || "Unable to process QR scan.";
    statusMessage.style.color = "#dc2626";
    if (qrScanner && !qrScannerStarted) {
      startQrScanner();
    }
  }
}

function resetUI() {
  statusMessage.textContent = "";
  warningBox.classList.add("hidden");
  scannerBox.classList.add("hidden");
  if (qrScanner && qrScannerStarted) {
    qrScanner.stop().catch(() => undefined);
    qrScannerStarted = false;
  }
}

// --------- Toast Notification ----------
let toastContainer = null;

function getContainer(position = "top-right") {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement("div");
  const [vSide, hSide] = position.split("-"); // e.g. "top-right"
  Object.assign(toastContainer.style, {
    position: "fixed",
    [vSide]: "20px",
    [hSide]: "20px",
    display: "flex",
    flexDirection: vSide === "top" ? "column" : "column-reverse",
    gap: "8px",
    zIndex: "9999",
  });
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function showNotification(message, type = "error", options = {}) {
  const { title, duration = 4000, position = "top-right" } = options;
  const container = getContainer(position);

  const palette = {
    success: { bg: "#f0fdf4", border: "#10b981", text: "#065f46", icon: "✓" },
    error: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "!" },
    warning: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e", icon: "⚠" },
  };
  const c = palette[type] || palette.error;

  const toast = document.createElement("div");
  Object.assign(toast.style, {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    width: "300px",
    maxWidth: "90vw",
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.text,
    padding: "12px 14px",
    borderRadius: "10px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.9rem",
    opacity: "0",
    transform: "translateY(-8px)",
    transition: "opacity 0.25s ease, transform 0.25s ease",
  });

  toast.innerHTML = `
    <span style="font-weight:700; flex-shrink:0;">${c.icon}</span>
    <div style="flex:1; min-width:0;">
      ${title ? `<div style="font-weight:600; margin-bottom:2px;">${title}</div>` : ""}
      <div style="opacity:0.9;">${message}</div>
    </div>
    <button aria-label="Dismiss" style="background:none; border:none; cursor:pointer; color:inherit; opacity:0.6; flex-shrink:0;">✕</button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  let timer;
  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(() => toast.remove(), 250);
  };
  const startTimer = () => (timer = setTimeout(dismiss, duration));
  startTimer();

  toast.addEventListener("mouseenter", () => clearTimeout(timer));
  toast.addEventListener("mouseleave", startTimer);
  toast.querySelector("button").addEventListener("click", () => {
    clearTimeout(timer);
    dismiss();
  });
}

function setLoading(isLoading) {
  checkInBtn.disabled = isLoading;
  btnSpinner.classList.toggle("hidden", !isLoading);
  btnIcon.classList.toggle("hidden", isLoading);
  if (isLoading) {
    btnLabel.textContent = "Checking...";
  } else {
    // Look at the UI cards to determine the correct state when loading finishes
    const checkInText = document.getElementById("statCheckIn")?.textContent;
    const checkOutText = document.getElementById("statCheckOut")?.textContent;

    if (checkOutText && checkOutText !== "—") {
      btnLabel.textContent = "Checked out";
      checkInBtn.disabled = true; // Keep locked if fully done
    } else if (checkInText && checkInText !== "—") {
      btnLabel.textContent = "Check out";
    } else {
      btnLabel.textContent = "Check in";
    }
  }
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
  const next = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + delta,
    1,
  );
  if (next.getFullYear() < CURRENT_YEAR) return; // don't allow browsing before this year
  currentMonth = next;
  loadHistory(currentMonth);
}

function updateNavState() {
  const atYearStart =
    currentMonth.getFullYear() === CURRENT_YEAR &&
    currentMonth.getMonth() === 0;
  prevMonthBtn.disabled = atYearStart;
}

let currentMonthLogsMap = new Map();

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
    const res = await fetch(
      `/api/attendance/my-history?year=${year}&month=${month}`,
      {
        headers: {
          Authorization: `Bearer ${token}`, // <--- ADD THIS LINE
        },
      },
    );
    const contentType = res.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      // Backend endpoint isn't live yet — fail gracefully instead of crashing on HTML.
      throw new Error("History service is not available yet.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load history.");
    }

    // Map date string -> full log object (storing check_in_at, check_out_at, status)
    currentMonthLogsMap.clear();
    if (data.logs) {
      data.logs.forEach((log) => {
        const cleanDate = log.date.slice(0, 10);
        currentMonthLogsMap.set(cleanDate, log);
      });
    }

    loadedMonths.add(monthKey(date));
    historyStatus.textContent = "";
    renderCalendar(date, data.logs || []);
  } catch (err) {
    historyStatus.textContent =
      err.message || "Unable to load attendance history.";
    renderCalendar(date, []); // still show the grid with weekends/empty days
  }
}

function renderCalendar(date, logs) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const today = new Date();

  // Map date string ("2026-08-25") -> status
  const logMap = new Map(
    logs.map((log) => [log.date.slice(0, 10), log.status]),
  );

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

  // 1. ADD COUNTERS BEFORE THE LOOP
  let countPresent = 0;
  let countLate = 0;
  let countAbsent = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayOfWeek = cellDate.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = cellDate.toDateString() === today.toDateString();

    // Check if the cell's date is strictly before today's date
    const isPastDay =
      cellDate <
      new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const log = currentMonthLogsMap.get(dateKey);
    const status = log ? log.status : null;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.textContent = day;

    if (status === "On-Time") {
      cell.classList.add("on-time");
      countPresent++;
    } else if (status === "Late") {
      cell.classList.add("late");
      countLate++;
    } else if (status === "Absent") {
      cell.classList.add("absent");
      countAbsent++;
    } else if (isWeekend) {
      cell.classList.add("weekend");
    }
    // THE SMART FIX: Mark as absent if it's a past weekday with no scan data
    else if (!status && isPastDay) {
      cell.classList.add("absent");
      countAbsent++;
    }

    if (isToday) cell.classList.add("today");

    // 🌟 CLICK EVENT TO OPEN MODAL 🌟
    cell.addEventListener("click", () => {
      openAttendanceModal(cellDate, log, isWeekend, isPastDay);
    });

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

  // UPDATE THE HTML SUMMARY CARDS AT THE END
  document.getElementById("sumPresent").textContent = countPresent;
  document.getElementById("sumLate").textContent = countLate;
  document.getElementById("sumAbsent").textContent = countAbsent;
  document.getElementById("sumTotal").textContent =
    countPresent + countLate + countAbsent;

  // Show the grid if there's data, otherwise keep it hidden
  document.getElementById("summaryGrid").classList.toggle("hidden", false);
}

function openAttendanceModal(cellDate, log, isWeekend, isPastDay) {
  const modal = document.getElementById("attendanceModal");
  const dateTitle = document.getElementById("modalDateTitle");
  const badge = document.getElementById("modalStatusBadge");
  const checkInVal = document.getElementById("modalCheckInTime");
  const checkOutVal = document.getElementById("modalCheckOutTime");

  // Format full date (e.g., "Thursday, July 16, 2026")
  dateTitle.textContent = cellDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Determine status & times to display
  let statusText = "ABSENT";
  let badgeClass = "absent";
  let inTime = "—";
  let outTime = "—";

  if (log) {
    statusText = log.status ? log.status.toUpperCase() : "PRESENT";
    badgeClass =
      log.status === "On-Time"
        ? "on-time"
        : log.status === "Late"
          ? "late"
          : "absent";

    if (log.check_in_at) {
      inTime = new Date(log.check_in_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (log.check_out_at) {
      outTime = new Date(log.check_out_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } else if (isWeekend) {
    statusText = "WEEKEND";
    badgeClass = "weekend";
  } else if (!isPastDay) {
    statusText = "UPCOMING";
    badgeClass = "weekend";
  }

  badge.textContent = statusText;
  badge.className = `modal-badge ${badgeClass}`;
  checkInVal.textContent = inTime;
  checkOutVal.textContent = outTime;

  modal.classList.remove("hidden");
}

// Close Modal Listeners
document.getElementById("closeModalBtn").addEventListener("click", () => {
  document.getElementById("attendanceModal").classList.add("hidden");
});

document.getElementById("attendanceModal").addEventListener("click", (e) => {
  if (e.target.id === "attendanceModal") {
    e.target.classList.add("hidden");
  }
});

if (tg) {
  tg.ready();
  tg.expand(); // always request full-height, don't let it sit half-collapsed
  tg.disableVerticalSwipes?.(); // stop Telegram's own swipe-to-close gesture from interfering with scroll
  document.documentElement.style.setProperty(
    "--tg-viewport-height",
    `${tg.viewportStableHeight || window.innerHeight}px`,
  );

  tg.onEvent("viewportChanged", () => {
    document.documentElement.style.setProperty(
      "--tg-viewport-height",
      `${tg.viewportStableHeight || window.innerHeight}px`,
    );
  });
}

// ---------- Profile Popover & Logout ----------
const profileToggleBtn = document.getElementById("profileToggleBtn");
const profilePopover = document.getElementById("profilePopover");
const logoutBtn = document.getElementById("logoutBtn");

// Toggle the popover when clicking the profile icon
profileToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevents immediate closing
  profilePopover.classList.toggle("hidden");
});

// Close the popover if clicking anywhere else on the screen
document.addEventListener("click", (e) => {
  if (
    !profilePopover.classList.contains("hidden") &&
    !profilePopover.contains(e.target) &&
    e.target !== profileToggleBtn
  ) {
    profilePopover.classList.add("hidden");
  }
});

// Execute Logout
logoutBtn.addEventListener("click", () => {
  // 1. Clear the persistent JWT token
  localStorage.removeItem("eyc_auth_token");

  // 2. Clear any cached UI data if necessary
  localStorage.removeItem("eyc_user_data");

  // 3. Redirect back to the login page
  window.location.href = "/login";
});

// ---------- Hydrate Attendance State on Page Load ----------
window.addEventListener("DOMContentLoaded", async () => {
  const savedUser = localStorage.getItem("eyc_user");
  if (savedUser) {
    const user = JSON.parse(savedUser);

    // Populate the top header card (Note: using user.fullName or user.name based on your login response)
    const displayName = user.fullName || user.name;

    // Combine Position and Campus Name (e.g., "Teacher · Youth School")
    const campusName = user.campusName || "Main Campus";
    const positionStr = user.position || "Teacher";
    const fullRoleSubtitle = `${positionStr} · ${campusName}`;

    const nameDisplay = document.getElementById("staffName");
    const roleDisplay = document.getElementById("staffRole");

    if (nameDisplay) nameDisplay.textContent = displayName;
    if (roleDisplay) roleDisplay.textContent = fullRoleSubtitle;

    // Populate the floating profile popover
    const popName = document.getElementById("popoverName");
    const popRole = document.getElementById("popoverRole");
    const popPhone = document.getElementById("popoverPhone");

    if (popName) popName.textContent = displayName;
    if (popRole) popRole.textContent = user.position;
    if (popPhone) popPhone.textContent = user.phone;
  }

  if (!token) return;

  try {
    const res = await fetch("/api/attendance/today", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // If the endpoint isn't live yet or fails, fail gracefully
    if (!res.ok) return;

    const data = await res.json();

    if (data.loggedIn) {
      const formatTimeOnly = (isoString) => {
        if (!isoString) return "—";
        return new Date(isoString).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      };

      // Populate Check-In card & update button if checked in
      if (data.checkInTime) {
        const checkInDisplay = document.getElementById("statCheckIn");
        if (checkInDisplay) {
          checkInDisplay.textContent = formatTimeOnly(data.checkInTime);
        }
        btnLabel.textContent = "Checked out";
      }

      // Populate Check-Out card & update button if checked out
      if (data.checkOutTime) {
        const checkOutDisplay = document.getElementById("statCheckOut");
        if (checkOutDisplay) {
          checkOutDisplay.textContent = formatTimeOnly(data.checkOutTime);
        }
        btnLabel.textContent = "Checked out";
      }

      if (data.checkInTime && data.checkOutTime) {
        const workingHrsDisplay = document.getElementById("statWorkingHrs"); // (Check your HTML ID for working hours)
        if (workingHrsDisplay) {
          workingHrsDisplay.textContent = calculateWorkingHours(
            data.checkInTime,
            data.checkOutTime,
          );
        }
      }
    }
  } catch (err) {
    console.error("Failed to load initial attendance state:", err);
  }
});
