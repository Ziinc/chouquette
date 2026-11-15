#!/usr/bin/env bash
# Builds Node as a shared library (libnode) for the embedded Node runtime,
# with its headers: Node publishes no prebuilt libnode.
#
#   scripts/build-libnode.sh <version> <out-dir> [work-dir]
#
# <out-dir> gets lib/ (libnode.so.<abi>, libnode.dylib or libnode.dll and
# its import library) and include/node/. The source tarball is checked
# against nodejs.org's SHASUMS256.txt.
set -euo pipefail

version=${1:?usage: build-libnode.sh <version> <out-dir> [work-dir]}
out=$(mkdir -p "$2" && cd "$2" && pwd)
work=${3:-$(mktemp -d)}
mkdir -p "$work" && cd "$work"

tarball=node-$version.tar.xz
curl -fsSLO "https://nodejs.org/dist/$version/$tarball"
curl -fsSL "https://nodejs.org/dist/$version/SHASUMS256.txt" | grep " $tarball\$" | sha256sum -c -
rm -rf "node-$version" && tar xf "$tarball" && cd "node-$version"

jobs=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)
    # vcbuild makes libnode.dll and its import library.
    ./vcbuild.bat release dll x64 no-cctest nonpm
    mkdir -p "$out/lib" && cp out/Release/libnode.dll out/Release/libnode.lib "$out/lib/"
    ;;
  *)
    ./configure --shared --without-npm --without-inspector --with-intl=small-icu
    make -j"$jobs"
    mkdir -p "$out/lib"
    cp -P out/Release/libnode.* "$out/lib/" 2>/dev/null || cp -P out/Release/lib/libnode.* "$out/lib/"
    ;;
esac

# Headers: Node's, V8's, libuv's and their config, as `make install` lays them out.
python3 tools/install.py install --headers-only --dest-dir "$out/root" --prefix /
mv "$out/root/include" "$out/include" && rm -rf "$out/root"
echo "libnode $version in $out"
ls -la "$out/lib"
