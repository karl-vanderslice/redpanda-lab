{ common, ... }:
common.mkNodeImage {
  name = "redpanda-inventory";
  src = ./.;
  sharedUI = true;
}
