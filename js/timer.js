// timer.js — Pomodoro timer logic, state management, and UI updates

const durations = { focus: 25, short: 5, long: 20 };
let currentMode    = 'focus';
let totalSeconds   = 25 * 60;
let remainingSeconds = 25 * 60;
let isRunning      = false;
let timerInterval  = null;

let pomodoroCount      = 0;
let totalFocusMinutes  = 0;
let totalBreaks        = 0;
let currentStreak      = 0;
let bestStreak         = 0;
let cyclePosition      = 0; // 0–3 within a 4-pomodoro cycle

// Expose running state so scene.js animation loop can read it
window.timerRunning = false;

// ── MODE ──────────────────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  clearInterval(timerInterval);
  isRunning = false;
  window.timerRunning = false;

  totalSeconds     = durations[mode] * 60;
  remainingSeconds = totalSeconds;

  updateDisplay();
  window.updateProgressRing(remainingSeconds, totalSeconds, currentMode);
  syncModeButtons();
  updateStartBtn();

  // Update apple & ring color
  const appleColors = { focus: 0xc0392b, short: 0x27ae60, long: 0x1a6b9a };
  window.setAppleColor(appleColors[mode]);
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────
function toggleTimer() {
  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    window.timerRunning = false;
    updateStartBtn();
  } else {
    isRunning = true;
    window.timerRunning = true;
    updateStartBtn();
    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateDisplay();
      window.updateProgressRing(remainingSeconds, totalSeconds, currentMode);
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        isRunning = false;
        window.timerRunning = false;
        onSessionComplete();
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  window.timerRunning = false;
  remainingSeconds = totalSeconds;
  updateDisplay();
  window.updateProgressRing(remainingSeconds, totalSeconds, currentMode);
  updateStartBtn();
}

function skipSession() {
  clearInterval(timerInterval);
  isRunning = false;
  window.timerRunning = false;
  onSessionComplete(true);
}

// ── SESSION COMPLETE ──────────────────────────────────────────────────────────
function onSessionComplete(skipped = false) {
  const labelMap = { focus: 'Focus Session', short: 'Short Break', long: 'Long Break' };

  if (!skipped) {
    if (currentMode === 'focus') {
      pomodoroCount++;
      totalFocusMinutes += durations.focus;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
      cyclePosition = (cyclePosition + 1) % 4;
      showToast(`🍎 Pomodoro #${pomodoroCount} complete!`);
    } else {
      totalBreaks++;
      currentStreak = 0;
      showToast('☕ Break done — back to it!');
    }
  }

  addLogEntry(labelMap[currentMode], skipped);
  updateStats();
  updateCycleDots();

  // Auto-advance to next mode
  if (!skipped) {
    const nextMode = currentMode === 'focus'
      ? (cyclePosition === 0 ? 'long' : 'short')
      : 'focus';
    setTimeout(() => setMode(nextMode), 600);
  }
}

// ── DURATION CONFIG ───────────────────────────────────────────────────────────
function changeDuration(mode, delta) {
  durations[mode] = Math.max(1, Math.min(90, durations[mode] + delta));
  document.getElementById(`dur-${mode}`).textContent = durations[mode];
  if (mode === currentMode && !isRunning) {
    totalSeconds     = durations[mode] * 60;
    remainingSeconds = totalSeconds;
    updateDisplay();
    window.updateProgressRing(remainingSeconds, totalSeconds, currentMode);
  }
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function updateDisplay() {
  const m = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const s = String(remainingSeconds % 60).padStart(2, '0');
  document.getElementById('time-display').textContent = `${m}:${s}`;
  document.getElementById('time-label').textContent =
    { focus: 'Focus Session', short: 'Short Break', long: 'Long Break' }[currentMode];
  document.getElementById('time-display').classList.toggle('break-mode', currentMode !== 'focus');
  document.title = `${m}:${s} — Pomodoro 3D`;
}

function syncModeButtons() {
  ['focus', 'short', 'long'].forEach(m =>
    document.getElementById(`btn-${m}`).classList.toggle('active', m === currentMode)
  );
}

function updateStartBtn() {
  const btn = document.getElementById('start-btn');
  btn.textContent = isRunning ? 'PAUSE' : remainingSeconds < totalSeconds ? 'RESUME' : 'START';
  btn.classList.toggle('paused', isRunning);
}

function updateStats() {
  document.getElementById('stat-pomodoros').textContent = pomodoroCount;
  const h = Math.floor(totalFocusMinutes / 60), min = totalFocusMinutes % 60;
  document.getElementById('stat-focus-time').textContent = h > 0 ? `${h}h${min}m` : `${min}m`;
  document.getElementById('stat-breaks').textContent  = totalBreaks;
  document.getElementById('stat-streak').textContent  = bestStreak;
}

function updateCycleDots() {
  document.querySelectorAll('.pomo-dot').forEach((d, i) => {
    d.classList.remove('filled', 'long-break');
    if (cyclePosition === 0 && pomodoroCount > 0) {
      d.classList.add('long-break');
    } else if (i < cyclePosition) {
      d.classList.add('filled');
    }
  });
}

function addLogEntry(label, skipped) {
  const log   = document.getElementById('session-log');
  const empty = log.querySelector('.empty-log');
  if (empty) empty.remove();

  const time    = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isBreak = label.includes('Break');

  const el = document.createElement('div');
  el.className = 'log-item';
  el.innerHTML = `
    <div class="log-dot ${isBreak ? 'break' : 'focus'}"></div>
    <span>${skipped ? '⏭ Skipped' : '✓ Done'} — ${label}</span>
    <span class="log-time">${time}</span>
  `;
  log.prepend(el);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('footer-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  updateDisplay();
  updateStats();
});
