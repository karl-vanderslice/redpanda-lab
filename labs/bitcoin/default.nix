{ common, ... }:
common.mkNodeImage {
  name = "redpanda-bitcoin";
  src = common.nodeSource {
    root = ./.;
    extraFiles = [ ./candles.json ];
  };
}
