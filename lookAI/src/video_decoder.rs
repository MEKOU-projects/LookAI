use std::fs::OpenOptions;
use std::io::Write;

pub struct VideoFrameReconstructor {
}

impl VideoFrameReconstructor {

    pub fn new() -> Self {
        Self {
        }
    }

    pub fn push_binary(&self, data: &[u8]) -> Option<Vec<u8>> {
        // EBMLヘッダ(WebM開始印)なら即リターン
        if data.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
            return None;
        }

        // H.264開始コード [0, 0, 1] を探す
        data.windows(3).position(|w| w == [0, 0, 1])
            .map(|pos| {
                // 開始コード以降のデータ（実データ）をクローンして返す
                data[pos..].to_vec()
            })
    }
}