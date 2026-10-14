{
  description = "Disposable Redpanda explorer and isolated application labs";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfreePredicate = pkg: (nixpkgs.lib.getName pkg) == "terraform";
        };
      labsFor =
        system:
        let
          pkgs = pkgsFor system;
          common = import ./labs/common { inherit pkgs; };
        in
        nixpkgs.lib.genAttrs [
          "trading"
          "sports"
          "agent-messaging"
          "agent-chat"
          "bitcoin"
          "jurisdictions"
          "iot"
          "pos"
          "logistics"
        ] (name: import (./labs + "/${name}/default.nix") { inherit pkgs common; });
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          labs = labsFor system;
          model = import ./labs/common/model.nix { inherit pkgs; };
          terraform = import ./labs/terraform/default.nix { inherit pkgs; };
        in
        nixpkgs.lib.mapAttrs (_: lab: lab.app) labs
        // nixpkgs.lib.mapAttrs' (name: lab: nixpkgs.lib.nameValuePair "${name}-image" lab.image) labs
        // {
          model-image = model.image;
          small-model = model.model;
          terraform-image = terraform.image;
          terraform = terraform.tool;
          fx-agent = labs.agent-messaging.fx;
        }
      );
      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            # Nix supplies the engine; the host supplies kernel namespaces and UID/GID helpers.
            packages = with pkgs; [
              podman
              podman-compose
              nodejs_22
              curl
              jq
              bash
              coreutils
              util-linux
              just
              zensical
              shellcheck
              nixfmt
              git
              skopeo
              prek
              iproute2
              cargo
              rustc
              rustfmt
              clippy
              pkg-config
              openssl
              ffmpeg
            ];
            shellHook = ''
              export REDPANDA_LAB_SHELL=1
              export npm_config_cache="''${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/npm"
              export CARGO_TARGET_DIR="''${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/cargo-target"
              export CARGO_HOME="''${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/cargo"
            '';
          };
        }
      );
    };
}
