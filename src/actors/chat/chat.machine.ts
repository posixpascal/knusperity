import { assign, createMachine, send, spawn, StateMachine } from "xstate";
import {
  SearchContext,
  SearchEvent,
  searchMachine,
  searchModel,
} from "../search/search.machine";
import {
  ABORT_CHECKOUT_EVENT,
  CALLBACK_EVENT,
  CHECKOUT_EVENT,
  HELP_EVENT,
  LINK_EVENT,
  NOOP_EVENT,
  ORDER_EVENT,
  SEARCH_EVENT,
} from "../../constants/events";
import {
  CALLBACK_PAYLOAD,
  CART_ADD_ITEM,
  CHECKOUT_CART_CONFIRM,
  CHECKOUT_CART_DENY,
} from "../../constants/callbacks";
import {
  CartContext,
  CartEvent,
  CartLineItem,
  cartMachine,
  cartModel,
} from "../cart/cart.machine";

import { createModel } from "xstate/lib/model";
import TelegramBot, {
  CallbackQuery,
  Chat,
  Message,
  User,
} from "node-telegram-bot-api";
import { ActorRefFrom } from "xstate/lib/types";
import { reply } from "../../helper";

import {
  KnusprContext,
  KnusprEvent,
  knusprMachine,
  knusprModel,
} from "../knuspr/knuspr.machine";
import { choose } from "xstate/lib/actions";

export type ChatEvent =
  | { type: typeof NOOP_EVENT }
  | (Message & { type: typeof SEARCH_EVENT; text: string })
  | (Message & { type: typeof ORDER_EVENT })
  | (Message & { type: typeof CHECKOUT_EVENT })
  | (Message & { type: typeof HELP_EVENT })
  | (Message & { type: typeof LINK_EVENT; payload: string })
  | (Message & { type: typeof CHECKOUT_CART_DENY })
  | (Message & { type: typeof ABORT_CHECKOUT_EVENT })
  | (CallbackQuery & { type: typeof CALLBACK_EVENT; data: CALLBACK_PAYLOAD });

export enum ChatState {
  CHAT_INITIAL = "chatInitial",
  CHAT_ORDER = "chatOrder",
  CHAT_CHECKOUT = "chatCheckout",
  RESET = "chatReset",
}

export interface ChatContext {
  bot?: TelegramBot;
  chat?: Chat;
  searchMachines: ActorRefFrom<StateMachine<SearchContext, any, SearchEvent>>[];
  cartMachines: ActorRefFrom<StateMachine<CartContext, any, CartEvent>>[];
  knusprMachines: ActorRefFrom<StateMachine<KnusprContext, any, KnusprEvent>>[];
}

export const chatModel = createModel<ChatContext, ChatEvent>({
  searchMachines: [],
  cartMachines: [],
  knusprMachines: [],
});

