# Mem0 Neo4j Memory Service - API Documentation

This document describes the REST API endpoints available in the Mem0 Memory Service. It is designed to be highly readable for AI agents implementing tools/skills to interact with this service.

## Base URL
`http://127.0.0.1:3899` or your deployed host address.

---

## 1. Store Message
**Endpoint:** `POST /api/messages`
**Description:** Ingests conversational messages, extracts entities/relationships using LLMs, and stores the resulting knowledge graph in Neo4j and semantic embeddings in the Qdrant vector database.

### Request Body (JSON)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `messages` | `string` or `Array<Object>` | **Yes** | The chat message(s) to store. Can be a single string OR an array of message objects like `[{"role": "user", "content": "..."}]` |
| `user_id` | `string` | No | Identifier for the user. Highly recommended to isolate and organize memory scope. |
| `agent_id` | `string` | No | Identifier for the agent interacting with the user. |
| `run_id` | `string` | No | Identifier for a specific conversation session/run. |
| `metadata` | `object` | No | Additional custom key-value pairs to attach to this memory block. |

**Example Request:**
```json
{
  "messages": [
    {"role": "user", "content": "Hello, my name is Alice and I love hiking."},
    {"role": "assistant", "content": "Hi Alice! I'll remember that you enjoy hiking."}
  ],
  "user_id": "user-123",
  "metadata": {"source": "web_chat"}
}
```

---

## 2. Search Related Memories
**Endpoint:** `POST /api/messages/related`
**Description:** Semantically searches the Qdrant vector database and traverses the Neo4j graph to find facts, entities, and memories related to the provided query.

### Request Body (JSON)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `query` | `string` | **Yes** | The natural language question or topic to search for (e.g., "What does the user like?"). |
| `user_id` | `string` | No | The user ID to scope the search to. Should match the ID used during ingestion. |
| `agent_id` | `string` | No | Scopes the search to a specific agent. |
| `run_id` | `string` | No | Scopes the search to a specific session. |
| `limit` | `integer` | No | Maximum number of memories to return. Default: `10`. |
| `filters` | `object` | No | Exact-match filters for metadata. |

**Example Request:**
```json
{
  "query": "What are Alice's hobbies?",
  "user_id": "user-123",
  "limit": 5
}
```

### Response (JSON)
The response will contain the matched semantic memories alongside any extracted graph relations.
**Example Response Snippet:**
```json
{
  "status": "success",
  "results": {
    "results": [
      {
        "id": "abc...",
        "memory": "Loves hiking",
        "score": 0.92
      }
    ],
    "relations": [
      { "source": "Alice", "relationship": "loves", "target": "hiking" }
    ]
  }
}
```

---

## 3. Test Write Endpoint
**Endpoint:** `GET /api/test-write?user_id={user_id}`
**Description:** A quick debug endpoint that injects a hardcoded Chinese dialogue array into the memory system to verify LLM extraction and Neo4j connectivity. Mainly used for health-checks.
