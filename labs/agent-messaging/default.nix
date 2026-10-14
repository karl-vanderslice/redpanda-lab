{ pkgs, common, ... }:
let
  # The pinned nixpkgs pkgs.fx is antonmedv's JSON viewer. Use the real
  # vercel-labs/fx release rather than aliasing that unrelated executable.
  fx = pkgs.callPackage ./fx.nix { };
  node = common.mkNodeImage {
    name = "redpanda-agent-messaging";
    src = common.nodeSource { root = ./.; };
    extraContents = [
      fx
      pkgs.bash
      pkgs.coreutils
    ];
  };
in
node // { inherit fx; }
