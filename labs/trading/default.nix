{ pkgs, ... }:
let
  app = pkgs.rustPlatform.buildRustPackage {
    pname = "commodity-exchange";
    version = "0.1.0";
    src = ./.;
    cargoLock.lockFile = ./Cargo.lock;
    postInstall = ''
      install -Dm644 ${../../LICENSE} "$out/share/licenses/redpanda-lab/LICENSE"
    '';
    meta = {
      description = "Simulated commodity exchange backed by a Redpanda execution log";
      license = pkgs.lib.licenses.mit;
      mainProgram = "commodity-exchange";
      platforms = pkgs.lib.platforms.linux;
    };
  };
  image = pkgs.dockerTools.buildLayeredImage {
    name = "localhost/redpanda-trading";
    tag = "nix";
    contents = [ app ];
    config = {
      User = "10001:10001";
      WorkingDir = "/tmp";
      Env = [
        "PATH=${app}/bin"
        "REDPANDA_PROXY_URL=http://redpanda:8082"
      ];
      Cmd = [
        "${app}/bin/commodity-exchange"
        "serve"
      ];
      ExposedPorts = {
        "3000/tcp" = { };
      };
    };
  };
in
{
  inherit app image;
}
