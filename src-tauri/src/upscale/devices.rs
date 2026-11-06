use libloading::Library;
use serde_json::{json, Value};
use std::{
    ffi::{c_char, c_void, CStr},
    path::Path,
};

// These symbols are from the bundled x64 NCNN build. Resolve the complete set
// before calling; never derive NCNN indices from a separate Vulkan enumeration.
pub fn enumerate(path: &Path) -> Result<Vec<Value>, String> {
    unsafe {
        let library = Library::new(path).map_err(|e| e.to_string())?;
        let count = library
            .get::<unsafe extern "C" fn() -> i32>(b"?get_gpu_count@ncnn@@YAHXZ\0")
            .or_else(|_| library.get(b"_ZN4ncnn13get_gpu_countEv\0"))
            .map_err(|_| "The bundled NCNN runtime cannot enumerate devices")?;
        let info = library
            .get::<unsafe extern "C" fn(i32) -> *const c_void>(b"?get_gpu_info@ncnn@@YAAEBVGpuInfo@1@H@Z\0")
            .or_else(|_| library.get(b"_ZN4ncnn12get_gpu_infoEi\0"))
            .map_err(|_| "The bundled NCNN runtime cannot inspect devices")?;
        let name = library
            .get::<unsafe extern "C" fn(*const c_void) -> *const c_char>(b"?device_name@GpuInfo@ncnn@@QEBAPEBDXZ\0")
            .or_else(|_| library.get(b"_ZNK4ncnn7GpuInfo11device_nameEv\0"))
            .map_err(|_| "The bundled NCNN runtime cannot name devices")?;
        let mut devices = Vec::new();
        for index in 0..count().clamp(0, 64) {
            let pointer = name(info(index));
            if pointer.is_null() {
                continue;
            }
            devices.push(json!({"index":index,"name":CStr::from_ptr(pointer).to_string_lossy()}));
        }
        // The caller immediately terminates the isolated probe. Avoid Vulkan
        // global DLL teardown in the parent application and in this probe.
        std::mem::forget(library);
        Ok(devices)
    }
}
