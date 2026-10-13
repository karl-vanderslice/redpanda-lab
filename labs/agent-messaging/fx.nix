{
  lib,
  stdenvNoCC,
  fetchurl,
}:
let
  releases = {
    x86_64-linux = {
      arch = "x86_64";
      hash = "sha256-U6OzDOFUEEj4+ktCt7xoFhRmuy43CNsQREmlivOAdDA=";
    };
    aarch64-linux = {
      arch = "aarch64";
      hash = "sha256-ePaoFxGTodIDP5PRtaKUDqSmIUfa9go3rmcKm/hfEuk=";
    };
  };
  release =
    releases.${stdenvNoCC.hostPlatform.system}
      or (throw "The fx lab supports Linux x86_64 and aarch64 release binaries.");
in
stdenvNoCC.mkDerivation {
  pname = "vercel-labs-fx";
  version = "0.0.13";
  src = fetchurl {
    url = "https://github.com/vercel-labs/fx/releases/download/v0.0.13/fx-linux-${release.arch}.tar.gz";
    hash = release.hash;
  };
  sourceRoot = ".";
  dontConfigure = true;
  dontBuild = true;
  dontStrip = true;
  installPhase = ''
    runHook preInstall
    install -Dm755 fx "$out/bin/fx"
    install -Dm644 LICENSE "$out/share/licenses/vercel-labs-fx/LICENSE"
    install -Dm644 THIRD_PARTY_NOTICES.md "$out/share/licenses/vercel-labs-fx/THIRD_PARTY_NOTICES.md"
    runHook postInstall
  '';
  meta = {
    description = "Upstream Vercel Labs terminal coding-agent harness (not the fx JSON viewer)";
    homepage = "https://github.com/vercel-labs/fx";
    license = lib.licenses.asl20;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
    mainProgram = "fx";
  };
}
