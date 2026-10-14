{ common, ... }:
common.mkNodeImage {
  name = "redpanda-activity";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
