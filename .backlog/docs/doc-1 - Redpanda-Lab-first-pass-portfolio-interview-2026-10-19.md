---
id: doc-1
title: 'Redpanda Lab first-pass portfolio interview, 2026-10-19'
type: other
created_date: '2026-10-19 16:28'
updated_date: '2026-10-19 16:33'
---
# First-pass portfolio interview

Date: 2026-10-19. Karl supplied these answers through the parent Ezra interview under EZRA-26. This record preserves the confirmed inputs separately from interpretation.

## Confirmed inputs

### Question 1

**Question:** What do you want Redpanda Lab to be? Choose its primary role, or describe its purpose in your own words.

**Selected label:** `Lab`.

**Offered description:** Hands-on learning and experiments with event streaming and application architectures.

### Question 2

**Question:** Who should Redpanda Lab primarily serve?

**Selected label:** `Both`.

**Offered description:** Support your own experiments and provide useful learning material for others.

### Question 3

**Question:** What should Redpanda Lab emphasize? This sets the direction, not permission to start or change running labs.

**Selected label:** `Both, end to end`.

**Offered description:** Connect broker behavior to working applications so learners can follow events, decisions, failure and recovery across the system.

## Interpretation

Redpanda Lab is a lab for Karl's own experiments and other learners. Its direction connects streaming fundamentals with working application patterns end to end. These answers do not select a new lab, a production blueprint, a release, or a runtime change. They do not narrow the project to broker-only tutorials.

The current README describes real Redpanda brokers, fictional organizations, synthetic data, 16 lab entries, unauthenticated local development behavior, and destructive disposal. Those are existing source descriptions, not runtime proof from this interview. Existing architecture, guides, blueprints, and recorded task states remain intact. RPLAB-13 and RPLAB-27 are existing In Progress work, not interview owners or authority to run or complete them.

## Later project definition

Karl owns the deeper definition. It must establish learning outcomes for personal experiments and other learners, connect broker behavior to application decisions and recovery, and identify explicit scope, non-goals, and authorized verification before implementation. No feature queue or implementation plan is selected here.

The standing portfolio contract says Ezra assists Karl through supported interfaces within project authority, not product end users. Where WebUI/API integration applies, later definition must account for an actually working ezraOS .exe app distinct from projects.exe icons or raw JSON, with a meaningful UI for API-only projects. This is a future interface requirement, not a delivered or activated app. The parent owns Lab category, provenance, tracker icon, and fixed desktop lifecycle work. This record grants no Root source, catalog, or runtime authority.

## Authority and verification limits

This assignment permits planning stewardship, with the validation-only exception recorded below. It does not permit lab code, lifecycle, deployment, resets, broker or application startup, credentials or private data, real payments or market orders, application provider calls, synchronization, or spending. Existing synthetic-data and ownership boundaries remain.

The source check owner is scripts/check, invoked by just check and the always-run lab-validation hook declared in .pre-commit-config.yaml. No active repository pre-commit hook or core.hooksPath override was found during this inspection. Its all-labs path invokes labs/terraform/lab check. Before reaching fmt/validate, that wrapper accesses persistent state, queries Podman, can start a Podman API service, loads a tool image, and runs a container with the Podman socket. These effects exceeded the initial planning authority. Karl subsequently authorized the validation-only exception below. No narrower gate counts as the full suite, and no hook bypass is authorized.

### Validation-only authorization

**Question:** May the coordinator run those existing validation checks for the planning-only change, using fresh isolated Terraform state?

**Selected label:** `Allow validation only`.

**Offered scope:** required temporary validation containers, local Podman API access and service startup if needed; preserve running labs and unrelated processes; no Terraform apply/destroy, lab startup or implementation.

Use supported fresh external private LAB_TF_STATE_DIR and runtime isolation. Before running, check the fixed path-derived tool container name; if occupied, stop without removing or interrupting it. Record whether the check creates its own Podman API service/socket, and stop only that newly task-owned service if safe. Shared image/store effects stay within the existing gate. No config or gate changes, narrower substitute, lab lifecycle operations, or new spending are authorized.

Publication does not authorize website or service activation. No lab runtime behavior was exercised to capture this interview.
