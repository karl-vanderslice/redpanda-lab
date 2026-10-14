{ common, ... }:
common.mkNodeImage {
  name = "redpanda-clearing";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
