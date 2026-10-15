---
id: RPLAB-32
title: Make README and Zensical prose more welcoming
status: Done
assignee:
  - '@omp'
created_date: '2026-10-15 15:25'
updated_date: '2026-10-15 15:38'
labels: []
dependencies: []
type: docs
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reader feedback: repeated lists of things a lab does not do make the documentation tiring and unnatural. Use a slightly warmer, friendlier voice while retaining technical precision, safety and the existing writing guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README, entry pages, lab guides and blueprints lead with useful reader outcomes and replace repetitive exclusion-list prose with natural explanations.
- [x] #2 Commands, identifiers, technical facts, proposal status and consequential safety and recovery limits remain accurate and visible.
- [x] #3 The strict documentation build and project gates pass; representative rendered pages are inspected in both themes, keyboard navigation, narrow layout, enlarged text and denied storage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Review all reader-facing Markdown, with independent read-only lab and blueprint reviews. Rewrite prose in place without changing workflows, page paths or theme code. Keep important warnings at the affected actions and link to detailed references. Run just check, preview the actual site, review factual preservation and retain verification evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote 43 README/documentation pages, including all 15 lab guides and 17 blueprint pages, around concrete reader activities and connected explanations. Independent reviews checked lab and blueprint meaning; corrected one explorer projection/ledger ambiguity. Structural comparison with c4446e4 preserved all fenced examples, table rows, headings/anchors and external link destinations. just check passed in 23.58s, including strict Nix documentation build. Chromium/axe inspected 12 representative pages in both themes at desktop and 320px with 40px root text, 48 total runs, zero reported violations; 2-3 incomplete checks remain. Real keyboard TOC, drawer, Search, tabs, code copy and section-link workflows passed. Denied local/session storage kept theme and navigation functional; restoring storage recovered the saved theme. Evidence: /home/karl/Projects/artifacts/redpanda-lab/2026-10-15/113406-3bd4a563-76a9-400c-ae07-d61a90be288c. Application behavior, code, commands and theme implementation unchanged; no container E2Es rerun for this prose-only task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Revised README and Zensical prose to lead with useful activities, explain workflows naturally and retain consequential safety/recovery limits near the relevant decisions. Preserved examples, reference tables, headings, links, fictional scope and proposal status. Required project gates and 48 representative browser audit runs passed, with native keyboard and denied-storage smoke proof. Automated accessibility checks retain incomplete-rule limits; formal screen-reader conformance is not claimed.
<!-- SECTION:FINAL_SUMMARY:END -->
