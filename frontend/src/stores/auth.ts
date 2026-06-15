import { defineStore } from "pinia";
import { login } from "../services/api";

export interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "supervisor" | "user";
  name: string;
  position: string;
  responsibleSeaAreas: string[];
  dataScope: string;
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem("ocean_token") ?? "",
    user: JSON.parse(localStorage.getItem("ocean_user") ?? "null") as UserProfile | null
  }),
  actions: {
    async signIn(username: string, password: string) {
      const data = await login(username, password);
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem("ocean_token", data.token);
      localStorage.setItem("ocean_user", JSON.stringify(data.user));
    },
    signOut() {
      this.token = "";
      this.user = null;
      localStorage.removeItem("ocean_token");
      localStorage.removeItem("ocean_user");
    }
  }
});
