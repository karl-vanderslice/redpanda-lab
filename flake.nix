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
      # Function applications are not memoized; share one instance per system.
      pkgsBySystem = forAllSystems (
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfreePredicate = pkg: (nixpkgs.lib.getName pkg) == "terraform";
        }
      );
      pkgsFor = system: pkgsBySystem.${system};
      toolsFor =
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          diagram-render = pkgs.callPackage ./nix/diagrams.nix { };
          podman-compose = pkgs.podman-compose.overrideAttrs (old: {
            patches = (old.patches or [ ]) ++ [ ./nix/podman-compose-lifecycle-status.patch ];
            patchFlags = [
              "-p1"
              "--fuzz=0"
            ];
          });
          local-podman = pkgs.writeShellApplication {
            name = "redpanda-local-podman";
            text = ''
              exec ${pkgs.podman}/bin/podman --remote=false "$@"
            '';
          };
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
          "sovereignty"
          "iot"
          "pos"
          "logistics"
          "event-log"
          "siem"
          "activity"
          "inventory"
          "clearing"
        ] (name: import (./labs + "/${name}/default.nix") { inherit pkgs common; });
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          labs = labsFor system;
          tools = toolsFor system;
          model = import ./labs/common/model.nix { inherit pkgs; };
          terraform = import ./labs/terraform/default.nix { inherit pkgs; };
        in
        nixpkgs.lib.mapAttrs (_: lab: lab.app) labs
        // nixpkgs.lib.mapAttrs' (name: lab: nixpkgs.lib.nameValuePair "${name}-image" lab.image) labs
        // {
          inherit (tools) diagram-render;
          documentation = pkgs.callPackage ./nix/docs.nix {
            src = nixpkgs.lib.fileset.toSource {
              root = ./.;
              fileset = nixpkgs.lib.fileset.unions [
                ./docs
                ./docs-theme
                ./zensical.toml
                ./scripts/docs
                ./scripts/diagrams
              ];
            };
            inherit (tools) diagram-render;
          };
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
          tools = toolsFor system;
        in
        {
          default = pkgs.mkShell {
            # Nix supplies the engine; the host supplies kernel namespaces and UID/GID helpers.
            REDPANDA_LAB_PODMAN = "${tools.local-podman}/bin/redpanda-local-podman";
            packages = with pkgs; [
              podman
              tools.podman-compose
              nodejs_22
              curl
              jq
              bash
              coreutils
              util-linux
              just
              zensical
              shellcheck
              actionlint
              nixfmt
              git
              gh
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
              tools.diagram-render
              tools.local-podman
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
