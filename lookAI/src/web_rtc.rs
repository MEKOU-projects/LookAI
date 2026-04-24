use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SignalMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<serde_json::Value>,
    #[serde(rename = "deviceType", skip_serializing_if = "Option::is_none")]
    pub device_type: Option<String>,
}

pub struct WebRtc {
    frame_rx: Mutex<mpsc::Receiver<Vec<u8>>>,
    pub frame_tx: mpsc::Sender<Vec<u8>>,
    result_tx: mpsc::Sender<String>,
    result_rx: Mutex<mpsc::Receiver<String>>,
    /// SPS/PPSを含む初期化パケットを受信済みか
    initialized: std::sync::atomic::AtomicBool,
}

impl WebRtc {
    pub fn new() -> Self {
        let (frame_tx, frame_rx) = mpsc::channel(64); // バッファ拡大
        let (result_tx, result_rx) = mpsc::channel(32);
        Self {
            frame_rx: Mutex::new(frame_rx),
            frame_tx,
            result_tx,
            result_rx: Mutex::new(result_rx),
            initialized: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub async fn receive_frame(&self) -> Option<Vec<u8>> {
        let mut rx = self.frame_rx.lock().await;

        // 1. フレームを待機（ここで止まる）
        let frame = rx.recv().await?;

        // 2. 最新に追いつく（リアルタイム性重視）
        // JPEGは1枚で完結するので、古いパケットは全部捨てて「今」の絵を優先
        let mut last = frame;
        while let Ok(newer) = rx.try_recv() {
            last = newer;
        }

        // 3. JPEG/バイナリとしての妥当性チェック（最小限）
        if last.len() > 100 { // 閾値は適当
            use std::sync::atomic::Ordering;
            if !self.initialized.load(Ordering::Relaxed) {
                self.initialized.store(true, Ordering::Relaxed);
                eprintln!("✅ MEKOU Stream Activated (First packet: {} bytes)", last.len());
            }
        }

        Some(last)
    }

    pub async fn send_result(&self, result: String) -> Result<()> {
        self.result_tx.send(result).await?;
        Ok(())
    }
}