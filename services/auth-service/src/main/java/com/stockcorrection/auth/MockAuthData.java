package com.stockcorrection.auth;

import java.util.List;

/**
 * Hardcoded employee directory for Phase 1. Not a repository/persistence
 * layer on purpose — this is a mock service, so the "database" is this list.
 */
final class MockAuthData {

    record Employee(
            String username,
            String password,
            String employeeId,
            String employeeNumber,
            String name,
            String email,
            String assignedTo, // storeId this employee currently manages, or null if not a manager
            String role // STORE_MANAGER, STORE_ASSOCIATE, or ADMIN
    ) {}

    static final List<Employee> EMPLOYEES = List.of(
            new Employee("priya.k", "password123", "EMP-1001", "1001",
                    "Priya K", "priya.k@example.com", "STORE-101", "STORE_MANAGER"),
            new Employee("raj.kumar", "password123", "EMP-1002", "1002",
                    "Raj Kumar", "raj.kumar@example.com", "STORE-102", "STORE_MANAGER"),
            // Valid login, but not a store manager — exercises UNAUTHORIZED_MANAGER.
            new Employee("sam.t", "password123", "EMP-1003", "1003",
                    "Sam T", "sam.t@example.com", null, "STORE_ASSOCIATE"),
            // Passes the login gate (has a store assignment) but is not a
            // manager — exercises the role-based FORBIDDEN_ROLE check.
            new Employee("alex.w", "password123", "EMP-1004", "1004",
                    "Alex W", "alex.w@example.com", "STORE-101", "STORE_ASSOCIATE"),
            // Second real associate, at a different store — lets the Admin
            // roster/threshold feature demonstrate two independent associates.
            new Employee("morgan.l", "password123", "EMP-1006", "1006",
                    "Morgan L", "morgan.l@example.com", "STORE-102", "STORE_ASSOCIATE"),
            // System-wide Admin — deliberately storeless (assignedTo null),
            // unlike sam.t this is expected and must not trip UNAUTHORIZED_MANAGER.
            new Employee("admin.a", "password123", "EMP-1005", "1005",
                    "Admin A", "admin.a@example.com", null, "ADMIN")
    );

    static Employee findByUsername(String username) {
        return EMPLOYEES.stream()
                .filter(e -> e.username().equalsIgnoreCase(username))
                .findFirst()
                .orElse(null);
    }

    static Employee findByEmployeeId(String employeeId) {
        return EMPLOYEES.stream()
                .filter(e -> e.employeeId().equals(employeeId))
                .findFirst()
                .orElse(null);
    }

    private MockAuthData() {}
}
