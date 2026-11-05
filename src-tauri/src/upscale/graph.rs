//! Append a weightless GPU crop without modifying the installed model files.
use std::collections::HashSet;

/// Return an equivalent graph whose only output excludes `padding` on each edge.
/// Unsupported or ambiguous graph layouts retain the original CPU crop path.
pub fn crop_output(graph: &str, padding: u32) -> Option<String> {
    if padding == 0 || padding > i32::MAX as u32 / 2 || graph.contains('\0') {
        return None;
    }
    let lines: Vec<_> = graph.lines().filter(|line| !line.trim().is_empty()).collect();
    if lines.first()?.trim() != "7767517" {
        return None;
    }
    let counts: Vec<_> = lines.get(1)?.split_whitespace().collect();
    if counts.len() != 2 {
        return None;
    }
    let layer_count: usize = counts[0].parse().ok()?;
    let blob_count: usize = counts[1].parse().ok()?;
    if lines.len() != layer_count.checked_add(2)? {
        return None;
    }
    let mut names = HashSet::new();
    let mut produced = HashSet::new();
    let mut consumed = HashSet::new();
    let mut input_count = 0;
    for line in &lines[2..] {
        let fields: Vec<_> = line.split_whitespace().collect();
        let name = *fields.get(1)?;
        if !names.insert(name) {
            return None;
        }
        let bottoms: usize = fields.get(2)?.parse().ok()?;
        let tops: usize = fields.get(3)?.parse().ok()?;
        let bottom_end = 4usize.checked_add(bottoms)?;
        let top_end = bottom_end.checked_add(tops)?;
        if top_end > fields.len() || tops == 0 {
            return None;
        }
        if fields[0] == "Input" {
            if bottoms != 0 || tops != 1 {
                return None;
            }
            input_count += 1;
        }
        for bottom in &fields[4..bottom_end] {
            if !produced.contains(bottom) {
                return None;
            }
            consumed.insert(*bottom);
        }
        for top in &fields[bottom_end..top_end] {
            if !produced.insert(*top) {
                return None;
            }
        }
    }
    if input_count != 1 || produced.len() != blob_count {
        return None;
    }
    let mut outputs = produced.difference(&consumed);
    let output = *outputs.next()?;
    if outputs.next().is_some() {
        return None;
    }
    let mut suffix = 0usize;
    let (layer, blob) = loop {
        let layer = format!("__lutri_crop_{suffix}");
        let blob = format!("__lutri_output_{suffix}");
        if !names.contains(layer.as_str()) && !produced.contains(blob.as_str()) {
            break (layer, blob);
        }
        suffix = suffix.checked_add(1)?;
    };
    // NCNN Crop: 0/1 are left/top, 6/7 are right/bottom; -233 keeps
    // each remaining dimension dynamic and preserves every RGB channel.
    // https://github.com/Tencent/ncnn/blob/20261020/src/layer/crop.cpp
    let mut result = format!(
        "7767517\n{} {}\n",
        layer_count.checked_add(1)?,
        blob_count.checked_add(1)?
    );
    for line in &lines[2..] {
        result.push_str(line);
        result.push('\n');
    }
    result.push_str(&format!(
        "Crop {layer} 1 1 {output} {blob} 0={padding} 1={padding} 3=-233 4=-233 5=-233 6={padding} 7={padding}\n"
    ));
    Some(result)
}
