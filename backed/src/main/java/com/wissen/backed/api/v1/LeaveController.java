package com.wissen.backed.api.v1;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Leave application and cancellation endpoints.
 *
 * POST /api/v1/leaves/apply          — apply for leave
 * PUT  /api/v1/leaves/{leaveId}/cancel — cancel a pending leave
 *
 * TODO: Replace in-memory stores with LeaveRepository (JPA)
 * TODO: Replace DESIGNATED_SEATS map with EmployeeRepository.findById(id)
 */
@RestController
@RequestMapping("/api/v1/leaves")
public class LeaveController {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // ── Leave ID counter ──────────────────────────────────────────────
    private static final AtomicInteger LEAVE_COUNTER = new AtomicInteger(100);

    // ── In-memory store: leaveId → LeaveRecord ───────────────────────
    // TODO: Replace with Spring Data JPA LeaveRepository
    private static final Map<String, LeaveRecord> LEAVE_STORE = new ConcurrentHashMap<>();

    // ── Per-employee overlap index: employeeId → set of leaveIds ─────
    private static final Map<String, Set<String>> EMP_LEAVES = new ConcurrentHashMap<>();

    // ── Mock designated-employee seat map ────────────────────────────
    // TODO: Replace with employeeRepository.findById(id).getDesignatedSeat()
    private static final Map<String, String> DESIGNATED_SEATS = buildDesignatedMap();

    private static Map<String, String> buildDesignatedMap() {
        var map = new HashMap<String, String>();
        for (int i = 1; i <= 40; i++)
            map.put(String.format("EMP-%03d", i), String.format("D-%02d", i));
        return java.util.Collections.unmodifiableMap(map);
    }

    private static final Set<String> VALID_LEAVE_TYPES =
        Set.of("CASUAL", "SICK", "EARNED", "COMP_OFF");

    // ── Internal leave record ─────────────────────────────────────────
    private record LeaveRecord(
            String leaveId, String employeeId, String leaveType,
            String startDate, String endDate, boolean halfDay, String halfDaySlot,
            String reason, String status,
            boolean seatReleased, String releasedSeatId, String createdAt) {}

    // ── Request / Response records ───────────────────────────────────

    record LeaveRequest(
        @NotBlank(message = "employeeId is required")  String employeeId,
        @NotBlank(message = "leaveType must be CASUAL | SICK | EARNED | COMP_OFF") String leaveType,
        @NotBlank(message = "startDate is required (YYYY-MM-DD)") String startDate,
        @NotBlank(message = "endDate is required (YYYY-MM-DD)")   String endDate,
        @NotNull(message  = "halfDay flag is required") Boolean halfDay,
        String halfDaySlot,
        String reason
    ) {}

    record LeaveConfirmation(
            String leaveId, String employeeId, String leaveType,
            String startDate, String endDate, boolean halfDay, String halfDaySlot,
            String reason, String status,
            boolean seatReleased, String releasedSeatId, String createdAt) {}

    record CancelConfirmation(
            String leaveId, String status,
            boolean seatRestored, String restoredSeatId, String cancelledAt) {}

    record ErrorResponse(String error, String message) {}

    // ── POST /api/v1/leaves/apply ─────────────────────────────────────

