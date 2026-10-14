{ common, ... }:
common.mkNodeImage {
  name = "redpanda-pos";
  src = ./.;
  sharedUI = true;
}
