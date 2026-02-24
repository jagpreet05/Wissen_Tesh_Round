/* ══════════════════════════════════════════════════════════════
   SMART SEAT ALLOCATION SYSTEM — app.js
   Vanilla JS · No frameworks · Backend-injectable IDs
   ══════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════════
   ██  API CONFIGURATION  ██
   ─────────────────────────────────────────────────────────────
   Centralised settings for connecting to the Spring Boot backend.
   To switch from mock data to live data:
     1. Set API_CONFIG.enabled = true
     2. Ensure backend is running on the BASE_URL below
   ════════════════════════════════════════════════════════════════ */

const API_CONFIG = {
  /** Base URL of Spring Boot backend — change port here if needed */
  // TODO: Update BASE_URL when deploying to a different environment
  BASE_URL: 'http://localhost:8080',

  /** API version prefix — matches @RequestMapping on backend controllers */
  // TODO: Confirm version prefix with backend team (e.g. /api/v1)
  PREFIX: '/api/v1',

  /**
   * Set to true when backend is running.
   * When false, all API calls silently fall back to in-memory mock data.
   */
  enabled: true,

  /** Timeout in ms before a fetch() call is considered failed */
  timeoutMs: 8000,
};

/* ────────────────────────────────────────────────────────────────
   ENDPOINT MAP
   One-stop reference for every backend route used by the frontend.
   Format: ENDPOINTS.<domain>.<action> → string path appended to BASE_URL + PREFIX
──────────────────────────────────────────────────────────────── */
const ENDPOINTS = {
  seats: {
    // TODO: Backend → GET  /api/v1/seats/status?date=YYYY-MM-DD
    status: '/seats/status',
    // TODO: Backend → POST /api/v1/seats/book
    book: '/seats/book',
    // TODO: Backend → GET  /api/v1/seats/available?date=YYYY-MM-DD&batch=1
    available: '/seats/available',
  },
  leaves: {
    // TODO: Backend → POST /api/v1/leaves/apply
    apply: '/leaves/apply',
    // TODO: Backend → GET  /api/v1/leaves?employeeId=EMP-042
    history: '/leaves',
    // TODO: Backend → PUT  /api/v1/leaves/{id}/cancel
    cancel: '/leaves/{id}/cancel',
  },
  employees: {
    // TODO: Backend → GET  /api/v1/employees/me  (current user profile)
    me: '/employees/me',
    // TODO: Backend → GET  /api/v1/employees/status?date=YYYY-MM-DD
    status: '/employees/status',
  },
  booking: {
    // TODO: Backend → GET  /api/v1/booking/window  (returns { open: bool, opensAt, closesAt })
    window: '/booking/window',
  },
};

/* ────────────────────────────────────────────────────────────────
   CORE FETCH HELPER — apiRequest()
   Wraps fetch() with:
     • Auth header placeholder (Bearer token)
     • Configurable timeout
     • Automatic JSON parsing
     • Graceful mock-data fallback when API_CONFIG.enabled = false
       or when the backend is unreachable (network error / non-2xx)
──────────────────────────────────────────────────────────────── */

/**
 * @param {string} endpoint  - Path from ENDPOINTS map (e.g. ENDPOINTS.seats.status)
 * @param {object} [options] - fetch() init options (method, body, headers…)
 * @param {*}      [mockData] - Fallback value returned when backend is off or unreachable
 * @returns {Promise<any>}   - Parsed JSON response, or mockData on failure
 */
