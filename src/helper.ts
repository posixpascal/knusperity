// noinspection JSIgnoredPromiseFromCall

export const reply = (msg: string) => (context: any) => {
  context.bot!.sendMessage(context.chat.id!, msg, {
    parse_mode: "Markdown",
  });
};

export const extractLinks = (text: string) => {
  const regex = /(https?:\/\/[^\s]+)/g;
  const links = text.match(regex);
  return links ? links : [];
};

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
