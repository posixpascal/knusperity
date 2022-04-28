# 🍪 knusperity

Probably the most sophisticated `knuspr.de order telegram bot` in the world. 
Actually... the only [knuspr.de](https://knuspr.de) bot in the world currently. _Why would anyone do this?_

`Knusperity` is a telegram bot that allows a whole telegram group to order products from `knuspr.de`. 

You can search for products, import them using knuspr.de-links, interact with your cart, 
get nutritional values for each product and checkout right on the spot.

### Screenshots
<summary>
    <details>    <img src="https://raw.githubusercontent.com/posixpascal/knusperity/trunk/screenshots/order.jpg" />
        <img src="https://raw.githubusercontent.com/posixpascal/knusperity/trunk/screenshots/search.jpg" />
        <img src="https://raw.githubusercontent.com/posixpascal/knusperity/trunk/screenshots/links.jpg" />
        <img src="https://raw.githubusercontent.com/posixpascal/knusperity/trunk/screenshots/order2.jpg" />
        <img src="https://raw.githubusercontent.com/posixpascal/knusperity/trunk/screenshots/checkout.jpg" />
        <img src="https://raw.githubusercontent.com/posixpascal/knusperity/trunk/screenshots/order-items.jpg" />
</details>
</summary>

🥹 Help me

## Get the bot

Unfortunately, due to the way the bot currently works, I'm not hosting the application for the general public.

However, you can easily build and run it yourself by following these instructions:

Clone the repository and run:
```
yarn
```

To start the bot, register your Telegram Bot Token by speaking to @BotFather.
Once you got your bot token, add it to your `.env` file in the root of the repository:

```
KNUSPR_ENDPOINT=https://knuspr.com/api/v2
KNUSPR_EMAIL=[login-email]
KNUSPR_PASSWORD=
TELEGRAM_BOT_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXX
```

Then you can start the bot using:
```
yarn run start
```

Then chat with the bot and write him `/help` to get rolling.

### Duuude, why?
Typical dev experience right there - spend 2 weeks to automate 5 minutes.

_Was it worth it?_  Probably not but then again, the project was originally built to test the capabilities of telegram's bot api as well as [xstate.js](xstate.js.org/). So let's not talk about it. 🥹
