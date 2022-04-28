import puppeteer, {
  BrowserLaunchArgumentOptions,
  LaunchOptions,
} from "puppeteer";
import { KnusprContext, KnusprStatus } from "./knuspr.machine";
import { sleep } from "../../helper";
import { CartLineItem } from "../cart/cart.machine";
import { User } from "node-telegram-bot-api";
import {
  CHECKOUT_CART_CONFIRM,
  CHECKOUT_CART_DENY,
} from "../../constants/callbacks";
import fs from "fs/promises";
const dotenv = require('dotenv'); dotenv.config();

const PUPPETEER_CONFIG: LaunchOptions & BrowserLaunchArgumentOptions = {
  headless: false,
};

const statusMessage = (status: KnusprStatus) => {
  const statusLabels: Record<keyof KnusprStatus, string> = {
    connected: "Verbinde mit Knuspr.de...",
    address: "Adresse wird gesetzt",
    cookies: "Cookies werden akzeptiert",
    delivery: "Lieferfenster wird ausgewählt",
    loggedIn: "Melde mich auf Knuspr an",
    payment: "Zahlungsmittel wird gesetzt",
    confirmation: "Warte auf finale Bestätigung der Gruppe",
    ordered: "Bestellung wird abgeschickt",
    productsInCart: "Lege Produkte in den Warenkorb",
  };

  const statusText = Object.entries(status)
    .map(([key, state]) => {
      let statusIcon = "⌛️";
      if (state !== null) {
        statusIcon = state ? "✅" : "❌";
      }

      return `${statusIcon}  ${statusLabels[key as keyof KnusprStatus]}`;
    })
    .join("\n");

  return `
    Alles klar! Ich verbinde mich nun mit Knuspr.de. 😊. 
    
${statusText}    
    
Aktualisiert am ${new Date().toLocaleTimeString()}    `;
};

export const enterFailSafeMode = async (context: KnusprContext, event: any) => {
  await updateMessage(context);
  const links = context.carts!.reduce((acc: string[], cur) => {
    return [
      ...acc,
      ...cur.items.flatMap((item) => `https://knuspr.de/${item.product.link}`),
    ];
  }, []);

  await context.bot!.sendMessage(
    context.chat!.id,
    `
    SORRY FREUNDE! Da hat sich wohl irgendwas geändert bei Knuspr. 
    Hier alle Links zu den Produkten die ihr bestellen wollt:
    
    ${links.join("\n")}
  `
  );

  console.log(event.data);
};

export const setupMessage = async (context: KnusprContext) => {
  const message = await context.bot!.sendMessage(
    context.chat!.id,
    statusMessage(context.status)
  );
  return { message };
};

export const updateMessage = async (context: KnusprContext) => {
  const message = await context.bot!.editMessageText(
    statusMessage(context.status),
    {
      chat_id: context.chat!.id,
      message_id: context.message!.message_id,
    }
  );

  return { message };
};

const cartTotal = (cart: any) => {
  console.log(cart);
  return cart
    .reduce((acc: number, item: CartLineItem) => {
      return acc + item.quantity * item.product.price.full;
    }, 0)
    .toFixed(2);
};

export const checkoutInitial = async (context: KnusprContext) => {
  const message = await context.bot!.sendMessage(
    context.chat!.id,
    "Bestellprozess gestartet. Ich führe euch nun Schritt für Schritt durch. Bleibt kurz dabei! 😊"
  );
  await sleep(1500);
  return message;
};

