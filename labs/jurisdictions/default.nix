{ common, ... }:
common.mkNodeImage {
  name = "redpanda-jurisdictions";
  sharedUI = true;
  src = ./.;
}
