{ common, ... }:
common.mkNodeImage {
  name = "redpanda-siem";
  src = ./.;
  sharedUI = true;
}
