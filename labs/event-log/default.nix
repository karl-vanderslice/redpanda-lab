{ common, ... }:
common.mkNodeImage {
  name = "redpanda-event-log";
  src = common.nodeSource { root = ./.; };
  sharedUI = true;
}
