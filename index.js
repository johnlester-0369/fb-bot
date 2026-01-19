import fs from "fs";
import login from "./lib/fca-unofficial/index.js";

const PREFIX = "/";

const listenOptions = {
  listenEvents: true, // Receive events (join/leave, rename, etc.)
  selfListen: false, // Receive messages from yourself
  logLevel: "silent", // Disable logs (silent/error/warn/info/verbose)
};

function isPrefix(message) {
  return message.startsWith(PREFIX);
}

function isCommand(message, command) {
  return (
    message === PREFIX + command || message.startsWith(PREFIX + command + " ")
  );
}

if (!fs.existsSync("appstate.json")) {
  console.log("Creating appstate.json...");
  fs.writeFileSync("appstate.json", "[]");
  console.log("Put your Facebook session cookies in appstate.json and run the bot.");
  process.exit(0);
}
console.log("Bot starting...");
login(
  { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
  (err, api) => {
    if (err) {
      console.error("Login Error:", err);
      return;
    }

    api.setOptions(listenOptions);

    const listenInstance = api.listenMqtt(async (err, event) => {
      if (err) {
        console.error("Listen Error:", err);
        return;
      }

      switch (event.type) {
        case "message":
          if (event.body && !isPrefix(event.body)) return; //ignore non prefix
          if (isCommand(event.body, "hi")) {
            api.sendMessage("Hello!", event.threadID);
          }
          break;
      }
    });
  },
);