async function apiRequest(endpoint, options = {}, mockData = null) {
  if (!API_CONFIG.enabled) {
    // Backend is disabled — return mock data immediately (no network call)
    console.debug(`[API — MOCK] ${options.method || 'GET'} ${endpoint}`, mockData);
    return Promise.resolve(mockData);
  }

  const url = `${API_CONFIG.BASE_URL}${API_CONFIG.PREFIX}${endpoint}`;

  // TODO: Replace static token with value from sessionStorage / auth service
  const token = sessionStorage.getItem('authToken') || '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) },
      signal: controller.signal,
      // credentials: 'include' sends the Spring Security session cookie
      // so the browser's logged-in session is reused automatically
      credentials: 'include',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[API] ${response.status} ${response.statusText} — ${url}. Falling back to mock data.`);
      return mockData;
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn(`[API] Request timed out after ${API_CONFIG.timeoutMs}ms — ${url}. Falling back to mock data.`);
    } else {
      console.warn(`[API] Network error — ${url}. Falling back to mock data.`, err.message);
    }
    return mockData;
  }
}

/* ════════════════════════════════════════════════════════════════
   ██  API METHODS  ██
   Each method calls the live backend when API_CONFIG.enabled = true.
   Falls back to in-memory mock data on error / when disabled.
   ════════════════════════════════════════════════════════════════ */

/**
 * getDashboardStats(date)
 * GET /api/v1/dashboard/stats?date=YYYY-MM-DD
 *
 * Backend response: { totalEmployees, occupiedSeats, availableSeats,
 *   leavesToday, utilizationPercent, totalSeats,
 *   designatedOccupied, floaterOccupied, leaveReleasedToPool, date }
 */
async function getDashboardStats(date = new Date().toISOString().split('T')[0]) {
  const mockFallback = {
    totalEmployees: 80, occupiedSeats: 36, availableSeats: 14,
    leavesToday: 5, utilizationPercent: 72, totalSeats: 50,
    designatedOccupied: 33, floaterOccupied: 3, leaveReleasedToPool: 3, date,
  };
  return apiRequest(`${ENDPOINTS.seats.status.replace('/seats/status', '/dashboard/stats')}?date=${date}`, {}, mockFallback);
}

/**
 * getSeatStatus(date)
 * GET /api/v1/seats/status?date=YYYY-MM-DD
 *
 * Backend response: { date, totalSeats, occupied, available, leaveReleased, seats:[ ... ] }
 * Each seat: { seatId, type:'DESIGNATED'|'FLOATER', zone, status, occupied, onLeave,
 *              occupant:{ name, team, batch }, checkinTime, date }
 *
 * Normalised to the shape the seat-grid renderer expects.
 */
async function getSeatStatus(date = new Date().toISOString().split('T')[0]) {
  const mockFallback = [
    ...DESIGNATED_EMPLOYEES.map(e => ({
      seatId: e.seat, type: 'Designated', occupied: e.occupied,
      occupant: e.occupied ? e.name : null, team: e.team,
      batch: e.batch, checkin: e.checkin, status: e.status, onLeave: e.onLeave,
    })),
    ...Array.from({ length: 10 }, (_, i) => {
      const occ = FLOATER_EMPLOYEES[i];
      return {
        seatId: `F-${String(i + 1).padStart(2, '0')}`, type: 'Floater',
        occupied: !!(occ && occ.occupied),
        occupant: occ && occ.occupied ? occ.name : null,
        team: occ && occ.occupied ? occ.team : null,
        batch: occ && occ.occupied ? occ.batch : null,
        checkin: occ && occ.occupied ? occ.checkin : null,
        status: occ && occ.occupied ? occ.status : 'free', onLeave: false,
      };
    }),
  ];

  // The backend wraps seats in { ..., seats: [] } — unwrap and normalise field names
  const raw = await apiRequest(`${ENDPOINTS.seats.status}?date=${date}`, {}, { seats: mockFallback });
  const seats = (raw && Array.isArray(raw.seats)) ? raw.seats : (Array.isArray(raw) ? raw : mockFallback);

  // Normalise backend field names to what the seat-grid renderer expects
  return seats.map(s => ({
    seatId: s.seatId,
    type: s.type === 'DESIGNATED' ? 'Designated' : s.type === 'FLOATER' ? 'Floater' : s.type,
    zone: s.zone || (s.type === 'FLOATER' || s.type === 'Floater' ? 'Zone B' : 'Zone A'),
    occupied: s.occupied,
    onLeave: s.onLeave || s.status === 'LEAVE_RELEASED',
    occupant: s.occupant ? (typeof s.occupant === 'string' ? s.occupant : s.occupant.name) : null,
    team: s.occupant ? (s.occupant.team || s.team || null) : s.team || null,
    batch: s.occupant ? (s.occupant.batch || s.batch || null) : s.batch || null,
    checkin: s.checkinTime || s.checkin || null,
    status: s.status === 'OCCUPIED' ? 'checked-in'
      : s.status === 'LEAVE_RELEASED' ? 'on-leave'
        : s.status === 'AVAILABLE' ? 'free'
          : s.status || 'free',
  }));
}

/**
 * getWeeklyCalendar(week, batch)
 * GET /api/v1/calendar/weekly?week=1|2&batch=1|2|all
 *
 * Backend response: { week, batchFilter, dateRange, days:[], schedule:[] }
 */
async function getWeeklyCalendar(week = 1, batch = 'all') {
  return apiRequest(
    `${ENDPOINTS.seats.status.replace('/seats/status', '/calendar/weekly')}?week=${week}&batch=${batch}`,
    {},
    null
  );
}

/**
 * bookSeat(payload)
 * POST /api/v1/seats/book
 *
 * Backend returns: { bookingId, employeeId, seatId, date, status:'CONFIRMED', bookedAt }
 * Normalised to { success, bookingId, seatId, date, message }
 */
async function bookSeat(payload) {
  const mockFallback = {
    bookingId: `BK-MOCK-${Date.now()}`, seatId: payload.seatId,
    date: payload.date, status: 'CONFIRMED',
  };
  const raw = await apiRequest(ENDPOINTS.seats.book, {
    method: 'POST', body: JSON.stringify(payload),
  }, mockFallback);

  // Normalise: backend uses status:'CONFIRMED', UI checks result.success
  if (!raw) return { success: false, message: 'No response from server.' };
  if (raw.success !== undefined) return raw;           // already normalised (mock fallback)
  return {
    success: raw.status === 'CONFIRMED',
    bookingId: raw.bookingId,
    seatId: raw.seatId,
    date: raw.date,
    message: raw.status === 'CONFIRMED' ? 'Seat booked successfully.' : (raw.message || 'Booking failed.'),
  };
}

/**
 * applyLeave(payload)
 * POST /api/v1/leaves/apply
 *
 * Backend returns: { leaveId, status:'PENDING', seatReleased, releasedSeatId, createdAt }
 * Normalised to { success, leaveId, seatReleased, message }
 *
 * leaveType mapping (UI text → backend enum):
 *   'Casual Leave' → 'CASUAL' | 'Sick Leave' → 'SICK'
 *   'Earned Leave' → 'EARNED' | 'Comp Off'   → 'COMP_OFF'
 */
async function applyLeave(payload) {
  const leaveTypeMap = {
    'Casual Leave': 'CASUAL', 'Sick Leave': 'SICK',
    'Earned Leave': 'EARNED', 'Comp Off': 'COMP_OFF',
  };
  const mappedPayload = {
    ...payload,
    leaveType: leaveTypeMap[payload.leaveType] || payload.leaveType.toUpperCase().replace(' ', '_'),
  };
  const mockFallback = {
    leaveId: `L-MOCK-${Date.now()}`, status: 'PENDING',
    seatReleased: payload.releaseSeat || false,
  };
  const raw = await apiRequest(ENDPOINTS.leaves.apply, {
    method: 'POST', body: JSON.stringify(mappedPayload),
  }, mockFallback);

  // Normalise: backend uses status:'PENDING', UI checks result.success
  if (!raw) return { success: false, message: 'No response from server.' };
  if (raw.success !== undefined) return raw;           // already normalised (mock fallback)
  return {
    success: raw.status === 'PENDING' || raw.status === 'APPROVED',
    leaveId: raw.leaveId,
    seatReleased: raw.seatReleased,
    message: raw.status === 'PENDING' ? 'Leave submitted successfully.' : (raw.message || 'Submission failed.'),
  };
}

/* ────────────────────────────────────────────────────────────────
   END OF API LAYER — all UI + mock data logic follows below
──────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   DATA MODEL
   Replace these objects with backend API responses.
   All key element IDs are documented for injection.
──────────────────────────────────────────────── */

/** Current logged-in user */
const CURRENT_USER = {
  id: 'EMP-042',
  name: 'Raj Patel',
  initials: 'RP',
  role: 'designated',     // 'designated' | 'floater'
  batch: 1,              // 1 | 2
  team: 'Delta',
  designatedSeat: 'D-12',
  avatarColor: '#3B82F6'
};

/** 10 Teams × 8 members = 80 employees */
const TEAMS = [
  { id: 'T1', name: 'Alpha', batch: 1, members: 8 },
  { id: 'T2', name: 'Beta', batch: 1, members: 8 },
  { id: 'T3', name: 'Gamma', batch: 1, members: 8 },
  { id: 'T4', name: 'Delta', batch: 1, members: 8 },
  { id: 'T5', name: 'Epsilon', batch: 1, members: 8 },
  { id: 'T6', name: 'Zeta', batch: 2, members: 8 },
  { id: 'T7', name: 'Eta', batch: 2, members: 8 },
  { id: 'T8', name: 'Theta', batch: 2, members: 8 },
  { id: 'T9', name: 'Iota', batch: 2, members: 8 },
  { id: 'T10', name: 'Kappa', batch: 2, members: 8 }
];

/**
 * Batch Schedule Rules
 *  Batch 1: Week 1 → Mon–Wed, Week 2 → Thu–Fri
 *  Batch 2: Week 1 → Thu–Fri, Week 2 → Mon–Wed
 *  dayIndex: 0=Mon,1=Tue,2=Wed,3=Thu,4=Fri (weekends excluded)
 */
const BATCH_SCHEDULE = {
  1: { 1: [0, 1, 2], 2: [3, 4] },
  2: { 1: [3, 4], 2: [0, 1, 2] }
};

/** Designated employee records (first 40, seats D-01 … D-40) */
const DESIGNATED_EMPLOYEES = (() => {
  const names = [
    'Raj Patel', 'Arjun Singh', 'Priya Sharma', 'Vikram Rao', 'Anita Joshi',
    'Suresh Iyer', 'Kavita Nair', 'Mohit Verma', 'Deepa Kapoor', 'Ramesh Bose',
    'Sunita Das', 'Tarun Gupta', 'Smita Jha', 'Nikhil Khanna', 'Reena Bajaj',
    'Harish Patel', 'Swati Desai', 'Manish Agarwal', 'Pallavi Shah', 'Karan Sethi',
    'Uma Krishnan', 'Rohan Sinha', 'Neha Kumar', 'Vivek Saxena', 'Divya Reddy',
    'Geeta Pillai', 'Anjali Mehta', 'Sanjay Tiwari', 'Lata Rao', 'Pooja Nair',
    'Arun Kumar', 'Meera Kapoor', 'Ravi Das', 'Komal Shukla', 'Naveen Yadav',
    'Preethi Menon', 'Ashish Malhotra', 'Farida Khan', 'Gaurav Jain', 'Hema Subramanian'
  ];
  const teams = ['Alpha', 'Alpha', 'Beta', 'Beta', 'Gamma', 'Gamma', 'Delta', 'Delta', 'Epsilon', 'Epsilon'];
  const checkins = ['08:42 AM', '08:51 AM', '09:00 AM', '09:08 AM', '09:17 AM', '09:22 AM', '09:30 AM', '09:45 AM'];
  const occupiedCount = 33; // 33 of 40 occupied today

  return names.map((name, i) => {
    const num = String(i + 1).padStart(2, '0');
    const isOccupied = i < occupiedCount;
    const isCurrentUser = i === 0; // Raj Patel → D-01... we map him to D-12 below
    const teamIndex = Math.floor(i / 4) % 10;
    const batch = teamIndex < 5 ? 1 : 2;
    return {
      id: `EMP-${String(i + 1).padStart(3, '0')}`,
      name,
      initials: name.split(' ').map(p => p[0]).join('').slice(0, 2),
      seat: `D-${num}`,
      team: teams[teamIndex] || 'Alpha',
      batch,
      occupied: isOccupied,
      onLeave: i >= occupiedCount && i < 38, // seats D-34…D-38 = leave-released
      checkin: isOccupied ? checkins[i % checkins.length] : null,
      status: i === 3 ? 'booked' : i < occupiedCount ? (i % 6 < 4 ? 'checked-in' : 'booked') : i >= 38 ? 'on-leave' : 'remote',
      avatarColor: `hsl(${(i * 37) % 360},62%,48%)`
    };
  });
})();

// Override seat for current user
const CU_ENTRY = DESIGNATED_EMPLOYEES.find(e => e.id === 'EMP-042' || e.id === 'EMP-001');
if (CU_ENTRY) {
  CU_ENTRY.id = CURRENT_USER.id;
  CU_ENTRY.name = CURRENT_USER.name;
  CU_ENTRY.initials = CURRENT_USER.initials;
  CU_ENTRY.seat = CURRENT_USER.designatedSeat;
  CU_ENTRY.status = 'checked-in';
  CU_ENTRY.occupied = true;
}

/** Floater employees (non-designated) */
const FLOATER_EMPLOYEES = (() => {
  const names = [
    'Ishaan Mehta', 'Priyanka Roy', 'Siddharth Nair', 'Tanvi Sharma', 'Yash Patel',
    'Ritu Agarwal', 'Vishal Gupta', 'Nandini Bose', 'Pramod Joshi', 'Alka Verma',
    'Sunil Kapoor', 'Kritika Das', 'Bharat Kumar', 'Manasi Rao', 'Lalit Singh',
    'Swara Pillai', 'Navneet Menon', 'Deepak Kwatra', 'Anjana Shukla', 'Omkar Deshmukh',
    'Kaveri Subramaniam', 'Dhruv Saxena', 'Riya Klein', 'Souvik Banerjee', 'Neelam Thakur',
    'Akshay Jadeja', 'Pooja Wadhwa', 'Ritesh Pandey', 'Shruti Malik', 'Ganesh Iyer',
    'Tanya Bhatt', 'Rahul Bhardwaj', 'Anisha Choudhary', 'Piyush Gupta', 'Sonal Jain',
    'Mehul Shah', 'Dipti Marwah', 'Aryan Kapoor', 'Sneha Patil', 'Rajat Bhatia'
  ];
  const checkins = ['09:05 AM', '09:20 AM', '09:35 AM'];
  const floaterSeats = ['F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06', 'F-07', 'F-08', 'F-09', 'F-10'];
  const assignedSeats = 3; // 3 floater seats occupied

  return names.slice(0, 40).map((name, i) => {
    const team = TEAMS[5 + (Math.floor(i / 4) % 5)];
    return {
      id: `EMP-${String(i + 41).padStart(3, '0')}`,
      name,
      initials: name.split(' ').map(p => p[0]).join('').slice(0, 2),
      seat: i < assignedSeats ? floaterSeats[i] : null,
      team: team ? team.name : 'Zeta',
      batch: 2,
      occupied: i < assignedSeats,
      status: i < 2 ? 'checked-in' : i < assignedSeats ? 'booked' : i < 8 ? 'remote' : 'on-leave',
      checkin: i < assignedSeats ? checkins[i % checkins.length] : null,
      avatarColor: `hsl(${(i * 53 + 120) % 360},58%,46%)`
    };
  });
})();

/** Holidays (ISO date strings) — no booking allowed */
const HOLIDAYS = new Set([
  '2026-03-08', // Holi (example)
]);

/** Leave history (current user) */
const LEAVE_HISTORY = [
  { id: 'L001', dates: 'Feb 20, 2026', type: 'Casual Leave', days: 1, half: '—', reason: 'Personal Work', seatAction: 'released', status: 'approved' },
  { id: 'L002', dates: 'Feb 06 – 07, 2026', type: 'Sick Leave', days: 2, half: '—', reason: 'Fever', seatAction: 'released', status: 'approved' },
  { id: 'L003', dates: 'Jan 22, 2026', type: 'Earned Leave', days: 1, half: '—', reason: 'Travel', seatAction: 'released', status: 'approved' },
  { id: 'L004', dates: 'Feb 27, 2026', type: 'Casual Leave', days: 1, half: '—', reason: 'Festival', seatAction: 'pending', status: 'pending' },
];

/* ─────────────────────────────────────────────
   CURRENT DATE / TIME STATE
──────────────────────────────────────────────── */
// System date: 2026-02-24 11:00 IST — Tuesday, Week 1
const NOW = new Date(2026, 1, 24, 11, 0, 0); // month is 0-indexed
const CURRENT_WEEK = 1; // 1 or 2
const CURRENT_DAY_IDX = 1; // 0=Mon,1=Tue,2=Wed,3=Thu,4=Fri

/**
 * Determine if booking window is open:
 * Window = [today 15:00] → [tomorrow 08:00], only if tomorrow is a working day for user's batch.
 */
function isBookingWindowOpen() {
  const hour = NOW.getHours();
  const min = NOW.getMinutes();
  const totalMin = hour * 60 + min;
  // After 15:00 today OR before 08:00 today (spillover from previous night)
  const afterOpen = totalMin >= 15 * 60;
  const beforeClose = totalMin < 8 * 60;
  // Check: is tomorrow a user working day?
  const tomorrowDayIdx = (CURRENT_DAY_IDX + 1) % 5;
  const userWorkDays = BATCH_SCHEDULE[CURRENT_USER.batch][CURRENT_WEEK];
  const tomorrowIsWorkDay = userWorkDays.includes(tomorrowDayIdx);
  return (afterOpen || beforeClose) && tomorrowIsWorkDay;
}

/* ─────────────────────────────────────────────
   INIT
──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initDate();
  initSidebarUser();
  initBookingWindowBanner();

  // ── Live data fetches (run in parallel for speed) ─────────────────
  const today = new Date().toISOString().split('T')[0];

  // Seat grid: fetch from backend, fall back to mock DESIGNATED/FLOATER arrays
  getSeatStatus(today).then(seats => {
    if (seats && seats.length) {
      renderSeatGridFromApi(seats);
    } else {
      buildSeatGrid(); // mock fallback
    }
  }).catch(() => buildSeatGrid());

  // Dashboard stats: fetch from backend, fall back to HTML values
  getDashboardStats(today).then(stats => {
    if (stats) renderDashboardStats(stats);
    else initStatCards();
  }).catch(() => initStatCards());

  // Weekly calendar: fetch from backend for both weeks
  getWeeklyCalendar(1, 'all').then(cal => {
    if (cal && cal.schedule) renderCalendarFromApi(1, cal);
    else buildCalendar(1);
  }).catch(() => buildCalendar(1));
  getWeeklyCalendar(2, 'all').then(cal => {
    if (cal && cal.schedule) renderCalendarFromApi(2, cal);
    else buildCalendar(2);
  }).catch(() => buildCalendar(2));

  // Static data (no API yet)
  initStatusList();
  initTeamGrid();
  buildLeaveHistory();
});

/* ─────────────────────────────────────────────
   DATE DISPLAY
──────────────────────────────────────────────── */
function initDate() {
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = NOW.toLocaleDateString('en-GB', opts);
  const el = document.getElementById('today-date-display');
  if (el) el.textContent = dateStr;
}

/* ─────────────────────────────────────────────
   SIDEBAR USER
──────────────────────────────────────────────── */
function initSidebarUser() {
  document.getElementById('sidebar-user-avatar').textContent = CURRENT_USER.initials;
  document.getElementById('sidebar-user-name').textContent = CURRENT_USER.name;
  document.getElementById('sidebar-user-eid').textContent = CURRENT_USER.id;
  document.getElementById('topbar-avatar').textContent = CURRENT_USER.initials;
  const rolePill = document.getElementById('sidebar-user-role');
  rolePill.textContent = CURRENT_USER.role === 'designated' ? 'Designated' : 'Non-Designated';
  rolePill.className = `role-pill ${CURRENT_USER.role === 'designated' ? 'designated' : 'floater'}`;
  document.getElementById('sidebar-team-chip').innerHTML =
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
     Team ${CURRENT_USER.team} · Batch ${CURRENT_USER.batch}`;
  document.getElementById('topbar-batch').querySelector('#batch-label').textContent =
    `Batch ${CURRENT_USER.batch} · Week ${CURRENT_WEEK}`;
}

