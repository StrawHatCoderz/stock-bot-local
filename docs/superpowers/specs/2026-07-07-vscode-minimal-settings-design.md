# Design Spec: VS Code Minimal Distraction Keyboard-First Settings

## Goal
Configure global VS Code settings (`settings.json`) to create a minimal-distraction, keyboard-first coding environment for the user.

## Requirements
- **Distraction-Free Workspace**: Hide all unnecessary UI elements (Status Bar, Activity Bar, Minimap, Breadcrumbs).
- **Keyboard-First**: Optimize for a user who navigates/opens panels using shortcuts (e.g. toggles sidebar with Cmd+B).
- **Sidebar**: Position the sidebar on the left side (`"workbench.sideBar.location": "left"`).
- **Tab Size**: Standardize on 2-space indentation.
- **Dark Theme**: Enable a modern dark theme.
- **Typography**: Visible font size of 17 (between 16 and 18) and disable all italics (including comments, keywords, types, etc.).
- **Auto-formatting**: Format on save enabled.

## Proposed Settings (`settings.json`)
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

## Verification Plan
1. Apply the configuration to `/Users/umarkhaji/Library/Application Support/Code/User/settings.json`.
2. Inspect the file content to verify formatting is valid JSON.
