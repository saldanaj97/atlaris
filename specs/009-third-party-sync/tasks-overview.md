# Progress Overview

- [x] Task 1: Database Schema - Integration Tokens Table
- [ ] Task 2: Database Schema - Notion Sync State Table
- [ ] Task 3: Database Schema - Google Calendar Sync State Table
- [x] Task 4: Shared OAuth Infrastructure - Token Encryption Utility
- [ ] Task 5: Shared OAuth Infrastructure - Token Storage Functions
- [ ] Task 6: Notion Integration - OAuth Authorization Flow
- [ ] Task 7: Notion Integration - Plan-to-Notion Data Mapper
- [ ] Task 8: Notion Integration - Client with Rate Limiting
- [ ] Task 9: Notion Integration - Export Endpoint
- [ ] Task 10: Notion Integration - Delta Sync
- [ ] Task 11: Google Calendar Integration - OAuth Flow
- [ ] Task 12: Google Calendar - Event Mapper
- [ ] Task 13: Google Calendar - Sync Endpoint
- [ ] Task 14: Tier Gates and Usage Tracking
- [ ] Task 15: UI Export Buttons Component
- [ ] Task 16: End-to-End Tests

# Implementation Overview

- [ ] PR 1: OAuth Security Foundations
  - Task 1: Database Schema - Integration Tokens Table
  - Task 4: Shared OAuth Infrastructure - Token Encryption Utility
  - Task 5: Shared OAuth Infrastructure - Token Storage Functions

- [ ] PR 2: Notion OAuth + Sync Schema
  - Task 2: Database Schema - Notion Sync State Table
  - Task 6: Notion Integration - OAuth Authorization Flow

- [ ] PR 3: Notion Mapper + Rate-Limited Client
  - Task 7: Notion Integration - Plan-to-Notion Data Mapper
  - Task 8: Notion Integration - Client with Rate Limiting

- [ ] PR 4: Notion Export Endpoint (One-off)
  - Task 9: Notion Integration - Export Endpoint

- [ ] PR 5: Notion Delta Sync
  - Task 10: Notion Integration - Delta Sync

- [ ] PR 6: Google OAuth + Sync Schema
  - Task 3: Database Schema - Google Calendar Sync State Table
  - Task 11: Google Calendar Integration - OAuth Flow

- [ ] PR 7: Google Event Mapping + Sync
  - Task 12: Google Calendar - Event Mapper
  - Task 13: Google Calendar - Sync Endpoint

- [ ] PR 8: Tier Gates & Usage Enforcement
  - Task 14: Tier Gates and Usage Tracking

- [ ] PR 9: UI + E2E Validation
  - Task 15: UI Export Buttons Component
  - Task 16: End-to-End Tests

---

# Task 1: Database Schema - Integration Tokens Table

- [x] Step 1: Add integration provider enum
- [x] Step 2: Add integration_tokens table to schema
- [x] Step 3: Generate migration
- [x] Step 4: Apply migration to local database
- [x] Step 5: Apply migration to test database
- [x] Step 6: Run Coderabbit CLI and implement suggestions
- [x] Step 7: Commit schema changes

---

# Task 2: Database Schema - Notion Sync State Table

- [ ] Step 1: Add notion_sync_state table to schema
- [ ] Step 2: Generate migration
- [ ] Step 3: Apply migrations to local and test databases
- [ ] Step 4: Run Coderabbit CLI and implement suggestions
- [ ] Step 5: Commit schema changes

---

# Task 3: Database Schema - Google Calendar Sync State Table

- [ ] Step 1: Add google_calendar_sync_state table
- [ ] Step 2: Add task_calendar_events mapping table
- [ ] Step 3: Generate and apply migrations (local + test)
- [ ] Step 4: Run Coderabbit CLI and implement suggestions
- [ ] Step 5: Commit schema changes

---

# Task 4: Shared OAuth Infrastructure - Token Encryption Utility

- [x] Step 1: Write failing test for token encryption
- [x] Step 2: Run test to verify it fails
- [x] Step 3: Implement AES-256-CBC encrypt/decrypt utilities
- [x] Step 4: Run test to verify it passes
- [x] Step 5: Run Coderabbit CLI and implement suggestions
- [x] Step 6: Commit