export const prepareCarts = async (context: KnusprContext, event: any) => {
  const confirmed = (user: User) => {
    return !!context.cartConfirmations.find(
      (confirmation) => confirmation.id === user.id
    );
  };

  const cartsPerPerson = context.carts
    .map(
      (cart) =>
        `${confirmed(cart.user) ? "✅" : "⌛️"} @${cart.user.first_name} - ${
          cart.items.length
        } Produkt(e) - ${cartTotal(cart.items)} €`
    )
    .join("\n");
  const text = `
   Folgende Warenkörbe werden bestellt, ist das in Ordnung für euch?
   
   ${cartsPerPerson}
   
   Bitte klickt auf den Button, um euren Warenkorb zu bestätigen. 
   Schreibt /order um euren Warenkorb wieder zu finden.
   
   --> ${context.cartConfirmations.length} / ${context.carts.length} <--
   Aktualisiert am ${new Date().toLocaleTimeString()}
   `;

  if (context.cartConfirmMessage) {
    await context.bot!.editMessageText(text, {
      chat_id: context.chat!.id,
      message_id: context.cartConfirmMessage.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Passt ✅",
              callback_data: CHECKOUT_CART_CONFIRM,
            },
            {
              text: "Passt nicht ❌",
              callback_data: CHECKOUT_CART_DENY,
            },
          ],
        ],
      },
    });

    return { message: context.cartConfirmMessage };
  }

  const message = await context.bot!.sendMessage(context.chat!.id, text, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Passt ✅",
            callback_data: CHECKOUT_CART_CONFIRM,
          },
          {
            text: "Passt nicht ❌",
            callback_data: CHECKOUT_CART_DENY,
          },
        ],
      ],
    },
  });

  return { message };
};

export const saveOrder = async (context: KnusprContext, event: any) => {
  await sleep(1000);

  await context.bot!.deleteMessage(
    context.chat!.id,
    String(context.cartConfirmMessage!.message_id)
  );

  await fs.writeFile(
    `orders/${context.chat!.id}.json`,
    JSON.stringify(
      {
        carts: context.carts.map((cart) => {
          return {
            items: cart.items,
            userId: cart.user.id,
            userName: cart.user.first_name,
          };
        }),
        chatId: context.chat!.id,
      },
      null,
      4
    )
  );

  return undefined;
};

export const acceptCookies = async (context: KnusprContext) => {
  const COOKIE_ACCEPT_BUTTON_SELECTOR =
    "#CybotCookiebotDialog #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll";

  await sleep(1000); // We keep this here to prevent telegram rate limits.

  const status = {
    ...context.status,
    cookies: true,
  };

  const page = context.page!;

  await page.waitForSelector(COOKIE_ACCEPT_BUTTON_SELECTOR);
  await page.click(COOKIE_ACCEPT_BUTTON_SELECTOR);

  return { status };
};

export const launchBrowser = async (context: KnusprContext) => {
  const browser = await puppeteer.launch(PUPPETEER_CONFIG);
  const page = await browser.newPage();

  await page.goto("https://www.knuspr.de");

  const status = {
    ...context.status,
    connected: true,
  };

  return { browser, page, status };
};

export const performLogin = async (context: KnusprContext) => {
  const LOGIN_FORM_SELECTOR = '[data-test="user-login-form"]';
  const LOGIN_SUBMIT_BUTTON = '[data-test="btnSignIn"]';

  await sleep(1000);
  const page = context.page!;

  // Enter Login credentials
  await page.click("#headerLogin");
  await page.waitForSelector(LOGIN_FORM_SELECTOR);
  await page.type(`${LOGIN_FORM_SELECTOR} #email`, process.env.KNUSPR_EMAIL!);
  await page.type(`${LOGIN_FORM_SELECTOR} #password`, process.env.KNUSPR_PASSWORD!);
  await page.click(LOGIN_SUBMIT_BUTTON);

  await page.waitForTimeout(2000);

  // Verify login
  await page.waitForSelector("#headerUser");

  const status = {
    ...context.status,
    loggedIn: true,
  };

  return { status };
};

export const populateCart = async (context: KnusprContext) => {
  await sleep(1000);

  const status = {
    ...context.status,
    productsInCart: true,
  };

  const carts = context.carts;
  for await (const cart of carts) {
    for await (const item of cart.items) {
      let added = 0;
      while (added < item.quantity) {
        await addItemToKnusprCart(context, item);
        added += 1;
      }
    }
  }

  return { status };
};