    /**
     * TODO: Connect to POST /api/v1/leaves/apply as per API contract.
     *       Persist via leaveRepository.save(new Leave(...)).
     */
    @PostMapping("/apply")
    public ResponseEntity<?> applyLeave(@Valid @RequestBody LeaveRequest req) {

        // Validate leaveType
        if (!VALID_LEAVE_TYPES.contains(req.leaveType().toUpperCase())) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_LEAVE_TYPE",
                "leaveType must be one of: CASUAL, SICK, EARNED, COMP_OFF. Got: " + req.leaveType()
            ));
        }

        // Parse + validate date range
        LocalDate start, end;
        try {
            start = LocalDate.parse(req.startDate());
            end   = LocalDate.parse(req.endDate());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_DATE_FORMAT", "startDate and endDate must be YYYY-MM-DD."));
        }
        if (end.isBefore(start)) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_DATE_RANGE", "endDate must be on or after startDate."));
        }

        // Overlap check
        // TODO: Replace with leaveRepository.existsByEmployeeIdAndDateOverlap(...)
        if (hasOverlap(req.employeeId(), start, end)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
                "LEAVE_OVERLAP",
                "Employee " + req.employeeId() + " already has leave between "
                    + req.startDate() + " and " + req.endDate() + "."));
        }

        // Designated seat auto-release
        // TODO: Replace with employeeService.isDesignated(req.employeeId())
        boolean isDesignated   = DESIGNATED_SEATS.containsKey(req.employeeId());
        String  releasedSeatId = isDesignated ? DESIGNATED_SEATS.get(req.employeeId()) : null;

        // Build and store leave record
        String leaveId = "L-" + java.time.Year.now().getValue()
                       + "-" + req.employeeId().replace("EMP-", "")
                       + "-" + String.format("%03d", LEAVE_COUNTER.incrementAndGet());
        String createdAt = ZonedDateTime.now(IST).toString();

        LeaveRecord record = new LeaveRecord(
            leaveId, req.employeeId(), req.leaveType().toUpperCase(),
            req.startDate(), req.endDate(), Boolean.TRUE.equals(req.halfDay()),
            req.halfDaySlot(), req.reason() != null ? req.reason() : "",
            "PENDING", isDesignated, releasedSeatId, createdAt);

        // TODO: Replace with leaveRepository.save(leave)
        LEAVE_STORE.put(leaveId, record);
        EMP_LEAVES.computeIfAbsent(req.employeeId(), k -> ConcurrentHashMap.newKeySet()).add(leaveId);

        return ResponseEntity.status(HttpStatus.CREATED).body(new LeaveConfirmation(
            record.leaveId(), record.employeeId(), record.leaveType(),
            record.startDate(), record.endDate(), record.halfDay(), record.halfDaySlot(),
            record.reason(), record.status(),
            record.seatReleased(), record.releasedSeatId(), record.createdAt()));
    }

    // ── PUT /api/v1/leaves/{leaveId}/cancel ───────────────────────────

    /**
     * Cancels a leave if it is still PENDING.
     * If the leave had released a designated seat, marks seatRestored = true.
     *
     * 200 — leave cancelled
     * 403 — leave is not in PENDING status (already APPROVED or CANCELLED)
     * 404 — leave not found
     *
     * TODO: Replace with leaveRepository.findById(leaveId) +
     *       leaveRepository.save(leave.withStatus("CANCELLED"))
     * TODO: If seatReleased was true, call seatService.restoreSeat(releasedSeatId)
     */
    @PutMapping("/{leaveId}/cancel")
    public ResponseEntity<?> cancelLeave(@PathVariable String leaveId) {

        LeaveRecord leave = LEAVE_STORE.get(leaveId);

        if (leave == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(
                "LEAVE_NOT_FOUND", "No leave found with ID: " + leaveId));
        }

        // Only PENDING leaves can be cancelled
        if (!"PENDING".equals(leave.status())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "CANNOT_CANCEL_LEAVE",
                "Leave " + leaveId + " has status '" + leave.status()
                    + "' and cannot be cancelled. Only PENDING leaves can be cancelled."));
        }

        // Update stored record to CANCELLED
        // TODO: Replace with leaveRepository.save(leave.withStatus("CANCELLED"))
        LeaveRecord cancelled = new LeaveRecord(
            leave.leaveId(), leave.employeeId(), leave.leaveType(),
            leave.startDate(), leave.endDate(), leave.halfDay(), leave.halfDaySlot(),
            leave.reason(), "CANCELLED",
            leave.seatReleased(), leave.releasedSeatId(), leave.createdAt());
        LEAVE_STORE.put(leaveId, cancelled);

        // Seat restore (mock — designated seat returns to the employee)
        // TODO: call seatService.restoreDesignatedSeat(leave.releasedSeatId()) when service layer exists
        boolean seatRestored  = leave.seatReleased();
        String  restoredSeatId = seatRestored ? leave.releasedSeatId() : null;

        return ResponseEntity.ok(new CancelConfirmation(
            leaveId, "CANCELLED", seatRestored, restoredSeatId,
            ZonedDateTime.now(IST).toString()));
    }

    // ── Overlap helper ────────────────────────────────────────────────
    private boolean hasOverlap(String employeeId, LocalDate newStart, LocalDate newEnd) {
        Set<String> leaveIds = EMP_LEAVES.get(employeeId);
        if (leaveIds == null || leaveIds.isEmpty()) return false;

        for (String id : leaveIds) {
            LeaveRecord r = LEAVE_STORE.get(id);
            if (r == null || "CANCELLED".equals(r.status())) continue;
            LocalDate exStart = LocalDate.parse(r.startDate());
            LocalDate exEnd   = LocalDate.parse(r.endDate());
            if (!newStart.isAfter(exEnd) && !newEnd.isBefore(exStart)) return true;
        }
        return false;
    }
}
