{
  writeShellApplication,
  d2,
  coreutils,
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
    for variable in "''${!D2_@}"; do
      unset "$variable"
    done
    unset SCALE DEBUG IMG_CACHE OMIT_VERSION
    arguments=(
      --watch=false --bundle=true
      --layout=elk --theme=0 --pad=32
      --sketch=false --scale=1 --animate-interval=0 --timeout=120 --target=""
    )
    temporary=$(mktemp -d "$directory/.diagram-render.XXXXXXXX")
    trap 'rm -rf -- "$temporary"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    cd -- "$(dirname -- "$source")"
    d2 "''${arguments[@]}" "$source" "$temporary/diagram.svg"
    d2 "''${arguments[@]}" "$source" "$temporary/diagram.png"
    cp -- ${./Source-Code-Pro-OFL.txt} "$temporary/Source-Code-Pro-OFL.txt"
    # UTF-8 escapes preserve the notice without shell-parser quote ambiguity.
    printf '%b\n' \
      'Source Code Pro 2.038 (Regular), bundled by the pinned D2 0.9.0 package.' \
      'Embedded notice: \0302\0251 2010 - 2020 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name \0342\0200\0230Source\0342\0200\0231.' \
      'Licensed under SIL Open Font License 1.1; see Source-Code-Pro-OFL.txt.' \
      'Upstream release: https://github.com/adobe-fonts/source-code-pro/tree/2.038R-ro%2F1.058R-it%2F1.018R-VAR' \
      'The accompanying full release license preserves the upstream 2010-2021 notice; line endings are normalized to LF.' \
      'Bundled regular TTF SHA256: f144137f557805c7327fc4b14d1d730f6e1822e0124170251ff1bcd723a693f1' \
      'Original font metadata remains in the embedded WOFF payload.' \
      'Portable style.font: mono selects the bundled face; no font overrides.' \
      'No standalone font files are distributed with these exports.' \
      > "$temporary/Source-Code-Pro-attribution.txt"
    mv -fT -- "$temporary/Source-Code-Pro-OFL.txt" "$directory/Source-Code-Pro-OFL.txt"
    mv -fT -- "$temporary/Source-Code-Pro-attribution.txt" "$directory/Source-Code-Pro-attribution.txt"
    mv -fT -- "$temporary/diagram.svg" "$stem.svg"
    mv -fT -- "$temporary/diagram.png" "$stem.png"
    printf '%s\n' "$stem.svg" "$stem.png"
  '';
}