const addItemToKnusprCart = async (
  context: KnusprContext,
  item: CartLineItem
) => {
  const page = context.page!;

  await page.goto(`https://knuspr.de/${item.product.link}`);
  await page.waitForTimeout(6000);

  try {
    // there are 2 states, one initial when the product is not in cart, and one counter element when its in cart.
    // We first try to find the initial button and fall back to the counter
    await page.waitForSelector(
      '[data-test="counter"] button[data-test="btnAdd"]',
      { timeout: 3000 }
    );
    // button exists, we click!
    await page.click('[data-test="counter"] button[data-test="btnAdd"]');
  } catch (e) {
    await page.waitForSelector(
      '[data-test="counter"] button[data-test="btnPlus"]',
      { timeout: 3000 }
    );
    // button exists, we click!
    await page.click('[data-test="counter"] button[data-test="btnPlus"]');
  }

  return;
};

export const knusprCheckout = async (context: KnusprContext) => {
  const page = context.page!;

  await page.goto("https://www.knuspr.de/bestellung/mein-warenkorb");
  await page.waitForSelector('button[data-test="cart-review-button"]');
  await page.click('button[data-test="cart-review-button"]');

  const status = {
    ...context.status,
    address: true,
  };

  return { status };
};

export const knusprDelivery = async (context: KnusprContext) => {
  const page = context.page!;
  await page.goto("https://www.knuspr.de/bestellung/bezahlen");

  try {
    await page.waitForSelector(
      'button[data-test="checkout-show-timeslots-button"]',
      { timeout: 2000 }
    );
    await page.click('button[data-test="checkout-show-timeslots-button"]');
  } catch (e) {
    // time window already selected, we purposefully deselect it.
    await page.click('[data-test="timeslot-change"]');
  }

  await page.waitForTimeout(5000);

  const listOfDays = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLSpanElement>(".timeSlots-tabList li")
    ).map((el, index) => [index, el.innerText]);
  });

  // Click on each tab in the delivery time-window and select all available options
  const deliveryOptions: any = [];
  for await (const [index, day] of listOfDays) {
    // mark tab as active
    await page.click(`.timeSlots-tabList li[data-test="tab-${index}"]`);
    await page.waitForTimeout(1000);

    // fetches all possible options
    const options = await page.evaluate(
      (index) => {
        return Array.from(
          document.querySelectorAll<HTMLTableElement>(
            `[data-test="tab-content-timeslots-${index}"] > div`
          )
        ).map((el) => {
          return {
            marker: el.querySelector("span")!.innerText,
            text: el.querySelector("button")!.innerText.split("\n")[0],
          };
        });
      },
      [index]
    );

    deliveryOptions.push({
      index,
      day,
      options,
    });
  }

  const status = {
    ...context.status,
  };

  const deliveryMessage = await context!.bot?.sendMessage(
    context.chat!.id,
    `
  Wann wollt ihr die Bestellung empfangen?
  

  
  `,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: inlineKeyboardForDeliveryOptions(deliveryOptions),
      },
    }
  );

  const extraDeliveryMessage = await context!.bot!.sendMessage(
    context.chat!.id,
    `
    ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️  ☝️ ☝️ ☝️ ☝️
     ⚠️ *Bitte sprecht euch ab bevor jemand eine Option auswählt.* ⚠️ 
      
  `,
    {
      parse_mode: "Markdown",
      reply_to_message_id: deliveryMessage!.message_id,
    }
  );

  return { status, deliveryOptions, deliveryMessage, extraDeliveryMessage };
};

// Stub method, the payment is already stored on knuspr :)
export const enterPayment = async (context: KnusprContext) => {
  await sleep(1000);

  //const page = context.page!;
  //await page.type('[aria-label="Kartennummer"]', config.creditCard);
  //await page.type('[aria-label="Kartennummer"]', config.creditCard);
  //await page.type('[aria-label="Kartennummer"]', config.creditCard);

  const status = {
    ...context.status,
    payment: true,
  };

  return { status };
};

