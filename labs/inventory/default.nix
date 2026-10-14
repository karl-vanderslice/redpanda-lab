{ common, ... }:
common.mkNodeImage {
  name = "redpanda-inventory";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
