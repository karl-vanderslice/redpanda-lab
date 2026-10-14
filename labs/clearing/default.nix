{ common, ... }:
common.mkNodeImage {
  name = "redpanda-clearing";
  src = ./.;
  sharedUI = true;
}
