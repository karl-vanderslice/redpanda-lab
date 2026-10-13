{ common, ... }:
common.mkNodeImage {
  name = "redpanda-bitcoin";
  src = ./.;
}
