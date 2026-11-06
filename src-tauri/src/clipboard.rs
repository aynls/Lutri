use std::sync::Mutex;

#[derive(Default)]
pub struct Clipboard(Mutex<Option<arboard::Clipboard>>);

impl Clipboard {
    pub fn with<T>(
        &self,
        operation: impl FnOnce(&mut arboard::Clipboard) -> Result<T, arboard::Error>,
    ) -> Result<T, String> {
        let mut clipboard = self.0.lock().map_err(|e| e.to_string())?;
        if clipboard.is_none() {
            *clipboard = Some(arboard::Clipboard::new().map_err(|e| e.to_string())?);
        }
        // Linux serves clipboard data from the owning process. Keep the handle
        // alive between commands so other applications can request the image.
        operation(clipboard.as_mut().unwrap()).map_err(|e| e.to_string())
    }

    pub fn close(&self) {
        if let Ok(mut clipboard) = self.0.lock() {
            clipboard.take();
        }
    }
}
