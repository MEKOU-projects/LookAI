use tokio;
use std::sync::Arc;

mod web_rtc; 
mod slam;
mod signal_server;
mod video_decoder;

use crate::web_rtc::WebRtc;
use crate::slam::Slam;
use crate::signal_server::SignalServer;
use crate::video_decoder::VideoFrameReconstructor;

use std::io::Write;

struct LookAI {
    rtc: Arc<WebRtc>,
    slam: Slam,
    reconstructor: VideoFrameReconstructor,
}

impl LookAI {
    async fn new(rtc: Arc<WebRtc>) -> Self {
        Self {
            rtc,
            slam: Slam::new(),
            reconstructor: VideoFrameReconstructor::new(),
        }
    }

    async fn start(&mut self) {
        // Rust側が「サーバー」として待ち受けるのか、
        // それとも外部のシグナリングサーバーに「クライアント」として繋ぎに行くのか
        // 今のモバイルのコードに合わせるなら「自前のSignalServer」に繋ぎに行く形
        let signaling_url = "ws://127.0.0.1:3001/ws";
        let rtc_clone = Arc::clone(&self.rtc);
        
        // WebSocketの受信ループを開始
        tokio::spawn(async move {
            if let Err(e) = rtc_clone.run(signaling_url).await {
                eprintln!("❌ WS Bridge Error: {:?}", e);
            }
        });

        println!("🚀 LookAI Loop Started. Waiting for binary chunks via WS...");
        
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open("debug_stream.h264")
            .unwrap();

        let mut packet_count = 0;

        loop {
            // WebRtc(内部はWS)からバイナリを取得
            if let Some(packet) = self.rtc.receive_frame().await {
                if packet_count == 0 {
                    println!("📝 First binary chunk: {:02x?}", &packet[..std::cmp::min(16, packet.len())]);
                }

                // そのままファイルに書き込み（デバッグ用）
                file.write_all(&packet).unwrap();
                
                if packet_count % 30 == 0 {
                    file.flush().unwrap();
                    println!("📥 Buffered {} chunks...", packet_count);
                }
                
                packet_count += 1;

                // 本来の解析フロー：WS経由ならRTPヘッダーがないので、
                // push_rtp ではなく push_binary などの直接入力メソッドが必要になるかもしれません
                if let Some(complete_frame) = self.reconstructor.push_binary(&packet) {
                    // SLAMの処理
                    let result = self.slam.update(&complete_frame);
                    
                    // SLAMの結果（座標など）をスマホに送り返す
                    let rtc_clone = Arc::clone(&self.rtc);
                    tokio::spawn(async move {
                        let _ = rtc_clone.send_slam_data(result).await;
                    });
                }
            }
            // CPU負荷を抑えつつ高速に回す
            tokio::task::yield_now().await;
        }
    }
}

#[tokio::main]
async fn main() {
    println!("🛰️ Starting LookAI MEKOU Engine...");

    // 1. 通信の核となる WebRtc (実体は WS Bridge) を作成
    let look_ai_core = Arc::new(WebRtc::new());

    // 2. シグナリングサーバーを起動 (スマホとRustの仲介役)
    let server_core = Arc::clone(&look_ai_core);
    tokio::spawn(async move {
        let server = Arc::new(SignalServer::new(server_core));
        server.start(3001).await;
    });

    // サーバーの起動を少し待機
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 3. メインロジック LookAI を起動
    let mut look_ai = LookAI::new(Arc::clone(&look_ai_core)).await;
    look_ai.start().await;
}