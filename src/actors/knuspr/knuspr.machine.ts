import { assign, createMachine, send, sendParent } from "xstate";
import { ABORT_CHECKOUT_EVENT, CALLBACK_EVENT } from "../../constants/events";
import { createModel } from "xstate/lib/model";
import TelegramBot, { Chat, Message, User } from "node-telegram-bot-api";
import { CartLineItem } from "../cart/cart.machine";
import {
  CHECKOUT_CART_CONFIRM,
  CHECKOUT_CART_DENY,
} from "../../constants/callbacks";
import {
  acceptCookies,
  checkoutInitial,
  confirmOrder,
  enterFailSafeMode,
  enterPayment,
  knusprCheckout,
  knusprDelivery,
  knusprEnterDelivery,
  launchBrowser,
  performLogin,
  populateCart,
  prepareCarts,
  saveOrder,
  setupMessage,
  updateMessage,
} from "./knuspr.service";
import { Browser, Page } from "puppeteer";
import { choose } from "xstate/lib/actions";

export interface UserCart {
  items: CartLineItem[];
  userId: number;
  userName: string;
}

export interface KnusprStatus {
  cookies: boolean | null;
  connected: boolean | null;
  loggedIn: boolean | null;
  productsInCart: boolean | null;
  address: boolean | null;
  payment: boolean | null;
  confirmation: boolean | null;
  delivery: boolean | null;
  ordered: boolean | null;
}

// Type definitions for xstate
export interface KnusprContext {
  bot?: TelegramBot;
  chat?: Chat;
  browser?: Browser;
  page?: Page;
  message?: Message;
  deliveryMessage?: Message;
  extraDeliveryMessage?: Message;
  status: KnusprStatus;
  deliveryOptions: any;
  selectedDeliveryOption?: any;
  cartConfirmMessage?: Message;
  carts: { user: User; items: CartLineItem[] }[];
  cartConfirmations: User[];
}

export type KnusprEvent =
  | {
      type: typeof CALLBACK_EVENT;
      message: Message;
      data: string;
    }
  | {
      type: typeof CHECKOUT_CART_CONFIRM;
    };

export enum KnusprState {
  INITIAL = "knusprInitial",
  CONNECTING = "knusprConnecting",
  LOGGING_IN = "knusprLogin",
  ACCEPTING_COOKIES = "knusprCookies",
  POPULATING_CART = "knusprPopulateCart",
  CHECKOUT = "knusprCheckout",
  DELIVERY = "knusprDelivery",
  DELIVERY_CONFIRM = "knusprDeliveryConfirm",
  ENTER_DELIVERY = "knusprEnterDelivery",
  PAYMENT = "knusprPayment",
  CONFIRMATION = "knusprConfirmation",
  CHECKOUT_INITIAL = "knusprCheckoutInitial",
  SAVE_ORDER = "knusprSaveOrder",
  PREPARE_CARTS = "prepareCarts",
  CONFIRM_CARTS = "confirmCarts",
  PROCEED = "proceed",
}

export const knusprModel = createModel<KnusprContext, KnusprEvent>({
  carts: [],
  cartConfirmations: [],
  cartConfirmMessage: undefined,
  status: {
    connected: null,
    cookies: null,
    loggedIn: null,
    productsInCart: null,
    address: null,
    delivery: null,
    payment: null,
    confirmation: null,
    ordered: null,
  },
  deliveryOptions: [],
});

