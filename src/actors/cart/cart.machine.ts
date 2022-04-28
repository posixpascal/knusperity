import { assign, createMachine, send } from "xstate";
import { choose } from "xstate/lib/actions";
import { createModel } from "xstate/lib/model";
import TelegramBot, { Chat, Message, User } from "node-telegram-bot-api";
import {
  CALLBACK_EVENT,
  CART_ADD_EVENT,
  LINK_EVENT,
} from "../../constants/events";
import {
  CALLBACK_PAYLOAD,
  CART_ADD_ITEM,
  CART_DEC_ITEM,
  CART_INC_ITEM,
} from "../../constants/callbacks";
import {
  createCart,
  extractProductsFromMessage,
  updateCart,
} from "./cart.service";

export interface CartLineItem {
  product: KProduct;
  quantity: number;
}

// Type definitions for xstate
export interface CartContext {
  bot?: TelegramBot;
  user?: User;
  chat?: Chat;

  // Where the cart will be placed
  message?: Message;

  // The message that triggered the cart.
  originalMessage?: Message;

  items: CartLineItem[];
}

export type CartEvent =
  | { type: typeof CART_ADD_EVENT }
  | { type: typeof LINK_EVENT }
  | { type: typeof CALLBACK_EVENT; product: KProduct; data: CALLBACK_PAYLOAD };

export enum CartState {
  CART_INITIAL = "cartInitial",
  CART_ADD = "cartAdd",
  CART_REMOVE = "cartRemove",
  CART_EXTRACT_LINKS = "cartExtractLinks",
  CART_START = "cartStart",
}

export const cartModel = createModel<CartContext, CartEvent>({
  items: [],
});

export const cartMachine = createMachine<CartContext, CartEvent>({
  context: cartModel.initialContext,
  initial: CartState.CART_INITIAL,
  invoke: [],
  on: {
    [CART_ADD_EVENT]: {
      target: CartState.CART_ADD,
    },
    [LINK_EVENT]: {
      target: CartState.CART_EXTRACT_LINKS,
    },
    [CALLBACK_EVENT]: {
      actions: choose([
        {
          cond: (_, { data }) => {
            return (
              data.startsWith(CART_INC_ITEM) || data.startsWith(CART_DEC_ITEM)
            );
          },
          actions: [
            assign({
              items: (ctx: CartContext, { data }: any) => {
                const parts = data.split("_");
                const productId = parseInt(parts[parts.length - 1]);

                // Product may be in cart already, we increment its quantity then
                const inCart = ctx.items.find(
                  (item) => item.product.productId === productId
                );
                if (!inCart) {
                  console.log("not in cart");
                  return ctx.items;
                }

                if (data.startsWith(CART_INC_ITEM)) {
                  inCart.quantity++;
                } else {
                  inCart.quantity--;
                }

                return ctx.items
                  .map((lineItem) => {
                    if (lineItem.product.productId === productId) {
                      return inCart;
                    }

                    return lineItem;
                  })
                  .filter((lineItem) => lineItem.quantity > 0);
              },
            }),
            send(CART_ADD_EVENT) as any,
          ],
        },
        {
          cond: (_, { data }) => {
            return data === CART_ADD_ITEM;
          },
          actions: [
            assign({
              items: (ctx: CartContext, data: any) => {
                // Product may be in cart already, we increment its quantity then
                const inCart = ctx.items.find(
                  (item) => item.product.productId === data.product.productId
                );
                if (inCart) {
                  return ctx.items.map((lineItem) => {
                    if (lineItem.product.productId === data.product.productId) {
                      return {
                        product: lineItem.product,
                        quantity: lineItem.quantity + 1,
                      };
                    }

                    return lineItem;
                  });
                }

                // Otherwise, we add it to the cart
                return [
                  ...ctx.items,
                  {
                    product: data.product,
                    quantity: 1,
                  },
                ];
              },
            }),
            (context, event) => {
              context.bot!.sendMessage(
                context.chat!.id,
                `✅ ${event.product.productName} hinzugefügt`,
                {
                  reply_to_message_id: context.message!.message_id,
                }
              );
            },
            send(CART_ADD_EVENT) as any,
          ],
        },
      ]),
    },
  },
  states: {
    [CartState.CART_INITIAL]: {
      invoke: {
        src: createCart,
        onDone: {
          actions: assign({
            message: (_, { data }) => data,
          }),
          target: CartState.CART_START,
        },
      },
    },
    [CartState.CART_EXTRACT_LINKS]: {
      invoke: {
        src: extractProductsFromMessage,
        onDone: {
          actions: assign({
            items: (context, { data }) => {
              const products = data;
              let cartItems = context.items;

              for (const product of products) {
                // Product may be in cart already, we increment its quantity then
                const inCart = context.items.find(
                  (item) => item.product.productId === data.productId
                );
                if (!inCart) {
                  cartItems.push({
                    product: product,
                    quantity: 1,
                  });
                  continue;
                }
                cartItems = cartItems.map((lineItem) => {
                  if (lineItem.product.productId === product.productId) {
                    return {
                      product: lineItem.product,
                      quantity: lineItem.quantity + 1,
                    };
                  }

                  return lineItem;
                });
              }

              return cartItems;
            },
          }),
          target: CartState.CART_START,
        },
      },
    },
    [CartState.CART_ADD]: {
      after: {
        300: {
          target: CartState.CART_START,
        },
      },
    },
    [CartState.CART_START]: {
      invoke: {
        src: updateCart,
        onDone: {
          actions: assign({
            message: (_, { data }) => data,
          }),
        },
      },
    },
  },
});
