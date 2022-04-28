import TelegramBot from "node-telegram-bot-api";
import { API } from "../../api";
import {
  CART_ADD_ITEM,
  SEARCH_NEXT_PAGE,
  SEARCH_PREV_PAGE,
} from "../../constants/callbacks";
import { logger } from "../../logger";
import { SearchContext } from "./search.machine";

const updateSearchMessage = async ({
  bot,
  message,
  product,
}: {
  bot: TelegramBot;
  message: TelegramBot.Message;
  product: KProduct;
}) => {
  await bot!.editMessageMedia(
    {
      caption:
        product.productName +
        "\n" +
        product.textualAmount +
        " - " +
        product.price.full +
        product.price.currency,
      type: "photo",
      media: "https://cdn.knuspr.de" + product.imgPath,
    },
    {
      message_id: message.message_id,
      chat_id: message.chat.id,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🛒 hinzufügen",
              callback_data: CART_ADD_ITEM,
            },
            {
              text: "Details",
              url: "https://www.knuspr.de/" + product.link,
            },
          ],
          [
            {
              text: "⬅️",
              callback_data: SEARCH_PREV_PAGE,
            },
            {
              text: "➡️",
              callback_data: SEARCH_NEXT_PAGE,
            },
          ],
        ],
      },
    }
  );
};

export const searchService = async ({
  message,
  bot,
  query,
  chat,
  page,
}: SearchContext) => {
  logger.debug("Searching for", query, "on page ", page);
  const products = await API.search(query, { page, limit: 1 });
  const [product] = products.productList;

  if (!product) {
    throw new Error("No results found");
  }

  const client = {
    bot: bot!,
    product,
  };

  if (!message) {
    const newMessage = await bot!.sendPhoto(
      chat!.id,
      "https://media0.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif"
    );
    await updateSearchMessage({ ...client, message: newMessage });
    return { message: newMessage, product };
  }

  await updateSearchMessage({ ...client, message });
  return { message, product };
};
