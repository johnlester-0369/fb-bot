# FB-Bot 🤖

> A modular, event-driven Facebook Messenger bot — reads session from `appstate.json`, authenticates through `fca-unofficial`, and dispatches incoming messages and group events to pluggable command and event modules.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/) [![License](https://img.shields.io/badge/license-ISC-blue)]()

## Architecture

```
         appstate.json
               │
               ▼
  ┌─────────────────────────┐
  │        index.js         │
  │  (loader / dispatcher)  │
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │     fca-unofficial      │
  │   (Facebook Chat API)   │
  └────────────┬────────────┘
               │ MQTT / HTTPS
               ▼
  ┌─────────────────────────┐
  │   Facebook Messenger    │
  │        Servers          │
  └─────────────────────────┘
```

`index.js` loads session cookies from `appstate.json`, authenticates via `fca-unofficial`, and opens a persistent MQTT connection to Facebook's servers. Incoming messages are routed to command handlers (prefix-triggered via `onStart`) or chat handlers (every message via `onChat`). Group events are routed to event handlers by `logMessageType`.

## Features

- **Modular Command System** — add, remove, or modify commands without touching core logic
- **Event-Driven Architecture** — handle group events such as member joins and leaves
- **Text-to-Speech** — convert text to audio in 100+ languages
- **Translation** — translate text between languages using Google Translate
- **QR Code Generator** — generate QR codes from any text or URL
- **System Info** — view bot uptime, memory usage, and platform details
- **Welcome / Goodbye Messages** — automatic greetings for group members

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A Facebook account
- Facebook session cookies exported as `appstate.json`

## Installation

**1. Clone the repository**

```bash
git clone <repository-url>
cd fb-bot
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure AppState**

Create `appstate.json` in the root directory with your Facebook session cookies. Tools like [c3c-ufc-utility](https://github.com/c3cbot/c3c-ufc-utility) or browser cookie-export extensions can generate this file.

```json
[
  {
    "key": "cookie_name",
    "value": "cookie_value",
    "domain": "facebook.com",
    "path": "/",
    "hostOnly": false,
    "creation": "2024-01-01T00:00:00.000Z",
    "lastAccessed": "2024-01-01T00:00:00.000Z"
  }
]
```

**4. Start the bot**

```bash
npm start
```

## Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/help` | List all available commands | `/help` |
| `/hi` | Greet the user | `/hi` |
| `/ping` | Check bot latency | `/ping` |
| `/system` | View uptime, memory, and platform info | `/system` |
| `/qr` | Generate a QR code | `/qr <text>` or reply with `/qr` |
| `/say` | Convert text to speech | `/say <text> \| <lang>` |
| `/trans` | Translate text | `/trans <text> \| <lang>` |

### Examples

```
/qr https://example.com
/qr Hello World!

/say Hello world | en
/say 안녕하세요 | ko

/trans Bonjour | en
/trans Hello | ja
```

### Language Codes

`en` (English) · `ko` (Korean) · `ja` (Japanese) · `zh` (Chinese) · `vi` (Vietnamese) · `th` (Thai) · `fr` (French) · `de` (German) · `es` (Spanish) · `fil` (Filipino) · `id` (Indonesian)

## Project Structure

```
fb-bot/
├── index.js                 # Main entry point — loader, dispatcher, lifecycle
├── package.json             # Dependencies and scripts
├── appstate.json            # Facebook session (DO NOT SHARE)
├── modules/
│   ├── commands/            # Command modules (prefix-triggered)
│   └── events/              # Event handler modules (group events)
└── lib/
    └── fca-unofficial/      # Facebook Chat API library
```

## Creating Commands

Add a `.js` file to `modules/commands/`. Export `config` and at least one of `onStart` (runs when the command prefix is matched) or `onChat` (runs on every message).

```javascript
export const config = {
  name: "example",
  description: "Description of the command",
};

// Runs when a user sends /example
export const onStart = async ({ api, event, args, prefix }) => {
  const { threadID, messageID } = event;
  api.sendMessage("Hello from example command!", threadID, messageID);
};

// Optional: runs on every message without a prefix
export const onChat = async ({ api, event }) => {
  console.log(`Message received: ${event.body}`);
};
```

### Command Context

| Property | Type | Description |
|----------|------|-------------|
| `api` | Object | Facebook API — send messages, reactions, etc. |
| `event` | Object | Message event with `threadID`, `senderID`, `body`, `args` |
| `args` | string[] | Arguments after the command name |
| `prefix` | string | Configured command prefix (default `/`) |
| `commands` | Map | All loaded command modules |

## Creating Event Handlers

Add a `.js` file to `modules/events/`. Export `config` (with an `eventType` array) and `onStart`.

```javascript
export const config = {
  name: "example",
  description: "Handles specific events",
  eventType: ["log:subscribe", "log:unsubscribe"],
};

export const onStart = async ({ api, event }) => {
  const { threadID, logMessageType, logMessageData } = event;
  api.sendMessage("An event occurred!", threadID);
};
```

### Event Types

| Event Type | Trigger |
|------------|---------|
| `log:subscribe` | Member added to group |
| `log:unsubscribe` | Member left or was removed |
| `log:thread-name` | Group name changed |
| `log:thread-icon` | Group icon changed |
| `log:thread-color` | Chat color changed |

## Configuration

Edit the `CONFIG` object in `index.js`:

```javascript
const CONFIG = {
  prefix: "/",                    // Command prefix
  appStatePath: "appstate.json",  // Path to session file
  commandsPath: join(__dirname, "modules", "commands"),
  eventsPath: join(__dirname, "modules", "events"),
  listenOptions: {
    listenEvents: true,           // Listen to group events
    selfListen: false,            // Ignore bot's own messages
    logLevel: "silent",           // Logging level
  },
};
```

## Security

> ⚠️ **Important**

- **Never share `appstate.json`** — it contains your Facebook session and grants full account access
- **Add `appstate.json` to `.gitignore`** before committing
- Use environment variables for sensitive configuration in production
- Regularly refresh your AppState — sessions expire; the bot handles this gracefully

## Troubleshooting

**Bot not starting** — verify `appstate.json` exists and contains valid session data; confirm your account is not locked or checkpointed; run `npm install` to ensure all dependencies are present.

**Bot not receiving messages** — confirm `listenEvents: true` in options; check the console for connection errors; your session may have expired and need refreshing.

**Commands not working** — ensure commands use the correct prefix (default `/`); confirm command files export both `config` and `onStart`; review the console for module load errors.

**Rate limiting** — Facebook may temporarily restrict accounts that send too many messages; add delays between messages if sending in bulk; avoid automated mass messaging.

## License

For educational purposes. Use responsibly and in accordance with Facebook's Terms of Service.