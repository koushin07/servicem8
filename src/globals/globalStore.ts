export interface GlobalStore {
  access_token: string | null;
}

const globalStore: GlobalStore = {
  access_token: null,
};

export default globalStore;
