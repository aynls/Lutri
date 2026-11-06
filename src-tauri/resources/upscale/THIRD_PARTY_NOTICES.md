# Local super-resolution components

Lutri's Rust image pipeline calls NCNN's C API. Windows x64 and Linux x64 packages include only their respective runtime and the shared model files.

| Files | Source | License |
| --- | --- | --- |
| `windows-x86_64/ncnn.dll` | [Tencent/ncnn release 20261020](https://github.com/Tencent/ncnn/releases/tag/20261020), Windows VS2026 shared archive, x64 | BSD 3-Clause and included third-party notices; see `LICENSE-ncnn.txt` |
| `linux-x86_64/libncnn.so` | Same release, Ubuntu 22.04 shared archive | Same license and notices |
| `macos-aarch64/libncnn.dylib` | Built from the same release's full source by `scripts/build-macos-ncnn.sh` | Same license |
| `macos-aarch64/libMoltenVK.dylib` | [MoltenVK v1.4.2](https://github.com/KhronosGroup/MoltenVK/releases/tag/v1.4.2), macOS archive | Apache License 2.0; see `LICENSE-MoltenVK.txt` |
| `models/realesrgan-x4plus.{param,bin}` | [Real-ESRGAN release v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0), `realesrgan-ncnn-vulkan-20220424-windows.zip` | Real-ESRGAN BSD 3-Clause; see `LICENSE-Real-ESRGAN.txt` |
| `models/realesrgan-x4plus-anime.{param,bin}` | Same official model archive | Same license |
| `models/realesr-general-x4v3.{param,bin}` | Official [General x4v3 checkpoint](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth), converted by `scripts/convert-general-x4v3.py` | Real-ESRGAN BSD 3-Clause; see `LICENSE-Real-ESRGAN.txt` |
| `models/realcugan-pro-{2,3}x-{conservative,no-denoise,denoise3x}.{param,bin}` | [Real-CUGAN Pro NCNN weights](https://github.com/nihui/realcugan-ncnn-vulkan/tree/395302c5c70f1bff604c974e92e0a87e45c9f9ee/models/models-pro), unchanged files with local names | Real-CUGAN MIT; see `LICENSE-Real-CUGAN.txt` |
| Real-CUGAN padding/alignment, cropping and sequential GAP synchronization algorithm | [nihui/realcugan-ncnn-vulkan](https://github.com/nihui/realcugan-ncnn-vulkan/tree/395302c5c70f1bff604c974e92e0a87e45c9f9ee), adapted to Rust and the NCNN C API | MIT; see `LICENSE-Real-CUGAN-NCNN.txt` |

General uses the official general checkpoint directly, without interpolation with the weak-denoise checkpoint (DNI). Conversion preserves all FP32 tensors, PReLU, PyTorch-order pixel shuffle and nearest-neighbor residual; it does not depend on ONNX or custom NCNN layers. The converter verifies the checkpoint SHA-256 and can compare CPU output with PyTorch using `--verify-runtime`.

Real-CUGAN Pro uses native 2×/3× weights and exact sequential `syncgap=1`: synchronize each of `gap0` through `gap3` across all tiles before final reconstruction. Activations are recomputed rather than retained per tile, trading additional inference time for bounded intermediate memory. 2× uses 18-pixel padding/alignment 2; 3× uses 14-pixel padding/alignment 4. The network consumes its padding; only right/bottom alignment excess is discarded. Single-pixel borders use repeated reflection safely.

The NCNN distribution includes Vulkan shader tooling. Retain the accompanying glslang and SPIR-V license texts when redistributing these resources. File sizes and SHA-256 values are recorded in `manifest.json`.

Windows x64 requires the Microsoft Visual C++ x64 Redistributable matching MSVC 14.50 or later, including the OpenMP runtime. Linux x64 uses the system `libgomp.so.1` and supports Vulkan where available. Debian and RPM packages declare the OpenMP runtime dependency; AppImage users may need to install their distribution's OpenMP runtime. macOS Apple Silicon uses bundled MoltenVK for GPU inference, with NCNN's CPU fallback if no compatible device is available. Custom models retain their own licenses; importing them into LutriUI does not change those terms.
