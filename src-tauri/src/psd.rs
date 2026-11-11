use image::RgbaImage;
use std::{
    fs::File,
    io::{self, BufWriter, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

pub struct Layer {
    pub path: PathBuf,
    pub bounds: [u32; 4],
    pub name: String,
}

fn u16_be(writer: &mut impl Write, value: u16) -> io::Result<()> {
    writer.write_all(&value.to_be_bytes())
}

fn u32_be(writer: &mut impl Write, value: u32) -> io::Result<()> {
    writer.write_all(&value.to_be_bytes())
}

fn length(writer: &mut (impl Write + Seek), position: u64) -> io::Result<()> {
    let end = writer.stream_position()?;
    let size = u32::try_from(end - position - 4).map_err(|_| io::Error::other("psd_size_limit"))?;
    writer.seek(SeekFrom::Start(position))?;
    u32_be(writer, size)?;
    writer.seek(SeekFrom::Start(end))?;
    Ok(())
}

fn plane(writer: &mut impl Write, image: &RgbaImage, channel: usize) -> io::Result<()> {
    let mut row = vec![0; image.width() as usize];
    for pixels in image.rows() {
        for (target, pixel) in row.iter_mut().zip(pixels) {
            *target = pixel[channel];
        }
        writer.write_all(&row)?;
    }
    Ok(())
}

/// Write layer records and channel data in bottom-to-top order.
pub fn write(path: &Path, layers: &[Layer], composite: &RgbaImage) -> Result<(), String> {
    let outcome = || -> io::Result<()> {
        if layers.is_empty() || layers.len() > 100 || composite.width() > 30000 || composite.height() > 30000 {
            return Err(io::Error::other("psd_size_limit"));
        }
        let mut estimated = composite.width() as u64 * composite.height() as u64 * 4 + 1024;
        for layer in layers {
            let [left, top, right, bottom] = layer.bounds;
            if left >= right || top >= bottom || right > composite.width() || bottom > composite.height() {
                return Err(io::Error::other("invalid_layer_bounds"));
            }
            estimated += (right - left) as u64 * (bottom - top) as u64 * 4 + layer.name.len() as u64 * 4 + 1024;
        }
        if estimated > 2_000_000_000 {
            return Err(io::Error::other("psd_size_limit"));
        }
        let mut writer = BufWriter::new(File::create_new(path)?);
        writer.write_all(b"8BPS")?;
        u16_be(&mut writer, 1)?;
        writer.write_all(&[0; 6])?;
        u16_be(&mut writer, 4)?;
        u32_be(&mut writer, composite.height())?;
        u32_be(&mut writer, composite.width())?;
        u16_be(&mut writer, 8)?;
        u16_be(&mut writer, 3)?;
        u32_be(&mut writer, 0)?;
        u32_be(&mut writer, 0)?;
        let section = writer.stream_position()?;
        u32_be(&mut writer, 0)?;
        let info = writer.stream_position()?;
        u32_be(&mut writer, 0)?;
        writer.write_all(&(-(layers.len() as i16)).to_be_bytes())?;
        for layer in layers {
            let [left, top, right, bottom] = layer.bounds;
            for value in [top, left, bottom, right] {
                u32_be(&mut writer, value)?;
            }
            let pixels = (right - left) as u64 * (bottom - top) as u64;
            let size = u32::try_from(pixels + 2).map_err(|_| io::Error::other("psd_size_limit"))?;
            u16_be(&mut writer, 4)?;
            for channel in [0_i16, 1, 2, -1] {
                writer.write_all(&channel.to_be_bytes())?;
                u32_be(&mut writer, size)?;
            }
            writer.write_all(b"8BIMnorm")?;
            writer.write_all(&[255, 0, 0, 0])?;
            let extra = writer.stream_position()?;
            u32_be(&mut writer, 0)?;
            u32_be(&mut writer, 0)?;
            u32_be(&mut writer, 0)?;
            let fallback: Vec<u8> = layer
                .name
                .chars()
                .take(255)
                .map(|c| if c.is_ascii() { c as u8 } else { b'?' })
                .collect();
            writer.write_all(&[fallback.len() as u8])?;
            writer.write_all(&fallback)?;
            let padding = (4 - (fallback.len() + 1) % 4) % 4;
            writer.write_all(&[0; 3][..padding])?;
            let unicode: Vec<u16> = layer.name.encode_utf16().collect();
            writer.write_all(b"8BIMluni")?;
            u32_be(&mut writer, 4 + unicode.len() as u32 * 2)?;
            u32_be(&mut writer, unicode.len() as u32)?;
            for code in unicode {
                u16_be(&mut writer, code)?;
            }
            length(&mut writer, extra)?;
        }
        for layer in layers {
            let image = image::open(&layer.path).map_err(io::Error::other)?.to_rgba8();
            let [left, top, right, bottom] = layer.bounds;
            if image.dimensions() != (right - left, bottom - top) {
                return Err(io::Error::other("invalid_layer_bounds"));
            }
            for channel in 0..4 {
                u16_be(&mut writer, 0)?;
                plane(&mut writer, &image, channel)?;
            }
        }
        if (writer.stream_position()? - info - 4) % 2 != 0 {
            writer.write_all(&[0])?;
        }
        length(&mut writer, info)?;
        u32_be(&mut writer, 0)?;
        length(&mut writer, section)?;
        u16_be(&mut writer, 0)?;
        for channel in 0..4 {
            plane(&mut writer, composite, channel)?;
        }
        writer.flush()?;
        writer.get_ref().sync_all()
    };
    outcome().map_err(|error| error.to_string())
}
