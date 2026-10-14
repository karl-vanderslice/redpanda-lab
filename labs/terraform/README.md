# Foundry Harbor Infrastructure

A fictional infrastructure review desk. HashiCorp Terraform and the Docker provider manage a real three-broker Redpanda cluster through the current user's rootless Podman Unix API. Saved plans authorize changes; Terraform state identifies infrastructure, not backed-up broker records.

From the repository root, enter the [common Nix environment](../../docs/reference/commands.md), then review the artifact before applying:

```bash
./labs/terraform/lab plan
./labs/terraform/lab show
read -r -p 'SHA256 of the plan you reviewed: ' REVIEWED_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_SHA256"
./labs/terraform/lab status
./labs/terraform/lab urls
```

The [scenario guide](../../docs/labs/terraform.md) describes socket/state ownership, exact pins, persisted ports, partial failure, drift repair, reviewed destruction, tuning and the proposed production blueprint. The socket grants broad host-user authority even when mounted read-only. Do not point existing state at another engine or erase ownership evidence to bypass a check. Hash approval is not enterprise identity or separation of duties.

```bash
./labs/terraform/lab check
./labs/terraform/lab down
```

Interactive `down` displays a destroy plan and requires the project name. It permanently deletes all three data volumes, including records created outside Terraform. State backups/plans cannot recover them; shared images and private evidence remain. `./labs/terraform/lab test` requires empty owned state/resources with Console enabled and retains resources on failure. Do not start the cluster before that test.

Terraform 1.16.4, Docker provider 4.6.0 and immutable Redpanda/Console images retain their licensing. A local Redpanda 26.2.4 RF1 probe accepted `acks=-1` with `min.insync.replicas=2`; the example does not set or rely on that property. See [delivery and stable storage](../../docs/reference/tuning.md#delivery-is-not-stable-storage) for Raft and development-storage limits.