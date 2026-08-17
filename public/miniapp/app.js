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

// --- Step A: get GPS coords (Telegram first, browser fallback) ---
function getUserCoordinates() {
  return new Promise((resolve, reject) => {
    if (tg?.LocationManager) {
      tg.LocationManager.init(() => {
        tg.LocationManager.getLocation((data) => {
          if (data) {
            resolve({ lat: data.latitude, lng: data.longitude });
          } else {
            fallbackToBrowserGeolocation(resolve, reject);
          }
        });
      });
      return;
    }
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
