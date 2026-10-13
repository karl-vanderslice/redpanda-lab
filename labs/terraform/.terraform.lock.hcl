# Nix-built provider package hashes, not upstream release ZIP hashes.
# Mirror provenance: nixpkgs e7439b6b14ad3cc35d05608ebca9bce01a25f5f8.
# linux_amd64 and linux_arm64; keep in step with default.nix.
provider "registry.terraform.io/kreuzwerker/docker" {
  version     = "4.6.0"
  constraints = "4.6.0"
  hashes = [
    "h1:+oBEInfuvezKBdi7qMnKoB3BIDYglciAKHWL0bKE24c=",
    "h1:DdgvD2Z8SdU2gL0EGWciYEcXMJdH4/1l8kqW7RzSO9Q=",
  ]
}
