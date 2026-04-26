use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::{ routing::get, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use futures_util::{StreamExt, SinkExt};
use dashmap::DashMap;
use tokio::sync::mpsc;
use crate::web_rtc::WebRtc;

pub struct SignalServer {
    webrtc: Arc<WebRtc>,
    // デバイスIDと、そのソケットへメッセージを送るための送信機を紐付け
    clients: DashMap<String, mpsc::UnboundedSender<Message>>,
}

impl SignalServer {
    pub fn new(webrtc: Arc<WebRtc>) -> Self {
        Self { 
            webrtc,
            clients: DashMap::new(),
        }
    }

    pub async fn start(self: Arc<Self>, port: u16) {
        let server_clone = Arc::clone(&self);

        // ─── YOLO結果をブラウザへ転送するポーリングタスク ───────────────────
        // result_rx を別タスクで常時監視し、"mobile" クライアントへ JSON で送る。
        // WebRtc::send_result() で積まれた文字列 ("DETECTED:{...}") をここで消費する。
        let webrtc_for_pump = Arc::clone(&self.webrtc);
        let self_for_pump = Arc::clone(&self);
        tokio::spawn(async move {
            loop {
                // result_rx から1件取り出す（待機）
                let result = {
                    let mut rx = webrtc_for_pump.result_rx.lock().await;
                    rx.recv().await
                };
                match result {
                    Some(line) => {
                        // {"type":"detection","payload":"DETECTED:{...}"} 形式で送信
                        let json = format!(
                            "{{\"type\":\"detection\",\"payload\":{:?}}}",
                            line
                        );
                        self_for_pump.send_to_device("mobile", json).await;
                    }
                    None => {
                        // チャネルが閉じた場合はタスク終了
                        eprintln!("⚠️ result_rx closed — pump task exiting");
                        break;
                    }
                }
            }
        });
        // ────────────────────────────────────────────────────────────────────

        let app = Router::new().route("/ws", get(move |ws: WebSocketUpgrade| {
            let s = Arc::clone(&server_clone);
            async move {
                ws.on_upgrade(move |socket| async move {
                    s.handle_socket(socket).await;
                })
            }
        }));

        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
        println!("🚀 Signal Server running on ws://{}", addr);
        axum::serve(listener, app.into_make_service()).await.unwrap();
    }

    async fn handle_socket(&self, socket: WebSocket) {
        let (mut sender, mut receiver) = socket.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

        // 【下り】send_to_device() → tx → sender → ブラウザ
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if sender.send(msg).await.is_err() { break; }
            }
        });

        // 接続してきたデバイスを登録（device_type を受け取るまでは "unknown" で仮登録）
        // 最初に register メッセージが来たら上書きする
        let mut current_device_id = "unknown".to_string();
        self.clients.insert(current_device_id.clone(), tx.clone());

        // 【上り】ブラウザ / アプリから届いたメッセージを処理
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                // JPEG バイナリ → YOLO キューへ
                Message::Binary(bin) => {
                    if let Err(e) = self.webrtc.frame_tx.send(bin.to_vec()).await {
                        eprintln!("❌ frame_tx send failed: {:?}", e);
                    }
                },
                // JSON テキスト → register / command
                Message::Text(text) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                        let msg_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match msg_type {
                            "register" | "join" => {
                                let id = v.get("deviceType")
                                    .and_then(|d| d.as_str())
                                    .unwrap_or("unknown")
                                    .to_string();
                                println!("✅ Registered: {}", id);
                                // 旧エントリを消してから新 id で登録
                                self.clients.remove(&current_device_id);
                                self.clients.insert(id.clone(), tx.clone());
                                current_device_id = id;
                            }
                            _ => {
                                println!("📩 Command from {}: {}", current_device_id, text);
                            }
                        }
                    }
                },
                _ => {}
            }
        }

        self.clients.remove(&current_device_id);
        println!("🔌 Disconnected: {}", current_device_id);
    }

    pub async fn send_to_device(&self, device_id: &str, message: String) {
        if let Some(tx) = self.clients.get(device_id) {
            // DashMap の参照を保持したまま send する
            let _ = tx.send(Message::Text(message));
        }
    }
}