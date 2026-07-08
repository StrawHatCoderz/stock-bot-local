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
            String assignedTo // storeId this employee currently manages, or null if not a manager
    ) {}

    static final List<Employee> EMPLOYEES = List.of(
            new Employee("priya.k", "password123", "EMP-1001", "1001",
                    "Priya K", "priya.k@example.com", "STORE-101"),
            new Employee("raj.kumar", "password123", "EMP-1002", "1002",
                    "Raj Kumar", "raj.kumar@example.com", "STORE-102"),
            // Valid login, but not a store manager — exercises UNAUTHORIZED_MANAGER.
            new Employee("sam.t", "password123", "EMP-1003", "1003",
                    "Sam T", "sam.t@example.com", null)
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
