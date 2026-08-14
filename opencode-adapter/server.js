import http from "node:http";

const PORT = Number(process.env.PORT || 4091);

const OPENCODE_URL =
  process.env.OPENCODE_URL ||
  "http://host.docker.internal:4090";

const OPENCODE_USERNAME =
  process.env.OPENCODE_USERNAME ||
  "opencode";

const OPENCODE_PASSWORD =
  process.env.OPENCODE_PASSWORD || "";

const OPENCODE_AGENT =
  process.env.OPENCODE_AGENT ||
  "openclaw-consultant";

const MODEL_ID = "openclaw";

function headers() {
  const auth = Buffer.from(
    `${OPENCODE_USERNAME}:${OPENCODE_PASSWORD}`
  ).toString("base64");

  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json"
  };
}

function json(res, status, body) {
  const data = JSON.stringify(body);

  res.writeHead(status, {
    "Content-Type": "application/json"
  });

  res.end(data);
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
  }

  return body ? JSON.parse(body) : {};
}

function messagesToPrompt(messages = []) {
  return messages
    .map((message) => {
      let content = message.content;

      if (Array.isArray(content)) {
        content = content
          .filter((part) => part?.type === "text")
          .map((part) => part.text)
          .join("\n");
      }

      if (typeof content !== "string") {
        content = JSON.stringify(content ?? "");
      }

      return `${String(message.role || "user").toUpperCase()}:\n${content}`;
    })
    .join("\n\n");
}

function extractText(message) {
  if (!Array.isArray(message?.parts)) {
    return "";
  }

  return message.parts
    .filter(
      (part) =>
        part?.type === "text" &&
        typeof part.text === "string"
    )
    .map((part) => part.text)
    .join("\n\n");
}

async function askOpenCode(body) {
  const sessionResponse = await fetch(
    `${OPENCODE_URL}/session`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: "OpenClaw provider chat"
      })
    }
  );

  if (!sessionResponse.ok) {
    throw new Error(
      `OpenCode session HTTP ${sessionResponse.status}: ${await sessionResponse.text()}`
    );
  }

  const session = await sessionResponse.json();

  if (!session?.id) {
    throw new Error("OpenCode did not return session.id");
  }

  const prompt = messagesToPrompt(body.messages);

  const messageResponse = await fetch(
    `${OPENCODE_URL}/session/${session.id}/message`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        agent: OPENCODE_AGENT,

        system: `
You are being used as the selected AI model by OpenClaw.

Answer the conversation provided by OpenClaw.

OpenClaw is the outer orchestration and execution system.

Do not claim that you executed commands or modified files unless
the supplied conversation explicitly contains results of those actions.
`,

        parts: [
          {
            type: "text",
            text: prompt
          }
        ]
      })
    }
  );

  if (!messageResponse.ok) {
    throw new Error(
      `OpenCode message HTTP ${messageResponse.status}: ${await messageResponse.text()}`
    );
  }

  const message = await messageResponse.json();

  return extractText(message);
}

function completion(text) {
  return {
    id: `chatcmpl-opencode-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL_ID,

    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text
        },
        finish_reason: "stop"
      }
    ],

    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function streamCompletion(res, text) {
  const id = `chatcmpl-opencode-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: MODEL_ID,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant"
          },
          finish_reason: null
        }
      ]
    })}\n\n`
  );

  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: MODEL_ID,
      choices: [
        {
          index: 0,
          delta: {
            content: text
          },
          finish_reason: null
        }
      ]
    })}\n\n`
  );

  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: MODEL_ID,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop"
        }
      ]
    })}\n\n`
  );

  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host}`
    );

    if (
      req.method === "GET" &&
      url.pathname === "/health"
    ) {
      return json(res, 200, {
        healthy: true,
        upstream: OPENCODE_URL,
        agent: OPENCODE_AGENT
      });
    }

    if (
      req.method === "GET" &&
      url.pathname === "/v1/models"
    ) {
      return json(res, 200, {
        object: "list",
        data: [
          {
            id: MODEL_ID,
            object: "model",
            created: 0,
            owned_by: "opencode"
          }
        ]
      });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/v1/chat/completions"
    ) {
      const body = await readBody(req);

      const text = await askOpenCode(body);

      if (body.stream === true) {
        return streamCompletion(res, text);
      }

      return json(
        res,
        200,
        completion(text)
      );
    }

    return json(res, 404, {
      error: {
        message: "Not found"
      }
    });

  } catch (error) {
    console.error(error);

    return json(res, 500, {
      error: {
        message:
          error instanceof Error
            ? error.message
            : String(error)
      }
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OpenCode adapter listening on :${PORT}`);
  console.log(`OpenCode upstream: ${OPENCODE_URL}`);
  console.log(`OpenCode agent: ${OPENCODE_AGENT}`);
});
