use nalgebra::Isometry3;
use serde::Serialize;

#[derive(Debug, Serialize)] // これで全体のデバッグ表示とJSON化が可能
pub struct SlamResult {
    pub pose: Isometry3<f32>,
    pub detected_objects: Vec<DetectedItem>,
}

#[derive(Debug, Serialize)] // 子構造体にも忘れずに！
pub struct DetectedItem {
    pub label: String,
    pub confidence: f32,
    pub position_3d: [f32; 3],
}

pub struct Slam;

impl Slam {
    pub fn new() -> Self {
        Self
    }

    // 暫定的なスタブ実装。
    // 引数の型は VideoFrameReconstructor が出す型（恐らく Vec<u8> や独自の構造体）に合わせてください。
    pub fn update(&self, _frame: &[u8]) -> String {
        // 解析結果としてスマホに送り返すダミー文字列
        "{\"x\": 0.0, \"y\": 0.0, \"z\": 0.0}".to_string()
    }
}