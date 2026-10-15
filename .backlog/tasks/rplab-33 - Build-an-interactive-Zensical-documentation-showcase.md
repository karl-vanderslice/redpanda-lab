---
id: RPLAB-33
title: Build an interactive Zensical documentation showcase
status: Done
assignee:
  - '@omp'
created_date: '2026-10-15 16:03'
updated_date: '2026-10-15 16:57'
labels: []
dependencies: []
type: enhancement
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn the GitHub documentation into a visual showcase using supported Zensical authoring features, terminal-style commands, an original project logo/favicon and responsive diagrams with mouse zoom/pan. Preserve all lab behavior, safety and recovery guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Review the requested official Zensical setup and Markdown docs against pinned 0.0.62; use supported local features and record material compatibility decisions.
- [x] #2 Homepage and lab/blueprint entry pages provide a coherent visual showcase with useful navigation and terminal-style examples; replace tab-dependent walkthroughs without losing alternatives or warnings.
- [x] #3 Original project logo and favicon load locally and remain legible in both themes.
- [x] #4 All full-size blueprint diagrams fit responsive containers and support mouse drag, anchored zoom, fit/reset and an expanded view; equivalent keyboard and single-pointer controls preserve access to all diagram content.
- [x] #5 Project gates, strict docs build and browser workflows pass in both themes, narrow layout, enlarged text, denied storage and reduced motion; checked GitHub Pages deployment is verified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use a neutral slate/blue documentation palette with a restrained warm accent, original stream-node mark, a two-column editorial homepage and native icon cards/buttons. Keep system-default remembered light/dark controls and existing search/navigation adapters. Style native shell fences as terminals with runnable copy contents. Replace content tabs with visible sequential alternatives. Extend the existing local blueprint viewer rather than enabling the pinned GLightbox adapter, whose bundle fetches an unpinned remote CDN. Provide bounded pan/zoom, pointer capture, keyboard and button controls, native modal expansion with Escape/focus restoration, responsive resize, static/no-JS fallback and SVG/PNG access. Preserve generated D2 sources/exports. Verify actual browser behavior, 320px and enlarged-text reflow, both themes, denied storage, reduced motion, image failure and keyboard navigation. Run existing gates, retain replayable evidence, signed commit and checked publication.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented native Zensical cards/buttons/icons, terminal shell examples, original stream-node logo/favicon, visible alternative walkthroughs and responsive mouse/keyboard diagram canvas with expansion. Reviewed official docs against pinned 0.0.62; retained local viewer because native GLightbox fetches unpinned CDN. All 44 pages passed both themes at desktop and 320px/40px root text (176 browser audits, zero violations, 2-3 incomplete checks). Command bodies/order are preserved across all seven changed Markdown pages. Mouse drag, anchored Ctrl-wheel zoom, pan buttons/keys, fit, modal shortcut isolation/focus, denied storage, reduced motion, copy/search/navigation, annotations, image failure, no-JS fallback and actual printing passed. Prek and just check passed. Evidence: /home/karl/Projects/artifacts/redpanda-lab/2026-10-15/121024-212082c6-be80-47e4-a9b1-b00cec2e5876. Remote publication remains pending; formal screen-reader and touch-device checks were not run.

Signed showcase aa3780d1c54b5b05af568f93e342d8823ab8451d is published. Exact-SHA Checks and Pages run 38769968036 succeeded (check/build 7m38s, Pages 8m35s). Actual hosted homepage uses the local stream-mark logo/favicon, native cards and terminal blocks with no tabs. Hosted trading diagram reached natural label scale, expanded as a focused native modal and returned focus after the asynchronous close event. Retained publication receipt and browser proof are in the registered 2026-10-15/121024-212082c6-be80-47e4-a9b1-b00cec2e5876 artifact run. No screen-reader or complete accessibility conformance claim.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published a native Zensical visual showcase with an original local logo/favicon, cards, terminal-style examples and visible walkthrough alternatives. Responsive blueprint canvases support mouse drag, anchored zoom, keyboard/button pan, fit and native modal expansion. All 44 pages passed four theme/layout combinations; command preservation, static/error fallbacks, printing, storage denial, reduced motion and focused browser workflows passed. Project gates, signed publication and actual hosted behavior are verified.
<!-- SECTION:FINAL_SUMMARY:END -->