/* ─────────────────────────────────────────────
   BOOKING WINDOW BANNER
──────────────────────────────────────────────── */
function initBookingWindowBanner() {
  const open = isBookingWindowOpen();
  const pill = document.getElementById('booking-window-pill');
  const dot = document.getElementById('bw-dot');
  const lbl = document.getElementById('bw-label');

  if (open) {
    pill.className = 'booking-window-pill bwp-open';
    dot.className = 'bw-dot bw-dot-on';
    lbl.textContent = 'Booking Open: 3 PM – 8 AM';
  } else {
    pill.className = 'booking-window-pill bwp-closed';
    dot.className = 'bw-dot bw-dot-off';
    lbl.textContent = 'Booking Closed · Opens 3:00 PM';
  }

  // Inline banner on donut card
  const ib = document.getElementById('bw-inline-banner');
  const ibTitle = document.getElementById('bwib-title');
  const ibSub = document.getElementById('bwib-sub');
  const ibBtn = document.getElementById('bwib-book-btn');
  if (!open) {
    ib.style.background = '#F8FAFC';
    ib.style.borderColor = '#E2E8F0';
    ibTitle.textContent = 'Booking Window Closed';
    ibTitle.style.color = '#475569';
    ibSub.textContent = 'Opens today at 3:00 PM';
    ibSub.style.color = '#94A3B8';
    ibBtn.style.opacity = '.5';
    ibBtn.disabled = true;
  }
}

