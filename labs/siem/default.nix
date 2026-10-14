{ common, ... }:
common.mkNodeImage {
  name = "redpanda-siem";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
