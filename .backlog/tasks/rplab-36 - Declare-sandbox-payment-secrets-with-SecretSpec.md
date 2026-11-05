---
id: RPLAB-36
title: Declare sandbox payment secrets with SecretSpec
status: Done
assignee:
  - '@assistant'
created_date: '2026-11-05T22:38:00Z'
updated_date: '2026-11-05T22:41:00Z'
labels: []
dependencies: []
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The optional POS provider path uses externally supplied Stripe and Square sandbox credentials but has no SecretSpec contract. Karl requested project secret requirements be declared and delivered through the standard SecretSpec/SOPS path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Separate sandbox provider profiles declare the existing Stripe and Square environment interfaces without inventing credentials
- [x] #2 Documentation explains scoped SecretSpec use and existing authorization boundaries without running providers
- [x] #3 Nonsecret contract and scoped delivery are verified without external requests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace existing POS consumer variables and optional provider boundaries. 2. Add provider-scoped SecretSpec profiles without changing runtime configuration. 3. Verify contract and fixture-only delivery, update documentation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pinned shell includes SecretSpec, SOPS and hardware plugins. Stripe and Square synthetic profiles exercised actual provider configuration without HTTP requests; baseline null check passed. Pinned just check pos passed static, package evaluation and strict docs. No sandbox credentials or provider calls were used.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Declared separate Stripe and Square sandbox SecretSpec profiles using their existing environment interfaces, added the supported tooling to the pinned shell, and documented scoped delivery. Synthetic consumer checks and pinned POS source/docs gate passed without provider requests.
<!-- SECTION:FINAL_SUMMARY:END -->
