# VS Code Minimal Distraction Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure global VS Code settings (`settings.json`) to create a minimal-distraction, keyboard-first coding environment for the user.

**Architecture:** Merge and overwrite the user's global `settings.json` file on macOS with the distraction-free preferences.

**Tech Stack:** JSON / VS Code configurations.

## Global Constraints

- VS Code global settings file location: `/Users/umarkhaji/Library/Application Support/Code/User/settings.json`
- Tab size of 2 spaces, no indentation detection.
- Disabling all italics via custom tokenColorCustomizations textMateRules.

---

### Task 1: Update and Verify VS Code User Settings

**Files:**
- Modify: `/Users/umarkhaji/Library/Application Support/Code/User/settings.json`

**Interfaces:**
- Consumes: Existing user settings.
- Produces: Updated distraction-free VS Code settings.

- [ ] **Step 1: Write the updated settings to the file**

Overwrite the file `/Users/umarkhaji/Library/Application Support/Code/User/settings.json` with the following content:

```json
{
  "files.autoSave": "afterDelay",
  "editor.formatOnSave": true,
  "workbench.sideBar.location": "left",
  "breadcrumbs.enabled": false,
  "editor.tabSize": 2,
  "editor.detectIndentation": false,
  "editor.minimap.enabled": false,
  "workbench.statusBar.visible": false,
  "workbench.activityBar.location": "hidden",
  "editor.fontSize": 17,
  "workbench.colorTheme": "Default Dark Modern",
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": [
          "comment",
          "markup.italic",
          "storage.type",
          "keyword",
          "variable.language"
        ],
        "settings": {
          "fontStyle": ""
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Verify JSON syntax validity**

Verify that the file contains valid JSON by reading it and checking formatting.
Run command: `node -e 'require("/Users/umarkhaji/Library/Application Support/Code/User/settings.json")'`
Expected: No errors (successful execution with exit code 0).
