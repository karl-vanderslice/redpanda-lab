{ pkgs }:
let
  lock = builtins.fromJSON (builtins.readFile ./package-lock.json);
  dependency = lock.packages."node_modules/kafkajs";
  kafkaArchive = pkgs.fetchurl {
    url = dependency.resolved;
    hash = dependency.integrity;
  };
  kafkaClient =
    pkgs.runCommand "kafkajs-${dependency.version}"
      {
        nativeBuildInputs = [
          pkgs.gnutar
          pkgs.gzip
        ];
      }
      ''
        mkdir -p "$out"
        tar -xzf ${kafkaArchive} --strip-components=1 -C "$out"
      '';
  mkNodeImage =
    {
      name,
      src,
      extraContents ? [ ],
      command ? null,
    }:
    let
      labName = pkgs.lib.removePrefix "redpanda-" name;
      app = pkgs.runCommand "${name}-application" { } ''
        mkdir -p "$out/app/${labName}" "$out/app/common" "$out/app/node_modules" "$out/tmp"
        cp -R ${src}/. "$out/app/${labName}/"
        cp ${./log.mjs} "$out/app/common/log.mjs"
        cp ${./http.mjs} "$out/app/common/http.mjs"
        ln -s ${kafkaClient} "$out/app/node_modules/kafkajs"
        install -Dm644 ${../../LICENSE} "$out/share/licenses/redpanda-lab/LICENSE"
      '';
      image = pkgs.dockerTools.buildLayeredImage {
        name = "localhost/${name}";
        tag = "nix";
        contents = [
          app
          pkgs.nodejs_22
          pkgs.cacert
        ]
        ++ extraContents;
        config = {
          User = "10001:10001";
          WorkingDir = "/app/${labName}";
          Env = [
            "NODE_ENV=production"
            "PATH=/bin"
            "HOME=/tmp"
          ];
          Cmd =
            if command == null then
              [
                "${pkgs.nodejs_22}/bin/node"
                "/app/${labName}/server.mjs"
              ]
            else
              command;
          ExposedPorts."3000/tcp" = { };
        };
      };
    in
    {
      inherit app image;
    };
in
{
  inherit mkNodeImage kafkaClient;
}
