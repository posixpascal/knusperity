/**
 * Extracts nutrition information from a cart item.
 * @param amountStr
 */
import { CartLineItem } from "./cart.machine";
import { CART_DEC_ITEM, CART_INC_ITEM } from "../../constants/callbacks";

export const nutritionFactor = (amountStr: string) => {
  if (!amountStr.includes("Stk")) {
    // Get total nutritional value
    const amount = parseFloat(amountStr.replace(/[^0-9\.]/g, ""));
    if (amount) {
      return amount * 0.01;
    }

    return 1;
  }

  let [totalAmount, unit, ...leftovers]: any = amountStr.split(" ");
  if (!totalAmount) {
    return 1;
  }

  if (unit === "l" || unit === "kg") {
    totalAmount = parseInt(totalAmount) / 1000;
    return totalAmount * 0.01;
  }

  return 1;
};

/**
 * Creates the inline keyboard for the cart.
 * @param items
 */
export const inlineCartKeyboard: any = (items: CartLineItem[]) => {
  if (items.length === 0) {
    return [
      [
        {
          text: "Warenkorb leer",
          callback_data: "xxx",
        },
      ],
    ];
  }

  let keyboard: any = [];
  for (const { product, quantity } of items) {
    const reply: any = [
      [
        {
          text: `${quantity}x ${product.productName}`,
          url: "https://www.knuspr.de/" + product.link,
        },
      ],
      [
        {
          text: `${(quantity * product.price.full).toFixed(2)} €`,
          callback_data: "__ignore__",
        },
        {
          text: "+ 1",
          callback_data: `${CART_INC_ITEM}_${product.productId}`,
        },
        {
          text: "- 1",
          callback_data: `${CART_DEC_ITEM}_${product.productId}`,
        },
      ],
    ];

    keyboard = [...keyboard, ...reply];
  }

  return keyboard;
};

/** Creates the message from user and his items */
export const contextToMessage = ({ user, items }: any) => {
  const { first_name: firstName } = user;
  const total = items.reduce(
    (acc: any, { quantity, product: { price } }: any) =>
      acc + quantity * price.full,
    0
  );

  const nutrition = items.reduce(
    (
      acc: any,
      {
        quantity,
        product: {
          textualAmount,
          composition: { nutritionalValues },
        },
      }: any
    ) => {
      let factor = nutritionFactor(textualAmount);
      if (Number.isNaN(factor)) {
        factor = 1;
      }

      return {
        ...acc,
        protein: acc.protein + nutritionalValues.protein * quantity * factor,
        fats: acc.fats + nutritionalValues.fats * quantity * factor,
        energyKCal:
          acc.energyKCal + nutritionalValues.energyKCal * quantity * factor,
        sugars: acc.sugars + nutritionalValues.sugars * quantity * factor,
        carbohydrates:
          acc.carbohydrates +
          nutritionalValues.carbohydrates * quantity * factor,
      };
    },
    { energyKCal: 0, carbohydrates: 0, protein: 0, fats: 0, sugars: 0 }
  );

  return `
@${firstName} - Dein Warenkorb:
Warenkorb gesamt: ${total.toFixed(2)} Euro

Kalorien: ${nutrition.energyKCal.toFixed(2)} kcal 
Zucker: ${nutrition.sugars.toFixed(2)} g
Fett: ${nutrition.fats.toFixed(2)} g
Protein: ${nutrition.protein.toFixed(2)} g
Kohlenhydrate: ${nutrition.carbohydrates.toFixed(2)} g 

(Grob geschätzt, weil manche Produkte in Paketen verkauft werden & es nicht immer direkt ersichtlich ist.)
----
Aktualisiert am: ${new Date().toLocaleString()}  
    `;
};
