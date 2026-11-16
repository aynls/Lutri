#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'Build the Lutri macOS runtime on an Apple Silicon Mac using a native shell.' >&2
  exit 1
fi
if ! command -v cmake >/dev/null || ! xcrun --find clang >/dev/null; then
  echo 'Install CMake and the Xcode Command Line Tools to build the Lutri macOS runtime.' >&2
  exit 1
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
resource_dir="$project_dir/src-tauri/resources/upscale"
manifest="$resource_dir/manifest.json"
output_dir="$resource_dir/macos-aarch64"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/lutri-macos-ncnn.XXXXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT

manifest_value() {
  plutil -extract "$1" raw -o - "$manifest"
}

download_archive() {
  local url checksum archive
  url="$(manifest_value "$1")"
  checksum="$(manifest_value "$2")"
  archive="$3"
  curl --fail --silent --show-error --location --retry 3 --output "$archive" "$url"
  printf '%s  %s\n' "$checksum" "$archive" | shasum -a 256 --check
}

ncnn_archive="$build_dir/ncnn.zip"
moltenvk_archive="$build_dir/MoltenVK.tar"
moltenvk_path='MoltenVK/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib'
download_archive macosSource macosSourceSha256 "$ncnn_archive"
download_archive moltenVkSource moltenVkSourceSha256 "$moltenvk_archive"
unzip -q "$ncnn_archive" -d "$build_dir/source"
tar -xf "$moltenvk_archive" -C "$build_dir" "$moltenvk_path"

# SimpleVK loads the bundled MoltenVK path supplied by the runtime. SimpleOMP
# keeps CPU threading available without a separate OpenMP dylib.
cmake -S "$build_dir/source" -B "$build_dir/build" -G 'Unix Makefiles' \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 \
  -DNCNN_VERSION="$(manifest_value ncnnRelease)" \
  -DNCNN_SHARED_LIB=ON \
  -DNCNN_C_API=ON \
  -DNCNN_VULKAN=ON \
  -DNCNN_SIMPLEVK=ON \
  -DNCNN_OPENMP=ON \
  -DNCNN_SIMPLEOMP=ON \
  -DNCNN_BUILD_BENCHMARK=OFF \
  -DNCNN_BUILD_EXAMPLES=OFF \
  -DNCNN_BUILD_TOOLS=OFF
cmake --build "$build_dir/build" --parallel "${CMAKE_BUILD_PARALLEL_LEVEL:-$(sysctl -n hw.logicalcpu)}"
cmake --install "$build_dir/build" --prefix "$build_dir/install"

ncnn_library="$build_dir/install/lib/libncnn.dylib"
moltenvk_library="$build_dir/$moltenvk_path"
xcrun lipo "$ncnn_library" -verify_arch arm64
xcrun lipo "$moltenvk_library" -verify_arch arm64
mkdir -p "$output_dir"
install -m 755 "$ncnn_library" "$output_dir/libncnn.dylib"
install -m 755 "$moltenvk_library" "$output_dir/libMoltenVK.dylib"
