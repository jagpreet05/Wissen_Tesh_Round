package com.wissen.backed;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * API-only security configuration.
 *
 * All authentication responses are JSON — no HTML pages, no redirects.
 *
 * Login flow (React frontend):
 *   1. React POSTs form-urlencoded to /login
 *   2. SuccessHandler returns 200 { "status":"LOGIN_SUCCESS", "user":"..." }
 *   3. JSESSIONID cookie is set (same-origin via Vite proxy)
 *   4. React redirects to /dashboard
 *
 * Failure / unauthenticated:
 *   - Wrong credentials → 401 { "error":"INVALID_CREDENTIALS" }
 *   - Unauthenticated API call → 401 { "error":"UNAUTHENTICATED" }
 *
 * CORS:
 *   - React dev server on localhost:5173 is an allowed origin
 *   - credentials:true so the session cookie travels with every fetch()
 *   - Note: When the Vite proxy is active the browser sees same-origin
 *     requests, so CORS headers are not strictly required for proxied calls,
 *     but we keep them for direct API access (curl, Postman, etc.)
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final List<String> ALLOWED_ORIGINS = List.of(
        "null",                         // file:// pages report Origin: null
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5500",
        "http://localhost:5173",        // Vite dev server
        "http://127.0.0.1",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5500"
    );


    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())

            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/api/health", "/h2-console/**").permitAll()
                .anyRequest().authenticated()
            )

            // ── Form login — JSON handlers (no HTML redirects) ────────
            .formLogin(form -> form
                .successHandler(jsonSuccessHandler())
                .failureHandler(jsonFailureHandler())
            )

            // ── HTTP Basic (for curl / Postman) ───────────────────────
            .httpBasic(org.springframework.security.config.Customizer.withDefaults())

            // ── Unauthenticated API call → 401 JSON, not login redirect
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(jsonEntryPoint())
            )

            // ── H2 console ────────────────────────────────────────────
            .headers(h -> h.frameOptions(f -> f.sameOrigin()));

        return http.build();
    }

    // ── JSON handlers ─────────────────────────────────────────────────

    /** On successful login: 200 { status, user } */
    private AuthenticationSuccessHandler jsonSuccessHandler() {
        return (HttpServletRequest req, HttpServletResponse res, Authentication auth) -> {
            res.setStatus(HttpServletResponse.SC_OK);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write(
                "{\"status\":\"LOGIN_SUCCESS\",\"user\":\"" + auth.getName() + "\"}"
            );
        };
    }

    /** On failed login: 401 { error, message } */
    private AuthenticationFailureHandler jsonFailureHandler() {
        return (HttpServletRequest req, HttpServletResponse res, AuthenticationException ex) -> {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write(
                "{\"error\":\"INVALID_CREDENTIALS\",\"message\":\"Username or password is incorrect.\"}"
            );
        };
    }

    /** On unauthenticated API request: 401 { error } — no redirect */
    private AuthenticationEntryPoint jsonEntryPoint() {
        return (HttpServletRequest req, HttpServletResponse res, AuthenticationException ex) -> {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write(
                "{\"error\":\"UNAUTHENTICATED\",\"message\":\"Please log in to access this resource.\"}"
            );
        };
    }

    // ── CORS ──────────────────────────────────────────────────────────

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        final CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(ALLOWED_ORIGINS);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(1800L);

        final UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