/* ─────────────────────────────────────────────
   STAT CARDS
──────────────────────────────────────────────── */
/** Animate HTML-preloaded stat card values (mock / fallback path) */
function initStatCards() {
  document.querySelectorAll('.sc-value').forEach(el => {
    const target = parseInt(el.textContent);
    if (!isNaN(target)) animateCount(el, 0, target, 700);
  });
}

/**
 * renderDashboardStats(stats)
 * Updates stat cards using live backend data from GET /api/v1/dashboard/stats.
 *
 * Backend shape: { totalEmployees, occupiedSeats, availableSeats, leavesToday,
 *                  utilizationPercent, totalSeats, designatedOccupied,
 *                  floaterOccupied, leaveReleasedToPool, date }
 */
function renderDashboardStats(stats) {
  const map = {
    'stat-total-employees': stats.totalEmployees,
    'stat-occupied-seats': stats.occupiedSeats,
    'stat-available-seats': stats.availableSeats,
    'stat-leaves-today': stats.leavesToday,
    'stat-utilization': stats.utilizationPercent,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id)?.querySelector('.sc-value')
      || document.getElementById(id);
    if (el && val !== undefined) animateCount(el, 0, val, 700);
  });
  // Update donut chart percentage if element exists
  const donutLabel = document.getElementById('donut-center-value');
  if (donutLabel) donutLabel.textContent = `${stats.utilizationPercent}%`;
}

/**
 * renderSeatGridFromApi(seats)
 * Re-renders both seat grids using normalised backend seat data.
 *
 * Seat shape after normalisation from getSeatStatus():
 * { seatId, type:'Designated'|'Floater', zone, occupied, onLeave,
 *   occupant:string|null, team, batch, checkin, status }
 */
function renderSeatGridFromApi(seats) {
  const desGrid = document.getElementById('grid-designated');
  const fltGrid = document.getElementById('grid-floater');
  if (desGrid) desGrid.innerHTML = '';
  if (fltGrid) fltGrid.innerHTML = '';

  seats.forEach(s => {
    const tile = createSeatTile({
      seatId: s.seatId,
      type: s.type,
      zone: s.zone,
      occupied: s.occupied,
      onLeave: s.onLeave,
      isCurrentUser: s.seatId === CURRENT_USER.designatedSeat && !s.onLeave,
      occupant: s.occupant,
      team: s.team,
      batch: s.batch,
      checkin: s.checkin,
      status: s.status,
    });
    const grid = s.type === 'Floater' ? fltGrid : desGrid;
    if (grid) grid.appendChild(tile);
  });
}

/**
 * renderCalendarFromApi(week, calData)
 * Re-renders a calendar week using live backend schedule data.
 *
 * Backend shape: { week, days:[{label,date,isToday,isHoliday}],
 *   schedule:[{ id, name, initials, batch, seatType, avatarColor,
 *     days:{ 'YYYY-MM-DD': { type, seatId, checkedIn } } }] }
 *
 * Cell type mapping: DESIGNATED→designated, FLOATER→floater,
 *   LEAVE→leave, OFF_BATCH→off, HOLIDAY→holiday
 */
