{
  writeShellApplication,
  d2,
  coreutils,
  routed-gothic,
}:
assert d2.version == "0.9.0";
writeShellApplication {
  name = "diagram-render";
  inheritPath = false;
  runtimeInputs = [
    d2
    coreutils
  ];
  text = ''
    if [[ $# != 2 || -z $1 || -z $2 ]]; then
      printf 'Usage: diagram-render SOURCE.d2 OUTPUT-STEM\n' >&2
      exit 2
    fi
    source=$(realpath -e -- "$1")
    if [[ ! -f $source || $source != *.d2 ]]; then
      printf 'Input must be a regular .d2 file: %s\n' "$source" >&2
      exit 2
    fi
    stem=$(realpath -m -- "$2")
    directory=$(dirname -- "$stem")
    if [[ ! -d $directory || $stem == / ]]; then
      printf 'Output directory must exist: %s\n' "$directory" >&2
      exit 2
    fi
    for suffix in svg png; do
      if [[ -e $stem.$suffix && ! -f $stem.$suffix ]]; then
        printf 'Output is not a regular file: %s.%s\n' "$stem" "$suffix" >&2
        exit 2
      fi
    done
    regular=${routed-gothic}/share/fonts/truetype/routed-gothic.ttf
    italic=${routed-gothic}/share/fonts/truetype/routed-gothic-italic.ttf
    license=${routed-gothic}/share/doc/routed-gothic/LICENSE.md
    for required in "$regular" "$italic" "$license"; do
      if [[ ! -f $required ]]; then
        printf 'Required font closure file is missing: %s\n' "$required" >&2
        exit 1
      fi
    done
    for variable in "''${!D2_@}"; do
      unset "$variable"
    done
    unset SCALE DEBUG IMG_CACHE OMIT_VERSION
    arguments=(
      --watch=false --bundle=true
      --layout=elk --theme=0 --pad=32
      --sketch=false --scale=1 --animate-interval=0 --timeout=120 --target=""
      "--font-regular=$regular" "--font-italic=$italic"
      "--font-bold=$regular" "--font-semibold=$regular"
    )
    temporary=$(mktemp -d "$directory/.diagram-render.XXXXXXXX")
    trap 'rm -rf -- "$temporary"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    cd -- "$(dirname -- "$source")"
    d2 "''${arguments[@]}" "$source" "$temporary/diagram.svg"
    d2 "''${arguments[@]}" "$source" "$temporary/diagram.png"
    cp -- "$license" "$temporary/Routed-Gothic-OFL.txt"
    printf '%s\n' \
      'Routed Gothic 1.0.0 by Darren Embry.' \
      'Copyright (c) 2017 Darren Embry. Reserved Font Name: Routed Gothic.' \
      'Licensed under SIL Open Font License 1.1; see Routed-Gothic-OFL.txt.' \
      'Source: https://github.com/dse/routed-gothic' \
      'Revision: 365e340d64c55cb7c57940744773e6c833e3efd9' \
      'Website: https://webonastick.com/fonts/routed-gothic/' \
      'SVG exports embed WOFF derived from the unchanged supplied font faces.' \
      'Regular, bold and semibold slots use regular; italic uses the italic face.' \
      'No standalone font files are distributed with these exports.' \
      > "$temporary/Routed-Gothic-attribution.txt"
    mv -fT -- "$temporary/Routed-Gothic-OFL.txt" "$directory/Routed-Gothic-OFL.txt"
    mv -fT -- "$temporary/Routed-Gothic-attribution.txt" "$directory/Routed-Gothic-attribution.txt"
    mv -fT -- "$temporary/diagram.svg" "$stem.svg"
    mv -fT -- "$temporary/diagram.png" "$stem.png"
    printf '%s\n' "$stem.svg" "$stem.png"
  '';
}
