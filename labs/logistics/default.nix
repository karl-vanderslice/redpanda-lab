{ common, ... }:
common.mkNodeImage {
  name = "redpanda-logistics";
  src = ./.;
  sharedUI = true;
}