function renderCalendarFromApi(week, calData) {
  const thead = document.getElementById(`cal-thead-${week}`);
  const tbody = document.getElementById(`cal-tbody-${week}`);
  if (!thead || !tbody || !calData) return;

  const typeMap = {
    DESIGNATED: 'designated', FLOATER: 'floater', LEAVE: 'leave',
    OFF_BATCH: 'off', HOLIDAY: 'holiday', REMOTE: 'remote',
  };
  const cssMap = {
    designated: 'cc-des', floater: 'cc-flt', leave: 'cc-leave',
    remote: 'cc-remote', holiday: 'cc-holiday', off: 'cc-off',
  };

  // Header
  const headerRow = document.createElement('tr');
  const empTh = document.createElement('th');
  empTh.textContent = 'Employee';
  headerRow.appendChild(empTh);
  calData.days.forEach(day => {
    const th = document.createElement('th');
    th.className = day.isToday ? 'th-today' : day.isHoliday ? 'th-holiday' : '';
    const label = day.date ? day.date.slice(5).replace('-', ' ') : day.label;
    th.innerHTML = `${day.label}<br/><small>${label}</small>${day.isToday ? '<br/><span style="display:inline-block;margin-top:3px;background:#3B82F6;color:#fff;padding:1px 7px;border-radius:99px;font-size:.6rem;font-weight:700">TODAY</span>' : ''}`;
    headerRow.appendChild(th);
  });
  thead.innerHTML = '';
  thead.appendChild(headerRow);

  // Rows
  tbody.innerHTML = '';
  calData.schedule.forEach(emp => {
    const tr = document.createElement('tr');
    tr.dataset.batch = emp.batch;
    const empTd = document.createElement('td');
    const color = emp.avatarColor || `hsl(${(parseInt(emp.id.replace('EMP-', '')) * 37) % 360},62%,48%)`;
    empTd.innerHTML = `
      <div class="emp-cell">
        <div class="ec-av" style="background:${color}">${emp.initials}</div>
        <div class="ec-info">
          <span class="ec-name">${emp.name}</span>
          <span class="ec-batch">Batch ${emp.batch} · ${emp.seatType === 'DESIGNATED' ? 'Designated' : 'Non-Designated'}</span>
        </div>
      </div>`;
    tr.appendChild(empTd);

    calData.days.forEach(day => {
      const td = document.createElement('td');
      td.className = day.isToday ? 'td-today' : day.isHoliday ? 'td-holiday' : '';
      const cell = emp.days && emp.days[day.date] ? emp.days[day.date] : { type: 'OFF_BATCH', seatId: null };
      const localType = typeMap[cell.type] || 'off';
      const localCss = cssMap[localType] || 'cc-off';
      const cellLabel = cell.seatId
        ? `${cell.seatId}${cell.checkedIn ? ' ✓' : ''}`
        : (localType === 'leave' ? 'Leave' : localType === 'off' ? 'Off Batch' : localType);
      td.innerHTML = `<span class="cc ${localCss}">${cellLabel}</span>`;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function animateCount(el, from, to, duration) {
  const start = performance.now();
  function update(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(from + (to - from) * easeOut(t));
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

/* ─────────────────────────────────────────────
   TODAY'S STATUS LIST
──────────────────────────────────────────────── */
const STATUS_EMPLOYEES = [
  ...DESIGNATED_EMPLOYEES.filter(e => e.status !== null),
  ...FLOATER_EMPLOYEES.filter(e => e.occupied || e.status === 'remote')
].slice(0, 36);

function initStatusList() {
  renderStatusList(STATUS_EMPLOYEES);
}

function renderStatusList(employees) {
  const list = document.getElementById('status-list');
  if (!list) return;
  list.innerHTML = '';
  employees.forEach(emp => {
    const div = document.createElement('div');
    div.className = 'status-item';
    div.dataset.status = emp.status;
    const seatLabel = emp.seat ? `<span class="si-seat">${emp.seat}</span>` : '';
    const statusClass = {
      'checked-in': 's-ci',
      'booked': 's-booked',
      'remote': 's-remote',
      'on-leave': 's-leave'
    }[emp.status] || 's-remote';
    const statusText = {
      'checked-in': 'Checked In',
      'booked': 'Booked',
      'remote': 'Remote',
      'on-leave': 'On Leave'
    }[emp.status] || emp.status;
    div.innerHTML = `
      <div class="si-left">
        <div class="si-avatar" style="background:${emp.avatarColor}">${emp.initials}</div>
        <div class="si-info">
          <span class="si-name">${emp.name}</span>
          <span class="si-meta">${emp.team} · Batch ${emp.batch}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${seatLabel}
        <span class="si-status ${statusClass}">${statusText}</span>
      </div>
    `;
    list.appendChild(div);
  });
  updateStatusCounts(employees);
}

function updateStatusCounts(base) {
  const counts = { 'checked-in': 0, 'booked': 0, 'remote': 0, 'on-leave': 0 };
  base.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++; });
  document.getElementById('stab-ci-count').textContent = counts['checked-in'];
  document.getElementById('stab-booked-count').textContent = counts['booked'];
  document.getElementById('stab-remote-count').textContent = counts['remote'];
  document.getElementById('stab-leave-count').textContent = counts['on-leave'];
}

function filterStatus(type, btn) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = type === 'all'
    ? STATUS_EMPLOYEES
    : STATUS_EMPLOYEES.filter(e => e.status === type);
  renderStatusList(filtered);
  const total = type === 'all' ? STATUS_EMPLOYEES.length : filtered.length;
  document.getElementById('status-showing').textContent =
    type === 'all'
      ? `Showing all ${total} in-office today`
      : `Showing ${filtered.length} · ${type.replace('-', ' ')}`;
}

/* ─────────────────────────────────────────────
   TEAM GRID
──────────────────────────────────────────────── */
function initTeamGrid() {
  const grid = document.getElementById('team-grid');
  if (!grid) return;
  grid.innerHTML = '';
  TEAMS.forEach(team => {
    const tile = document.createElement('div');
    tile.className = 'team-tile';
    tile.innerHTML = `
      <div class="tt-name">${team.name}</div>
      <div class="tt-count">${team.members} members</div>
      <div class="tt-batch">
        <span class="tt-b b${team.batch}">Batch ${team.batch}</span>
      </div>
    `;
    grid.appendChild(tile);
  });
}

/* ─────────────────────────────────────────────
   SEAT GRID
──────────────────────────────────────────────── */
let currentSeat = null; // currently selected seat data

function buildSeatGrid() {
  buildDesignatedGrid();
  buildFloaterGrid();
}

function buildDesignatedGrid() {
  const grid = document.getElementById('grid-designated');
  if (!grid) return;
  grid.innerHTML = '';
  DESIGNATED_EMPLOYEES.forEach(emp => {
    const tile = createSeatTile({
      seatId: emp.seat,
      type: 'Designated',
      zone: 'Zone A',
      occupied: emp.occupied,
      onLeave: emp.onLeave,
      isCurrentUser: emp.id === CURRENT_USER.id,
      occupant: emp.occupied ? emp.name : null,
      team: emp.team,
      batch: emp.batch,
      checkin: emp.checkin,
      status: emp.status
    });
    grid.appendChild(tile);
  });
}

function buildFloaterGrid() {
  const grid = document.getElementById('grid-floater');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const seatId = `F-${String(i).padStart(2, '0')}`;
    const occupant = FLOATER_EMPLOYEES[i - 1];
    const isOcc = occupant && occupant.occupied;
    const tile = createSeatTile({
      seatId,
      type: 'Floater',
      zone: 'Zone B',
      occupied: !!isOcc,
      onLeave: false,
      isCurrentUser: false,
      occupant: isOcc ? occupant.name : null,
      team: isOcc ? occupant.team : null,
      batch: isOcc ? occupant.batch : null,
      checkin: isOcc ? occupant.checkin : null,
      status: isOcc ? occupant.status : 'free'
    });
    grid.appendChild(tile);
  }
}

function createSeatTile(data) {
  const { seatId, type, zone, occupied, onLeave, isCurrentUser, occupant, team, batch, checkin } = data;

  let cls, pipCls;
  if (isCurrentUser) { cls = 'tile-mine'; pipCls = 'pip-mine'; }
  else if (onLeave) { cls = 'tile-released'; pipCls = 'pip-released'; }
  else if (occupied) { cls = type === 'Designated' ? 'tile-des-occ' : 'tile-flt-occ'; pipCls = 'pip-occ'; }
  else { cls = type === 'Designated' ? 'tile-des-free' : 'tile-flt-free'; pipCls = 'pip-free'; }

  const tile = document.createElement('div');
  tile.className = `seat-tile ${cls}`;
  tile.setAttribute('role', 'listitem');
  tile.setAttribute('tabindex', '0');
  tile.setAttribute('aria-label', `${seatId} — ${occupied ? 'Occupied' : 'Available'}`);
  tile.dataset.seatId = seatId;
  tile.dataset.type = type;
  tile.dataset.zone = zone;
  tile.dataset.occupied = occupied;
  tile.dataset.isCurrentUser = isCurrentUser;

  tile.innerHTML = `
    <span class="seat-status-pip ${pipCls}"></span>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" opacity=".7">
      <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2v3H5v2h14v-2h-2v-3a2 2 0 0 0 2-2z"/>
    </svg>
    <span class="seat-label">${seatId}</span>
  `;

  const seatData = { seatId, type, zone, occupied, onLeave, isCurrentUser, occupant, team, batch, checkin };

  tile.addEventListener('click', () => showSeatDetail(seatData, tile));
  tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSeatDetail(seatData, tile); } });

  return tile;
}

