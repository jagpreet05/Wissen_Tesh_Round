package com.wissen.backed.api.v1;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Seat booking endpoints.
 *
 * POST   /api/v1/seats/book           — create a booking
 * DELETE /api/v1/seats/book/{bookingId} — cancel a future booking
 *
 * TODO: Replace BOOKING_STORE with BookingRepository (JPA)
 * TODO: Replace OCCUPIED_SEATS check with SeatRepository.isBooked(seatId, date)
 */
@RestController
@RequestMapping("/api/v1/seats")
public class SeatBookingController {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // ── In-memory booking store: bookingId → BookingRecord ───────────
    // TODO: Replace with Spring Data JPA BookingRepository
    private static final Map<String, BookingRecord> BOOKING_STORE = new ConcurrentHashMap<>();

    // ── Mock occupied seats (matches SeatStatusController) ───────────
    // TODO: Replace with SeatRepository.findOccupiedSeatIds(date)
    private static final Set<String> OCCUPIED_SEATS = buildOccupiedSet();

    private static Set<String> buildOccupiedSet() {
        var set = new java.util.HashSet<String>();
        for (int i = 1; i <= 33; i++) set.add(String.format("D-%02d", i));
        for (int i = 1; i <= 3;  i++) set.add(String.format("F-%02d", i));
        return java.util.Collections.unmodifiableSet(set);
    }

    // ── Internal booking record ───────────────────────────────────────
    private record BookingRecord(
            String bookingId, String employeeId, String seatId,
            String date, String status, String bookedAt) {}

    // ── Request / Response records ───────────────────────────────────

    record BookingRequest(
        @NotBlank(message = "employeeId is required") String employeeId,
        @NotBlank(message = "seatId is required")     String seatId,
        @NotBlank(message = "date is required (YYYY-MM-DD)") String date,
        @NotNull  @Min(1) @Max(2) Integer batch,
        @NotNull  @Min(1) @Max(2) Integer week
    ) {}

    record BookingConfirmation(
            String bookingId, String employeeId, String seatId,
            String date, String status, String bookedAt) {}

    record CancelConfirmation(
            String bookingId, String status, String cancelledAt) {}

    record ErrorResponse(String error, String message) {}

    // ── POST /api/v1/seats/book ───────────────────────────────────────

    /**
     * TODO: Connect to GET/POST /api/v1/seats/book as per API contract.
     *       Persist via bookingRepository.save(new Booking(...)).
     */
    @PostMapping("/book")
    public ResponseEntity<?> bookSeat(@Valid @RequestBody BookingRequest req) {

        // Booking window: 15:00 → 08:00 IST
        if (!isBookingWindowOpen()) {
            var now = ZonedDateTime.now(IST).toLocalTime();
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "BOOKING_WINDOW_CLOSED",
                "Booking is allowed only between 3:00 PM and 8:00 AM. Current time: " + now
            ));
        }

        // Seat must not already be occupied
        if (OCCUPIED_SEATS.contains(req.seatId())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(
                "SEAT_ALREADY_BOOKED",
                "Seat " + req.seatId() + " is already occupied on " + req.date() + "."
            ));
        }

        String bookingId = "BK-" + req.date().replace("-", "")
                         + "-" + req.employeeId().replace("EMP-", "");
        String bookedAt  = ZonedDateTime.now(IST).toString();

        // TODO: Replace with bookingRepository.save(...)
        BOOKING_STORE.put(bookingId, new BookingRecord(
            bookingId, req.employeeId(), req.seatId(),
            req.date(), "CONFIRMED", bookedAt));

        return ResponseEntity.status(HttpStatus.CREATED)
            .body(new BookingConfirmation(bookingId, req.employeeId(),
                req.seatId(), req.date(), "CONFIRMED", bookedAt));
    }

    // ── DELETE /api/v1/seats/book/{bookingId} ─────────────────────────

    /**
     * Cancels a booking if it exists and the booking date is in the future.
     *
     * 200 — cancelled successfully
     * 403 — booking date is today or in the past
     * 404 — booking not found
     *
     * TODO: Replace with bookingRepository.findById(bookingId) +
     *       bookingRepository.save(booking.withStatus("CANCELLED"))
     */
    @DeleteMapping("/book/{bookingId}")
    public ResponseEntity<?> cancelBooking(@PathVariable String bookingId) {

        BookingRecord booking = BOOKING_STORE.get(bookingId);

        if (booking == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(
                "BOOKING_NOT_FOUND",
                "No booking found with ID: " + bookingId
            ));
        }

        // Only future bookings can be cancelled
        LocalDate bookingDate = LocalDate.parse(booking.date());
        LocalDate today       = LocalDate.now(IST);
        if (!bookingDate.isAfter(today)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse(
                "CANNOT_CANCEL_PAST_BOOKING",
                "Booking " + bookingId + " is for " + booking.date()
                    + " which is today or in the past and cannot be cancelled."
            ));
        }

        // TODO: Replace with bookingRepository.save(booking.withStatus("CANCELLED"))
        BOOKING_STORE.put(bookingId, new BookingRecord(
            booking.bookingId(), booking.employeeId(), booking.seatId(),
            booking.date(), "CANCELLED", booking.bookedAt()));

        return ResponseEntity.ok(new CancelConfirmation(
            bookingId, "CANCELLED", ZonedDateTime.now(IST).toString()));
    }

    // ── Booking window helper ─────────────────────────────────────────
    private boolean isBookingWindowOpen() {
        var now   = ZonedDateTime.now(IST).toLocalTime();
        var open  = java.time.LocalTime.of(15, 0);
        var close = java.time.LocalTime.of(8, 0);
        return now.isAfter(open) || now.isBefore(close);
    }
}
