{ common, ... }:
common.mkNodeImage {
  name = "redpanda-pos";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
