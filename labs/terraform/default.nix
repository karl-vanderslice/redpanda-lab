{ pkgs, ... }:
let
  terraform = pkgs.terraform;
  provider = pkgs.terraform-providers.kreuzwerker_docker;
  providerMirror = "${provider}/libexec/terraform-providers";
  cliConfig = pkgs.writeText "redpanda-terraform.tfrc" ''
    disable_checkpoint = true
    provider_installation {
      filesystem_mirror {
        path = "${providerMirror}"
        include = ["registry.terraform.io/kreuzwerker/docker"]
      }
    }
  '';
  tool = pkgs.writeShellApplication {
    name = "redpanda-terraform";
    runtimeInputs = [ terraform ];
    text = ''
      export TF_CLI_CONFIG_FILE=${cliConfig}
      export CHECKPOINT_DISABLE=1
      exec terraform "$@"
    '';
  };
  image = pkgs.dockerTools.buildLayeredImage {
    name = "localhost/redpanda-lab-terraform";
    tag = "tf-${terraform.version}-docker-${provider.version}";
    contents = [
      tool
      terraform
      provider
      pkgs.cacert
    ];
    extraCommands = ''
      mkdir -p workspace state tmp run
      mkdir -p share/licenses/redpanda-lab
      cp ${../../LICENSE} share/licenses/redpanda-lab/LICENSE
      chmod 1777 tmp
    '';
    config = {
      Entrypoint = [ "${tool}/bin/redpanda-terraform" ];
      WorkingDir = "/workspace";
      Env = [
        "HOME=/tmp"
        "TF_DATA_DIR=/state/data"
        "TF_IN_AUTOMATION=1"
        "TF_INPUT=0"
      ];
      Labels = {
        "org.opencontainers.image.title" = "Redpanda lab HashiCorp Terraform";
        "org.opencontainers.image.description" = "Offline Nix Docker provider mirror; no cloud credentials";
      };
    };
  };
in
assert terraform.version == "1.16.4";
assert provider.version == "4.6.0";
{
  inherit
    tool
    image
    provider
    providerMirror
    cliConfig
    ;
}
