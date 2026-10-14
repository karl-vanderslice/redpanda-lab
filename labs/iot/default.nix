{ common, ... }:
common.mkNodeImage {
  name = "redpanda-iot";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
