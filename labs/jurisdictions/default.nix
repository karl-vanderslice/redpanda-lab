{ common, ... }:
common.mkNodeImage {
  name = "redpanda-jurisdictions";
  src = ./.;
}