---

# Task 5: Shared OAuth Infrastructure - Token Storage Functions

- [x] Step 1: Write failing integration test for token storage
- [x] Step 2: Run test to verify it fails
- [x] Step 3: Implement store/get/delete encrypted tokens
- [x] Step 4: Run test to verify it passes
- [x] Step 5: Run Coderabbit CLI and implement suggestions
- [ ] Step 6: Commit

---

# Task 6: Notion Integration - OAuth Authorization Flow

- [ ] Step 1: Write failing test for OAuth redirect
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Implement authorization redirect endpoint
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Add callback test (failing)
- [ ] Step 6: Implement callback endpoint
- [ ] Step 7: Run tests to verify they pass
- [ ] Step 8: Run Coderabbit CLI and implement suggestions
- [ ] Step 9: Commit

---

# Task 7: Notion Integration - Plan-to-Notion Data Mapper

- [ ] Step 1: Write failing unit test for mapping
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Implement mapper functions
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Install Notion SDK
- [ ] Step 6: Run Coderabbit CLI and implement suggestions
- [ ] Step 7: Commit

---

# Task 8: Notion Integration - Client with Rate Limiting

- [ ] Step 1: Write failing test for rate-limited client
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Implement client with 3 req/sec + retry
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Run Coderabbit CLI and implement suggestions
- [ ] Step 6: Commit

---

# Task 9: Notion Integration - Export Endpoint

- [ ] Step 1: Write failing integration test for export endpoint
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Implement sync utility module
- [ ] Step 4: Implement export API endpoint
- [ ] Step 5: Run test to verify it passes
- [ ] Step 6: Run Coderabbit CLI and implement suggestions
- [ ] Step 7: Commit

---

# Task 10: Notion Integration - Delta Sync

- [ ] Step 1: Write failing test for delta sync
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Implement hash-based delta sync
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Run Coderabbit CLI and implement suggestions
- [ ] Step 6: Commit

---

# Task 11: Google Calendar Integration - OAuth Flow

- [ ] Step 1: Write failing test for Google OAuth
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Install googleapis package
- [ ] Step 4: Implement OAuth redirect + callback endpoints
- [ ] Step 5: Run test to verify it passes
- [ ] Step 6: Run Coderabbit CLI and implement suggestions
- [ ] Step 7: Commit

---

# Task 12: Google Calendar - Event Mapper

- [ ] Step 1: Write failing unit test
- [ ] Step 2: Run test to verify it fails
- [ ] Step 3: Implement task-to-event mapper
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Run Coderabbit CLI and implement suggestions
- [ ] Step 6: Commit

---

# Task 13: Google Calendar - Sync Endpoint

- [ ] Step 1: Write failing integration test
- [ ] Step 2: Implement calendar sync function
- [ ] Step 3: Implement sync API endpoint
- [ ] Step 4: Run test to verify it passes
- [ ] Step 5: Run Coderabbit CLI and implement suggestions
- [ ] Step 6: Commit

---

# Task 14: Tier Gates and Usage Tracking

- [ ] Step 1: Write failing integration test for quotas
- [ ] Step 2: Implement usage tracking helpers
- [ ] Step 3: Enforce quotas in export/sync endpoints
- [ ] Step 4: Run tests to verify they pass
- [ ] Step 5: Add monthly export count to users schema
- [ ] Step 6: Generate and apply migrations (local + test)
- [ ] Step 7: Run Coderabbit CLI and implement suggestions
- [ ] Step 8: Commit

---

# Task 15: UI Export Buttons Component

- [ ] Step 1: Write failing unit test
- [ ] Step 2: Implement component (loading, errors, toasts)
- [ ] Step 3: Run test to verify it passes
- [ ] Step 4: Run Coderabbit CLI and implement suggestions
- [ ] Step 5: Commit

---

# Task 16: End-to-End Tests

- [ ] Step 1: Add Notion export E2E test
- [ ] Step 2: Add Google Calendar sync E2E test
- [ ] Step 3: Run E2E test suite
- [ ] Step 4: Run Coderabbit CLI and implement suggestions
- [ ] Step 5: Commit
