{ common, ... }:
common.mkNodeImage {
  name = "redpanda-activity";
  src = ./.;
  sharedUI = true;
}
