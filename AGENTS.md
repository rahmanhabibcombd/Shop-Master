# Agent Instructions

## Core Directives for WhatsApp POS Sync Application

1. **Strict Code Preservation (Locking)**:
   - Do NOT modify, rewrite, or touch any pre-built features unless the user EXPLICITLY requests changes to that specific capability.
   - **WhatsApp Unlink / Disconnect Logic**: Do not touch or modify the disconnect, logout, or session termination codes. The Zender API unlinking, token resets, and database-level status clears are fully integrated and must not be altered, updated, or reverted.
   - **Re-Sync & Connectivity Status Handshake**: Keep the automatic check status logic, pairing code sequences, and OTP-token generation processes intact.
   - **Custom Reminder / Bengali Messages**: Keep the custom Bengali prompt with editable user dialogs unchanged.
   - **Direct Backend API Calls**: Ensure all messaging triggers continue to use the background server API (`/api/gateways/dispatch`) without reverting to direct browser redirects (`wa.me` or `window.open`).

2. **Precise Target Slicing**:
   - Use surgical file-edit tools (`edit_file` with exact match lines) rather than replacing whole files or using generic blocks.
   - Avoid implementing "optimizations" or code cleanups that could introduce syntax errors or break concurrent modules.

3. **Zero Unsolicited Features & Styling**:
   - Strictly follow the requested scope. Do not add unsolicited design tabs, visual indicators, system logs, dashboard pages, or mock alerts.
   - Do not change port settings, server routing, or external proxy settings.

4. **Self-Sanitation / Proofing**:
   - Before concluding any turn, always run `compile_applet` and `lint_applet` to confirm zero regression errors.