export const knusprMachine = createMachine<KnusprContext, KnusprEvent>({
  context: knusprModel.initialContext,
  initial: KnusprState.CHECKOUT_INITIAL,
  // @ts-ignore
  // @ts-ignore
  on: {
    [CHECKOUT_CART_CONFIRM]: {
      target: KnusprState.CONFIRM_CARTS,
    },
    [CALLBACK_EVENT]: {
      actions: choose([
        {
          cond: (_, { data }: any) => {
            return data === CHECKOUT_CART_CONFIRM;
          },
          actions: [
            // @ts-ignore
            assign({
              cartConfirmations: (context: any, event: any) => {
                if (
                  context.cartConfirmations.find(
                    (user: User) => user.id === event.from.id
                  )
                ) {
                  return context.cartConfirmations;
                }

                return [...context.cartConfirmations, event.from!];
              },
            }),
            send(CHECKOUT_CART_CONFIRM),
          ],
        },
        {
          cond: (_, { data }: any) => {
            return data === CHECKOUT_CART_DENY;
          },
          actions: [
            // @ts-ignore
            assign({
              cartConfirmations: (context: any, event: any) => {
                return [...context.cartConfirmations].filter(
                  (user) => user.id !== event.from!.id
                );
              },
            }),
            sendParent(ABORT_CHECKOUT_EVENT),
          ],
        },
      ]),
    },
  },
  states: {
    [KnusprState.CHECKOUT_INITIAL]: {
      // @ts-ignore
      invoke: {
        src: checkoutInitial,
        onDone: {
          target: KnusprState.PREPARE_CARTS,
          actions: assign({
            message: (_, { data }) => data.message,
          }),
        },
      },
    },
    [KnusprState.PREPARE_CARTS]: {
      invoke: {
        src: prepareCarts,
        onDone: {
          actions: assign({
            cartConfirmMessage: (_, { data }) => data.message,
          }),
        },
      },
      on: {},
    },
    [KnusprState.CONFIRM_CARTS]: {
      invoke: {
        src: async (context, event) => {
          if (context.cartConfirmations.length === context.carts.length) {
            await prepareCarts(context, event);
            return true;
          }
          throw new Error("Not all users confirmed carts");
        },
        onDone: {
          target: KnusprState.SAVE_ORDER,
        },
        onError: {
          target: KnusprState.PREPARE_CARTS,
        },
      },
    },
    [KnusprState.SAVE_ORDER]: {
      invoke: {
        src: saveOrder,
        onDone: {
          target: KnusprState.PROCEED,
        },
      },
      on: {},
    },
    [KnusprState.PROCEED]: {
      invoke: {
        src: setupMessage,
        onDone: {
          actions: [
            assign({
              message: (_, { data }) => data.message,
            }),
          ],
          target: KnusprState.CONNECTING,
        },
      },
    },
    [KnusprState.CONNECTING]: {
      invoke: {
        src: launchBrowser,
        onDone: {
          actions: [
            assign({
              browser: (_, { data }) => data.browser,
              page: (_, { data }) => data.page,
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.ACCEPTING_COOKIES,
        },
      },
    },
    [KnusprState.ACCEPTING_COOKIES]: {
      invoke: {
        src: acceptCookies,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.LOGGING_IN,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({ ...status, cookies: false }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
    [KnusprState.LOGGING_IN]: {
      invoke: {
        src: performLogin,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.POPULATING_CART,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({
                ...status,
                loggedIn: false,
              }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
    [KnusprState.POPULATING_CART]: {
      invoke: {
        src: populateCart,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.CHECKOUT,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({
                ...status,
                productsInCart: false,
              }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
    [KnusprState.CHECKOUT]: {
      invoke: {
        src: knusprCheckout,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.DELIVERY,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({ ...status, address: false }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
    [KnusprState.DELIVERY_CONFIRM]: {
      on: {
        [CALLBACK_EVENT]: {
          actions: [
            assign({
              selectedDeliveryOption: (_, { data }) => data,
            }),
          ],
          target: KnusprState.ENTER_DELIVERY,
        },
      },
    },
    [KnusprState.CONFIRMATION]: {
      invoke: {
        src: confirmOrder,
        onDone: {},
        onError: {},
      },
    },
    [KnusprState.PAYMENT]: {
      invoke: {
        src: enterPayment,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.CONFIRMATION,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({ ...status, payment: false }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
    [KnusprState.ENTER_DELIVERY]: {
      invoke: {
        src: knusprEnterDelivery,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
            }),
            updateMessage,
          ],
          target: KnusprState.PAYMENT,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({ ...status, address: false }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
    [KnusprState.DELIVERY]: {
      invoke: {
        src: knusprDelivery,
        onDone: {
          actions: [
            assign({
              status: (_, { data }) => data.status,
              deliveryOptions: (_, { data }) => data.deliveryOptions,
              deliveryMessage: (_, { data }) => data.deliveryMessage,
              extraDeliveryMessage: (_, { data }) => data.extraDeliveryMessage,
            }),
            updateMessage,
          ],
          target: KnusprState.DELIVERY_CONFIRM,
        },
        onError: {
          actions: [
            assign({
              status: ({ status }, { data }) => ({ ...status, address: false }),
            }),
            enterFailSafeMode,
          ],
        },
      },
    },
  },
});
