// ─────────────────────────────────────────────
//  LLMSystem.ts  —  Direct Link to Ollama/Qdrant
// ─────────────────────────────────────────────

// 型定義のみ維持
export interface ChatResponseChunk {
    message: { content: string };
    done: boolean;
}

const QDRANT_URL = 'http://localhost:6333';
const OLLAMA_URL = 'http://localhost:11434';
const COLLECTION_NAME = "mekou_exp";

/**
 * ブラウザから直接 Ollama / Qdrant を叩く
 */
export async function processMessage(text: string): Promise<string> {
    try {
        // 1. 記憶の保存 (Fire and forget)
        saveToQdrant(text).catch(e => console.error("Qdrant Save Error:", e));

        // 2. コンテキスト検索
        const relevantContext = await searchQdrant(text);

        // 3. Ollama 思考 (ブラウザ標準 fetch)
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama3.1",
                format: "json",
                messages: [
                    {
                        role: "system",
                        content: `あなたはサイバー知能「MEKOU」。性格: 冷徹、論理的、皮肉屋。
                        行動指針: 最短・最安全な提案、ECS/IoT操作優先。
                        口調: 軽い挑発を含め、無駄な同調は排除。結論を端的に述べる。
                        応答は必ず以下のJSON形式で行え。
                        {
                          "thought": { "analysis": "string", "plan": "string" },
                          "tasks": { "now": "string", "next": "string" },
                          "js": "string",
                          "text": "string"
                        }
                        背景知識: ${relevantContext}`
                    },
                    { role: "user", content: text }
                ],
                stream: false // ブラウザでの処理を簡略化するため一旦 false
            })
        });

        const data = await response.json();
        return data.message.content;
    } catch (error: any) {
        console.error("MEKOU Core Error:", error.message);
        throw error;
    }
}

async function getEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        body: JSON.stringify({ model: "mxbai-embed-large", prompt: text })
    });
    const data = await res.json();
    return data.embedding;
}

async function saveToQdrant(text: string): Promise<void> {
    const vector = await getEmbedding(text);
    await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            wait: false,
            points: [{
                id: Date.now(),
                vector: vector,
                payload: { text, timestamp: new Date().toISOString(), type: "raw_speech" }
            }]
        })
    });
}

async function searchQdrant(text: string): Promise<string> {
    try {
        const vector = await getEmbedding(text);
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vector, limit: 3, with_payload: true })
        });
        const data = await res.json();
        return data.result.map((r: any) => r.payload?.text).join("\n");
    } catch (e) {
        return "";
    }
}

export function validateMekouOutput(output: string): { score: number, reason: string } {
    // 簡易バリデーション。JSが含まれているかチェック
    if (!output.includes('system') && !output.includes('notification')) {
        return { score: -5, reason: "NO_INTERFACE_CALL" };
    }
    return { score: 5, reason: "SUCCESSFUL_LEGISLATION" };
}