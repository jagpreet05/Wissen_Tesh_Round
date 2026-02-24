package com.wissen.backed.api.v1;

import com.wissen.backed.SeatStateStore;
import com.wissen.backed.SeatStateStore.Employee;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

/**
 * Weekly calendar endpoint.
 * GET /api/v1/calendar/weekly?week=1|2&batch=1|2|all
 *
 * Returns per-employee daily schedule cells for one business week.
 * Cell types: DESIGNATED | FLOATER | LEAVE | OFF_BATCH | HOLIDAY
 *
 * Now reads leave data dynamically from SeatStateStore.
 * Week dates are computed dynamically from LocalDate.now().
 * isToday flag is set against actual current date.
 *
 * Batch schedule rules:
 *   Batch 1: Week 1 → Mon-Wed, Week 2 → Thu-Fri
 *   Batch 2: Week 1 → Thu-Fri, Week 2 → Mon-Wed
 */
@RestController
@RequestMapping("/api/v1/calendar")
public class WeeklyCalendarController {

    private static final String DESIGNATED = "DESIGNATED";
    private static final String FLOATER    = "FLOATER";
    private static final String OFF_BATCH  = "OFF_BATCH";
    private static final String ON_LEAVE   = "LEAVE";

    private static final Map<Integer, Map<Integer, int[]>> BATCH_SCHEDULE = Map.of(
        1, Map.of(1, new int[]{0,1,2}, 2, new int[]{3,4}),
        2, Map.of(1, new int[]{3,4},   2, new int[]{0,1,2})
    );

    private static final String[] DAY_LABELS = {"Mon","Tue","Wed","Thu","Fri"};

    private static final String[] FLOATER_SEATS = {
        "F-01","F-02","F-03","F-05","F-07","F-08","F-09"
    };

    record DayHeader(String label, String date, boolean isToday, boolean isHoliday) {}
    record DayCell(String type, String seatId, boolean checkedIn) {}
    record EmployeeSchedule(
        String id, String name, String initials,
        int batch, String seatType, String team, String avatarColor,
        Map<String, DayCell> days
    ) {}
    record CalendarResponse(
        int week, String batchFilter,
        Map<String, String> dateRange,
        List<DayHeader> days,
        List<EmployeeSchedule> schedule
    ) {}

    private final SeatStateStore store;
    public WeeklyCalendarController(SeatStateStore store) { this.store = store; }

    @GetMapping("/weekly")
    public ResponseEntity<CalendarResponse> getWeekly(
            @RequestParam(defaultValue = "1") int week,
            @RequestParam(defaultValue = "all") String batch) {

        if (week < 1 || week > 2) return ResponseEntity.badRequest().build();

        // ── Compute the two calendar weeks dynamically ──────────────────
        // Week 1 = the Monday of the current ISO week (or the next Monday if today is weekend)
        // Week 2 = Week 1 + 7 days
        LocalDate today = LocalDate.now(SeatStateStore.IST);
        LocalDate week1Start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekStart  = week == 1 ? week1Start : week1Start.plusWeeks(1);

        String[] dates = new String[5];
        for (int d = 0; d < 5; d++) dates[d] = weekStart.plusDays(d).toString();

        // ── Day headers ─────────────────────────────────────────────────
        List<DayHeader> dayHeaders = new ArrayList<>();
        for (int d = 0; d < 5; d++) {
            boolean isToday = dates[d].equals(today.toString());
            dayHeaders.add(new DayHeader(DAY_LABELS[d], dates[d], isToday, false));
        }

        // ── Per-employee schedules ──────────────────────────────────────
        // Use a representative subset of 14 employees (7 designated + 7 floaters)
        List<Employee> sample = buildSample();
        List<EmployeeSchedule> schedules = new ArrayList<>();

        for (Employee emp : sample) {
            if (!batch.equalsIgnoreCase("all") && !batch.equals(String.valueOf(emp.batch()))) {
                continue;
            }

            int[] workDays = BATCH_SCHEDULE.get(emp.batch()).get(week);
            Map<String, DayCell> dayCells = new LinkedHashMap<>();

            for (int dayIdx = 0; dayIdx < 5; dayIdx++) {
                LocalDate cellDate = LocalDate.parse(dates[dayIdx]);
                DayCell cell = buildCell(emp, dayIdx, week, workDays, cellDate);
                dayCells.put(dates[dayIdx], cell);
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

        return ResponseEntity.ok(new CalendarResponse(week, batch, dateRange, dayHeaders, schedules));
    }

    // ── Cell builder — reads leave from SeatStateStore ─────────────────────

    private DayCell buildCell(Employee emp, int dayIdx, int week, int[] workDays, LocalDate cellDate) {
        boolean isWorkDay = contains(workDays, dayIdx);
        if (!isWorkDay) return new DayCell(OFF_BATCH, null, false);

        // Check live leave from store
        if (store.isOnLeave(emp.id(), cellDate)) {
            return new DayCell(ON_LEAVE, null, false);
        }

        // Simulate check-in for past days (Mon + Tue of week 1, relative to today)
        LocalDate today = LocalDate.now(SeatStateStore.IST);
        boolean checkedIn = !cellDate.isAfter(today);

        if ("DESIGNATED".equals(emp.seatType())) {
            return new DayCell(DESIGNATED, emp.designatedSeat(), checkedIn);
        } else {
            int seatIdx = (Integer.parseInt(emp.id().replace("EMP-","")) + dayIdx + week)
                          % FLOATER_SEATS.length;
            return new DayCell(FLOATER, FLOATER_SEATS[seatIdx], checkedIn && dayIdx <= 1);
        }
    }

    // ── Sample employees (7 designated + 7 floaters) ───────────────────────
    // Pulled from the store so names stay consistent with SeatStatusController.
    private List<Employee> buildSample() {
        String[] ids = {
            "EMP-001","EMP-002","EMP-003","EMP-004","EMP-005","EMP-006","EMP-007",
            "EMP-041","EMP-042","EMP-043","EMP-044","EMP-045","EMP-046","EMP-047"
        };
        List<Employee> list = new ArrayList<>();
        for (String id : ids) store.findEmployee(id).ifPresent(list::add);
        return list;
    }

    private boolean contains(int[] arr, int val) {
        for (int v : arr) if (v == val) return true;
        return false;
    }
}
