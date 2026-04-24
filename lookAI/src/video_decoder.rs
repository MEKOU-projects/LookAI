/// VideoFrameReconstructor
///
/// 受信データは RTP パケット: [RTPヘッダー(可変長)][WebMペイロード]
/// RTPヘッダーを剥がしてWebMペイロードだけffmpegに渡す。
///
/// RTPヘッダー構造:
///   byte0: V(2bit) P(1) X(1) CC(4)
///   byte1: M(1) PT(7)
///   byte2-3: Sequence Number
///   byte4-7: Timestamp
///   byte8-11: SSRC
///   + CC * 4 bytes (CSRC list)
///   + if X: 4 bytes extension header + ext_len*4 bytes

pub struct VideoFrameReconstructor {
    packet_count: u64,
}

impl VideoFrameReconstructor {
    pub fn new() -> Self {
        Self { packet_count: 0 }
    }

    /// RTPヘッダーのバイト長を計算する
    fn rtp_header_size(packet: &[u8]) -> Option<usize> {
        if packet.len() < 12 { return None; }

        let v  = (packet[0] >> 6) & 0x3;
        if v != 2 { return None; } // RTPバージョンは必ず2

        let cc = (packet[0] & 0x0F) as usize;
        let x  = (packet[0] >> 4) & 0x1;

        let mut size = 12 + cc * 4;

        if x == 1 {
            // Extension header: 2byte ID + 2byte length (in 32bit words)
            if packet.len() < size + 4 { return None; }
            let ext_len = u16::from_be_bytes([packet[size + 2], packet[size + 3]]) as usize;
            size += 4 + ext_len * 4;
        }

        if packet.len() <= size { return None; }
        Some(size)
    }

    pub fn push_binary(&mut self, packet: &[u8]) -> Option<Vec<u8>> {
        if packet.is_empty() { return None; }

        self.packet_count += 1;

        match Self::rtp_header_size(packet) {
            Some(header_size) => {
                let payload = &packet[header_size..];
                if self.packet_count <= 3 {
                    let hex: String = packet.iter().take(8)
                        .map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                    eprintln!("RTP strip: header={}bytes payload={}bytes [{} ...]",
                        header_size, payload.len(), hex);
                }
                if payload.is_empty() { return None; }
                Some(payload.to_vec())
            }
            None => {
                // RTPでなければそのまま渡す
                Some(packet.to_vec())
            }
        }
    }

    pub fn reset(&mut self) {
        self.packet_count = 0;
    }
}