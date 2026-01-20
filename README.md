# FB-Bot 🤖

A minimal and simple Facebook Messenger bot built with a modular, event-driven architecture. This lightweight bot provides essential features like text-to-speech, translation, QR code generation, and group event handling.

## ✨ Features

- 📦 **Modular Command System** - Easy to add, remove, or modify commands
- 🎯 **Event-Driven Architecture** - Handle group events like member joins/leaves
- 🔊 **Text-to-Speech** - Convert text to audio in 100+ languages
- 🌐 **Translation** - Translate text between languages using Google Translate
- 📱 **QR Code Generator** - Create QR codes from text or URLs
- 📊 **System Info** - View bot uptime, memory usage, and platform details
- 👋 **Welcome/Goodbye Messages** - Automatic greetings for group members

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A Facebook account
- Facebook session cookies (AppState)

## 🚀 Installation

1. **Clone or download the repository**

   ```bash
   git clone <repository-url>
   cd fb-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure AppState**

   Create an `appstate.json` file in the root directory with your Facebook session cookies.

   You can obtain your AppState using tools like [c3c-ufc-utility](https://github.com/c3cbot/c3c-ufc-utility) or browser extensions that export Facebook cookies.

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

4. **Start the bot**

   ```bash
   npm start
   ```

## 📖 Available Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/help` | Shows all available commands | `/help` |
| `/hi` | Greets the user | `/hi` |
| `/ping` | Check if bot is alive with latency | `/ping` |
| `/system` | View bot system information | `/system` |
| `/qr` | Generate QR code from text | `/qr <text>` or reply with `/qr` |
| `/say` | Convert text to speech | `/say <text> \| <lang>` |
| `/trans` | Translate text | `/trans <text> \| <lang>` |

### Command Examples

```
/qr https://example.com
/qr Hello World!

/say Hello world | en
/say 안녕하세요 | ko

/trans Bonjour | en
/trans Hello | ja
```

### Supported Languages (TTS & Translation)

Common language codes: `en` (English), `ko` (Korean), `ja` (Japanese), `zh` (Chinese), `vi` (Vietnamese), `th` (Thai), `fr` (French), `de` (German), `es` (Spanish), `fil` (Filipino), `id` (Indonesian)

## 📁 Project Structure

```
fb-bot/
├── index.js                 # Main entry point
├── package.json             # Dependencies and scripts
├── appstate.json            # Facebook session (DO NOT SHARE)
├── modules/
│   ├── commands/            # Command modules
│   │   ├── help.js          # Help command
│   │   ├── hi.js            # Greeting command
│   │   ├── logger.js        # Message logger (onChat)
│   │   ├── ping.js          # Ping/pong command
│   │   ├── qr.js            # QR code generator
│   │   ├── say.js           # Text-to-speech
│   │   ├── system.js        # System information
│   │   └── trans.js         # Translation
│   └── events/              # Event handlers
│       ├── welcome.js       # Welcome new members
│       └── goodbye.js       # Goodbye leaving members
└── lib/
    └── fca-unofficial/      # Facebook Chat API library
```

## 🔧 Creating New Commands

Create a new file in `modules/commands/` with the following structure:

```javascript
/**
 * Example Command Module
 * @module commands/example
 */

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "example",
  description: "Description of the command",
};

/**
 * Handles the /example command (requires prefix)
 * @param {Object} context - The command context
 */
export const onStart = async ({ api, event, args, prefix }) => {
  const { threadID, messageID } = event;
  
  // Your command logic here
  api.sendMessage("Hello from example command!", threadID, messageID);
};

/**
 * Optional: Handles ALL messages (no prefix required)
 * Useful for logging, auto-replies, keyword detection
 */
export const onChat = async ({ api, event }) => {
  // This runs for every message
  console.log(`Message received: ${event.body}`);
};
```

### Command Context Properties

| Property | Description |
|----------|-------------|
| `api` | Facebook API object for sending messages |
| `event` | Message event with `threadID`, `senderID`, `body`, `args`, etc. |
| `args` | Array of command arguments (without prefix and command name) |
| `prefix` | The command prefix (default: `/`) |
| `commands` | Map of all loaded commands |

## 🎉 Creating New Event Handlers

Create a new file in `modules/events/` to handle group events:

```javascript
/**
 * Example Event Module
 * @module events/example
 */

export const config = {
  name: "example",
  description: "Handles specific events",
  eventType: ["log:subscribe", "log:unsubscribe"], // Event types to handle
};

/**
 * Handles the event
 * @param {Object} context - The event context
 */
export const onStart = async ({ api, event }) => {
  const { threadID, logMessageType, logMessageData } = event;
  
  // Your event handling logic here
  api.sendMessage("An event occurred!", threadID);
};
```

### Available Event Types

| Event Type | Description |
|------------|-------------|
| `log:subscribe` | Member added to group |
| `log:unsubscribe` | Member left/removed from group |
| `log:thread-name` | Group name changed |
| `log:thread-icon` | Group icon changed |
| `log:thread-color` | Chat color changed |

## ⚙️ Configuration

Edit the `CONFIG` object in `index.js` to customize:

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

## 🔒 Security Notes

> ⚠️ **Important Security Warnings**

1. **Never share your `appstate.json`** - It contains your Facebook session and can be used to access your account

2. **Add to `.gitignore`** - Ensure `appstate.json` is in your `.gitignore` file:
   ```
   appstate.json
   ```

3. **Use environment variables** for sensitive data in production

4. **Regularly update AppState** - Sessions can expire; the bot handles this gracefully

## 🐛 Troubleshooting

### Bot not starting
- Verify `appstate.json` exists and contains valid session data
- Check if your Facebook account is not locked/checkpointed
- Run `npm install` to ensure all dependencies are installed

### Bot not receiving messages
- Confirm `listenEvents: true` in options
- Check console for connection errors
- Your session may have expired; get a new AppState

### Commands not working
- Ensure commands use the correct prefix (default: `/`)
- Check that command files export `config` and `onStart`
- Look for errors in the console

### Rate limiting issues
- Facebook may temporarily restrict accounts sending too many messages
- Add delays between messages if sending in bulk
- Avoid spamming or automated mass messaging

## 📄 License

This project is for educational purposes. Use responsibly and in accordance with Facebook's Terms of Service.