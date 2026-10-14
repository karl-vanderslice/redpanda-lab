{ common, ... }:
common.mkNodeImage {
  name = "redpanda-agent-chat";
  src = common.nodeSource { root = ./.; };
}
