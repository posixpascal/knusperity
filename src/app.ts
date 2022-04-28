import dotenv from "dotenv";
dotenv.config();

import { interpret } from "xstate";
import TelegramBot from "node-telegram-bot-api";
import {
  CALLBACK_EVENT,
  CHECKOUT_EVENT,
  HELP_EVENT,
  LINK_EVENT,
  ORDER_EVENT,
  SEARCH_EVENT,
  START_EVENT,
} from "./constants/events";
import { chatMachine, chatModel } from "./actors/chat/chat.machine";

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token!, { polling: true });

export const instances: Record<number, any> = {};

bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (!instances.hasOwnProperty(chatId)) {
    try {
      instances[chatId] = interpret(
        chatMachine.withContext({
          ...chatModel.initialContext,
          chat: msg.chat,
          bot,
        })
      );

      instances[chatId].start();
    } catch (e) {
      console.log("ERROR: ", e);
    }
  }

  const interpreter = instances[chatId];

  try {
    // Detect basic commands and dispatch events to the machine
    const keyword = msg.text!.toLowerCase().split(" ")[0];
    switch (keyword) {
      case "/start":
        interpreter.send(START_EVENT, msg);
        break;
      case "/order":
        interpreter.send(ORDER_EVENT, msg);
        break;
      case "/checkout":
        interpreter.send(CHECKOUT_EVENT, msg);
        break;
      case "/search":
        interpreter.send(SEARCH_EVENT, msg);
        break;
      case "/help":
        interpreter.send(HELP_EVENT, msg);
        break;
      default:
    }

    // Detect links from knuspr
    if (
      msg.text!.includes("https://knuspr.de/") ||
      msg.text!.includes("https://www.knuspr.de/")
    ) {
      console.log("LINK DETECTED");
      interpreter.send(LINK_EVENT, msg);
    }
  } catch (e) {
    console.error(e);
  }
});

bot.on("callback_query", async (msg) => {
  const chatId = msg.message!.chat!.id;

  if (!instances.hasOwnProperty(chatId)) {
    return;
  }

  const knusperity = instances[chatId];
  knusperity.send(CALLBACK_EVENT, msg);
});

console.log("Knuspr Bot started.");
