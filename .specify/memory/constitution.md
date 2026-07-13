<!-- 
Sync Impact Report
- Version: 1.1.0 -> 1.2.0
- Modified principles: N/A
- Added sections: II. Avoid Global Variables
- Removed sections: N/A
- Templates requiring updates: N/A
- Follow-up TODOs: Refactored existing global variables in mcp/src/index.ts
-->
# Stock Correction Bot Constitution

## Core Principles

### I. Use Arrow Functions
All JavaScript functions MUST be defined as arrow functions where appropriate, favoring lexical scoping and concise syntax. This ensures consistent `this` binding and more readable code throughout the codebase.

### II. Avoid Global Variables
All components MUST avoid the use of global or module-level mutable variables. State MUST be encapsulated within functions, classes, or explicitly passed as arguments to prevent unintended side-effects and improve testability.

## Additional Constraints

No additional constraints at this time.

## Development Workflow

Follow standard branch-based development and pull request reviews. Ensure all tests pass before merging.

## Governance

This Constitution supersedes all other practices. All PRs/reviews must verify compliance. Amendments require documentation, approval, and a migration plan.

**Version**: 1.2.0 | **Ratified**: 2026-07-13 | **Last Amended**: 2026-07-13
