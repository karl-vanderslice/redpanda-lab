terraform {
  required_version = "= 1.16.4"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 4.6.0"
    }
  }
  # The wrapper initializes this to /state/terraform.tfstate, never the checkout.
  backend "local" {}
}

provider "docker" {
  host = "unix:///run/podman.sock"
}

variable "project" {
  type        = string
  description = "Path-derived rootless resource namespace; do not rename with live state."
  validation {
    condition     = can(regex("^rplab-tf-[a-f0-9]{12}$", var.project))
    error_message = "Use the lab wrapper's path-derived namespace."
  }
}

variable "port_base" {
  type        = number
  description = "Thirteen fixed high loopback ports, persisted by the lab wrapper."
  validation {
    condition     = var.port_base == floor(var.port_base) && var.port_base >= 49152 && var.port_base <= 65520
    error_message = "port_base must be an integer between 49152 and 65520."
  }
}

variable "redpanda_image" {
  type        = string
  description = "Redpanda v26.2.4 image pinned to the shared immutable digest."
  validation {
    condition     = can(regex("^registry-1\\.docker\\.io/redpandadata/redpanda:v26\\.2\\.4@sha256:[a-f0-9]{64}$", var.redpanda_image))
    error_message = "Use the v26.2.4 digest pin from images.env."
  }
}

variable "console_image" {
  type        = string
  description = "Immutable Console v3.12.0 digest."
  validation {
    condition     = can(regex("^registry-1\\.docker\\.io/redpandadata/console:v3\\.12\\.0@sha256:[a-f0-9]{64}$", var.console_image))
    error_message = "Use the v3.12.0 digest pin from images.env."
  }
}

variable "console_enabled" {
  type        = bool
  default     = true
  description = "Create the stateless Console; the drift exercise requires it."
}

locals {
  brokers = { for n in range(3) : "broker-${n}" => n }
  owner   = "io.redpanda.lab.project"
  console_config = yamlencode({
    kafka = {
      brokers = [for name in sort(keys(local.brokers)) : "${name}:9092"]
    }
    schemaRegistry = {
      enabled = true
      urls    = [for name in sort(keys(local.brokers)) : "http://${name}:8081"]
    }
    redpanda = {
      adminApi = {
        enabled = true
        urls    = [for name in sort(keys(local.brokers)) : "http://${name}:9644"]
      }
    }
  })
}

resource "docker_network" "cluster" {
  name   = "${var.project}-network"
  driver = "bridge"
  # Podman's Docker API exposes the netavark IPAM option on refresh.
  ipam_options = { driver = "host-local" }
  labels {
    label = local.owner
    value = var.project
  }
}

# Images are shared immutable cache entries, not exclusive lab-owned data.
resource "docker_image" "redpanda" {
  name         = var.redpanda_image
  keep_locally = true
}

resource "docker_image" "console" {
  count        = var.console_enabled ? 1 : 0
  name         = var.console_image
  keep_locally = true
}

resource "docker_volume" "data" {
  for_each = local.brokers
  name     = "${var.project}-${each.key}-data"
  labels {
    label = local.owner
    value = var.project
  }
}

resource "docker_container" "broker" {
  for_each              = local.brokers
  name                  = "${var.project}-${each.key}"
  hostname              = each.key
  image                 = docker_image.redpanda.image_id
  memory                = 1024
  memory_swap           = 2048
  must_run              = true
  restart               = "no"
  stop_timeout          = 30
  destroy_grace_seconds = 30
  remove_volumes        = false
  # The Docker provider detaches the initial bridge before adding these aliases.
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.cluster.name
    aliases = [each.key]
  }
  labels {
    label = local.owner
    value = var.project
  }
  labels {
    label = "io.redpanda.lab.role"
    value = "broker"
  }
  volumes {
    volume_name    = docker_volume.data[each.key].name
    container_path = "/var/lib/redpanda/data"
  }
  ports {
    internal = 19092
    external = var.port_base + each.value
    ip       = "127.0.0.1"
  }
  ports {
    internal = 9644
    external = var.port_base + 3 + each.value
    ip       = "127.0.0.1"
  }
  ports {
    internal = 18082
    external = var.port_base + 6 + each.value
    ip       = "127.0.0.1"
  }
  ports {
    internal = 18081
    external = var.port_base + 9 + each.value
    ip       = "127.0.0.1"
  }
  command = concat([
    "redpanda", "start",
    "--mode", "dev-container", "--smp", "1", "--memory", "768M",
    "--kafka-addr", "internal://0.0.0.0:9092,external://0.0.0.0:19092",
    "--advertise-kafka-addr", "internal://${each.key}:9092,external://127.0.0.1:${var.port_base + each.value}",
    "--rpc-addr", "0.0.0.0:33145",
    "--advertise-rpc-addr", "${each.key}:33145",
    "--pandaproxy-addr", "internal://0.0.0.0:8082,external://0.0.0.0:18082",
    "--advertise-pandaproxy-addr", "internal://${each.key}:8082,external://127.0.0.1:${var.port_base + 6 + each.value}",
    "--schema-registry-addr", "internal://0.0.0.0:8081,external://0.0.0.0:18081",
    "--default-log-level", "info"
  ], each.value == 0 ? [] : ["--seeds", "broker-0:33145"])
}

resource "docker_container" "console" {
  count                 = var.console_enabled ? 1 : 0
  name                  = "${var.project}-console"
  image                 = docker_image.console[0].image_id
  memory                = 256
  memory_swap           = 512
  must_run              = true
  restart               = "no"
  stop_timeout          = 10
  destroy_grace_seconds = 10
  remove_volumes        = false
  network_mode          = "bridge"
  networks_advanced {
    name    = docker_network.cluster.name
    aliases = ["console"]
  }
  labels {
    label = local.owner
    value = var.project
  }
  labels {
    label = "io.redpanda.lab.role"
    value = "console"
  }
  # Upload uses the API, not a host-path bind. The tool cannot write the checkout.
  upload {
    file        = "/tmp/console.yml"
    content     = local.console_config
    permissions = "0644"
  }
  env = ["CONFIG_FILEPATH=/tmp/console.yml"]
  ports {
    internal = 8080
    external = var.port_base + 12
    ip       = "127.0.0.1"
  }
  depends_on = [docker_container.broker]
}

output "project" {
  value = var.project
}

output "brokers" {
  value = { for name, n in local.brokers : name => {
    container = docker_container.broker[name].name
    kafka     = "127.0.0.1:${var.port_base + n}"
    admin     = "http://127.0.0.1:${var.port_base + 3 + n}"
    proxy     = "http://127.0.0.1:${var.port_base + 6 + n}"
    schema    = "http://127.0.0.1:${var.port_base + 9 + n}"
  } }
}

output "console" {
  value = var.console_enabled ? "http://127.0.0.1:${var.port_base + 12}" : null
}
