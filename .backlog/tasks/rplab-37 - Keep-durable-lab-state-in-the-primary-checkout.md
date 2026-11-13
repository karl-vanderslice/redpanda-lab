---
id: RPLAB-37
title: Keep durable lab state in the primary checkout
status: Done
assignee:
  - '@omp'
created_date: '2026-11-13T16:50:00Z'
updated_date: '2026-11-13T16:55:00Z'
labels: []
dependencies: []
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Karl approved keeping durable lab state inside the primary checkout in a gitignored directory (onboarding answers, ledger 1d3a1ac6). Terraform state defaulted to tmpfs-backed ~/.local/state and was lost at reboot; saved ports and lifecycle locks lived in reboot-ephemeral XDG cache. Path flake references copy every file in the checkout into the Nix store, so the directory must stay out of flake sources.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Explorer, ordinary labs, sovereignty and Terraform keep port, lock and Terraform state under the primary checkout gitignored .lab-state directory; linked worktrees resolve the same primary directory
- [x] #2 The Terraform outside-checkout guard is removed
- [x] #3 A Nix store path check proves flake sources used by the wrappers exclude .lab-state from the primary checkout and a linked worktree
- [x] #4 AGENTS.md has a Local state section and .gitignore and .containerignore exclude the directory; docs and changelog describe the new location
- [x] #5 Full just check passes, including the Terraform check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lab_state_root to scripts/local-podman: resolve the primary checkout from the Git common dir, create .lab-state with mode 0700, refuse non-Git roots. 2. Use it for explorer, ordinary lab, sovereignty and default Terraform state; drop the Terraform outside-checkout guard; keep LAB_TF_STATE_DIR override; move explorer npm lock caches to XDG cache. 3. Replace path: flake references with the checkout path so Nix uses git+file and copies only tracked files. 4. Ignore /.lab-state/ (.containerignore already excludes everything outside app/), document Local state in AGENTS.md, guides and CHANGELOG. 5. Prove exclusion with nix flake metadata store paths from the primary checkout and a linked worktree; run full just check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From the linked worktree, just urls explorer|iot|sovereignty and just tf urls created and reported state under the primary checkout .lab-state (explorer/, labs/, terraform/<worktree hash>), root mode 0700; a non-Git copy was refused. nix flake metadata for the primary checkout and the worktree resolved git+file sources without .lab-state while the primary .lab-state held Terraform data and a probe file; a path: reference was shown to copy it. .containerignore already excludes everything except LICENSE and app/. Full just check passed, including Terraform init/validate. Observed: the Terraform check left its task-owned podman system service running after exit (the wrapper backgrounds a shell function, so $! is not the podman PID); stopped manually, not changed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Durable lab state (saved ports, lifecycle locks, Terraform state/plans/evidence) now lives in the primary checkout gitignored .lab-state/, resolved through the Git common dir so linked worktrees share it. The Terraform outside-checkout guard is removed; LAB_TF_STATE_DIR still overrides. Wrappers use Git flake references instead of path:, so only tracked files reach the Nix store; lifecycle commands require a Git checkout. AGENTS.md Local state, guides and CHANGELOG updated. Full just check passed. Risk: new untracked source files are invisible to builds until git add.
<!-- SECTION:FINAL_SUMMARY:END -->
