import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

export const jar = new CookieJar();
const client: AxiosInstance = wrapper(
  axios.create({
    jar,
    baseURL: "https://knuspr.de/",
  })
);

export const API = {
  async search(query: string, { page = 1, limit = 1 } = { page: 1, limit: 1 }) {
    const { data } = await client.get(
      `/services/frontend-service/search-metadata?search=${encodeURIComponent(
        query
      )}&limit=${limit}&offset=${page}&companyId=1`
    );

    // MicroServices FTL. Each service responds differently...
    // Mapping their composition to the same as their product API in piece of code:
    return {
      ...data.data,
      productList: data.data.productList.map((product: any) => ({
        ...product,
        composition: {
          nutritionalValues: {
            ...product.composition?.nutritionalValues || {},
            energyKCal: product.composition?.nutritionalValues?.energyValueKcal || 0,
            protein: product.composition?.nutritionalValues?.proteins || 0,
          },
        },
      })),
    };
  },
  async productByID(id: number): Promise<KProduct> {
    const dataset = await Promise.all([
      client.get(`/api/v1/products/${id}`),
      client.get(`/api/v1/products/${id}/prices`),
      client.get(`/api/v1/products/${id}/composition`),
    ]);

    const enrichedProduct: any = dataset.reduce(
      (acc: any, cur: any) => ({ ...acc, ...cur.data }),
      {}
    );
    const nutritionalValues = Object.entries(
      enrichedProduct.nutritionalValues[0].values || {}
    ).reduce((acc: any, cur: any) => ({ ...acc, [cur[0]]: cur[1].amount }), {});

    return {
      productName: enrichedProduct.name,
      id: enrichedProduct.id,
      productId: enrichedProduct.id,
      textualAmount: enrichedProduct.textualAmount,
      price: {
        full: enrichedProduct.price.amount,
        currency: enrichedProduct.price.currency,
      },
      imgPath: enrichedProduct.images[0],
      composition: {
        nutritionalValues,
      },
      link: `${enrichedProduct.id}-knusperity-wins`,
    };
  },
};
