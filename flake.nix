{
  description = "Disposable rootless Podman Redpanda exploration lab";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; }; in {
          default = pkgs.mkShell {
            # Rootless Podman itself must come from the host so it can use setuid newuidmap/newgidmap.
            packages = with pkgs; [ podman-compose nodejs_22 curl jq bash coreutils util-linux ];
            shellHook = ''
              export REDPANDA_LAB_SHELL=1
              export npm_config_cache="''${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/npm"
            '';
          };
        });
    };
}
