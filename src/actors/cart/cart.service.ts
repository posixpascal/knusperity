import { CartContext } from "./cart.machine";
import { contextToMessage, inlineCartKeyboard } from "./utils";
import { extractLinks } from "../../helper";
import { API } from "../../api";

const updateCartMessage = async ({
  bot,
  chat,
  message,
  user,
  items,
}: CartContext) => {
  await bot!.editMessageText(contextToMessage({ bot, items, message, user }), {
    message_id: message!.message_id,
    chat_id: chat!.id,
    reply_markup: {
      inline_keyboard: inlineCartKeyboard(items),
    },
  });
};

export const extractProductsFromMessage: any = async (
  { bot, chat, message, user }: CartContext,
  { text }: { text: string }
) => {
  const links = extractLinks(text);
  const knusprProductIds = links
    .map((link) => {
      console.log(link.match(/\/(\d+)/g));
      const [knusprProductId] = link.match(/\/(\d+)/g) || [];
      return parseInt(knusprProductId.slice(1));
    })
    .filter((id) => !!id);

  if (!links.length) {
    return;
  }

  const linksMessage = await bot!.sendMessage(chat!.id, "🧐 Working on it...");
  const products: KProduct[] = [];

  let index = 1;
  for await (const productID of knusprProductIds) {
    products.push(await API.productByID(productID));
    const productStr = products
      .map((product) => `✅ ${product.productName} - ${product.price.full}`)
      .join("\n");
    if (index % 8 === 0) {
      await bot!.editMessageText(
        `🤓 Watch me working...
${productStr}
`,
        {
          message_id: linksMessage!.message_id,
          chat_id: chat!.id,
        }
      );
    }
  }

  const productStr = products
    .map((product) => `✅ ${product.productName} - ${product.price.full}`)
    .join("\n");
  await bot!.editMessageText(
    `🫡 Produkte hinzugefügt!
${products
  .map((product) => `✅ ${product.productName} - ${product.price.full}`)
  .join("\n")} 
`,
    {
      message_id: linksMessage.message_id,
      chat_id: chat!.id,
    }
  );

  return products;
};

export const createCart = async ({
  bot,
  chat,
  message,
  originalMessage,
}: CartContext) => {
  if (message) {
    await bot!.sendMessage(
      chat!.id,
      `☝️ @${originalMessage!.from!.first_name}, dein Warenkorb ist hier ☝️`,
      {
        reply_to_message_id: message.message_id,
      }
    );
    throw new Error("Ignored");
  }

  const cartMessage = await bot!.sendMessage(
    chat!.id,
    "Alles klar. Moment...",
    {
      reply_to_message_id: originalMessage!.message_id,
      protect_content: true,
    }
  );

  await bot!.sendMessage(
    chat!.id,
    `
☝️ @${originalMessage!.from!.first_name}, dein Warenkorb ist hier ☝️

/search *[Suchbegriff]* - 🕵️‍♂️Produkte suchen
/links *[...Links]* - 🔗 Produkt(e) via Link(s) hinzufügen 
/help - 🧐 Wenn du Fragen hast.
/checkout - 🛒 Bestellung abschließen
/order - 🤷‍♀️Warenkorb verloren? 

- Cheers, Knusperity 🥰`,
    {
      reply_to_message_id: cartMessage!.message_id,
      protect_content: true,
      parse_mode: "Markdown",
    }
  );

  return cartMessage; // updates the underlying messaage for the cart.
};

export const updateCart = async (context: CartContext) => {
  if (context.message) {
    await updateCartMessage(context);
    return context.message;
  }

  const { bot, originalMessage, chat } = context;

  // Create a new message instead
  const newMessage = await bot!.sendMessage(chat!.id, "Alles klar. Moment...", {
    reply_to_message_id: originalMessage!.message_id,
    protect_content: true,
  });

  await updateCartMessage({
    ...context,
    message: newMessage,
  });

  return newMessage;
};
