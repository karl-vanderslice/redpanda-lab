{ common, ... }:
common.mkNodeImage {
  name = "redpanda-iot";
  src = ./.;
  sharedUI = true;
}
