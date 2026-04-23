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
    // WS送信用の送信口が必要な場合はここに追加可能だが、一旦受信メインで構成
}

impl WebRtc {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(2); // バッファを少し広めに確保
        Self {
            frame_rx: Mutex::new(rx),
            frame_tx: tx,
        }
    }

    /// WebSocket経由でスマホからのバイナリを受け取り、内部キューに流すメインループ
    pub async fn run(&self, signaling_url: &str) -> Result<()> {
        let (ws_stream, _) = connect_async(signaling_url).await?;
        let (mut ws_writer, mut ws_reader) = ws_stream.split();

        println!("📡 WS Bridge Connected to: {}", signaling_url);

        // サーバーに自分（PC）を登録
        let reg = SignalMessage {
            msg_type: "register".to_string(),
            device_type: Some("pc".to_string()),
            ..Default::default()
        };
        ws_writer.send(Message::Text(serde_json::to_string(&reg)?.into())).await?;

        while let Some(msg) = ws_reader.next().await {
            match msg? {
                Message::Binary(bin) => {
                    // スマホの MediaRecorder から届いたバイナリ（WebM/H.264）
                    if let Err(e) = self.frame_tx.send(bin.to_vec()).await {
                        eprintln!("❌ Queue Full: {:?}", e);
                    }
                },
                Message::Text(text) => {
                    // JSONメッセージの処理が必要な場合はここ
                    let _incoming: SignalMessage = serde_json::from_str(&text).unwrap_or_default();
                },
                Message::Ping(p) => { ws_writer.send(Message::Pong(p)).await?; }
                _ => {}
            }
        }
        Ok(())
    }

    /// LookAIのメインループがパケットを取り出すための関数
    pub async fn receive_frame(&self) -> Option<Vec<u8>> {
        let mut rx = self.frame_rx.lock().await;
        
        // まず1つ受け取る
        let mut last_frame = rx.recv().await?;

        // キューが空になるまで回し続け、最新のパケットで上書きし続ける
        // これにより、滞留していた数秒前のパケットを一瞬でゴミ箱に送る
        while let Ok(newer_frame) = rx.try_recv() {
            last_frame = newer_frame;
        }

        Some(last_frame)
    }

    /// SLAMの結果などをスマホへ送り返す（DataChannelの代わり）
    pub async fn send_slam_data(&self, data: String) -> Result<()> {
        // ※ 本来は ws_writer を保持して送る必要があるが、
        // 1時までの動作確認用なら一旦 println! や別のTX経由で実装
        println!("🚀 SLAM Result (To Mobile): {}", data);
        Ok(())
    }
}