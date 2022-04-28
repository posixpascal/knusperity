import { assign, createMachine, send } from "xstate";
import { searchService } from "./search.service";
import {
  CALLBACK_EVENT,
  SEARCH_PAGINATE_NEXT_EVENT,
  SEARCH_PAGINATE_PREV_EVENT,
} from "../../constants/events";
import { choose, log } from "xstate/lib/actions";
import {
  CALLBACK_PAYLOAD,
  SEARCH_NEXT_PAGE,
  SEARCH_PREV_PAGE,
} from "../../constants/callbacks";
import { createModel } from "xstate/lib/model";
import TelegramBot, { Chat } from "node-telegram-bot-api";

// Type definitions for xstate
export interface SearchContext {
  bot?: TelegramBot;
  product?: KProduct;
  chat?: Chat;
  message: any;
  query: string;
  page: number;
}

export type SearchEvent =
  | { type: typeof SEARCH_PAGINATE_NEXT_EVENT }
  | { type: typeof SEARCH_PAGINATE_PREV_EVENT }
  | { type: typeof CALLBACK_EVENT; data: CALLBACK_PAYLOAD };

export enum SearchState {
  SEARCH = "search",
  PAGINATE_NEXT = "paginateNext",
  PAGINATE_PREV = "paginatePrev",
}

export const searchModel = createModel<SearchContext, SearchEvent>({
  message: null,
  query: "",
  page: 1,
});

export const searchMachine = createMachine<SearchContext, SearchEvent>({
  context: searchModel.initialContext,
  initial: SearchState.SEARCH,
  on: {
    [SEARCH_PAGINATE_NEXT_EVENT]: {
      target: SearchState.PAGINATE_NEXT,
    },
    [SEARCH_PAGINATE_PREV_EVENT]: {
      target: SearchState.PAGINATE_PREV,
    },
    [CALLBACK_EVENT]: {
      actions: choose([
        {
          cond: (_, { data }) => {
            return data === SEARCH_NEXT_PAGE;
          },
          actions: send(SEARCH_PAGINATE_NEXT_EVENT),
        },
        {
          cond: (_, { data }) => {
            return data === SEARCH_PREV_PAGE;
          },
          actions: send(SEARCH_PAGINATE_PREV_EVENT),
        },
      ]),
    },
  },
  states: {
    [SearchState.SEARCH]: {
      invoke: {
        src: searchService,
        onDone: {
          actions: [
            assign({
              message: (_, { data }) => data.message,
              product: (_, { data }) => data.product,
            }),
          ],
        },
      },
    },
    [SearchState.PAGINATE_NEXT]: {
      entry: assign({
        page: ({ page }) => page + 1,
      }),
      after: {
        300: SearchState.SEARCH,
      },
    },
    [SearchState.PAGINATE_PREV]: {
      entry: assign({
        page: ({ page }) => page - 1,
      }),
      after: {
        300: SearchState.SEARCH,
      },
    },
  },
});
