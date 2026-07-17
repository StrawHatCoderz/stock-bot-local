package com.stockcorrection.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Mock AuthAPI per phase-1/05_api-contract.md — POST /api/login, GET /api/me.
 *
 * Token storage here is a plain in-memory map, standing in for
 * SessionTokenRepository described in phase-1/03_tech_stack.md: token ->
 * employeeId. No JWT signing/expiry — this is a mock, not a real auth service.
 */
@RestController
public class AuthController {

    // token -> employeeId
    private final Map<String, String> tokens = new ConcurrentHashMap<>();

    record LoginRequest(String username, String password) {}

    @PostMapping("/api/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest request) {
        MockAuthData.Employee employee = MockAuthData.findByUsername(request.username());

        if (employee == null || !employee.password().equals(request.password())) {
            // No failure shape is specified for bad credentials in the given
            // contract (see api-contract.md) — this 401 + errorCode body is
            // this service's own reasonable fill-in for that gap.
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("errorCode", "INVALID_CREDENTIALS");
            body.put("message", "Username or password is incorrect.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
        }

        String token = "mock-jwt-" + UUID.randomUUID();
        tokens.put(token, employee.employeeId());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/api/me")
    public ResponseEntity<Map<String, Object>> me(
            @RequestHeader(value = "Authorization", required = false) String authorization) {

        String employeeId = resolveEmployeeId(authorization);
        if (employeeId == null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("errorCode", "INVALID_TOKEN");
            body.put("message", "Missing or invalid bearer token.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
        }

        MockAuthData.Employee employee = MockAuthData.findByEmployeeId(employeeId);
        boolean isAdmin = employee != null && "ADMIN".equals(employee.role());
        if (employee == null || (employee.assignedTo() == null && !isAdmin)) {
            // Per api-contract.md: valid credentials/token, but not an
            // authorized manager for any store. Admin is deliberately
            // storeless (system-wide) and is exempt from this gate.
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("authorized", false);
            body.put("errorCode", "UNAUTHORIZED_MANAGER");
            body.put("message", "Employee is not authorized for this store.");
            return ResponseEntity.ok(body);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authorized", true);
        body.put("employee_id", employee.employeeId());
        body.put("employee_number", employee.employeeNumber());
        body.put("name", employee.name());
        body.put("email", employee.email());
        body.put("assignedTo", employee.assignedTo());
        body.put("role", employee.role());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/api/auth/verify")
    public ResponseEntity<Map<String, Object>> verify(
            @RequestHeader(value = "Authorization", required = false) String authorization) {

        String employeeId = resolveEmployeeId(authorization);
        if (employeeId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        MockAuthData.Employee employee = MockAuthData.findByEmployeeId(employeeId);
        if (employee == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employeeId", employee.employeeId());
        body.put("storeId", employee.assignedTo());
        body.put("role", employee.role());
        if ("STORE_ASSOCIATE".equals(employee.role())) {
            body.put("thresholdPercent", MockThresholdData.get(employee.employeeId()));
        }
        return ResponseEntity.ok(body);
    }

    @GetMapping("/api/auth/managers")
    public ResponseEntity<Map<String, Object>> managers(
            @RequestHeader(value = "Authorization", required = false) String authorization) {

        MockAuthData.Employee caller = resolveCaller(authorization);
        if (caller == null || !"ADMIN".equals(caller.role())) {
            return ResponseEntity.ok(forbiddenRoleBody("Only an Admin can list store managers."));
        }

        List<Map<String, Object>> managers = MockAuthData.EMPLOYEES.stream()
                .filter(e -> "STORE_MANAGER".equals(e.role()))
                .map(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("employeeId", e.employeeId());
                    row.put("name", e.name());
                    row.put("storeId", e.assignedTo());
                    return (Map<String, Object>) row;
                })
                .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("managers", managers);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/api/auth/associates")
    public ResponseEntity<Map<String, Object>> associates(
            @RequestHeader(value = "Authorization", required = false) String authorization) {

        MockAuthData.Employee caller = resolveCaller(authorization);
        if (caller == null || !"ADMIN".equals(caller.role())) {
            return ResponseEntity.ok(forbiddenRoleBody("Only an Admin can list store associates."));
        }

        List<Map<String, Object>> associates = MockAuthData.EMPLOYEES.stream()
                .filter(e -> "STORE_ASSOCIATE".equals(e.role()) && e.assignedTo() != null)
                .map(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("employeeId", e.employeeId());
                    row.put("name", e.name());
                    row.put("storeId", e.assignedTo());
                    row.put("thresholdPercent", MockThresholdData.get(e.employeeId()));
                    return (Map<String, Object>) row;
                })
                .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("associates", associates);
        return ResponseEntity.ok(body);
    }

    record ThresholdRequest(Double thresholdPercent) {}

    @PatchMapping("/api/auth/associates/{employeeId}/threshold")
    public ResponseEntity<Map<String, Object>> setAssociateThreshold(
            @PathVariable String employeeId,
            @RequestBody ThresholdRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {

        MockAuthData.Employee caller = resolveCaller(authorization);
        if (caller == null || !"ADMIN".equals(caller.role())) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("status", "FAILED");
            body.put("errorCode", "FORBIDDEN_ROLE");
            body.put("message", "Only an Admin can change an associate's threshold.");
            return ResponseEntity.ok(body);
        }

        MockAuthData.Employee target = MockAuthData.findByEmployeeId(employeeId);
        if (target == null || !"STORE_ASSOCIATE".equals(target.role())) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("status", "FAILED");
            body.put("errorCode", "ASSOCIATE_NOT_FOUND");
            body.put("message", "No store associate found with that id.");
            return ResponseEntity.ok(body);
        }

        Double thresholdPercent = request.thresholdPercent();
        if (thresholdPercent == null || thresholdPercent < 0 || thresholdPercent > 100) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("status", "FAILED");
            body.put("errorCode", "INVALID_THRESHOLD");
            body.put("message", "Threshold must be between 0 and 100.");
            return ResponseEntity.ok(body);
        }

        MockThresholdData.set(employeeId, thresholdPercent);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "SUCCESS");
        body.put("employeeId", employeeId);
        body.put("thresholdPercent", thresholdPercent);
        body.put("message", "Threshold updated.");
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> forbiddenRoleBody(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authorized", false);
        body.put("errorCode", "FORBIDDEN_ROLE");
        body.put("message", message);
        return body;
    }

    private MockAuthData.Employee resolveCaller(String authorizationHeader) {
        String employeeId = resolveEmployeeId(authorizationHeader);
        return employeeId == null ? null : MockAuthData.findByEmployeeId(employeeId);
    }

    private String resolveEmployeeId(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authorizationHeader.substring("Bearer ".length()).trim();
        return tokens.get(token);
    }
}