export const knusprEnterDelivery = async (
  context: KnusprContext,
  data: any
) => {
  await sleep(1000);
  const page = context.page!;

  const { selectedDeliveryOption, deliveryMessage, extraDeliveryMessage } =
    context;
  const info = selectedDeliveryOption.split("-")[1];
  const [index, marker] = info.split("@");

  await page.click(`li[data-test="tab-${index}"]`);
  await page.waitForTimeout(3000);

  const selectedSlot = await page.evaluate(
    (index, marker) => {
      const slots = Array.from(
        document.querySelectorAll<HTMLTableElement>(
          `[data-test="tab-content-timeslots-${index}"] > div`
        )
      ).map((el) => {
        return {
          el,
          marker: el.querySelector("span")!.innerText,
          text: el.querySelector("button")!.innerText.split("\n")[0],
        };
      });

      const wantedSlot = slots.find((subject) => subject.marker === marker);

      if (wantedSlot) {
        wantedSlot.el.querySelector<HTMLButtonElement>("button")!.click();
        setTimeout(
          () =>
            wantedSlot.el.querySelector<HTMLButtonElement>("button")!.click(),
          500
        );
      }

      return slots;
    },
    index,
    marker
  );

  await page.waitForSelector('[data-test="timeslot-change"]');

  const status = {
    ...context.status,
    delivery: true,
  };

  await context.bot!.deleteMessage(
    context.chat!.id,
    String(context.deliveryMessage!.message_id)
  );
  await context.bot!.deleteMessage(
    context.chat!.id,
    String(context.extraDeliveryMessage!.message_id)
  );

  return { status };
};

interface DeliveryOptions {
  index: number;
  day: string;
  options: {
    marker: string;
    text: string;
  }[];
}

const inlineKeyboardForDeliveryOptions = (
  deliveryOptions: DeliveryOptions[]
) => {
  return deliveryOptions.flatMap(({ day, options, index }) => {
    return options.flatMap((option) => [
      [
        {
          text: `${day} ab ${option.marker}`,
          callback_data: `KNUSPR_DELIVERY-${index}@${option.marker}`,
        },
      ],
    ]);
  });
};

export const confirmOrder = async (context: KnusprContext) => {
  const page = context.page!;

  const address = await page.evaluate(() => {
    return document.querySelector<HTMLDivElement>('[data-test="address-text"]')!
      .innerText;
  });

  const contact = await page.evaluate(() => {
    return document.querySelector<HTMLDivElement>(
      '[data-test="contacts-text"]'
    )!.innerText;
  });

  const payment = await page.evaluate(() => {
    return document.querySelector<HTMLDivElement>('[data-test="payment-text"]')!
      .innerText;
  });

  const bags = await page.evaluate(() => {
    return document.querySelector<HTMLDivElement>(
      '[data-test="packaging-text"]'
    )!.innerText;
  });

  const deliveryMessage = await page.evaluate(() => {
    return document.querySelector<HTMLDivElement>('[data-test="courier-text"]')!
      .innerText;
  });

  const price = await page.evaluate(() => {
    return document.querySelector<HTMLDivElement>("#totalPrice")!.innerText;
  });

  const perCarts = context
    .carts!.reduce((acc: string[], cur) => {
      return [
        ...acc,
        ` - ${cur.user.first_name}: ${cur.items
          .reduce((accumulator, product) => {
            return accumulator + product.product.price.full * product.quantity;
          }, 0)
          .toFixed(2)} ,-`,
      ];
    }, [])
    .join("\n");

  await context.bot!.sendMessage(
    context.chat!.id,
    `
*Bestellübersicht*
=====================
  
*Adresse*:
${address}
  
*Kontakt*:
${contact}

*Zahlung*:
${payment}

*Tüten*:
${bags}

*Nachricht an den Boten*:
${deliveryMessage}

*Preis*:
${price}

Aufgeschlüsselt nach Nutzer:
${perCarts}

=======================================================
Wenn das so für euch i.O. ist sende ich die Bestellung los.
⚠️ Passiert im Moment nicht automatisch weil sicher 1000 Bugs :) ⚠️ 

  `,
    {
      parse_mode: "Markdown",
    }
  );
  return;
};
