package com.wissen.backed.api.v1;

import com.wissen.backed.SeatStateStore;
import com.wissen.backed.SeatStateStore.LeaveEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Leave application and cancellation endpoints.
 *
 * POST /api/v1/leaves/apply          — apply for leave (DESIGNATED only, no time restriction)
 * PUT  /api/v1/leaves/{leaveId}/cancel — cancel a PENDING leave
 *
 * Writes directly to SeatStateStore so the leave is immediately visible
 * in /seats/status and /calendar/weekly.
 */
@RestController
@RequestMapping("/api/v1/leaves")
public class LeaveController {

    private static final AtomicInteger COUNTER = new AtomicInteger(100);
    private static final Set<String> VALID_TYPES = Set.of("CASUAL","SICK","EARNED","COMP_OFF");

    // ── Mock user roles (keep in sync with AuthController + SeatStateStore) ──
    private static final java.util.Map<String, String> USER_ROLES = java.util.Map.of(
        "user",  "designated",
        "admin", "floater"
    );

    record LeaveRequest(
        @NotBlank String employeeId,
        @NotBlank String leaveType,
        @NotBlank String startDate,
        @NotBlank String endDate,
        @NotNull  Boolean halfDay,
        String halfDaySlot,
        String reason
    ) {}

    record LeaveConfirmation(
        String leaveId, String employeeId, String leaveType,
        String startDate, String endDate, boolean halfDay, String halfDaySlot,
        String reason, String status,
        boolean seatReleased, String releasedSeatId, String createdAt
    ) {}

    record CancelConfirmation(
        String leaveId, String status,
        boolean seatRestored, String restoredSeatId, String cancelledAt
    ) {}

    record ErrorResponse(String error, String message) {}

    private final SeatStateStore store;
    public LeaveController(SeatStateStore store) { this.store = store; }

    // ── POST /api/v1/leaves/apply ──────────────────────────────────────────

    @PostMapping("/apply")
    public ResponseEntity<?> applyLeave(@Valid @RequestBody LeaveRequest req,
                                        Authentication auth) {

        // Role check — only DESIGNATED employees apply for leave
        String username = auth != null ? auth.getName() : "";
        String role = USER_ROLES.getOrDefault(username, "designated");
        if ("floater".equalsIgnoreCase(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "ROLE_NOT_ALLOWED",
                "Floater employees do not apply for leave. Use 'Book Seat' instead."
            ));
        }

        // No time restriction for leave — always allowed.

        // Validate leave type
        if (!VALID_TYPES.contains(req.leaveType().toUpperCase())) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_LEAVE_TYPE",
                "leaveType must be CASUAL, SICK, EARNED, or COMP_OFF."
            ));
        }

        // Parse dates
        LocalDate start, end;
        try {
            start = LocalDate.parse(req.startDate());
            end   = LocalDate.parse(req.endDate());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_DATE_FORMAT", "startDate and endDate must be YYYY-MM-DD."
            ));
        }
        if (end.isBefore(start)) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_DATE_RANGE", "endDate must be on or after startDate."
            ));
        }

        // Overlap check via store
        if (store.hasLeaveOverlap(req.employeeId(), start, end)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
                "LEAVE_OVERLAP",
                "Employee " + req.employeeId() + " already has leave between "
                    + req.startDate() + " and " + req.endDate() + "."
            ));
        }

        // Auto-release designated seat
        var empOpt = store.findEmployee(req.employeeId());
        boolean isDesignated = empOpt.map(e -> "DESIGNATED".equals(e.seatType())).orElse(false);
        String releasedSeatId = isDesignated ? empOpt.get().designatedSeat() : null;

        String leaveId   = "L-" + java.time.Year.now().getValue()
                         + "-" + req.employeeId().replace("EMP-","")
                         + "-" + String.format("%03d", COUNTER.incrementAndGet());
        String createdAt = ZonedDateTime.now(SeatStateStore.IST).toString();

        LeaveEntry entry = new LeaveEntry(
            leaveId, req.employeeId(), req.leaveType().toUpperCase(),
            start, end,
            Boolean.TRUE.equals(req.halfDay()), req.halfDaySlot(),
            req.reason() != null ? req.reason() : "",
            "PENDING", isDesignated, releasedSeatId, createdAt
        );
        store.addLeave(entry);

        return ResponseEntity.status(HttpStatus.CREATED).body(new LeaveConfirmation(
            entry.leaveId(), entry.employeeId(), entry.leaveType(),
            entry.startDate().toString(), entry.endDate().toString(),
            entry.halfDay(), entry.halfDaySlot(), entry.reason(), entry.status(),
            entry.seatReleased(), entry.releasedSeatId(), entry.createdAt()
        ));
    }

    // ── PUT /api/v1/leaves/{leaveId}/cancel ───────────────────────────────

    @PutMapping("/{leaveId}/cancel")
    public ResponseEntity<?> cancelLeave(@PathVariable String leaveId) {

        var opt = store.findLeave(leaveId);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(
                "LEAVE_NOT_FOUND", "No leave found with ID: " + leaveId
            ));
        }

        LeaveEntry leave = opt.get();
        if (!"PENDING".equals(leave.status())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "CANNOT_CANCEL_LEAVE",
                "Leave " + leaveId + " has status '" + leave.status() + "' and cannot be cancelled."
            ));
        }

        LeaveEntry cancelled = new LeaveEntry(
            leave.leaveId(), leave.employeeId(), leave.leaveType(),
            leave.startDate(), leave.endDate(),
            leave.halfDay(), leave.halfDaySlot(), leave.reason(),
            "CANCELLED",
            leave.seatReleased(), leave.releasedSeatId(), leave.createdAt()
        );
        store.updateLeave(cancelled);

        return ResponseEntity.ok(new CancelConfirmation(
            leaveId, "CANCELLED",
            leave.seatReleased(), leave.releasedSeatId(),
            ZonedDateTime.now(SeatStateStore.IST).toString()
        ));
    }
}