export const chatMachine = createMachine<ChatContext, ChatEvent, any, any>(
  {
    context: chatModel.initialContext,
    initial: ChatState.CHAT_INITIAL,
    on: {
      [NOOP_EVENT]: {},
      [HELP_EVENT]: {
        actions: [
          reply(`
Ich bin Knusperity! Der interaktive Knuspr Bestellbot. Mein Zweck der Existenz ist es... Dinge für euch bei Knuspr zu bestellen. F M L 🥹

*Warenkorb*
-----------
Wenn du mitbestellen willst, aktiviere zuerst deinen Warenkorb!
Schreibe dazu einfach /order in den Chat.

*Produkte*
----------
Du kannst Produkte direkt von Knuspr.de hier einfügen. Einfach den Link kopieren und mit /links hier schreiben.           
/links [hier link einfügen]

Oder du suchst direkt deine Produkte indem du /search [Suchbegriff] schreibst!

*Beispiele*
/search Pizza
/links https://knuspr.de/link-der-pizza https://knuspr.de/link-von-etwas-anderem

*Bestellen*
Wenn ihr alle fertig seid, schreibt einfach einer von euch: /checkout & es geht weiter.

⚠️ ⚠️ ⚠️ 
Ich bestelle noch nicht automatisch, den letzten Klick wag ich mich noch nicht zu machen... 
Das soll euch aber nicht weiter stören!
⚠️ ⚠️ ⚠️
          `),
        ],
      },
      [CALLBACK_EVENT]: {
        actions: send(
          (context, event) => {
            // Populate the event with product data from search
            if (event.data === CART_ADD_ITEM) {
              let product = null;
              // Delegate event to a search message
              for (const search of context.searchMachines) {
                const { context } = search.state;
                if (context.message?.message_id === event.message?.message_id) {
                  product = context.product;
                }
              }

              return {
                ...event,
                product,
              };
            }

            return event;
          },
          {
            // @ts-ignore
            to: (context, event) => {
              if (event.data.startsWith("KNUSPR")) {
                // Delegate event to a search message
                for (const checkout of context.knusprMachines) {
                  const { context } = checkout.state;
                  console.log("Found receipient");
                  if (context.chat!.id === event.message!.chat.id) {
                    return checkout.id;
                  }
                }
              }

              if (event.data.startsWith("SEARCH")) {
                // Delegate event to a search message
                for (const search of context.searchMachines) {
                  const { context } = search.state;
                  if (
                    context.message.message_id === event.message!.message_id
                  ) {
                    return search.id;
                  }
                }
              }

              if (event.data.startsWith("CHECKOUT")) {
                // Delegate event to a search message
                for (const checkout of context.knusprMachines) {
                  const { context } = checkout.state;
                  if (context.chat!.id === event.message!.chat.id) {
                    return checkout.id;
                  }
                }
              }

              if (event.data.startsWith("CART")) {
                // Delegate event to users cart machine
                for (const cart of context.cartMachines) {
                  const { context } = cart.state;

                  if (context.user!.id === event.from.id) {
                    return cart.id;
                  }
                }
              }

              return null;
            },
          }
        ),
      },
      [ORDER_EVENT]: {
        actions: assign({
          cartMachines: (context, event) => {
            const userCart = context.cartMachines.find(
              ({ state: { context: cartContext } }: any) => {
                return cartContext.user!.id === event.from!.id;
              }
            );

            // TODO: should be handled somewhere else in the state machine.
            if (userCart) {
              const {
                state: { context: cartContext },
              } = userCart;
              context.bot!.sendMessage(
                cartContext.chat!.id,
                `☝️ @${
                  cartContext.originalMessage!.from!.first_name
                }, dein Warenkorb ist hier ☝️`,
                {
                  reply_to_message_id: cartContext.originalMessage!.message_id,
                }
              );
              return context.cartMachines;
            }

            return [
              ...context.cartMachines,
              spawn(
                cartMachine.withContext({
                  ...cartModel.initialContext,
                  chat: context.chat,
                  user: event.from,
                  originalMessage: event,
                  bot: context.bot,
                }),
                `cart-${event.message_id}`
              ),
            ];
          },
        }),
        target: ChatState.CHAT_ORDER,
      },
      [CHECKOUT_EVENT]: {
        target: ChatState.CHAT_CHECKOUT,
      },
      [ABORT_CHECKOUT_EVENT]: {
        target: ChatState.CHAT_ORDER,
        actions: [
          reply(
            "Bestellungprozess abgebrochen. Ihr könnt jederzeit mit /checkout neu anfangen!"
          ),
        ],
      },
      [SEARCH_EVENT]: {
        actions: assign({
          searchMachines: (context, event) => [
            ...context.searchMachines,
            spawn(
              searchMachine.withContext({
                ...searchModel.initialContext,
                chat: context.chat,
                bot: context.bot,
                query: event.text.replace("/search", ""), // TODO: better location for this intent extraction?
              }),
              `search-${event.message_id}`
            ),
          ],
        }),
      },
    },
    states: {
      [ChatState.RESET]: {
        entry: [
          assign({
            checkoutMachines: () => [],
            cartMachines: () => [],
            searchMachines: () => [],
          }),
        ],
        after: {
          1000: {
            target: ChatState.CHAT_INITIAL,
          },
        },
      },
      [ChatState.CHAT_INITIAL]: {
        on: {
          [LINK_EVENT]: {
            actions: [
              reply("Bitte starte eine Order in diesem Chat via /order."),
            ],
          },
        },
      },
      [ChatState.CHAT_CHECKOUT]: {
        entry: [
          assign({
            knusprMachines: (context, event) => [
              ...context.knusprMachines,
              spawn(
                knusprMachine.withContext({
                  ...knusprModel.initialContext,
                  chat: context.chat,
                  bot: context.bot,
                  carts: context.cartMachines.map((cartMachine) => {
                    return cartMachine.state.context as {
                      user: User;
                      items: CartLineItem[];
                    };
                  }),
                }),
                `checkout-${context.chat!.id}`
              ),
            ],
          }),
        ],
        on: {
          [CHECKOUT_CART_DENY]: {
            actions: [
              reply(
                "Bestellprozess abgebrochen. Startet jederzeit von vorn via /checkout."
              ),
              send(ABORT_CHECKOUT_EVENT),
            ],
          },
        },
      },
      [ChatState.CHAT_ORDER]: {
        on: {
          [LINK_EVENT]: {
            actions: send(
              (context, event) => {
                // check if user has a cart
                for (const cart of context.cartMachines) {
                  const { context } = cart.state;

                  if (context.user!.id === event.from!.id) {
                    return event;
                  }
                }

                return {
                  type: NOOP_EVENT,
                }; // Prevent event from recycling/looping back
              },
              {
                to: (context, event) => {
                  // Delegate event to users cart machine
                  for (const cart of context.cartMachines) {
                    const { context } = cart.state;

                    if (context.user!.id === event.from!.id) {
                      return cart.id;
                    }
                  }

                  return "self";
                },
              }
            ),
          },
        },
      },
    },
  },
  {
    actions: {},
  }
);