function showSeatDetail(data, tile) {
  currentSeat = data;

  // Deselect all
  document.querySelectorAll('.seat-tile').forEach(t => t.style.boxShadow = '');
  if (tile) tile.style.boxShadow = '0 0 0 3px #3B82F6, 0 4px 14px rgba(59,130,246,.3)';

  const panel = document.getElementById('seat-detail-card');
  document.getElementById('sd-title').textContent = `Seat ${data.seatId}`;
  document.getElementById('sd-type').textContent = data.type;
  document.getElementById('sd-zone').textContent = data.zone;
  document.getElementById('sd-occupant').textContent = data.occupant || '—';
  document.getElementById('sd-team').textContent = data.team || '—';
  document.getElementById('sd-batch').textContent = data.batch ? `Batch ${data.batch}` : '—';
  document.getElementById('sd-checkin').textContent = data.checkin || '—';
  document.getElementById('sd-week').textContent = `Week ${CURRENT_WEEK}`;

  const statusEl = document.getElementById('sd-status');
  if (data.isCurrentUser) { statusEl.textContent = '🟣 Your Seat'; }
  else if (data.onLeave) { statusEl.textContent = '🟡 Leave — Released'; }
  else if (data.occupied) { statusEl.textContent = '🔴 Occupied'; }
  else { statusEl.textContent = '🟢 Available'; }

  const bookBtn = document.getElementById('sd-book-btn');
  if (data.occupied && !data.onLeave) {
    bookBtn.disabled = true;
    bookBtn.textContent = 'Unavailable';
    bookBtn.style.opacity = '.5';
  } else {
    bookBtn.disabled = false;
    bookBtn.textContent = 'Book This Seat';
    bookBtn.style.opacity = '1';
    bookBtn.onclick = () => openBookingModal(data);
  }

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeSeatDetail() {
  document.getElementById('seat-detail-card').style.display = 'none';
  document.querySelectorAll('.seat-tile').forEach(t => t.style.boxShadow = '');
  currentSeat = null;
}

/* ─── Seat Filter ─── */
function filterSeats(type, btn) {
  document.querySelectorAll('.pill-btn[onclick^="filterSeats"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const allTiles = document.querySelectorAll('.seat-tile');
  allTiles.forEach(tile => {
    const occ = tile.dataset.occupied === 'true';
    const tileType = tile.dataset.type;
    let show = true;
    if (type === 'available') show = !occ;
    else if (type === 'occupied') show = occ;
    else if (type === 'designated') show = tileType === 'Designated';
    else if (type === 'floater') show = tileType === 'Floater';
    tile.style.display = show ? '' : 'none';
  });
}

/* ─────────────────────────────────────────────
   WEEKLY CALENDAR
──────────────────────────────────────────────── */
const WEEK1_DAYS = [
  { label: 'Mon', date: 'Feb 23', idx: 0, isToday: false, isHoliday: false },
  { label: 'Tue', date: 'Feb 24', idx: 1, isToday: true, isHoliday: false },
  { label: 'Wed', date: 'Feb 25', idx: 2, isToday: false, isHoliday: false },
  { label: 'Thu', date: 'Feb 26', idx: 3, isToday: false, isHoliday: false },
  { label: 'Fri', date: 'Feb 27', idx: 4, isToday: false, isHoliday: false },
];
const WEEK2_DAYS = [
  { label: 'Mon', date: 'Mar 02', idx: 0, isToday: false, isHoliday: false },
  { label: 'Tue', date: 'Mar 03', idx: 1, isToday: false, isHoliday: false },
  { label: 'Wed', date: 'Mar 04', idx: 2, isToday: false, isHoliday: false },
  { label: 'Thu', date: 'Mar 05', idx: 3, isToday: false, isHoliday: false },
  { label: 'Fri', date: 'Mar 06', idx: 4, isToday: false, isHoliday: false },
];

/** Get calendar data for an employee on a given day in a given week */
function getCalCell(emp, dayIdx, week) {
  const isDesignated = emp.seat && emp.seat.startsWith('D-');
  const workDays = BATCH_SCHEDULE[emp.batch][week];
  const isWorkDay = workDays.includes(dayIdx);

  if (!isWorkDay) return { type: 'off', label: 'Off Batch' };

  // Simulate leave for some employees on certain days
  const leaveMap = {
    'EMP-004': { 1: [4], 2: [1] },
    'EMP-006': { 2: [2] },
    'EMP-033': { 1: [1] },
  };
  if (leaveMap[emp.id] && leaveMap[emp.id][week] && leaveMap[emp.id][week].includes(dayIdx)) {
    return { type: 'leave', label: 'Leave' };
  }

  if (isDesignated) {
    const isChecked = week === 1 && (dayIdx === 0 || dayIdx === 1);
    return { type: 'designated', label: emp.seat + (isChecked ? ' ✓' : '') };
  } else {
    // Floater: simulate seat assignment
    const floaterSeats = ['F-01', 'F-02', 'F-03', 'F-05', 'F-07', 'F-08', 'F-09'];
    const seat = floaterSeats[(parseInt(emp.id.replace('EMP-', '')) + dayIdx + week) % floaterSeats.length];
    const isChecked = week === 1 && dayIdx === 1;
    return { type: 'floater', label: seat + (isChecked ? ' ✓' : '') };
  }
}

let calBatchFilter = 'all';

function buildCalendar(week) {
  const days = week === 1 ? WEEK1_DAYS : WEEK2_DAYS;
  const thead = document.getElementById(`cal-thead-${week}`);
  const tbody = document.getElementById(`cal-tbody-${week}`);
  if (!thead || !tbody) return;

  // Build header
  const headerRow = document.createElement('tr');
  const empTh = document.createElement('th');
  empTh.textContent = 'Employee';
  headerRow.appendChild(empTh);
  days.forEach(day => {
    const th = document.createElement('th');
    th.className = day.isToday ? 'th-today' : day.isHoliday ? 'th-holiday' : '';
    th.innerHTML = `${day.label}<br/><small>${day.date}</small>${day.isToday ? '<br/><span style="display:inline-block;margin-top:3px;background:#3B82F6;color:#fff;padding:1px 7px;border-radius:99px;font-size:.6rem;font-weight:700">TODAY</span>' : ''}`;
    headerRow.appendChild(th);
  });
  thead.innerHTML = '';
  thead.appendChild(headerRow);

  // Build body: sample 14 employees (mix of both batches)
  const sampleEmp = [
    ...DESIGNATED_EMPLOYEES.slice(0, 7),
    ...FLOATER_EMPLOYEES.slice(0, 7)
  ];

  tbody.innerHTML = '';
  sampleEmp.forEach(emp => {
    const tr = document.createElement('tr');
    tr.dataset.batch = emp.batch;

    // Employee cell
    const empTd = document.createElement('td');
    empTd.innerHTML = `
      <div class="emp-cell">
        <div class="ec-av" style="background:${emp.avatarColor}">${emp.initials}</div>
        <div class="ec-info">
          <span class="ec-name">${emp.name}</span>
          <span class="ec-batch">Batch ${emp.batch} · ${emp.seat && emp.seat.startsWith('D-') ? 'Designated' : 'Non-Designated'}</span>
        </div>
      </div>
    `;
    tr.appendChild(empTd);

    // Day cells
    days.forEach(day => {
      const td = document.createElement('td');
      td.className = day.isToday ? 'td-today' : day.isHoliday ? 'td-holiday' : '';
      const cell = getCalCell(emp, day.idx, week);

      const typeMap = {
        'designated': 'cc-des',
        'floater': 'cc-flt',
        'leave': 'cc-leave',
        'remote': 'cc-remote',
        'holiday': 'cc-holiday',
        'off': 'cc-off'
      };
      td.innerHTML = `<span class="cc ${typeMap[cell.type] || 'cc-off'}">${cell.label}</span>`;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function switchWeek(num) {
  document.getElementById('cal-week-1').style.display = num === 1 ? 'block' : 'none';
  document.getElementById('cal-week-2').style.display = num === 2 ? 'block' : 'none';
  document.getElementById('wb-1').className = num === 1 ? 'week-btn active' : 'week-btn';
  document.getElementById('wb-2').className = num === 2 ? 'week-btn active' : 'week-btn';
}

function filterCalBatch(batch, btn) {
  document.querySelectorAll('.cal-batch-filter .pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  calBatchFilter = batch;
  document.querySelectorAll('#cal-tbody-1 tr, #cal-tbody-2 tr').forEach(tr => {
    tr.style.display = (batch === 'all' || tr.dataset.batch === batch) ? '' : 'none';
  });
}

/* ─────────────────────────────────────────────
   LEAVE HISTORY TABLE
──────────────────────────────────────────────── */
function buildLeaveHistory(filterStatus = 'all') {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = filterStatus === 'all'
    ? LEAVE_HISTORY
    : LEAVE_HISTORY.filter(l => l.status === filterStatus);

  rows.forEach(leave => {
    const tr = document.createElement('tr');
    const seatActionBadge = leave.seatAction === 'released'
      ? `<span class="badge b-released">D-12 → Floater</span>`
      : leave.seatAction === 'pending'
        ? `<span class="badge b-pending-rel">D-12 → Pending</span>`
        : `<span class="badge b-na">N/A</span>`;
    const statusBadge = {
      approved: '<span class="badge b-approved">Approved</span>',
      pending: '<span class="badge b-pending">Pending</span>',
      rejected: '<span class="badge b-rejected">Rejected</span>'
    }[leave.status];
    const canCancel = leave.status === 'pending';

    tr.innerHTML = `
      <td>${leave.dates}</td>
      <td>${leave.type}</td>
      <td>${leave.days}</td>
      <td>${leave.half || '—'}</td>
      <td>${leave.reason}</td>
      <td>${seatActionBadge}</td>
      <td>${statusBadge}</td>
      <td>${canCancel ? `<span class="hist-action" onclick="cancelLeave('${leave.id}')">Cancel</span>` : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterHistory(val) { buildLeaveHistory(val); }

function cancelLeave(id) {
  const idx = LEAVE_HISTORY.findIndex(l => l.id === id);
  if (idx > -1) {
    LEAVE_HISTORY[idx].status = 'rejected';
    LEAVE_HISTORY[idx].seatAction = 'na';
    buildLeaveHistory();
    showToast('Leave Cancelled', 'Your leave request has been cancelled and the seat returned.', 'info');
  }
}

/* ─────────────────────────────────────────────
   LEAVE FORM
──────────────────────────────────────────────── */
function submitLeave(e) {
  e.preventDefault();
  const leaveTypeEl = document.getElementById('f-leave-type');
  const leaveType = leaveTypeEl.value;
  if (!leaveType) { showToast('Missing Info', 'Please select a leave type.', 'warn'); return; }

  const startDate = document.getElementById('f-start').value;
  const halfEl = document.getElementById('f-half');
  const halfVal = halfEl.value === 'no' ? null : halfEl.options[halfEl.selectedIndex].text;
  const reason = document.getElementById('f-reason').value || '';

  // ── Calls applyLeave() → real API when API_CONFIG.enabled = true, mock otherwise ──
  applyLeave({
    employeeId: CURRENT_USER.id,
    // TODO: Map leaveTypeEl.value to backend enum (e.g. 'CASUAL', 'SICK', 'EARNED', 'COMP_OFF')
    leaveType: leaveTypeEl.options[leaveTypeEl.selectedIndex].text,
    startDate,
    // TODO: Wire endDate field when multi-day leave picker is added
    endDate: startDate,
    halfDay: !!halfVal,
    halfDaySlot: halfVal || null,
    reason,
    releaseSeat: CURRENT_USER.role === 'designated',
  }).then(result => {
    if (result && (result.success || result.status === 'PENDING')) {
      // Update local LEAVE_HISTORY so UI reflects immediately without a reload
      LEAVE_HISTORY.unshift({
        id: result.leaveId || `L${String(LEAVE_HISTORY.length + 1).padStart(3, '0')}`,
        dates: startDate,
        type: leaveTypeEl.options[leaveTypeEl.selectedIndex].text,
        days: 1,
        half: halfVal || '—',
        reason: reason || '—',
        seatAction: result.seatReleased ? 'pending' : 'na',
        status: 'pending',
      });

      document.getElementById('leave-form').reset();
      buildLeaveHistory();

      const seatMsg = result.seatReleased
        ? `Seat ${result.releasedSeatId || CURRENT_USER.designatedSeat} will be released to the floater pool.`
        : 'Your leave request is awaiting approval.';
      showToast('Leave Submitted!', seatMsg, 'success');
    } else {
      const errMsg = result?.error === 'LEAVE_OVERLAP'
        ? 'You already have leave applied for these dates.'
        : result?.error === 'INVALID_LEAVE_TYPE'
          ? 'Invalid leave type selected.'
          : result?.message || 'Submission failed. Please try again.';
      showToast('Submission Failed', errMsg, 'err');
    }
  });
}

function resetLeaveForm() { document.getElementById('leave-form').reset(); }

/* ─────────────────────────────────────────────
   BOOKING MODAL
──────────────────────────────────────────────── */
function openBookingModal(seatData) {
  const backdrop = document.getElementById('modal-backdrop');

  // Determine seat to book
  let seat = seatData;
  if (!seat) {
    seat = CURRENT_USER.role === 'designated'
      ? { seatId: CURRENT_USER.designatedSeat, type: 'Designated', zone: 'Zone A' }
      : null;
  }

  // Show/hide floater selector
  const sel = document.getElementById('modal-seat-selector');
  if (CURRENT_USER.role !== 'designated') {
    sel.style.display = 'flex';
  } else {
    sel.style.display = 'none';
  }

  // Fill details
  const nextDay = new Date(NOW);
  nextDay.setDate(nextDay.getDate() + 1);
  const dateStr = nextDay.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  document.getElementById('md-employee').textContent = CURRENT_USER.name;
  document.getElementById('md-empid').textContent = CURRENT_USER.id;
  document.getElementById('md-seat').textContent = seat ? seat.seatId : '— Select above';
  document.getElementById('md-zone').textContent = seat ? `${seat.zone} — Level 3` : '—';
  document.getElementById('md-date').textContent = dateStr;
  document.getElementById('md-batch').textContent = `Batch ${CURRENT_USER.batch} · Week ${CURRENT_WEEK}`;

  const typeEl = document.getElementById('md-type');
  if (seat) {
    const chipCls = seat.type === 'Designated' ? 'type-des' : 'type-flt';
    typeEl.innerHTML = `<span class="type-chip ${chipCls}">${seat.type}</span>`;
  } else {
    typeEl.textContent = 'Floater';
  }

  const bwOpen = isBookingWindowOpen();
  document.getElementById('md-window').textContent = bwOpen ? '3:00 PM – 8:00 AM ✅' : 'Window Closed ⛔';

  // Confirm button state
  const confirmBtn = document.getElementById('modal-confirm-btn');
  confirmBtn.disabled = !bwOpen;
  if (!bwOpen) {
    document.getElementById('modal-notice').style.background = '#FEF2F2';
    document.getElementById('modal-notice').style.borderColor = '#FCA5A5';
    document.getElementById('modal-notice').querySelector('span').innerHTML =
      'Booking window is currently <strong>closed</strong>. You can only book between <strong>3:00 PM – 8:00 AM</strong>.';
  }

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.body.style.overflow = '';
}

function updateModalSeat() {
  const sel = document.getElementById('modal-seat-sel');
  const seatId = sel.value;
  if (seatId) {
    document.getElementById('md-seat').textContent = seatId;
    document.getElementById('md-zone').textContent = 'Zone B — Level 3';
    document.getElementById('md-type').innerHTML = `<span class="type-chip type-flt">Floater</span>`;
  }
}

function confirmBooking() {
  const btn = document.getElementById('modal-confirm-btn');
  const seatId = document.getElementById('md-seat').textContent;
  const dateText = document.getElementById('md-date').textContent;

  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Confirming…`;

  // TODO: Replace dateText with ISO date once backend date picker is wired in
  const isoDate = (() => {
    const d = new Date(NOW);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  // ── Calls bookSeat() → real API when API_CONFIG.enabled = true, mock otherwise ──
  bookSeat({
    employeeId: CURRENT_USER.id,
    seatId,
    date: isoDate,
    batch: CURRENT_USER.batch,
    week: CURRENT_WEEK,
  }).then(result => {
    closeBookingModal();
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Confirm Booking`;
    btn.disabled = false;

    if (result && (result.success || result.status === 'CONFIRMED')) {
      // Refresh seat grid from backend after successful booking
      const today = new Date().toISOString().split('T')[0];
      getSeatStatus(today).then(seats => { if (seats && seats.length) renderSeatGridFromApi(seats); });
      showToast('Booking Confirmed!', `Seat ${seatId} booked for ${dateText}`, 'success');
    } else {
      // Map backend error codes to user-friendly messages
      const errMsg = result?.error === 'BOOKING_WINDOW_CLOSED'
        ? 'Booking window is closed. Try between 3 PM and 8 AM.'
        : result?.error === 'SEAT_ALREADY_BOOKED'
          ? `Seat ${seatId} is already booked. Please choose another.`
          : result?.message || 'Booking failed. Please try again.';
      showToast('Booking Failed', errMsg, 'err');
    }
  });
}

/* ─────────────────────────────────────────────
   NAVIGATION
──────────────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  seats: 'Seat Layout',
  calendar: 'Weekly Calendar',
  leave: 'Leave Management'
};

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  document.getElementById(`page-${name}`)?.classList.add('active');
  const navEl = document.getElementById(`nav-${name}`);
  if (navEl) { navEl.classList.add('active'); navEl.setAttribute('aria-current', 'page'); }
  document.getElementById('page-title').textContent = PAGE_TITLES[name] || name;
  // Scroll main to top
  document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─────────────────────────────────────────────
   TOAST NOTIFICATION
──────────────────────────────────────────────── */
function showToast(title, message, type = 'success') {
  const stack = document.getElementById('toast-stack');
  const iconMap = {
    success: { cls: 'ti-green', svg: `<polyline points="20 6 9 17 4 12"/>` },
    warn: { cls: 'ti-amber', svg: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>` },
    err: { cls: 'ti-red', svg: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>` },
    info: { cls: 'ti-blue', svg: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>` }
  };
  const icon = iconMap[type] || iconMap.success;
  const typeClass = { success: '', warn: 't-warn', err: 't-err', info: 't-info' }[type] || '';

  const item = document.createElement('div');
  item.className = `toast-item ${typeClass}`;
  item.innerHTML = `
    <div class="toast-tp-icon ${icon.cls}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon.svg}</svg>
    </div>
    <div>
      <div class="toast-t">${title}</div>
      <div class="toast-m">${message}</div>
    </div>
  `;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

/* ─────────────────────────────────────────────
   KEYBOARD SHORTCUTS
──────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeBookingModal(); closeSeatDetail(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); openBookingModal(null); }
});

/* ─────────────────────────────────────────────
   NOTIFICATION DOT DEMO
──────────────────────────────────────────────── */
document.getElementById('notif-btn')?.addEventListener('click', () => {
  showToast('Notifications', '1 pending leave · Booking window opens at 3 PM', 'info');
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = 'none';
});
