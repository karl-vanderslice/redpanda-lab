{ common, ... }:
common.mkNodeImage {
  name = "redpanda-logistics";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
