{
  runCommand,
  bash,
  coreutils,
  zensical,
  diagram-render,
  src,
}:
runCommand "redpanda-lab-documentation"
  {
    nativeBuildInputs = [
      bash
      coreutils
      zensical
      diagram-render
    ];
  }
  ''
    export REDPANDA_LAB_SHELL=1
    export XDG_CACHE_HOME="$TMPDIR/cache"
    bash ${src}/scripts/docs build "$out"
  ''
