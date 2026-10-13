{ pkgs }:
let
  model = pkgs.fetchurl {
    url = "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/09816acd5d99df7be770d85ea30822623dab342c/SmolLM2-135M-Instruct-Q8_0.gguf";
    hash = "sha256-WhOVcW95E3QcxR2YWBubEijYCYep99NmQQZ0LrBruoM=";
  };
  license = pkgs.fetchurl {
    url = "https://www.apache.org/licenses/LICENSE-2.0.txt";
    hash = "sha256-z8d0m5b2O9McPEK1xHG/dWgUBT6EfBDz6wA0F7xSPTA=";
  };
  modelCard = pkgs.fetchurl {
    url = "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/raw/09816acd5d99df7be770d85ea30822623dab342c/README.md";
    hash = "sha256-CbHwWULRH1xHqsl4nd5vqOQxzdVBAoUyp/tvHA5j2Tk=";
  };
  modelFiles = pkgs.runCommand "redpanda-lab-small-model" { } ''
    mkdir -p "$out/model" "$out/tmp"
    ln -s ${model} "$out/model/model.gguf"
    cp ${license} "$out/model/LICENSE"
    cp ${modelCard} "$out/model/MODEL_CARD.md"
    install -Dm644 ${../../LICENSE} "$out/share/licenses/redpanda-lab/LICENSE"
  '';
  engine = pkgs.llama-cpp;
  image = pkgs.dockerTools.buildLayeredImage {
    name = "localhost/redpanda-lab-model";
    tag = "nix";
    contents = [
      modelFiles
      engine
      pkgs.curl
      pkgs.cacert
    ];
    config = {
      User = "10001:10001";
      Env = [
        "PATH=/bin"
        "HOME=/tmp"
        "OMP_NUM_THREADS=2"
      ];
      Entrypoint = [ "${engine}/bin/llama-server" ];
      Cmd = [
        "-m"
        "/model/model.gguf"
        "--host"
        "0.0.0.0"
        "--port"
        "8080"
        "-c"
        "8192"
        "-np"
        "1"
        "-t"
        "2"
        "--alias"
        "lab-small"
        "--jinja"
      ];
      ExposedPorts."8080/tcp" = { };
    };
  };
in
{
  inherit model engine image;
}
