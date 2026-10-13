{ pkgs, common, ... }:
let
  media =
    pkgs.runCommand "sports-original-synthetic-media"
      {
        nativeBuildInputs = [ pkgs.ffmpeg ];
      }
      ''
        mkdir -p "$out"
        for sport in basketball hockey soccer football; do
          case "$sport" in
            basketball) color=0x705039 ;;
            hockey) color=0x294b60 ;;
            soccer) color=0x244d39 ;;
            football) color=0x284536 ;;
          esac
          ffmpeg -hide_banner -loglevel error -nostdin \
            -f lavfi -i "color=c=$color:s=960x540:r=24:d=18" \
            -f lavfi -i "color=c=0xe33e50:s=20x20:r=24:d=18" \
            -filter_complex "[0:v]drawbox=x=70:y=55:w=820:h=430:color=white@0.7:t=2,drawbox=x=479:y=55:w=2:h=430:color=white@0.7:t=fill,drawbox=x=370:y=170:w=220:h=200:color=white@0.5:t=2,drawgrid=w=164:h=108:t=1:c=white@0.08[court];[court][1:v]overlay=x='470+330*sin(t*0.7)':y='260+150*cos(t*1.1)':shortest=1,format=yuv420p[video]" \
            -map '[video]' -an -c:v libx264 -preset medium -crf 24 -threads 1 \
            -flags +bitexact -fflags +bitexact -map_metadata -1 -movflags +faststart \
            "$out/$sport.mp4"
        done
      '';
  source = pkgs.runCommand "sports-app-with-local-media" { } ''
    mkdir -p "$out"
    cp -R ${./.}/. "$out/"
    chmod -R u+w "$out"
    mkdir -p "$out/public/media"
    cp ${media}/*.mp4 "$out/public/media/"
  '';
in
common.mkNodeImage {
  name = "redpanda-sports";
  src = source;
}
