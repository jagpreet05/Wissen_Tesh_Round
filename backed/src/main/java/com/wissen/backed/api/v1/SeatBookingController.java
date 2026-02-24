package com.wissen.backed.api.v1;

import com.wissen.backed.SeatStateStore;
import com.wissen.backed.SeatStateStore.BookingEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.Map;

/**
 * Seat booking endpoints (floater seats only).
 *
 * POST   /api/v1/seats/book             — create a booking (FLOATER role, after 15:00 IST)
 * DELETE /api/v1/seats/book/{bookingId} — cancel a future booking
 *
 * Booking target date rule (9 AM cutoff):
 *   Before 09:00 IST → target = today   (early-morning same-day booking)
 *   From   09:00 IST → target = tomorrow (next day booking opens)
 *
 * The client may also supply an explicit date which overrides the cutoff logic.
 *
 * Booking window: 15:00 → 08:59 IST (seat booking only).
 */
@RestController
@RequestMapping("/api/v1/seats")
public class SeatBookingController {

    // Mock user roles — keep in sync with AuthController + SeatStateStore
    private static final Map<String, String> USER_ROLES = Map.of(
        "user",  "designated",
        "admin", "floater"
    );

    record BookingRequest(
        @NotBlank String employeeId,
        @NotBlank String seatId,
        String date,   // optional; if omitted, targetDate() is used
        @NotNull @Min(1) @Max(2) Integer batch,
        @NotNull @Min(1) @Max(2) Integer week
    ) {}

    record BookingConfirmation(
        String bookingId, String employeeId, String seatId,
        String date, String status, String bookedAt
    ) {}

    record CancelConfirmation(String bookingId, String status, String cancelledAt) {}

    record ErrorResponse(String error, String message) {}

    private final SeatStateStore store;
    public SeatBookingController(SeatStateStore store) { this.store = store; }

    // ── POST /api/v1/seats/book ────────────────────────────────────────────

    @PostMapping("/book")
    public ResponseEntity<?> bookSeat(@Valid @RequestBody BookingRequest req,
                                      Authentication auth) {

        // Role check: only FLOATER employees can book seats
        String username = auth != null ? auth.getName() : "";
        String role = USER_ROLES.getOrDefault(username, "floater");
        if ("designated".equalsIgnoreCase(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "ROLE_NOT_ALLOWED",
                "Designated employees cannot book floater seats. " +
                "Your seat is pre-assigned. Use 'Apply Leave' if you are away."
            ));
        }

        // Booking window: open 15:00–08:59 IST (seat booking only, not leave)
        if (!isBookingWindowOpen()) {
            var now = ZonedDateTime.now(SeatStateStore.IST).toLocalTime();
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "BOOKING_WINDOW_CLOSED",
                "Seat booking opens at 3:00 PM IST. Current time: " + now
            ));
        }

        // Resolve target date: explicit date in request OR store.targetDate()
        LocalDate targetDate;
        if (req.date() != null && !req.date().isBlank()) {
            try { targetDate = LocalDate.parse(req.date()); }
            catch (Exception e) {
                return ResponseEntity.badRequest().body(new ErrorResponse(
                    "INVALID_DATE_FORMAT", "date must be YYYY-MM-DD."
                ));
            }
        } else {
            targetDate = store.targetDate();
        }

        String seatId = req.seatId().toUpperCase();

        // Only floater (F-xx) seats can be booked here
        if (!seatId.startsWith("F-")) {
            return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_SEAT_TYPE",
                "Only floater seats (F-xx) can be booked via this endpoint."
            ));
        }

        // Check if seat is already booked on that date
        if (store.isSeatBooked(seatId, targetDate)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
                "SEAT_ALREADY_BOOKED",
                "Seat " + seatId + " is already booked on " + targetDate + "."
            ));
        }

        String bookingId = "BK-" + targetDate.toString().replace("-","")
                         + "-" + req.employeeId().replace("EMP-","");
        String bookedAt  = ZonedDateTime.now(SeatStateStore.IST).toString();

        store.addBooking(new BookingEntry(
            bookingId, req.employeeId(), seatId, targetDate, "CONFIRMED", bookedAt
        ));

        return ResponseEntity.status(HttpStatus.CREATED).body(new BookingConfirmation(
            bookingId, req.employeeId(), seatId, targetDate.toString(), "CONFIRMED", bookedAt
        ));
    }

    // ── DELETE /api/v1/seats/book/{bookingId} ─────────────────────────────

    @DeleteMapping("/book/{bookingId}")
    public ResponseEntity<?> cancelBooking(@PathVariable String bookingId) {
        // Find the booking across all dates
        var allEntries = store.allEmployees().stream()
            .flatMap(e -> store.bookingsOnDate(store.targetDate()).stream())
            .filter(b -> b.bookingId().equals(bookingId))
            .findFirst();

        // Broader search across last 60 days if not found in target date
        if (allEntries.isEmpty()) {
            LocalDate today = LocalDate.now(SeatStateStore.IST);
            outer:
            for (int i = -30; i <= 30; i++) {
                for (var b : store.bookingsOnDate(today.plusDays(i))) {
                    if (b.bookingId().equals(bookingId)) {
                        allEntries = java.util.Optional.of(b);
                        break outer;
                    }
                }
            }
        }

        if (allEntries.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(
                "BOOKING_NOT_FOUND", "No booking found with ID: " + bookingId
            ));
        }

        BookingEntry booking = allEntries.get();
        if (!booking.date().isAfter(LocalDate.now(SeatStateStore.IST))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "CANNOT_CANCEL_PAST_BOOKING",
                "Booking " + bookingId + " is for " + booking.date()
                    + " which is today or in the past."
            ));
        }

        store.cancelBooking(booking.seatId(), booking.date());
        return ResponseEntity.ok(new CancelConfirmation(
            bookingId, "CANCELLED", ZonedDateTime.now(SeatStateStore.IST).toString()
        ));
    }

    // ── Booking window helper ─────────────────────────────────────────────

    private boolean isBookingWindowOpen() {
        var now   = ZonedDateTime.now(SeatStateStore.IST).toLocalTime();
        var open  = java.time.LocalTime.of(15, 0);
        var close = java.time.LocalTime.of(9, 0);
        return now.isAfter(open) || now.isBefore(close);
    }
}
