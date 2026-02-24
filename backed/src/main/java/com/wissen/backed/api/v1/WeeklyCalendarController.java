package com.wissen.backed.api.v1;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Weekly calendar endpoint.
 * GET /api/v1/calendar/weekly?week=1|2&batch=1|2|all
 *
 * Returns per-employee daily schedule cells for one business week.
 * Cell types: DESIGNATED | FLOATER | LEAVE | OFF_BATCH | HOLIDAY
 *
 * TODO: Replace buildMockSchedule() with CalendarService / ScheduleRepository
 *       once JPA entities (Employee, Leave, BatchSchedule) are wired in.
 */
@RestController
@RequestMapping("/api/v1/calendar")
public class WeeklyCalendarController {

    // ── Cell-type constants (aligns with frontend cc-* CSS classes) ──
    private static final String DESIGNATED = "DESIGNATED";
    private static final String FLOATER    = "FLOATER";
    private static final String LEAVE      = "OFF_BATCH";   // off-batch day
    private static final String OFF_BATCH  = "OFF_BATCH";
    private static final String HOLIDAY    = "HOLIDAY";
    private static final String ON_LEAVE   = "LEAVE";

    // ── Batch schedule rules ─────────────────────────────────────────
    // dayIndex: 0=Mon,1=Tue,2=Wed,3=Thu,4=Fri
    // Batch 1: Week 1 → Mon-Wed (0,1,2) ; Week 2 → Thu-Fri (3,4)
    // Batch 2: Week 1 → Thu-Fri (3,4)   ; Week 2 → Mon-Wed (0,1,2)
    private static final Map<Integer, Map<Integer, int[]>> BATCH_SCHEDULE = Map.of(
        1, Map.of(1, new int[]{0,1,2}, 2, new int[]{3,4}),
        2, Map.of(1, new int[]{3,4},   2, new int[]{0,1,2})
    );

    // ── Week date ranges (static for mock; TODO: compute dynamically) ──
    private static final Map<Integer, String[]> WEEK_DATES = Map.of(
        1, new String[]{"2026-02-23","2026-02-24","2026-02-25","2026-02-26","2026-02-27"},
        2, new String[]{"2026-03-02","2026-03-03","2026-03-04","2026-03-05","2026-03-06"}
    );
    private static final String[] DAY_LABELS = {"Mon","Tue","Wed","Thu","Fri"};

    // ── Known leave days per employee (employeeId → week → day-indices) ──
    private static final Map<String, Map<Integer, int[]>> LEAVE_MAP = Map.of(
        "EMP-004", Map.of(1, new int[]{4}, 2, new int[]{1}),
        "EMP-006", Map.of(2, new int[]{2}),
        "EMP-033", Map.of(1, new int[]{1})
    );

    // ── Sample employees for the calendar (7 designated + 7 floaters) ──
    private record EmpSummary(
        String id, String name, String initials,
        int batch, String seatType, String assignedSeat,
        String team, String avatarColor
    ) {}

    private static final List<EmpSummary> SAMPLE_EMPLOYEES = List.of(
        new EmpSummary("EMP-001","Raj Patel",        "RP", 1, "DESIGNATED", "D-01", "Alpha",   "#3B82F6"),
        new EmpSummary("EMP-002","Arjun Singh",      "AS", 1, "DESIGNATED", "D-02", "Alpha",   "#8B5CF6"),
        new EmpSummary("EMP-003","Priya Sharma",     "PS", 1, "DESIGNATED", "D-03", "Beta",    "#EC4899"),
        new EmpSummary("EMP-004","Vikram Rao",       "VR", 1, "DESIGNATED", "D-04", "Beta",    "#F59E0B"),
        new EmpSummary("EMP-005","Anita Joshi",      "AJ", 1, "DESIGNATED", "D-05", "Gamma",   "#10B981"),
        new EmpSummary("EMP-006","Suresh Iyer",      "SI", 2, "DESIGNATED", "D-06", "Zeta",    "#EF4444"),
        new EmpSummary("EMP-007","Kavita Nair",      "KN", 2, "DESIGNATED", "D-07", "Zeta",    "#6366F1"),
        new EmpSummary("EMP-041","Ishaan Mehta",     "IM", 2, "FLOATER",    null,   "Eta",     "#F97316"),
        new EmpSummary("EMP-042","Priyanka Roy",     "PR", 2, "FLOATER",    null,   "Eta",     "#14B8A6"),
        new EmpSummary("EMP-043","Siddharth Nair",   "SN", 2, "FLOATER",    null,   "Theta",   "#A855F7"),
        new EmpSummary("EMP-044","Tanvi Sharma",     "TS", 1, "FLOATER",    null,   "Epsilon", "#0EA5E9"),
        new EmpSummary("EMP-045","Yash Patel",       "YP", 1, "FLOATER",    null,   "Epsilon", "#22C55E"),
        new EmpSummary("EMP-046","Ritu Agarwal",     "RA", 2, "FLOATER",    null,   "Iota",    "#F43F5E"),
        new EmpSummary("EMP-047","Vishal Gupta",     "VG", 2, "FLOATER",    null,   "Kappa",   "#84CC16")
    );

