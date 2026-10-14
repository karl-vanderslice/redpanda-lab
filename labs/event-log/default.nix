{ common, ... }:
common.mkNodeImage {
  name = "redpanda-event-log";
  src = ./.;
  sharedUI = true;
}
