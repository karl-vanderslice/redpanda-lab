{ common, ... }:
common.mkNodeImage {
  name = "redpanda-sovereignty";
  sharedUI = true;
  src = common.nodeSource { root = ./.; };
}