    // ── Response records ─────────────────────────────────────────────

    record DayHeader(String label, String date, boolean isToday, boolean isHoliday) {}

    record DayCell(String type, String seatId, boolean checkedIn) {}

    record EmployeeSchedule(
        String id, String name, String initials,
        int batch, String seatType, String team, String avatarColor,
        Map<String, DayCell> days   // keyed by ISO date string
    ) {}

    record CalendarResponse(
        int week, String batchFilter,
        Map<String, String> dateRange,
        List<DayHeader> days,
        List<EmployeeSchedule> schedule
    ) {}

    // ── Floater pool seats for mock assignment ───────────────────────
    private static final String[] FLOATER_SEATS = {
        "F-01","F-02","F-03","F-05","F-07","F-08","F-09"
    };

    // ── Endpoint ─────────────────────────────────────────────────────

    /**
     * GET /api/v1/calendar/weekly?week=1|2&batch=1|2|all
     *
     * TODO: Connect to CalendarService.getWeeklySchedule(week, batch) once
     *       Employee and Leave entities + repositories are implemented.
     */
    @GetMapping("/weekly")
    public ResponseEntity<CalendarResponse> getWeekly(
            @RequestParam(defaultValue = "1") int week,
            @RequestParam(defaultValue = "all") String batch) {

        if (week < 1 || week > 2) {
            return ResponseEntity.badRequest().build();
        }

        String[] dates = WEEK_DATES.get(week);

        // Build day headers
        List<DayHeader> dayHeaders = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            boolean isToday = dates[i].equals("2026-02-24"); // TODO: use LocalDate.now()
            dayHeaders.add(new DayHeader(DAY_LABELS[i], dates[i], isToday, false));
        }

        // Build per-employee schedules, filtered by batch
        List<EmployeeSchedule> schedules = new ArrayList<>();
        for (EmpSummary emp : SAMPLE_EMPLOYEES) {
            if (!batch.equalsIgnoreCase("all") && !batch.equals(String.valueOf(emp.batch()))) {
                continue;
            }

            int[] workDays = BATCH_SCHEDULE.get(emp.batch()).get(week);
            Map<String, DayCell> dayCells = new LinkedHashMap<>();

            for (int dayIdx = 0; dayIdx < 5; dayIdx++) {
                String date = dates[dayIdx];
                DayCell cell = buildCell(emp, dayIdx, week, workDays, date);
                dayCells.put(date, cell);
            }

            schedules.add(new EmployeeSchedule(
                emp.id(), emp.name(), emp.initials(),
                emp.batch(), emp.seatType(), emp.team(), emp.avatarColor(),
                dayCells
            ));
        }

        Map<String, String> dateRange = new LinkedHashMap<>();
        dateRange.put("from", dates[0]);
        dateRange.put("to",   dates[4]);

        return ResponseEntity.ok(new CalendarResponse(
            week, batch, dateRange, dayHeaders, schedules
        ));
    }

    // ── Cell builder ─────────────────────────────────────────────────

    private DayCell buildCell(EmpSummary emp, int dayIdx, int week,
                              int[] workDays, String date) {
        // Check if this is a working day for this employee's batch
        boolean isWorkDay = contains(workDays, dayIdx);
        if (!isWorkDay) {
            return new DayCell(OFF_BATCH, null, false);
        }

        // Check leave
        int[] leaveDays = null;
        if (LEAVE_MAP.containsKey(emp.id()) && LEAVE_MAP.get(emp.id()).containsKey(week)) {
            leaveDays = LEAVE_MAP.get(emp.id()).get(week);
        }
        if (leaveDays != null && contains(leaveDays, dayIdx)) {
            return new DayCell(ON_LEAVE, null, false);
        }

        // Simulate check-in for today/yesterday (week 1 Mon+Tue)
        boolean checkedIn = week == 1 && (dayIdx == 0 || dayIdx == 1);

        if ("DESIGNATED".equals(emp.seatType())) {
            return new DayCell(DESIGNATED, emp.assignedSeat(), checkedIn);
        } else {
            // Floater: deterministically assign a seat from the pool
            int seatIdx = (Integer.parseInt(emp.id().replace("EMP-", "")) + dayIdx + week)
                          % FLOATER_SEATS.length;
            return new DayCell(FLOATER, FLOATER_SEATS[seatIdx], checkedIn && dayIdx == 1);
        }
    }

    private boolean contains(int[] arr, int val) {
        for (int v : arr) if (v == val) return true;
        return false;
    }
}
