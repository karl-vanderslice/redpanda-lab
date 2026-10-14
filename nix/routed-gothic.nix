{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "routed-gothic";
  version = "1.0.0";
  src = fetchFromGitHub {
    owner = "dse";
    repo = "routed-gothic";
    rev = "365e340d64c55cb7c57940744773e6c833e3efd9";
    hash = "sha256-3CVnduEQgoxcqAajFLxX0P0jHmBTVBJRX42IyFeyfpY=";
  };
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/share/fonts/truetype" "$out/share/doc/routed-gothic"
    cp dist/ttf/*.ttf "$out/share/fonts/truetype/"
    cp LICENSE.md README.md "$out/share/doc/routed-gothic/"
    runHook postInstall
  '';
  meta = {
    description = "Routed Gothic fonts for structural system diagrams";
    homepage = "https://github.com/dse/routed-gothic";
    license = lib.licenses.ofl;
    platforms = lib.platforms.all;
  };
}
