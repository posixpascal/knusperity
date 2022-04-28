interface KPrice {
  full: float;
  currency: "€" | "$";
}

interface KComposition {
  nutritionalValues: {
    [key: string]: { amount: number; unit: string };
  };
}

interface KProduct {
  id: any;
  productName: string;
  productId: number;
  textualAmount: string;
  imgPath: string;
  link: string;
  price: KPrice;
  composition: KComposition;
}
